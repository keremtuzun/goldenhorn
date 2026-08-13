/* Match Data.
   This page replaced a stopwatch. A scout used to pick one robot and tap seven
   action buttons for 150 seconds, once per match, and could cover one robot at
   a time. The feed publishes the same match afterwards with a per-robot endgame
   result and a phase by phase scoring breakdown, for all six robots, and it
   does not mis-tap. So the scouts' time goes to the pit, where nobody else is
   looking, and the match record comes from here. */

import { esc, downloadFile, toCSV, fmtRel } from '../util.js';
import { icon } from '../icons.js';
import { state, importRecords } from '../store.js';
import { teamName, importMatchData, refreshDerived } from '../api.js';
import { barChart } from '../charts.js';
import { hydrate, toast } from '../ui.js';
import { pageHead, statTile, emptyState, dataStrip } from './parts.js';

const OUR = () => state.settings.ourTeam;

let importing = false;

const PHASE_LABELS = {
  auto: 'Auto', transition: 'Transition', shift1: 'Shift 1', shift2: 'Shift 2',
  shift3: 'Shift 3', shift4: 'Shift 4', endgame: 'Endgame',
};

const tbaRecords = () => state.records.filter(r => r.source === 'tba');

function matchTable(records) {
  const byMatch = new Map();
  for (const r of records) {
    if (!byMatch.has(r.matchKey)) {
      byMatch.set(r.matchKey, { key: r.matchKey, match: r.match, number: r.matchNumber, red: [], blue: [] });
    }
    byMatch.get(r.matchKey)[r.alliance].push(r);
  }
  const rows = [...byMatch.values()].reverse().slice(0, 40);
  const us = OUR();

  const html = rows.map(m => {
    const red = m.red[0], blue = m.blue[0];
    if (!red || !blue) return '';
    const ours = [...m.red, ...m.blue].some(r => r.team === us);
    const chip = (r, side) => `<span class="tchip ${r.team === us ? 'us' : `${side}-al`}"
      title="${esc(teamName(r.team))}${r.climbed ? ` climbed ${esc(r.tower)}` : ''}">${r.team}${r.climbed ? ' &#9650;' : ''}</span>`;
    const fouls = red.majorFouls + blue.majorFouls;
    return `<div class="mrow ${ours ? 'ours' : ''}" data-match="${esc(m.key)}" style="cursor:pointer">
      <div class="m-id">${esc(m.match)}<span>${red.won ? 'red won' : blue.won ? 'blue won' : 'tie'}</span></div>
      <div class="sides">
        <div class="side">${m.red.map(r => chip(r, 'red')).join('')}</div>
        <span class="vs mono">${red.allianceScore} · ${blue.allianceScore}</span>
        <div class="side blue">${m.blue.map(r => chip(r, 'blue')).join('')}</div>
      </div>
      <div style="text-align:right">
        <div class="mono dim" style="font-size:var(--t-xs)">RP ${red.rp ?? '-'} / ${blue.rp ?? '-'}</div>
        ${fouls ? `<span class="tag neg">${fouls} major foul${fouls === 1 ? '' : 's'}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  return html || emptyState({
    icon: 'inbox', title: 'Nothing to show', body: 'No played matches came back from the feed.',
  });
}

/** Hub scoring across the event, by phase. Counted once per alliance per match,
 *  because these figures are alliance level and would otherwise be tripled. */
function phaseChart(records) {
  const totals = Object.fromEntries(Object.keys(PHASE_LABELS).map(k => [k, 0]));
  const seen = new Set();
  for (const r of records) {
    const id = r.matchKey + r.alliance;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of Object.keys(PHASE_LABELS)) totals[p] += r.phases?.[p] ?? 0;
  }
  const items = Object.entries(PHASE_LABELS).map(([key, label]) => ({ key, label, value: totals[key] }));
  return items.some(i => i.value > 0)
    ? barChart(items, { format: v => String(v) })
    : emptyState({ icon: 'chart', title: 'No phase data', body: 'The feed did not publish a hub breakdown for these matches.' });
}

export function renderMatchData(root) {
  const recs = tbaRecords();
  const matches = new Set(recs.map(r => r.matchKey)).size;
  const teams = new Set(recs.map(r => r.team)).size;
  const climbs = recs.filter(r => r.climbed).length;
  const us = OUR();
  const ours = recs.filter(r => r.team === us);
  const wins = ours.filter(r => r.won).length;
  const newest = recs.length ? recs.map(r => r.at).sort().at(-1) : null;

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Straight from the feed', title: 'Match Data',
      lede: 'Every played qualification match with its full score breakdown: the endgame result the feed publishes for each robot, alliance scoring phase by phase, ranking points and fouls.',
      actions: `<button class="btn" data-act="import"${importing ? ' disabled' : ''}>
        ${icon(importing ? 'clock' : 'download')}${importing ? 'Importing…' : recs.length ? 'Refresh' : 'Import match data'}</button>`,
    })}
    ${dataStrip()}

    ${!recs.length ? `<div class="card">${emptyState({
      icon: 'download', title: 'No match data yet',
      body: 'Pull the event and every played match becomes one row per robot. It replaces what a scout used to tap in by hand, for all six robots at once.',
      action: `<button class="btn" data-act="import"${importing ? ' disabled' : ''}>${icon('download')}Import from The Blue Alliance</button>`,
    })}</div>` : `
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Matches imported', value: matches, icon: 'calendar',
        sub: `<span class="dim">${recs.length} robot rows</span>` })}
      ${statTile({ label: 'Robots covered', value: teams, icon: 'robot',
        sub: newest ? `<span class="dim">latest ${esc(fmtRel(newest))}</span>` : '' })}
      ${statTile({ label: 'Climbs recorded', value: climbs, icon: 'trending',
        sub: '<span class="tag pos">per robot</span>' })}
      ${statTile({ label: 'Our record', value: `${wins}-${ours.length - wins}`, icon: 'trophy',
        sub: ours.length ? `<span class="dim">${ours.length} matches played</span>` : '<span class="dim">not in this field</span>' })}
    </div>

    <div class="g12">
      <div class="card c7">
        <div class="card-head"><div><div class="h-sec">${icon('activity')}Where the points come from</div>
          <div class="card-note">Hub scoring across the event by phase. Alliance level, counted once per alliance per match.</div></div></div>
        ${phaseChart(recs)}
      </div>

      <div class="card c5">
        <div class="card-head"><div class="h-sec">${icon('info')}What is per robot, and what is not</div></div>
        <div class="bullets">
          <div class="bullet">${icon('check')}<span><b>The endgame tower</b> is published per driver station, so a climb belongs to exactly one robot.</span></div>
          <div class="bullet">${icon('check')}<span><b>Contribution</b> comes from OPR, which is solved across many matches rather than watched.</span></div>
          <div class="bullet">${icon('alert')}<span><b>Auto, teleop and hub points</b> are alliance totals. Three robots share them and the feed never says who did what.</span></div>
        </div>
        <hr class="rule tight" />
        <p class="card-note">Which is exactly why the pit still needs a human. The endgame column is the only per robot number on this page you can quote without a caveat.</p>
      </div>

      <div class="card c12 flush">
        <div class="card-head">
          <div><div class="h-sec">${icon('table')}Matches</div>
          <div class="card-note">Newest first. A triangle marks a robot the feed recorded climbing. Click a row to load it into the predictor.</div></div>
          <button class="btn sm ghost" data-act="export">${icon('download')}CSV</button>
        </div>
        <div class="stack tight" style="padding:0 var(--s5) var(--s5)">${matchTable(recs)}</div>
      </div>
    </div>`}`;

  hydrate(root);
}

export function bindMatchData(root, { rerender, onPredict }) {
  root.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;

    if (act === 'import') {
      if (importing) return;
      importing = true;
      rerender();
      try {
        const { records, matches, skipped } = await importMatchData();
        importRecords(records);
        refreshDerived();
        toast(`Imported ${matches.length} matches, ${records.length} robot rows.${
          skipped ? ` ${skipped} not played yet.` : ''}`, 'pos', 5000);
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'neg', 6000);
      } finally {
        importing = false;
        rerender();
      }
      return;
    }

    if (act === 'export') {
      const rows = tbaRecords().map(r => ({
        match: r.match, team: r.team, station: r.station, alliance: r.alliance,
        allianceScore: r.allianceScore, opponentScore: r.opponentScore,
        won: r.won ? 1 : 0, rp: r.rp ?? '',
        autoPoints: r.autoPoints ?? '', teleopPoints: r.teleopPoints ?? '',
        endgamePoints: r.endgamePoints ?? '',
        climbed: r.climbed ? 1 : 0, tower: r.tower || '',
        majorFouls: r.majorFouls, minorFouls: r.minorFouls,
      }));
      if (!rows.length) { toast('Import some matches first.', 'warn'); return; }
      downloadFile(`match-data-${state.settings.event}.csv`, toCSV(rows));
      toast('Match data exported.', 'pos');
      return;
    }

    const row = e.target.closest('[data-match]');
    if (row) onPredict?.(row.dataset.match);
  });
}
