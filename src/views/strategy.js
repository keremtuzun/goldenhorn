/* Match Predictor, Pick List, Alliance Draft and Rank Projection. */

import { $, $$, esc, num, clamp, mean, seeded, downloadFile, toCSV } from '../util.js';
import { icon } from '../icons.js';
import { state, persist, emit, savePicks } from '../store.js';
import { teamName, predictAlliance, winProbability, scoreTeams } from '../api.js';
import { histogram } from '../charts.js';
import { hydrate, toast, confirmAction } from '../ui.js';
import { pageHead, statTile, emptyState, dataStrip } from './parts.js';

const OUR = () => state.settings.ourTeam;

/* ─────────────────────────── match predictor ─────────────────────────── */

let picked = { red: [null, null, null], blue: [null, null, null] };

export function renderPredictor(root) {
  const options = extra => '<option value="">Select a robot…</option>' +
    state.teams.map(t => `<option value="${t.team}"${String(extra) === String(t.team) ? ' selected' : ''}>${
      t.team} · ${esc(t.name)}${t.opr != null ? ` (OPR ${num(t.opr, 0)})` : ''}</option>`).join('');

  const upcoming = state.matches.filter(m => !m.played).slice(0, 20);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Alliance predictor', title: 'Match Predictor',
      lede: 'Because the model works at alliance level, any three on three can be projected from measured contribution. Load a real match off the schedule or build one by hand.',
    })}
    ${dataStrip()}
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div><div class="h-sec">${icon('target')}Set the field</div></div>
        ${upcoming.length ? `<select id="loadMatch" style="max-width:20rem">
          <option value="">Load an upcoming match…</option>
          ${upcoming.map(m => `<option value="${m.key}">Qual ${m.number} · ${m.red.join(', ')} vs ${m.blue.join(', ')}</option>`).join('')}
        </select>` : ''}
      </div>
      <div class="g12">
        <div class="c6">
          <div class="h-sub" style="color:var(--red-al);margin-bottom:var(--s3)">Red alliance</div>
          ${picked.red.map((v, i) => `<div class="field"><select class="pred" data-side="red" data-i="${i}">${options(v)}</select></div>`).join('')}
        </div>
        <div class="c6">
          <div class="h-sub" style="color:var(--blue-al);margin-bottom:var(--s3)">Blue alliance</div>
          ${picked.blue.map((v, i) => `<div class="field"><select class="pred" data-side="blue" data-i="${i}">${options(v)}</select></div>`).join('')}
        </div>
      </div>
      <button class="btn full lg" data-act="predict">${icon('activity')}Project this match</button>
    </div>
    <div id="predOut"></div>`;

  hydrate(root);
  if (picked.red.some(Boolean) && picked.blue.some(Boolean)) runPredict(root);
}

export function runPredict(root) {
  const out = $('#predOut', root);
  const red = predictAlliance(picked.red.filter(Boolean));
  const blue = predictAlliance(picked.blue.filter(Boolean));

  if (!red.rows.length || !blue.rows.length) {
    out.innerHTML = `<div class="card">${emptyState({
      icon: 'target', title: 'Put at least one robot on each side',
      body: 'The projection sums measured contribution, so both alliances need at least one team with data.',
    })}</div>`;
    return;
  }

  const margin = red.score - blue.score;
  const pRed = winProbability(margin);
  const favoured = margin >= 0 ? 'red' : 'blue';
  const pShown = Math.round((margin >= 0 ? pRed : 1 - pRed) * 100);

  // What each side is actually leaning on, so the number is arguable rather
  // than oracular.
  const drivers = rows => [...rows].sort((a, b) => (b.opr ?? 0) - (a.opr ?? 0))
    .map(t => `<div class="row" style="gap:var(--s2)">
      <span class="tchip">${t.team}</span>
      <div class="meter" style="flex:1"><i data-w="${clamp(((t.opr ?? 0) / Math.max(1, red.score + blue.score)) * 240, 4, 100)}%"></i></div>
      <span class="mono dim" style="font-size:var(--t-xs)">${num(t.opr, 1)}</span>
    </div>`).join('');

  out.innerHTML = `
    <div class="g12">
      <div class="card c7">
        <div class="card-head"><div class="h-sec">Projection</div>
          <span class="tag ${favoured}-al">${favoured} favoured</span></div>
        <div class="row" style="gap:var(--s5);margin:var(--s4) 0">
          <div style="text-align:center;flex:0 0 5rem">
            <div class="s-val" style="color:var(--red-al)" data-count="${Math.round(red.score)}">0</div>
            <div class="s-lbl">Red</div>
          </div>
          <div style="flex:1">
            <div class="meter thick"><i class="${favoured}-al" data-w="${pShown}%"></i></div>
            <div class="row between" style="margin-top:var(--s2);font-size:var(--t-xs);color:var(--text-4)">
              <span>${pShown}% chance the ${favoured} alliance wins</span>
              <span>${Math.abs(Math.round(margin))} point margin</span>
            </div>
          </div>
          <div style="text-align:center;flex:0 0 5rem">
            <div class="s-val" style="color:var(--blue-al)" data-count="${Math.round(blue.score)}">0</div>
            <div class="s-lbl">Blue</div>
          </div>
        </div>
        <hr class="rule tight" />
        <p class="prose">Alliance scores are summed OPR, which is by construction each team's measured
        contribution to its alliance. The win chance is a logistic on the projected margin, scaled by
        how spread out contribution actually is at this event, so a ten point gap in a tight field means
        more than a ten point gap in a lopsided one.</p>
      </div>

      <div class="card c5">
        <div class="card-head"><div class="h-sec">Who carries each side</div></div>
        <div class="s-lbl" style="color:var(--red-al)">Red</div>
        <div class="stack tight" style="margin-bottom:var(--s4)">${drivers(red.rows)}</div>
        <div class="s-lbl" style="color:var(--blue-al)">Blue</div>
        <div class="stack tight">${drivers(blue.rows)}</div>
      </div>
    </div>`;

  hydrate(out, { animate: false });
}

export function bindPredictor(root) {
  root.addEventListener('change', e => {
    const sel = e.target.closest('.pred');
    if (sel) {
      picked[sel.dataset.side][Number(sel.dataset.i)] = sel.value || null;
      runPredict(root);
      return;
    }
    if (e.target.id === 'loadMatch' && e.target.value) {
      const m = state.matches.find(x => x.key === e.target.value);
      if (!m) return;
      picked = { red: [...m.red], blue: [...m.blue] };
      // The listener is delegated on root, so re-rendering the page keeps it.
      renderPredictor(root);
    }
  });
  root.addEventListener('click', e => {
    if (e.target.closest('[data-act="predict"]')) runPredict(root);
  });
}

export function setPredictorMatch(m) { picked = { red: [...m.red], blue: [...m.blue] }; }

/* ─────────────────────────── pick list ─────────────────────────── */

const LANES = [
  { id: 'first',  label: 'First pick',   note: 'Robots that make us a contender.' },
  { id: 'second', label: 'Second pick',  note: 'Specialists and reliable partners.' },
  { id: 'pool',   label: 'Unsorted',     note: 'Everyone not yet placed.' },
  { id: 'dnp',    label: 'Do not pick',  note: 'Say why. The drive team will ask.' },
];

const WEIGHT_LABELS = {
  opr: 'Contribution', auto: 'Autonomous', teleop: 'Teleop rate',
  defense: 'Defence', consistency: 'Climb rate', pit: 'Pit report on file',
};

export function seedPickList({ force = false } = {}) {
  const picks = state.picks;
  if (picks.seeded && !force) return;
  const ranked = scoreTeams(state.teams).filter(t => t.team !== OUR())
    .sort((a, b) => b.score - a.score);
  picks.order = ranked.map(t => t.team);
  picks.tier = {};
  ranked.forEach((t, i) => { picks.tier[t.team] = i < 8 ? 'first' : i < 24 ? 'second' : 'pool'; });
  picks.seeded = true;
  persist('picks');
}

function laneTeams(lane) {
  return state.picks.order
    .filter(t => (state.picks.tier[t] || 'pool') === lane)
    .map(t => state.teams.find(x => x.team === t))
    .filter(Boolean);
}

function pickRow(t, index) {
  const note = state.picks.notes[t.team];
  return `<div class="pick" data-team="${t.team}" draggable="false">
    <span class="grip" data-grip>${icon('grip')}</span>
    <span class="p-rk">${index + 1}</span>
    <div style="min-width:0">
      <div class="row" style="gap:var(--s2)">
        <span class="p-team">${t.team}</span>
        ${t.hasPit ? `<span class="tag" title="Pit report on file">${icon('robot')}</span>` : ''}
      </div>
      <div class="p-name">${esc(t.name)}${note ? ` · ${esc(note)}` : ''}</div>
    </div>
    <span class="p-score">${num(t.score, 1)}</span>
    <button class="iconbtn" data-note="${t.team}" title="Note" aria-label="Add a note about ${t.team}">${icon('edit')}</button>
  </div>`;
}

export function renderPickList(root) {
  seedPickList();
  const w = state.settings.weights;

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Alliance selection', title: 'Pick List',
      lede: 'Ranked by a score you control, then reordered by hand. Drag between columns, print it, and take it to the table.',
      actions: `<button class="btn ghost no-print" data-act="reseed">${icon('refresh')}Reseed from data</button>
                <button class="btn ghost no-print" data-act="export">${icon('download')}CSV</button>
                <button class="btn no-print" data-act="print">${icon('print')}Print</button>`,
    })}
    <div class="g12">
      <div class="card c4 no-print">
        <div class="card-head"><div><div class="h-sec">${icon('sliders')}What matters to us</div>
          <div class="card-note">Move a slider and every score below recomputes. Hand-placed robots stay where you put them.</div></div></div>
        <div class="weights">
          ${Object.entries(w).map(([k, v]) => `<div class="weight-row">
            <span>${esc(WEIGHT_LABELS[k] || k)}</span>
            <input type="range" min="0" max="50" value="${v}" data-weight="${k}" />
            <output>${v}</output>
          </div>`).join('')}
        </div>
        <hr class="rule tight" />
        <p class="card-note">Consistency comes from our own scouted matches, so it only counts once
        a robot has been watched twice. Everything else comes off the live feed.</p>
      </div>

      <div class="c8">
        <div class="g12" id="lanes">
          ${LANES.map(l => {
            const rows = laneTeams(l.id);
            return `<div class="card ${l.id === 'pool' ? 'c12' : 'c6'}" data-lane="${l.id}">
              <div class="card-head">
                <div><div class="h-sec">${esc(l.label)} <span class="tag">${rows.length}</span></div>
                <div class="card-note">${esc(l.note)}</div></div>
              </div>
              <div class="picklane" data-lane-body="${l.id}">
                ${rows.length ? rows.map(pickRow).join('')
                  : `<p class="card-note" style="padding:var(--s3);text-align:center">Drag robots here.</p>`}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  hydrate(root);
  wireDrag(root);
}

/** Pointer-based drag so it works with a mouse in the stands and a finger on a
 *  tablet in the pit. HTML5 drag and drop does neither of those reliably. */
function wireDrag(root) {
  let dragging = null;

  root.addEventListener('pointerdown', e => {
    const grip = e.target.closest('[data-grip]');
    if (!grip) return;
    dragging = grip.closest('.pick');
    dragging.classList.add('dragging');
    dragging.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  root.addEventListener('pointermove', e => {
    if (!dragging) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const lane = under?.closest('[data-lane-body]');
    if (!lane) return;
    $$('[data-lane-body]', root).forEach(l => l.classList.toggle('over', l === lane));

    const sibling = under.closest('.pick');
    if (sibling && sibling !== dragging) {
      const box = sibling.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      lane.insertBefore(dragging, after ? sibling.nextSibling : sibling);
    } else if (!sibling && lane !== dragging.parentElement) {
      lane.appendChild(dragging);
    }
  });

  const finish = () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    $$('[data-lane-body]', root).forEach(l => l.classList.remove('over'));
    commitOrder(root);
    dragging = null;
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}

function commitOrder(root) {
  const order = [], tier = {};
  $$('[data-lane-body]', root).forEach(lane => {
    const id = lane.dataset.laneBody;
    $$('.pick', lane).forEach(p => {
      const t = Number(p.dataset.team);
      order.push(t);
      tier[t] = id;
    });
  });
  // Anything not on screen (filtered out, or added since) keeps its place.
  state.picks.order.forEach(t => { if (!order.includes(t)) { order.push(t); tier[t] = state.picks.tier[t] || 'pool'; } });
  state.picks.order = order;
  state.picks.tier = tier;
  savePicks();
  renumberLanes(root);
}

function renumberLanes(root) {
  $$('[data-lane-body]', root).forEach(lane => {
    $$('.pick', lane).forEach((p, i) => { $('.p-rk', p).textContent = i + 1; });
    const card = lane.closest('[data-lane]');
    const count = $$('.pick', lane).length;
    const badge = $('.h-sec .tag', card);
    if (badge) badge.textContent = count;
  });
}

export function addToPickList(team, lane = 'first') {
  seedPickList();
  team = Number(team);
  state.picks.order = [team, ...state.picks.order.filter(t => t !== team)];
  state.picks.tier[team] = lane;
  savePicks();
}

export function bindPickList(root, rerender) {
  root.addEventListener('input', e => {
    const slider = e.target.closest('[data-weight]');
    if (!slider) return;
    state.settings.weights[slider.dataset.weight] = Number(slider.value);
    slider.nextElementSibling.textContent = slider.value;
    persist('settings');
    state.teams = scoreTeams(state.teams);
    // Update scores in place so a slider drag does not rebuild the whole page.
    $$('.pick', root).forEach(p => {
      const t = state.teams.find(x => x.team === Number(p.dataset.team));
      if (t) $('.p-score', p).textContent = num(t.score, 1);
    });
  });

  root.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const noteFor = e.target.closest('[data-note]')?.dataset.note;

    if (noteFor) {
      const current = state.picks.notes[noteFor] || '';
      const next = window.prompt(`Note about ${noteFor} ${teamName(noteFor)}`, current);
      if (next != null) {
        if (next.trim()) state.picks.notes[noteFor] = next.trim();
        else delete state.picks.notes[noteFor];
        savePicks();
        rerender();
      }
      return;
    }
    if (act === 'reseed') {
      const ok = await confirmAction({
        title: 'Reseed the pick list?',
        body: 'Every robot goes back to where the weighted score puts it. Your hand ordering and tier moves are lost. Notes are kept.',
        confirmLabel: 'Reseed it',
      });
      if (ok) { seedPickList({ force: true }); rerender(); toast('Pick list reseeded from live data.', 'pos'); }
    }
    if (act === 'print') window.print();
    if (act === 'export') {
      const rows = state.picks.order.map((t, i) => {
        const row = state.teams.find(x => x.team === t);
        return {
          rank: i + 1, team: t, name: row?.name || '', tier: state.picks.tier[t] || 'pool',
          score: row?.score ?? '', opr: row?.opr ?? '', dpr: row?.dpr ?? '',
          note: state.picks.notes[t] || '',
        };
      });
      downloadFile(`picklist-${state.settings.event}.csv`, toCSV(rows));
      toast('Pick list exported.', 'pos');
    }
  });
}

/* ─────────────────────────── alliance draft ─────────────────────────── */

/** Serpentine order: captains 1 to 8 take a first pick, then 8 back down to 1
 *  take a second. A captain who is picked is replaced by the next seed, which
 *  is the part teams forget when they plan. */
function draftOrder() { return [...Array(8).keys(), ...[...Array(8).keys()].reverse()]; }

export function startDraft() {
  const seeds = [...state.teams]
    .sort((a, b) => (a.evtRank ?? 999) - (b.evtRank ?? 999) || (b.opr ?? 0) - (a.opr ?? 0));
  const captains = seeds.slice(0, 8).map(t => t.team);
  state.draft = {
    captains,
    alliances: captains.map(c => [c]),
    available: seeds.slice(8).map(t => t.team),
    step: 0,
    log: [],
  };
  emit('draft');
}

function bestAvailable(available) {
  const ranked = state.picks.order.filter(t => available.includes(t) && state.picks.tier[t] !== 'dnp');
  return ranked[0] ?? available[0] ?? null;
}

export function draftStep() {
  const d = state.draft;
  if (!d || d.step >= 16) return;
  const order = draftOrder();
  const ai = order[d.step];
  const alliance = d.alliances[ai];
  const captain = d.captains[ai];

  // Other captains pick greedily off measured contribution; we pick off our list.
  const isUs = captain === OUR();
  let choice;
  if (isUs) choice = bestAvailable(d.available);
  else {
    choice = [...d.available]
      .map(t => state.teams.find(x => x.team === t))
      .filter(Boolean)
      .sort((a, b) => (b.opr ?? 0) - (a.opr ?? 0))[0]?.team ?? d.available[0];
  }
  if (choice == null) { d.step = 16; emit('draft'); return; }

  alliance.push(choice);
  d.available = d.available.filter(t => t !== choice);
  d.log.push({ step: d.step + 1, alliance: ai + 1, captain, choice, us: isUs });
  d.step++;
  emit('draft');
}

export function renderDraft(root) {
  const d = state.draft;

  if (!d) {
    root.innerHTML = `
      ${pageHead({
        eyebrow: 'Selection simulator', title: 'Alliance Draft',
        lede: 'Run the serpentine before you live it. Seeds come from the event ranking, other captains pick greedily off contribution, and we pick off your list.',
      })}
      ${dataStrip()}
      <div class="card">${emptyState({
        icon: 'users', title: 'Nothing drafted yet',
        body: 'Seed eight captains from the current standings and walk the sixteen picks one at a time, or run the whole thing.',
        action: `<button class="btn" data-act="start">${icon('play')}Seed the captains</button>`,
      })}</div>`;
    hydrate(root);
    return;
  }

  const order = draftOrder();
  const onClock = d.step < 16 ? d.captains[order[d.step]] : null;
  const ourAlliance = d.alliances.findIndex(a => a.includes(OUR()));
  const best = bestAvailable(d.available);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Selection simulator', title: 'Alliance Draft',
      lede: 'Pick sixteen of these and you know who is realistically there when your turn comes round.',
      actions: `<button class="btn ghost" data-act="reset">${icon('refresh')}Restart</button>
                ${d.step < 16 ? `<button class="btn ghost" data-act="step">${icon('right')}One pick</button>
                <button class="btn" data-act="run">${icon('play')}Run the rest</button>` : ''}`,
    })}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Picks made', value: d.step, icon: 'users', sub: `<span class="dim">of 16</span>` })}
      ${statTile({ label: 'On the clock', value: onClock ? String(onClock) : 'Done', icon: 'clock',
        sub: onClock ? `<span class="dim">${esc(teamName(onClock))}</span>` : '<span class="tag pos">draft complete</span>' })}
      ${statTile({ label: 'Best still available', value: best ? String(best) : '–', icon: 'star',
        sub: best ? `<span class="dim">${esc(teamName(best))}</span>` : '' })}
      ${statTile({ label: 'Our alliance', value: ourAlliance >= 0 ? `#${ourAlliance + 1}` : 'Not picked', icon: 'trophy',
        sub: ourAlliance >= 0 ? `<span class="tag gold">${d.alliances[ourAlliance].join(' · ')}</span>`
          : '<span class="dim">still on the board</span>' })}
    </div>

    <div class="draft-board" style="margin-bottom:var(--s4)">
      ${d.alliances.map((a, i) => `
        <div class="alli ${a.includes(OUR()) ? 'us' : ''}">
          <h6>Alliance ${i + 1}${onClock === d.captains[i] && d.step < 16 ? ' · on the clock' : ''}</h6>
          ${[0, 1, 2].map(s => a[s]
            ? `<div class="slot"><b>${a[s]}</b><span class="dim" style="overflow:hidden;text-overflow:ellipsis">${esc(teamName(a[s]))}</span></div>`
            : '<div class="slot empty">open</div>').join('')}
        </div>`).join('')}
    </div>

    <div class="g12">
      <div class="card c7 flush">
        <div class="card-head"><div class="h-sec">${icon('history')}Pick order</div></div>
        ${d.log.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>#</th><th>Alliance</th><th>Captain</th><th>Took</th></tr></thead>
          <tbody>${d.log.map(l => `<tr class="${l.us ? 'me' : ''}">
            <td class="rk">${l.step}</td><td>${l.alliance}</td>
            <td class="mono">${l.captain}</td>
            <td><div class="team-cell"><b>${l.choice}</b><span class="tn">${esc(teamName(l.choice))}</span></div></td>
          </tr>`).join('')}</tbody></table></div>`
        : `<p class="card-note" style="padding:var(--s5)">No picks yet. Step through or run it.</p>`}
      </div>
      <div class="card c5">
        <div class="card-head"><div><div class="h-sec">${icon('picklist')}Still on the board</div>
          <div class="card-note">In your pick list order, do-not-pick robots removed.</div></div></div>
        <div class="stack tight" style="max-height:26rem;overflow-y:auto">
          ${state.picks.order.filter(t => d.available.includes(t) && state.picks.tier[t] !== 'dnp')
            .slice(0, 20).map((t, i) => {
              const row = state.teams.find(x => x.team === t);
              return `<div class="pick" data-click data-team="${t}">
                <span class="p-rk">${i + 1}</span>
                <div style="min-width:0"><span class="p-team">${t}</span>
                <div class="p-name">${esc(row?.name || '')}</div></div>
                <span class="p-score">${num(row?.score, 1)}</span></div>`;
            }).join('') || '<p class="card-note">Everyone has been taken.</p>'}
        </div>
      </div>
    </div>`;

  hydrate(root);
}

export function bindDraft(root, rerender) {
  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') { startDraft(); rerender(); }
    if (act === 'reset') { state.draft = null; rerender(); }
    if (act === 'step') { draftStep(); rerender(); }
    if (act === 'run') {
      while (state.draft && state.draft.step < 16) draftStep();
      rerender();
      toast('Draft complete. Check which alliance you landed on.', 'pos');
    }
  });
}

/* ─────────────────────────── rank projection ─────────────────────────── */

/** Monte Carlo over the matches still to play.
 *  This models win and loss from projected margin, not the season's ranking
 *  point rules, which are game specific and change every year. It answers "how
 *  many more do we win and roughly where does that land us", which is the
 *  question worth asking on Saturday morning. */
export function projectRank(runs = 2000) {
  const us = OUR();
  const remaining = state.matches.filter(m => !m.played);
  if (!remaining.length) return null;

  // Start from the wins already banked, so the projection is a continuation of
  // the event rather than a replay of it.
  const baseWins = {};
  state.teams.forEach(t => { baseWins[t.team] = t.wins || 0; });

  const rand = seeded(20260812);
  const finishes = [];
  let ourWinsTotal = 0;

  for (let run = 0; run < runs; run++) {
    const wins = { ...baseWins };
    for (const m of remaining) {
      const red = predictAlliance(m.red).score;
      const blue = predictAlliance(m.blue).score;
      const pRed = winProbability(red - blue);
      const redWon = rand() < pRed;
      (redWon ? m.red : m.blue).forEach(t => { wins[t] = (wins[t] || 0) + 1; });
    }
    ourWinsTotal += wins[us] || 0;
    const standings = Object.entries(wins)
      .sort(([, a], [, b]) => b - a)
      .map(([t]) => Number(t));
    finishes.push(standings.indexOf(us) + 1);
  }

  const fieldSize = state.teams.length;
  const bins = new Array(fieldSize).fill(0);
  finishes.forEach(f => { if (f >= 1) bins[f - 1]++; });

  const sorted = [...finishes].sort((a, b) => a - b);
  return {
    runs, remaining: remaining.length,
    median: sorted[Math.floor(runs / 2)],
    best: sorted[Math.floor(runs * 0.05)],
    worst: sorted[Math.floor(runs * 0.95)],
    top8: Math.round((finishes.filter(f => f <= 8).length / runs) * 100),
    avgWins: ourWinsTotal / runs,
    bins,
  };
}

export function renderProjection(root) {
  const hasSchedule = state.matches.some(m => !m.played);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Monte Carlo', title: 'Rank Projection',
      lede: 'Simulate every match we have left a couple of thousand times and see where the season actually lands.',
      actions: hasSchedule ? `<button class="btn" data-act="run">${icon('dice')}Run the simulation</button>` : '',
    })}
    ${dataStrip()}
    <div id="projOut">
      ${hasSchedule
        ? `<div class="card">${emptyState({
            icon: 'dice', title: 'Not simulated yet',
            body: 'Each run plays out every remaining qualification match using projected margins, then records where we finish.',
            action: `<button class="btn" data-act="run">${icon('play')}Run two thousand seasons</button>`,
          })}</div>`
        : `<div class="card">${emptyState({
            icon: 'calendar', title: 'No matches left to simulate',
            body: 'Either quals are done or the schedule has not been published for this event yet.',
          })}</div>`}
    </div>`;

  hydrate(root);
}

export function runProjection(root) {
  const out = $('#projOut', root);
  out.innerHTML = `<div class="card"><div class="skel" style="height:12rem;border-radius:var(--r-sm)"></div></div>`;

  // Yield a frame so the skeleton actually paints before the loop blocks.
  setTimeout(() => {
    const r = projectRank();
    if (!r) { renderProjection(root); return; }

    const worst = r.bins.length;
    out.innerHTML = `
      <div class="stats" style="margin-bottom:var(--s4)">
        ${statTile({ label: 'Most likely finish', value: r.median, icon: 'trophy',
          sub: `<span class="dim">across ${r.runs.toLocaleString()} simulated seasons</span>` })}
        ${statTile({ label: 'Realistic range', value: `${r.best} to ${r.worst}`, icon: 'activity',
          sub: '<span class="dim">middle 90 percent of outcomes</span>' })}
        ${statTile({ label: 'Chance of a top eight seed', value: r.top8, suffix: '%', icon: 'star' })}
        ${statTile({ label: 'Projected total wins', value: r.avgWins, decimals: 1, icon: 'trending',
          sub: `<span class="dim">${r.remaining} matches still to play</span>` })}
      </div>
      <div class="card">
        <div class="card-head"><div><div class="h-sec">${icon('chart')}Where we finish</div>
          <div class="card-note">Each bar is one final position, from first on the left to ${worst}th on the right. Taller means more of the simulated seasons ended there.</div></div></div>
        ${histogram(r.bins, { highlightIndex: r.median - 1 })}
        <hr class="rule tight" />
        <p class="prose">This models wins and losses from projected score margins. It does not model this
        season's ranking point rules, which change every year, so treat it as a read on form rather than a
        prediction of the official standings.</p>
      </div>`;
    hydrate(out);
  }, 30);
}

export function bindProjection(root) {
  root.addEventListener('click', e => {
    if (e.target.closest('[data-act="run"]')) runProjection(root);
  });
}
