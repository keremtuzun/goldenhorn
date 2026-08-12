/* Match Schedule and Scout Assignments. */

import { $, $$, esc, downloadFile, toCSV, fmtCountdown } from '../util.js';
import { icon } from '../icons.js';
import { state, persist, getAccounts } from '../store.js';
import { teamName } from '../api.js';
import { hydrate, toast } from '../ui.js';
import { pageHead, statTile, emptyState, dataStrip } from './parts.js';

const OUR = () => state.settings.ourTeam;

/* ─────────────────────────── schedule ─────────────────────────── */

let scheduleFilter = 'ours';

const timeLabel = m => {
  if (!m.time) return '';
  const d = new Date(m.time);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function matchRow(m) {
  const us = OUR();
  const ours = m.red.includes(us) || m.blue.includes(us);
  const chip = (t, side) => `<span class="tchip ${t === us ? 'us' : side + '-al'}" title="${esc(teamName(t))}">${t}</span>`;

  let right;
  if (m.played) {
    const ourSide = m.red.includes(us) ? 'red' : m.blue.includes(us) ? 'blue' : null;
    const won = ourSide && m.winner === ourSide;
    right = `<div style="text-align:right">
      <div class="mono" style="font-size:var(--t-sm)">
        <span style="color:var(--red-al)">${m.redScore ?? '–'}</span>
        <span class="dimmer"> · </span>
        <span style="color:var(--blue-al)">${m.blueScore ?? '–'}</span>
      </div>
      ${ourSide ? `<span class="tag ${won ? 'pos' : 'neg'}">${won ? 'win' : 'loss'}</span>`
        : `<span class="tag">${esc(m.winner || 'tie')}</span>`}
    </div>`;
  } else {
    right = `<div style="text-align:right">
      <div class="mono dim" style="font-size:var(--t-xs)">${esc(timeLabel(m))}</div>
      <button class="btn sm ghost" data-scout="${esc(m.key)}">${icon('stopwatch')}Scout</button>
    </div>`;
  }

  return `<div class="mrow ${ours ? 'ours' : ''}" data-match="${esc(m.key)}">
    <div class="m-id">Q${m.number}<span>${m.played ? 'played' : 'upcoming'}</span></div>
    <div class="sides">
      <div class="side">${m.red.map(t => chip(t, 'red')).join('')}</div>
      <span class="vs">VS</span>
      <div class="side blue">${m.blue.map(t => chip(t, 'blue')).join('')}</div>
    </div>
    ${right}
  </div>`;
}

export function renderSchedule(root) {
  const us = OUR();
  const all = state.matches;
  const ourMatches = all.filter(m => m.red.includes(us) || m.blue.includes(us));
  const upcoming = all.filter(m => !m.played);
  const ourNext = ourMatches.find(m => !m.played);
  const record = ourMatches.filter(m => m.played).reduce((acc, m) => {
    const side = m.red.includes(us) ? 'red' : 'blue';
    if (m.winner === side) acc.w++; else if (!m.winner) acc.t++; else acc.l++;
    return acc;
  }, { w: 0, l: 0, t: 0 });

  const list =
    scheduleFilter === 'ours' ? ourMatches :
    scheduleFilter === 'upcoming' ? upcoming : all;

  root.innerHTML = `
    ${pageHead({
      eyebrow: state.matchesAreReal ? 'Live from The Blue Alliance' : 'Schedule not published',
      title: 'Match Schedule',
      lede: state.matchesAreReal
        ? 'The real qualification schedule for this event, with results as they land.'
        : 'The event has not posted a schedule yet, so this is a placeholder pairing so you can try the flow.',
      actions: `<button class="btn ghost" data-act="export">${icon('download')}CSV</button>`,
    })}
    ${dataStrip()}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Our matches', value: ourMatches.length, icon: 'calendar',
        sub: `<span class="dim">${ourMatches.filter(m => m.played).length} played</span>` })}
      ${statTile({ label: 'Our record', value: `${record.w}-${record.l}-${record.t}`, icon: 'trophy' })}
      ${statTile({ label: 'Next up', value: ourNext ? `Q${ourNext.number}` : '–', icon: 'clock',
        sub: ourNext?.time ? `<span class="dim" id="schedCd" data-at="${ourNext.time}">calculating…</span>`
          : '<span class="dim">no time published</span>' })}
      ${statTile({ label: 'Matches left in quals', value: upcoming.length, icon: 'activity' })}
    </div>

    <div class="card flush">
      <div class="card-head">
        <div><div class="h-sec">${icon('calendar')}Qualifications</div>
        <div class="card-note">Our matches are outlined in gold. Click any row to load it into the predictor.</div></div>
        <div class="seg" id="schedFilter">
          <span class="seg-thumb"></span>
          <button data-f="ours" class="${scheduleFilter === 'ours' ? 'on' : ''}">Ours</button>
          <button data-f="upcoming" class="${scheduleFilter === 'upcoming' ? 'on' : ''}">Upcoming</button>
          <button data-f="all" class="${scheduleFilter === 'all' ? 'on' : ''}">All</button>
        </div>
      </div>
      <div class="stack tight" style="padding:0 var(--s5) var(--s5)">
        ${list.length ? list.map(matchRow).join('') : emptyState({
          icon: 'calendar', title: 'Nothing in this view',
          body: scheduleFilter === 'ours'
            ? 'Team 8159 does not appear in the loaded schedule. Check the event key on the Data page.'
            : 'No matches match this filter.',
        })}
      </div>
    </div>`;

  hydrate(root);
  startScheduleCountdown(root);
}

let schedTimer = null;
function startScheduleCountdown(root) {
  clearInterval(schedTimer);
  const el = $('#schedCd', root);
  if (!el) return;
  const at = Number(el.dataset.at);
  const tick = () => {
    const { h, m, s, over } = fmtCountdown(at - Date.now());
    el.textContent = over ? 'up now' : `in ${h}:${m}:${s}`;
  };
  tick();
  schedTimer = setInterval(tick, 1000);
}
export function stopScheduleCountdown() { clearInterval(schedTimer); }

export function bindSchedule(root, { rerender, onScout, onPredict, positionSegThumb }) {
  root.addEventListener('click', e => {
    const filter = e.target.closest('#schedFilter button[data-f]');
    if (filter) {
      scheduleFilter = filter.dataset.f;
      rerender();
      return;
    }
    const scout = e.target.closest('[data-scout]');
    if (scout) {
      onScout?.(state.matches.find(m => m.key === scout.dataset.scout));
      return;
    }
    if (e.target.closest('[data-act="export"]')) {
      downloadFile(`schedule-${state.settings.event}.csv`, toCSV(state.matches.map(m => ({
        match: m.number, red1: m.red[0], red2: m.red[1], red3: m.red[2],
        blue1: m.blue[0], blue2: m.blue[1], blue3: m.blue[2],
        redScore: m.redScore ?? '', blueScore: m.blueScore ?? '', winner: m.winner ?? '',
      }))));
      toast('Schedule exported.', 'pos');
      return;
    }
    const row = e.target.closest('[data-match]');
    if (row) onPredict?.(state.matches.find(m => m.key === row.dataset.match));
  });
  positionSegThumb?.($('#schedFilter', root));
}

/* ─────────────────────────── scout assignments ─────────────────────────── */

const POSITIONS = ['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'];

function scoutPool() {
  const fromBoard = Object.values(state.board.scouts || {}).map(s => s.name).filter(Boolean);
  const fromLocal = Object.values(getAccounts()).map(a => a.name);
  const names = [...new Set([...fromBoard, ...fromLocal])].sort();
  return names;
}

/** Round-robin over positions so nobody watches the same alliance station all
 *  day, and everyone gets a comparable number of matches. */
export function buildAssignments({ shift = 12 } = {}) {
  const scouts = scoutPool();
  if (!scouts.length) return null;
  const upcoming = state.matches.filter(m => !m.played).slice(0, shift);
  if (!upcoming.length) return null;

  const rows = upcoming.map((m, mi) => ({
    key: m.key, number: m.number,
    teams: [...m.red, ...m.blue],
    scouts: POSITIONS.map((_, pi) => scouts[(mi * POSITIONS.length + pi) % scouts.length]),
  }));

  const load = {};
  rows.forEach(r => r.scouts.forEach(s => { load[s] = (load[s] || 0) + 1; }));
  return { rows, scouts, load, built: new Date().toISOString() };
}

export function renderAssignments(root) {
  const a = state.assignments;
  const pool = scoutPool();

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Shift planning', title: 'Scout Assignments',
      lede: 'Who watches which robot, match by match. Rotated so nobody stares at the same alliance station for two hours.',
      actions: `<button class="btn ghost no-print" data-act="build">${icon('refresh')}${a ? 'Rebuild' : 'Build'} a shift</button>
        ${a ? `<button class="btn ghost no-print" data-act="export">${icon('download')}CSV</button>
               <button class="btn no-print" data-act="print">${icon('print')}Print</button>` : ''}`,
    })}

    ${!pool.length ? `<div class="card">${emptyState({
      icon: 'users', title: 'No scouts registered yet',
      body: 'Assignments come from the people who have made an account. Get the crew signed up and their names appear here.',
    })}</div>`
    : !a ? `<div class="card">${emptyState({
      icon: 'table', title: 'No shift planned',
      body: `${pool.length} scout${pool.length === 1 ? '' : 's'} registered. Build a shift and every upcoming match gets six named positions.`,
      action: `<button class="btn" data-act="build">${icon('play')}Build the next twelve matches</button>`,
    })}</div>`
    : `
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Matches covered', value: a.rows.length, icon: 'calendar' })}
      ${statTile({ label: 'Scouts on shift', value: a.scouts.length, icon: 'users' })}
      ${statTile({ label: 'Matches each', value: Math.round((a.rows.length * 6) / a.scouts.length), icon: 'activity',
        sub: '<span class="dim">on average</span>' })}
      ${statTile({ label: 'Robots watched', value: a.rows.length * 6, icon: 'robot' })}
    </div>

    <div class="card flush" style="margin-bottom:var(--s4)">
      <div class="card-head"><div><div class="h-sec">${icon('table')}The shift</div>
        <div class="card-note">Each cell is the scout and the robot they are on. Hand this out or print it.</div></div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Match</th>${POSITIONS.map(p => `<th>${p}</th>`).join('')}</tr></thead>
        <tbody>${a.rows.map(r => `<tr>
          <td class="mono"><b>Q${r.number}</b></td>
          ${r.scouts.map((s, i) => `<td>
            <div style="font-size:var(--t-xs);font-weight:600">${esc(s)}</div>
            <div class="mono dimmer" style="font-size:var(--t-2xs)">${r.teams[i]}${
              r.teams[i] === OUR() ? ' ★' : ''}</div>
          </td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-head"><div class="h-sec">${icon('activity')}Workload</div></div>
      <div class="stack tight">
        ${Object.entries(a.load).sort(([, x], [, y]) => y - x).map(([name, n]) => `
          <div class="row" style="gap:var(--s3)">
            <div class="avatar sm">${esc(name[0].toUpperCase())}</div>
            <span style="flex:0 0 9rem;font-size:var(--t-sm)">${esc(name)}</span>
            <div class="meter" style="flex:1"><i data-w="${(n / Math.max(...Object.values(a.load))) * 100}%"></i></div>
            <span class="mono dim" style="font-size:var(--t-xs)">${n}</span>
          </div>`).join('')}
      </div>
    </div>`}`;

  hydrate(root);
}

export function bindAssignments(root, rerender) {
  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'build') {
      const built = buildAssignments();
      if (!built) { toast('Need registered scouts and upcoming matches to build a shift.', 'warn'); return; }
      state.assignments = built;
      persist('assignments');
      rerender();
      toast(`Shift built across ${built.rows.length} matches.`, 'pos');
    }
    if (act === 'print') window.print();
    if (act === 'export') {
      const rows = state.assignments.rows.flatMap(r =>
        r.scouts.map((s, i) => ({ match: `Q${r.number}`, position: POSITIONS[i], team: r.teams[i], scout: s })));
      downloadFile(`assignments-${state.settings.event}.csv`, toCSV(rows));
      toast('Assignments exported.', 'pos');
    }
  });
}
