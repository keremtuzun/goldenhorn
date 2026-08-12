/* Dashboard, Team Analytics, Compare, and the team detail drawer. */

import { $, $$, esc, num, dash, mean, fmtCountdown, fmtRel, clamp } from '../util.js';
import { icon } from '../icons.js';
import { state, pitFor, recordsFor } from '../store.js';
import { teamName } from '../api.js';
import { radar, barChart, sparkline } from '../charts.js';
import { openDrawer, closeDrawer, hydrate, toast } from '../ui.js';
import { pageHead, statTile, emptyState, skeletonRows, dataStrip } from './parts.js';

const OUR = () => state.settings.ourTeam;

/* ─────────────────────────── dashboard ─────────────────────────── */

function nextMatch() {
  const us = OUR();
  const ours = state.matches.filter(m => !m.played && (m.red.includes(us) || m.blue.includes(us)));
  return ours[0] || state.matches.find(m => !m.played) || null;
}

function nextMatchCard() {
  const m = nextMatch();
  if (!m) {
    return `<div class="card c5">${emptyState({
      icon: 'calendar', title: 'No upcoming match',
      body: 'Every qualification match on the schedule has been played, or the schedule has not been posted yet.',
    })}</div>`;
  }
  const us = OUR();
  const ourSide = m.red.includes(us) ? 'red' : m.blue.includes(us) ? 'blue' : null;
  const chip = (t, side) =>
    `<button class="tchip ${t === us ? 'us' : side + '-al'}" data-team="${t}" title="${esc(teamName(t))}">${t}</button>`;

  return `<div class="card c5" id="nextMatchCard">
    <div class="card-head">
      <div>
        <div class="h-sec">${ourSide ? 'Your next match' : 'Next match up'}</div>
        <div class="card-note">Qualification ${m.number}${state.matchesAreReal ? '' : ' · schedule not posted yet'}</div>
      </div>
      ${ourSide ? `<span class="tag ${ourSide}-al">${ourSide} alliance</span>` : ''}
    </div>
    <div class="countdown" id="cd" data-at="${m.time || 0}">
      ${m.time ? '<div><b>--</b><span>hrs</span></div><div><b>--</b><span>min</span></div><div><b>--</b><span>sec</span></div>'
        : '<div style="font-size:var(--t-sm);color:var(--text-4)">No start time published for this match.</div>'}
    </div>
    <hr class="rule tight" />
    <div class="stack tight">
      <div>
        <div class="s-lbl" style="color:var(--red-al)">Red</div>
        <div class="side">${m.red.map(t => chip(t, 'red')).join('')}</div>
      </div>
      <div>
        <div class="s-lbl" style="color:var(--blue-al)">Blue</div>
        <div class="side">${m.blue.map(t => chip(t, 'blue')).join('')}</div>
      </div>
    </div>
    <button class="btn full" style="margin-top:var(--s4)" data-go="match">
      ${icon('stopwatch')}Scout this match
    </button>
  </div>`;
}

function topTable() {
  const ranked = state.teams.filter(t => t.opr != null).sort((a, b) => b.opr - a.opr).slice(0, 8);
  if (state.data.loading) return `<table><tbody>${skeletonRows(4, 6)}</tbody></table>`;
  if (!ranked.length) {
    return emptyState({
      icon: 'chart', title: 'No contribution numbers yet',
      body: 'OPR appears once the event has played enough matches for the feed to solve it.',
    });
  }
  const max = ranked[0].opr || 1;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th></th><th>Team</th><th class="n">OPR</th><th></th></tr></thead>
    <tbody>${ranked.map((t, i) => `
      <tr data-click data-team="${t.team}">
        <td class="rk ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</td>
        <td><div class="team-cell"><b>${t.team}</b><span class="tn">${esc(t.name)}</span>${
          t.team === OUR() ? '<span class="tag gold">us</span>' : ''}</div></td>
        <td class="n">${num(t.opr, 1)}</td>
        <td style="width:6rem"><div class="meter"><i data-w="${Math.max(5, (t.opr / max) * 100).toFixed(1)}%"></i></div></td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

export function renderHome(root) {
  const us = state.teams.find(t => t.team === OUR());
  const scouted = state.records.length;
  const pits = state.pits.length;
  const covered = new Set(state.records.map(r => String(r.team))).size;
  const pending = state.queue.length;

  root.innerHTML = `
    ${pageHead({
      eyebrow: `${state.settings.event} · İstanbul · 2026`,
      title: `Welcome back, ${state.user?.name?.split(' ')[0] || 'scout'}`,
      lede: 'Team 8159 Golden Horn, Jr. Robotics Science School, Ataşehir. Rookie 2020, Galileo Division at the 2026 Houston World Championship.',
      actions: `<button class="btn ghost" data-go="picklist">${icon('picklist')}Pick list</button>
                <button class="btn" data-go="match">${icon('stopwatch')}Start scouting</button>`,
    })}
    ${dataStrip()}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Teams in the field', value: state.teams.length, icon: 'users',
        sub: `<span class="tag">${covered} scouted by us</span>` })}
      ${statTile({ label: 'Matches you have logged', value: scouted, icon: 'stopwatch',
        sub: pending ? `<span class="tag warn">${pending} waiting to sync</span>`
                     : '<span class="tag pos">all synced</span>' })}
      ${statTile({ label: 'Pit reports on file', value: pits, icon: 'robot',
        sub: `<span class="tag">${state.teams.length - pits} still to visit</span>` })}
      ${statTile({
        label: 'Our OPR', value: us?.opr ?? '–', decimals: 1, icon: 'trending',
        sub: us?.rank ? `<span class="tag gold">#${us.rank} of ${state.teams.length}</span>` : '' })}
    </div>

    <div class="g12">
      ${nextMatchCard()}
      <div class="card c7">
        <div class="card-head">
          <div><div class="h-sec">${icon('trophy')}Top robots by contribution</div>
          <div class="card-note">OPR is a team's measured points added to its alliance score.</div></div>
          <button class="btn sm ghost" data-go="analytics">All teams${icon('right')}</button>
        </div>
        ${topTable()}
      </div>

      <div class="card c7">
        <div class="card-head"><div class="h-sec">${icon('layers')}How the three modes fit together</div></div>
        <div class="steps">
          <div class="step"><span class="s-n">1</span><div><b>Pre-Scout</b>
            <p>Every prior match of every team in the division, captured at alliance level before quals start.</p></div></div>
          <div class="step"><span class="s-n">2</span><div><b>Pit Scout</b>
            <p>Specs, drivetrain, vision, scoring, autos and shop habits. Near total awareness of every robot.</p></div></div>
          <div class="step"><span class="s-n">3</span><div><b>Match Scout</b>
            <p>Seven time-tracked action segments fused with the CV scoreboard reader.</p></div></div>
        </div>
        <hr class="rule" />
        <p class="prose">Scouts do not count game pieces. The vision pipeline counts, the scouts flag
        <b>who</b> and <b>when</b>, and a bounded ridge solve turns the two into an honest per-team rate.</p>
      </div>

      <div class="card c5">
        <div class="card-head"><div class="h-sec">${icon('zap')}Jump to</div></div>
        <div class="stack tight">
          <button class="btn ghost full" style="justify-content:flex-start" data-go="pit">${icon('robot')}Log a pit report</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-go="draft">${icon('users')}Run an alliance draft</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-go="projection">${icon('dice')}Project our final rank</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-go="data">${icon('database')}Export or sync data</button>
        </div>
        <hr class="rule tight" />
        <p class="card-note">Press <span class="kbd">Ctrl K</span> anywhere to search teams and jump between pages.</p>
      </div>
    </div>`;

  hydrate(root);
  startCountdown(root);
}

let cdTimer = null;
function startCountdown(root) {
  clearInterval(cdTimer);
  const box = $('#cd', root);
  const at = Number(box?.dataset.at || 0);
  if (!box || !at) return;
  const tick = () => {
    const { h, m, s, over } = fmtCountdown(at - Date.now());
    if (over) {
      box.innerHTML = '<div style="font-size:var(--t-sm);color:var(--text-3)">Match is up now.</div>';
      clearInterval(cdTimer);
      return;
    }
    box.innerHTML = `<div><b>${h}</b><span>hrs</span></div><div><b>${m}</b><span>min</span></div><div><b>${s}</b><span>sec</span></div>`;
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

export function stopCountdown() { clearInterval(cdTimer); }

/* ─────────────────────────── analytics ─────────────────────────── */

let sortKey = 'opr', sortDir = -1, filterText = '', filterOnly = 'all';

const COLUMNS = [
  { key: 'rank', label: '#', cell: t => `<td class="rk ${t.rank <= 3 ? 'r' + t.rank : ''}">${t.rank}</td>` },
  { key: 'team', label: 'Team', cell: t => `<td><div class="team-cell"><b>${t.team}</b>
      <span class="tn">${esc(t.name)}</span>${t.team === OUR() ? '<span class="tag gold">us</span>' : ''}
      ${t.hasPit ? `<span class="tag" title="Pit report on file">${icon('robot')}</span>` : ''}</div></td>` },
  { key: 'opr', label: 'OPR', n: true, cell: t => `<td class="n" style="color:var(--gold-300);font-weight:700">${num(t.opr, 1)}</td>` },
  { key: 'epa', label: 'EPA', n: true, cell: t => `<td class="n">${num(t.epa, 1)}</td>` },
  { key: 'ccwm', label: 'CCWM', n: true, cell: t => `<td class="n">${num(t.ccwm, 1)}</td>` },
  { key: 'dpr', label: 'DPR', n: true, cell: t => `<td class="n">${num(t.dpr, 1)}</td>` },
  { key: 'winPct', label: 'Win %', n: true, cell: t => `<td class="n">${t.winPct != null ? t.winPct + '%' : '–'}</td>` },
  { key: 'consistency', label: 'Consist.', n: true, cell: t => `<td class="n">${t.consistency != null ? t.consistency : '–'}</td>` },
  { key: 'scouted', label: 'Scouted', n: true, cell: t => `<td class="n">${t.scouted || '–'}</td>` },
  { key: 'score', label: 'Pick score', n: true, cell: t => `<td class="n">${num(t.score, 1)}</td>` },
  { key: 'record', label: 'Record', cell: t => `<td class="mono">${t.record || '–'}</td>` },
];

function visibleTeams() {
  const q = filterText.trim().toLowerCase();
  return state.teams.filter(t => {
    if (filterOnly === 'scouted' && !t.scouted) return false;
    if (filterOnly === 'pit' && !t.hasPit) return false;
    if (filterOnly === 'unseen' && (t.scouted || t.hasPit)) return false;
    if (!q) return true;
    return String(t.team).includes(q) || t.name.toLowerCase().includes(q);
  });
}

function analyticsBody() {
  if (state.data.loading) return skeletonRows(COLUMNS.length, 8);
  const rows = [...visibleTeams()].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
  });
  if (!rows.length) {
    return `<tr><td colspan="${COLUMNS.length}">${emptyState({
      icon: 'search', title: 'No team matches that filter',
      body: 'Clear the search box or switch the filter back to every team.',
    })}</td></tr>`;
  }
  return rows.map(t => `<tr data-click data-team="${t.team}" class="${t.team === OUR() ? 'me' : ''}">
    ${COLUMNS.map(c => c.cell(t)).join('')}</tr>`).join('');
}

export function renderAnalytics(root) {
  const withOpr = state.teams.filter(t => t.opr != null);
  const leader = [...withOpr].sort((a, b) => b.opr - a.opr)[0];
  const defenders = state.teams.filter(t => t.dpr != null);
  const bestDef = defenders.length ? [...defenders].sort((a, b) => a.dpr - b.dpr)[0] : null;
  const winners = state.teams.filter(t => t.winPct != null);
  const bestWin = winners.length ? [...winners].sort((a, b) => b.winPct - a.winPct)[0] : null;

  const top10 = [...withOpr].sort((a, b) => b.opr - a.opr).slice(0, 10)
    .map(t => ({ key: t.team, label: String(t.team), value: t.opr }));

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Live feed', title: 'Team Analytics',
      lede: 'Real Marmara Regional teams with OPR, DPR and CCWM from The Blue Alliance and EPA from Statbotics, next to what our own scouts have logged.',
      actions: `<button class="btn ghost" data-act="export">${icon('download')}Export CSV</button>
                <button class="btn" data-act="refresh">${icon('refresh')}Refresh</button>`,
    })}
    ${dataStrip()}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Contribution leader', value: leader ? String(leader.team) : '–', icon: 'trophy',
        sub: leader ? `<span class="dim">${esc(leader.name)} · ${num(leader.opr, 1)} OPR</span>` : '' })}
      ${statTile({ label: 'Field average OPR', value: withOpr.length ? mean(withOpr.map(t => t.opr)) : '–',
        decimals: 1, icon: 'activity' })}
      ${statTile({ label: 'Strongest defence', value: bestDef ? String(bestDef.team) : '–', icon: 'shield',
        sub: bestDef ? `<span class="dim">lowest DPR at ${num(bestDef.dpr, 1)}</span>`
                     : '<span class="dim">needs DPR from the feed</span>' })}
      ${statTile({ label: 'Best win rate', value: bestWin ? bestWin.winPct : '–', suffix: '%', icon: 'trending',
        sub: bestWin ? `<span class="dim">${bestWin.team} · ${esc(bestWin.record)}</span>` : '' })}
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div>
        <div class="h-sec">${icon('chart')}Top ten by OPR</div>
        <div class="card-note">Our robot is highlighted. Hover a bar for the exact figure.</div>
      </div></div>
      ${top10.length ? barChart(top10, { highlight: OUR(), format: v => num(v, 0) })
        : emptyState({ icon: 'chart', title: 'Nothing to plot yet', body: 'OPR needs played matches before the feed can solve it.' })}
    </div>

    <div class="card flush">
      <div class="card-head">
        <div><div class="h-sec">${icon('table')}Every team</div>
        <div class="card-note">Click a column to sort. Click a row for the full profile.</div></div>
        <div class="row" style="gap:var(--s2)">
          <input id="anSearch" type="search" placeholder="Team number or name" style="width:12rem" value="${esc(filterText)}" />
          <div class="seg" id="anFilter">
            <span class="seg-thumb"></span>
            <button data-f="all" class="${filterOnly === 'all' ? 'on' : ''}">All</button>
            <button data-f="scouted" class="${filterOnly === 'scouted' ? 'on' : ''}">Scouted</button>
            <button data-f="pit" class="${filterOnly === 'pit' ? 'on' : ''}">Pit</button>
            <button data-f="unseen" class="${filterOnly === 'unseen' ? 'on' : ''}">Unseen</button>
          </div>
        </div>
      </div>
      <div class="tbl-wrap"><table id="anTable">
        <thead><tr>${COLUMNS.map(c => `<th data-sort="${c.key}" class="${c.n ? 'n' : ''} ${
          sortKey === c.key ? 'sorted ' + (sortDir === 1 ? 'asc' : '') : ''}">${esc(c.label)}<span class="sort-ind">${
          icon('down')}</span></th>`).join('')}</tr></thead>
        <tbody id="anBody">${analyticsBody()}</tbody>
      </table></div>
    </div>`;

  hydrate(root);
  positionSegThumb($('#anFilter', root));
}

export function refreshAnalyticsBody(root) {
  const body = $('#anBody', root);
  if (!body) return;
  body.innerHTML = analyticsBody();
  hydrate(body, { animate: false });
}

export function bindAnalytics(root, { onSort, onFilter }) {
  const table = $('#anTable', root);
  table?.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = key === 'team' || key === 'rank' ? 1 : -1; }
    onSort();
  });
  $('#anSearch', root)?.addEventListener('input', e => { filterText = e.target.value; onFilter(); });
  $('#anFilter', root)?.addEventListener('click', e => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    filterOnly = b.dataset.f;
    $$('#anFilter button', root).forEach(x => x.classList.toggle('on', x === b));
    positionSegThumb($('#anFilter', root));
    onFilter();
  });
}

/** Slides the segmented-control pill under whichever button is on. */
export function positionSegThumb(seg) {
  if (!seg) return;
  const thumb = $('.seg-thumb', seg);
  const active = $('button.on', seg);
  if (!thumb || !active) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
}

/* ─────────────────────────── team drawer ─────────────────────────── */

const AXES = ['Score', 'Auto', 'Teleop', 'Defence', 'Consist.', 'Record'];

function axisValues(t) {
  const f = key => state.teams.map(x => x[key]).filter(v => v != null);
  const top = key => Math.max(...(f(key).length ? f(key) : [1]));
  const dprMax = Math.max(...(f('dpr').length ? f('dpr') : [1]));
  return [
    (t.opr ?? 0) / (top('opr') || 1),
    (t.autoBps ?? 0) / (top('autoBps') || 1),
    (t.teleopBps ?? 0) / (top('teleopBps') || 1),
    t.dpr != null ? 1 - t.dpr / (dprMax || 1) : 0.4,
    (t.consistency ?? 45) / 100,
    (t.winPct ?? 45) / 100,
  ].map(v => clamp(v, 0, 1));
}

export function openTeam(teamNum, { onPick, onCompare, onScout } = {}) {
  const t = state.teams.find(x => x.team === Number(teamNum));
  if (!t) { toast(`No data on file for team ${teamNum}.`, 'warn'); return; }
  const pit = pitFor(t.team);
  const recs = recordsFor(t.team);
  const fieldAvg = AXES.map((_, i) => mean(state.teams.map(x => axisValues(x)[i])));

  const scoringHistory = recs.map(r => r.totals?.Scoring ?? 0).reverse();

  openDrawer(`
    <div class="drawer-head">
      <div>
        <div class="eyebrow dim">${t.evtRank ? `Ranked ${t.evtRank} at the event` : 'Unranked'}</div>
        <h2 class="h-page" style="font-size:var(--t-xl)">${t.team} <span style="color:var(--text-3);font-weight:600">${esc(t.name)}</span></h2>
        ${t.loc ? `<p class="card-note">${icon('pin')}${esc(t.loc)}</p>` : ''}
      </div>
      <button class="iconbtn" data-act="close" aria-label="Close"><i data-ic="x"></i></button>
    </div>
    <div class="drawer-body stack loose">
      <div class="card">
        <div class="card-head"><div class="h-sec">Measured contribution</div>
          ${t.sample ? '<span class="tag warn">sample</span>' : '<span class="tag pos"><span class="pulse"></span>live</span>'}</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr)">
          <div><div class="s-lbl">OPR</div><div class="mono" style="font-size:var(--t-lg);color:var(--gold-300)">${num(t.opr, 1)}</div></div>
          <div><div class="s-lbl">EPA</div><div class="mono" style="font-size:var(--t-lg)">${num(t.epa, 1)}</div></div>
          <div><div class="s-lbl">DPR</div><div class="mono" style="font-size:var(--t-lg)">${num(t.dpr, 1)}</div></div>
          <div><div class="s-lbl">CCWM</div><div class="mono">${num(t.ccwm, 1)}</div></div>
          <div><div class="s-lbl">Record</div><div class="mono">${esc(t.record || '–')}</div></div>
          <div><div class="s-lbl">Win rate</div><div class="mono">${t.winPct != null ? t.winPct + '%' : '–'}</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><div class="h-sec">Shape against the field</div>
          <div class="card-note">Gold is this robot. Grey is the field average on the same axes.</div></div></div>
        ${radar([
          { color: 'var(--text-4)', values: fieldAvg },
          { color: 'var(--gold-300)', values: axisValues(t) },
        ], AXES, { size: 240 })}
      </div>

      <div class="card">
        <div class="card-head"><div class="h-sec">What our scouts saw</div>
          <span class="tag">${recs.length} match${recs.length === 1 ? '' : 'es'}</span></div>
        ${recs.length ? `
          ${scoringHistory.length > 1 ? `<div style="margin-bottom:var(--s3)">
            <div class="s-lbl">Seconds spent scoring, oldest to newest</div>
            ${sparkline(scoringHistory, { w: 300, h: 46 })}</div>` : ''}
          <div class="tbl-wrap"><table>
            <thead><tr><th>Match</th><th class="n">Scoring</th><th class="n">Defence</th><th class="n">Driver</th><th>By</th></tr></thead>
            <tbody>${recs.slice(0, 8).map(r => `<tr>
              <td class="mono">${esc(r.match)}</td>
              <td class="n">${r.totals?.Scoring ?? 0}s</td>
              <td class="n">${r.defense != null ? r.defense + '/5' : '–'}</td>
              <td class="n">${r.driver != null ? r.driver + '/5' : '–'}</td>
              <td class="dim">${esc(r.by)}</td></tr>`).join('')}</tbody>
          </table></div>`
        : emptyState({
            icon: 'stopwatch', title: 'We have not scouted this robot yet',
            body: 'Match scout it once and consistency, time on task and driver notes start filling in here.',
            action: `<button class="btn sm" data-act="scout">${icon('stopwatch')}Scout them next</button>`,
          })}
      </div>

      <div class="card">
        <div class="card-head"><div class="h-sec">Pit report</div>
          ${pit ? `<span class="tag pos">${esc(fmtRel(pit.at))}</span>` : ''}</div>
        ${pit ? `
          ${pit.photo ? `<img src="${esc(pit.photo)}" alt="Robot photo for team ${t.team}"
             style="border-radius:var(--r-sm);margin-bottom:var(--s4);width:100%" />` : ''}
          <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:var(--s3)">
            <div><div class="s-lbl">Drivetrain</div><div>${esc(pit.dt)}${pit.module ? ` · ${esc(pit.module)}` : ''}</div></div>
            <div><div class="s-lbl">Capacity</div><div class="mono">${esc(dash(pit.capacity))}</div></div>
            <div><div class="s-lbl">Claimed BPS</div><div class="mono">${esc(dash(pit.claimedBps))}</div></div>
            <div><div class="s-lbl">Vision</div><div>${pit.vision ? esc((pit.visionAreas || []).join(', ') || 'yes') : 'None'}</div></div>
            <div><div class="s-lbl">Language</div><div>${esc(dash(pit.lang))}</div></div>
            <div><div class="s-lbl">Driver years</div><div class="mono">${esc(dash(pit.driverExp))}</div></div>
          </div>
          ${pit.notes ? `<hr class="rule tight" /><p class="prose">${esc(pit.notes)}</p>` : ''}
          <div class="card-note" style="margin-top:var(--s3)">Logged by ${esc(pit.by)}</div>`
        : emptyState({
            icon: 'robot', title: 'No pit report yet',
            body: 'Nobody has visited this pit. A report adds drivetrain, capacity, vision and autos to the pick score.',
            action: `<button class="btn sm" data-act="pit">${icon('robot')}Log their pit</button>`,
          })}
      </div>

      <div class="row wrap" style="gap:var(--s2)">
        <button class="btn" data-act="pick">${icon('picklist')}Add to pick list</button>
        <button class="btn ghost" data-act="compare">${icon('compare')}Compare</button>
        <a class="btn ghost" href="https://www.thebluealliance.com/team/${t.team}/2026" target="_blank" rel="noopener">
          ${icon('external')}The Blue Alliance</a>
      </div>
    </div>`, {
    onMount(panel) {
      panel.addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'close') return closeDrawer();
        closeDrawer();
        if (act === 'pick') onPick?.(t.team);
        if (act === 'compare') onCompare?.(t.team);
        if (act === 'scout' || act === 'pit') onScout?.(t.team, act);
      });
    },
  });
}

/* ─────────────────────────── compare ─────────────────────────── */

let comparing = [];

export function addToCompare(team) {
  team = Number(team);
  if (comparing.includes(team)) return;
  if (comparing.length >= 3) comparing.shift();
  comparing.push(team);
}

const SERIES_COLORS = ['var(--gold-300)', 'var(--info)', 'var(--pos)'];

export function renderCompare(root) {
  const rows = comparing.map(n => state.teams.find(t => t.team === n)).filter(Boolean);
  const options = state.teams.map(t =>
    `<option value="${t.team}">${t.team} · ${esc(t.name)}</option>`).join('');

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Head to head', title: 'Compare Robots',
      lede: 'Put two or three robots on the same axes. Useful right before a pick, and useful for deciding who to defend.',
      actions: rows.length ? `<button class="btn ghost" data-act="clear">${icon('x')}Clear</button>` : '',
    })}
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="row wrap" style="gap:var(--s3)">
        <select id="cmpAdd" style="max-width:22rem"><option value="">Add a robot to the comparison…</option>${options}</select>
        <div class="chips">${rows.map((t, i) => `<span class="tag" style="box-shadow:inset 0 0 0 1px ${SERIES_COLORS[i]};color:${SERIES_COLORS[i]}">
          ${t.team}<button data-drop="${t.team}" aria-label="Remove ${t.team}" style="display:flex">${icon('x')}</button></span>`).join('')}</div>
      </div>
    </div>

    ${rows.length < 2 ? `<div class="card">${emptyState({
      icon: 'compare', title: 'Pick at least two robots',
      body: 'Add robots from the dropdown above, from a table row, or from the command palette.',
    })}</div>` : `
    <div class="g12">
      <div class="card c5">
        <div class="card-head"><div class="h-sec">Profile overlay</div></div>
        ${radar(rows.map((t, i) => ({ color: SERIES_COLORS[i], values: axisValues(t) })), AXES, { size: 260 })}
      </div>
      <div class="card c7 flush">
        <div class="card-head"><div class="h-sec">Side by side</div></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Metric</th>${rows.map((t, i) =>
            `<th class="n" style="color:${SERIES_COLORS[i]}">${t.team}</th>`).join('')}</tr></thead>
          <tbody>
            ${[
              ['OPR', t => num(t.opr, 1)], ['EPA', t => num(t.epa, 1)],
              ['DPR', t => num(t.dpr, 1)], ['CCWM', t => num(t.ccwm, 1)],
              ['Auto rate', t => num(t.autoBps, 2)], ['Teleop rate', t => num(t.teleopBps, 2)],
              ['Win rate', t => t.winPct != null ? t.winPct + '%' : '–'],
              ['Consistency', t => t.consistency != null ? t.consistency : '–'],
              ['Matches we scouted', t => t.scouted || '–'],
              ['Pit report', t => t.hasPit ? 'yes' : 'no'],
              ['Pick score', t => num(t.score, 1)],
            ].map(([label, fn]) => `<tr><td>${label}</td>${rows.map(t =>
              `<td class="n">${fn(t)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    </div>`}`;

  hydrate(root);
}

export function bindCompare(root, rerender) {
  root.addEventListener('change', e => {
    if (e.target.id !== 'cmpAdd' || !e.target.value) return;
    addToCompare(e.target.value);
    rerender();
  });
  root.addEventListener('click', e => {
    const drop = e.target.closest('[data-drop]');
    if (drop) { comparing = comparing.filter(t => t !== Number(drop.dataset.drop)); rerender(); return; }
    if (e.target.closest('[data-act="clear"]')) { comparing = []; rerender(); }
  });
}
