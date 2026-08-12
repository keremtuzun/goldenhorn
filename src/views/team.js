/* Scout Leaderboard, Data and Sync, Roadmap. */

import { $, esc, num, fmtRel, downloadFile, toCSV, copyText } from '../util.js';
import { icon } from '../icons.js';
import { state, persist, pubId, syncBoard, flushQueue, saveMatchRecord } from '../store.js';
import { dbConfigured, signedIn, dbUser, dbHealthcheck } from '../db.js';
import { unpackRecord } from '../qr.js';
import { loadLive, loadSample, refreshDerived } from '../api.js';
import { hydrate, toast, openModal, closeModal, confirmAction } from '../ui.js';
import { pageHead, statTile, emptyState } from './parts.js';

/* ─────────────────────────── leaderboard ─────────────────────────── */

export function renderLeaderboard(root) {
  const me = state.user ? pubId(state.user.email) : null;
  const scouts = Object.entries(state.board.scouts || {})
    .map(([id, v]) => ({ id, name: v.name || 'Scout', matches: v.matches || 0, pit: v.pit || 0 }))
    .sort((a, b) => b.matches - a.matches || b.pit - a.pit || a.name.localeCompare(b.name));

  const totalMatches = scouts.reduce((s, x) => s + x.matches, 0);
  const totalPits = scouts.reduce((s, x) => s + x.pit, 0);
  const max = Math.max(1, scouts[0]?.matches || 1);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Recognising the grind', title: 'Scout Leaderboard',
      lede: 'None of this works without the people watching robots for eight hours. Everyone who signs up appears here, and the board moves as matches and pit reports land.',
      actions: `<button class="btn ghost" data-act="sync">${icon('refresh')}Sync now</button>`,
    })}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Matches scouted', value: totalMatches, icon: 'stopwatch' })}
      ${statTile({ label: 'Scout hours', value: totalMatches * 0.18, decimals: 1, suffix: 'h', icon: 'clock',
        sub: '<span class="dim">about eleven minutes a match</span>' })}
      ${statTile({ label: 'Pit reports', value: totalPits, icon: 'robot' })}
      ${statTile({ label: 'Active scouts', value: scouts.length, icon: 'users' })}
    </div>

    ${state.boardStatus === 'missing' || state.boardStatus === 'idle' ? `
      <div class="notice warn" style="margin-bottom:var(--s4)">${icon('database')}<div>
        <b>Showing this device only</b>
        <p>The shared team board is not connected, so these are the scouts registered here rather than
        the whole crew. Set a board URL on the Data page to join the devices up.</p></div>
        <button class="btn sm push" data-go="data">Fix it</button>
      </div>` : ''}

    <div class="card flush">
      <div class="card-head"><div><div class="h-sec">${icon('trophy')}The board</div>
        <div class="card-note">${state.boardStatus === 'ok'
          ? `Shared across every device on the team. Last synced ${esc(fmtRel(state.boardSynced))}.`
          : 'Local to this device until a shared board is connected.'}</div></div></div>
      ${scouts.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>#</th><th>Scout</th><th class="n">Matches</th><th class="n">Hours</th><th class="n">Pit reports</th><th>Share of the work</th></tr></thead>
        <tbody>${scouts.map((s, i) => `<tr class="${me && s.id === me ? 'me' : ''}">
          <td class="rk ${i < 3 && s.matches > 0 ? 'r' + (i + 1) : ''}">${i + 1}</td>
          <td><div class="row" style="gap:var(--s3)">
            <div class="avatar sm${me && s.id === me ? ' me' : ''}">${esc(s.name[0].toUpperCase())}</div>
            <b>${esc(s.name)}</b>${me && s.id === me ? '<span class="tag gold">you</span>' : ''}
          </div></td>
          <td class="n">${s.matches}</td>
          <td class="n">${num(s.matches * 0.18, 1)}h</td>
          <td class="n">${s.pit}</td>
          <td style="width:9rem"><div class="meter"><i data-w="${(s.matches / max) * 100}%"></i></div></td>
        </tr>`).join('')}</tbody>
      </table></div>`
      : emptyState({
          icon: 'users', title: 'Nobody on the board yet',
          body: 'New accounts show up here automatically. Get the crew signed up and start logging.',
        })}
    </div>`;

  hydrate(root);
}

export function bindLeaderboard(root, rerender) {
  root.addEventListener('click', async e => {
    if (!e.target.closest('[data-act="sync"]')) return;
    try {
      await syncBoard(true);
      rerender();
      toast('Board synced.', 'pos');
    } catch {
      toast('Could not reach the board. It will retry when you are back online.', 'warn');
    }
  });
}

/* ─────────────────────────── data and sync ─────────────────────────── */

const BOARD_TAGS = {
  ok:      ['pos',  'connected'],
  missing: ['warn', 'expired'],
  offline: ['neg',  'offline'],
  error:   ['neg',  'unreachable'],
  idle:    ['',     'not set'],
};
function boardTag() {
  const [tone, label] = BOARD_TAGS[state.boardStatus] || BOARD_TAGS.idle;
  return `<span class="tag ${tone}">${label}</span>`;
}

export function renderData(root) {
  const d = state.data;
  const canScan = 'BarcodeDetector' in window;

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Plumbing', title: 'Data and Sync',
      lede: 'Where the numbers come from, what is waiting to go out, and how to move a scouted match between devices when there is no network at all.',
    })}

    <div class="g12">
      <div class="card c6">
        <div class="card-head"><div class="h-sec">${icon('radio')}Live source</div>
          ${d.source === 'tba' || d.source === 'statbotics'
            ? '<span class="tag pos"><span class="pulse"></span>connected</span>'
            : d.source === 'sample' ? '<span class="tag warn">sample data</span>'
            : '<span class="tag neg">not connected</span>'}
        </div>
        <div class="field"><label for="cfgEvent">Event key</label>
          <input id="cfgEvent" value="${esc(state.settings.event)}" placeholder="2026tuis3" /></div>
        <div class="field"><label for="cfgTeam">Our team number</label>
          <input id="cfgTeam" type="number" value="${state.settings.ourTeam}" /></div>
        <div class="field"><label for="cfgKey">The Blue Alliance read key <span class="opt">optional</span></label>
          <input id="cfgKey" type="password" value="${esc(state.settings.tbaKey)}" placeholder="uses the shared key if blank" /></div>
        <p class="card-note" style="margin-bottom:var(--s4)">Statbotics needs no key and gives EPA. A free
        read key from thebluealliance.com/account adds real OPR, DPR, rankings and the schedule.
        Keys are stored in this browser only.</p>
        <div class="row" style="gap:var(--s2)">
          <button class="btn" data-act="connect">${icon('refresh')}Connect and pull</button>
          <button class="btn ghost" data-act="sample">Load sample data</button>
        </div>
        ${d.error ? `<div class="notice warn" style="margin-top:var(--s4)">${icon('alert')}<div>
          <b>Partial feed</b><p>${esc(d.error)}</p></div></div>` : ''}
      </div>

      <div class="card c6">
        <div class="card-head"><div><div class="h-sec">${icon('database')}Database</div>
          <div class="card-note">Real accounts and a real table for every match, pit report and pick list.</div></div>
          ${dbConfigured()
            ? (signedIn() ? '<span class="tag pos"><span class="pulse"></span>connected</span>'
                          : '<span class="tag warn">not signed in</span>')
            : '<span class="tag">not set up</span>'}
        </div>

        ${!dbConfigured() ? `<div class="notice" style="margin-bottom:var(--s4)">${icon('info')}<div>
          <b>Running on this device only</b>
          <p>Accounts and scouting data live in this browser. Point the app at a free Supabase project
          and everything moves to a real Postgres database with proper sign in, shared across every
          tablet on the team. Three steps, once.</p></div>
        </div>
        <div class="steps" style="margin-bottom:var(--s4)">
          <div class="step"><span class="s-n">1</span><div><b>Make a free project</b>
            <p>supabase.com, new project. The free tier is far more than a scouting season needs.</p></div></div>
          <div class="step"><span class="s-n">2</span><div><b>Run the schema</b>
            <p>Copy the SQL below into the project's SQL editor and run it once. It creates the tables and locks down who can edit what.</p></div></div>
          <div class="step"><span class="s-n">3</span><div><b>Paste the two values</b>
            <p>Project Settings, then API. The URL and the anon public key. The anon key is meant to be public: the database policies are what protect the data.</p></div></div>
        </div>` : ''}

        <div class="field"><label for="cfgDbUrl">Project URL</label>
          <input id="cfgDbUrl" value="${esc(state.settings.dbUrl || '')}" placeholder="https://xxxxxxxx.supabase.co" /></div>
        <div class="field"><label for="cfgDbKey">Anon public key</label>
          <input id="cfgDbKey" type="password" value="${esc(state.settings.dbKey || '')}" placeholder="eyJhbGciOi…" /></div>
        <div class="row wrap" style="gap:var(--s2)">
          <button class="btn" data-act="save-db">${icon('save')}Connect</button>
          <button class="btn ghost" data-act="test-db">${icon('activity')}Test connection</button>
          <button class="btn ghost" data-act="copy-sql">${icon('copy')}Copy the SQL</button>
          <a class="btn ghost" href="/supabase/schema.sql" target="_blank" rel="noopener">${icon('external')}View schema</a>
        </div>
        ${dbConfigured() && signedIn() ? `<p class="card-note" style="margin-top:var(--s3)">
          Signed in as <b>${esc(dbUser()?.email || '')}</b>. Passwords are hashed by the database and never stored here.</p>` : ''}
        <div id="dbTestOut"></div>
      </div>

      <div class="card c6">
        <div class="card-head"><div class="h-sec">${icon('layers')}${dbConfigured() ? 'Legacy shared board' : 'The team board'}</div>${boardTag()}</div>
        ${dbConfigured() ? `<div class="notice" style="margin-bottom:var(--s4)">${icon('checkCircle')}<div>
          <b>Superseded by the database</b><p>The old public JSON board is no longer used for syncing. Kept here only so nothing is lost if you switch back.</p></div></div>` : ''}

        ${state.boardStatus === 'missing' ? `<div class="notice warn" style="margin-bottom:var(--s4)">
          ${icon('alert')}<div><b>The shared board has expired</b>
          <p>Free JSON stores get cleaned up. Nothing has been lost: this device keeps every record and the
          leaderboard still works, it just is not being shared with the other tablets. To reconnect the crew,
          open <span class="mono">jsonblob.com</span>, save an empty <span class="mono">{}</span>, and paste
          the API URL it gives you below. Do it once, on every device.</p></div>
        </div>` : ''}

        <div class="field"><label for="cfgBoard">Board URL <span class="opt">GET and PUT JSON</span></label>
          <input id="cfgBoard" value="${esc(state.settings.boardUrl || '')}" placeholder="https://jsonblob.com/api/jsonBlob/…" /></div>
        <div class="row" style="gap:var(--s2);margin-bottom:var(--s4)">
          <button class="btn ghost sm" data-act="save-board">${icon('save')}Save board URL</button>
          <a class="btn ghost sm" href="https://jsonblob.com" target="_blank" rel="noopener">${icon('external')}Make a new one</a>
        </div>

        <div class="switch-row"><span>Waiting to send</span>
          <span class="tag ${state.queue.length ? 'warn' : 'pos'}">${state.queue.length} item${state.queue.length === 1 ? '' : 's'}</span></div>
        <div class="switch-row"><span>Match records here</span><span class="mono">${state.records.length}</span></div>
        <div class="switch-row"><span>Pit reports here</span><span class="mono">${state.pits.length}</span></div>
        <div class="switch-row"><span>Records seen on the board</span><span class="mono">${(state.board.matches || []).length}</span></div>
        <div class="switch-row"><span>Installed as an app</span>
          <span class="tag">${window.matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'}</span></div>
        <div class="row" style="gap:var(--s2);margin-top:var(--s4)">
          <button class="btn" data-act="push">${icon('upload')}Push to the board</button>
          <button class="btn ghost" data-act="pull">${icon('download')}Pull from the board</button>
        </div>
        <p class="card-note" style="margin-top:var(--s3)">The board is a public JSON document. Display names and
        tallies go on it, never emails, passwords or photos. Anyone with the URL can read and overwrite it, so
        treat it as a shared scratchpad and keep JSON backups.</p>
      </div>

      <div class="card c6">
        <div class="card-head"><div><div class="h-sec">${icon('qr')}Move a match without a network</div>
          <div class="card-note">The scouting tablet shows a code. This device reads it.</div></div></div>
        ${canScan
          ? `<button class="btn full" data-act="scan">${icon('scan')}Scan a code with the camera</button>
             <div class="rule tight"></div>`
          : `<div class="notice" style="margin-bottom:var(--s4)">${icon('info')}<div>
              <b>No camera decoder in this browser</b>
              <p>Chrome on Android can scan directly. Everywhere else, type or paste the code text below.</p>
            </div></div>`}
        <div class="field"><label for="qrIn">Or paste the code text</label>
          <textarea id="qrIn" rows="3" placeholder="GH1|9026|Q12|r|Elif K.|150|S38.I22…"></textarea></div>
        <button class="btn ghost full" data-act="import-code">${icon('upload')}Import this record</button>
      </div>

      <div class="card c6">
        <div class="card-head"><div class="h-sec">${icon('database')}Export and reset</div></div>
        <div class="stack tight">
          <button class="btn ghost full" style="justify-content:flex-start" data-act="ex-all">${icon('save')}Everything as JSON</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-act="ex-matches">${icon('download')}Match records as CSV</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-act="ex-pits">${icon('download')}Pit reports as CSV</button>
          <button class="btn ghost full" style="justify-content:flex-start" data-act="im-all">${icon('upload')}Restore from a JSON backup</button>
        </div>
        <hr class="rule tight" />
        <button class="btn neg full" data-act="wipe">${icon('trash')}Clear everything on this device</button>
        <p class="card-note" style="margin-top:var(--s3)">Wiping removes accounts, records, pit reports and
        the pick list from this browser. Anything already pushed to the board survives.</p>
      </div>
    </div>`;

  hydrate(root);
}

function exportEverything() {
  return JSON.stringify({
    exported: new Date().toISOString(),
    event: state.settings.event,
    settings: state.settings,
    records: state.records,
    pits: state.pits,
    picks: state.picks,
  }, null, 2);
}

export function bindData(root, rerender) {
  root.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'connect') {
      state.settings.event = $('#cfgEvent', root).value.trim() || '2026tuis3';
      state.settings.ourTeam = Number($('#cfgTeam', root).value) || 8159;
      state.settings.tbaKey = $('#cfgKey', root).value.trim();
      persist('settings');
      toast('Pulling live data…', 'info');
      const ok = await loadLive();
      rerender();
      toast(ok ? 'Connected.' : 'No feed responded. Check the event key.', ok ? 'pos' : 'neg');
      return;
    }

    if (act === 'sample') { loadSample(); rerender(); toast('Sample data loaded. Everything is badged.', 'warn'); return; }

    if (act === 'save-db') {
      state.settings.dbUrl = $('#cfgDbUrl', root).value.trim().replace(/\/+$/, '');
      state.settings.dbKey = $('#cfgDbKey', root).value.trim();
      persist('settings');
      const health = await dbHealthcheck();
      rerender();
      toast(health.ok ? 'Database connected. Create an account or sign in to start syncing.'
                      : `Saved, but: ${health.reason}`,
            health.ok ? 'pos' : 'warn', 6000);
      return;
    }

    if (act === 'test-db') {
      const out = $('#dbTestOut', root);
      out.innerHTML = `<div class="notice" style="margin-top:var(--s4)">${icon('clock')}<div><p>Testing…</p></div></div>`;
      const health = await dbHealthcheck();
      out.innerHTML = `<div class="notice ${health.ok ? 'pos' : 'neg'}" style="margin-top:var(--s4)">
        ${icon(health.ok ? 'checkCircle' : 'xCircle')}<div>
        <b>${health.ok ? (health.signedIn ? 'Connected and queries work' : 'Project reachable') : 'Not working'}</b>
        <p>${esc(health.reason || 'Tables are readable and the policies are in place.')}</p></div></div>`;
      return;
    }

    if (act === 'copy-sql') {
      try {
        const sql = await fetch('/supabase/schema.sql').then(r => r.text());
        const ok = await copyText(sql);
        toast(ok ? 'Schema copied. Paste it into the Supabase SQL editor and run it.'
                 : 'Could not copy. Open the schema link instead.', ok ? 'pos' : 'warn', 5000);
      } catch {
        toast('Could not read the schema file.', 'neg');
      }
      return;
    }

    if (act === 'save-board') {
      state.settings.boardUrl = $('#cfgBoard', root).value.trim();
      persist('settings');
      try { await syncBoard(false); } catch { /* status is set either way */ }
      rerender();
      toast(state.boardStatus === 'ok' ? 'Board connected.' : 'Saved, but that URL did not answer.',
        state.boardStatus === 'ok' ? 'pos' : 'warn');
      return;
    }

    if (act === 'push') {
      try { await syncBoard(true); await flushQueue(); rerender(); toast('Pushed to the board.', 'pos'); }
      catch {
        rerender();
        toast(state.boardStatus === 'missing'
          ? 'That board no longer exists. Make a new one and paste its URL.'
          : 'Could not reach the board.', 'neg');
      }
      return;
    }
    if (act === 'pull') {
      try { await syncBoard(false); rerender(); toast(
        state.boardStatus === 'ok' ? 'Pulled the latest board.' : 'The board did not answer.',
        state.boardStatus === 'ok' ? 'pos' : 'warn'); }
      catch { rerender(); toast('Could not reach the board.', 'neg'); }
      return;
    }

    if (act === 'import-code') {
      const text = $('#qrIn', root).value.trim();
      if (!text) { toast('Paste a code first.', 'warn'); return; }
      importCode(text, rerender);
      return;
    }

    if (act === 'scan') { scanWithCamera(rerender); return; }

    if (act === 'ex-all') {
      downloadFile(`goldenhorn-${state.settings.event}.json`, exportEverything(), 'application/json');
      toast('Full backup exported.', 'pos');
      return;
    }
    if (act === 'ex-matches') {
      if (!state.records.length) { toast('No match records to export yet.', 'warn'); return; }
      downloadFile('match-records.csv', toCSV(state.records.map(r => ({
        at: r.at, by: r.by, team: r.team, match: r.match, alliance: r.alliance, tracked: r.tracked,
        ...r.totals, defense: r.defense, driver: r.driver, broke: r.broke ? 1 : 0, notes: r.notes,
      }))));
      toast('Match records exported.', 'pos');
      return;
    }
    if (act === 'ex-pits') {
      if (!state.pits.length) { toast('No pit reports to export yet.', 'warn'); return; }
      downloadFile('pit-reports.csv', toCSV(state.pits.map(p => ({
        at: p.at, by: p.by, team: p.team, drivetrain: p.dt, module: p.module, wheel: p.wheel,
        intake: p.intake, capacity: p.capacity, claimedBps: p.claimedBps, vision: p.vision ? 1 : 0,
        visionAreas: (p.visionAreas || []).join(' '), language: p.lang,
        driverExp: p.driverExp, notes: p.notes,
      }))));
      toast('Pit reports exported.', 'pos');
      return;
    }

    if (act === 'im-all') {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          state.records = data.records || state.records;
          state.pits = data.pits || state.pits;
          state.picks = data.picks || state.picks;
          if (data.settings) Object.assign(state.settings, data.settings);
          persist();
          refreshDerived();
          rerender();
          toast(`Restored ${state.records.length} records and ${state.pits.length} pit reports.`, 'pos');
        } catch (err) {
          toast(`That file did not parse: ${err.message}`, 'neg');
        }
      };
      input.click();
      return;
    }

    if (act === 'wipe') {
      const ok = await confirmAction({
        title: 'Clear everything on this device?',
        body: 'Accounts, match records, pit reports, photos and the pick list all go. Export a backup first if you are not certain.',
        confirmLabel: 'Wipe it',
      });
      if (!ok) return;
      ['gh_accounts', 'gh_session', 'gh_pits', 'gh_matches', 'gh_picks', 'gh_queue',
       'gh_settings', 'gh_board_cache', 'gh_assign', 'gh_match_draft'].forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });
}

function importCode(text, rerender) {
  try {
    const rec = unpackRecord(text);
    saveMatchRecord(rec);
    refreshDerived();
    rerender();
    toast(`Imported team ${rec.team} from ${rec.match}.`, 'pos');
  } catch (err) {
    toast(`Not a valid code: ${err.message}`, 'neg');
  }
}

/** Camera scan where the browser can do it natively. No decoder shipped, so
 *  this is a genuine capability check rather than a broken button. */
async function scanWithCamera(rerender) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    toast('Camera permission was refused, so paste the code text instead.', 'warn');
    return;
  }
  const video = Object.assign(document.createElement('video'), { autoplay: true, playsInline: true, muted: true });
  video.srcObject = stream;
  video.style.cssText = 'width:100%;border-radius:var(--r-sm)';

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  let stop = false;
  const shutDown = () => { stop = true; stream.getTracks().forEach(t => t.stop()); };

  openModal(`<h3 class="h-sec">${icon('scan')}Point at the code</h3>
    <div id="camHost" style="margin:var(--s4) 0"></div>
    <div class="row end"><button class="btn ghost" data-close>Cancel</button></div>`, {
    onMount(panel) {
      $('#camHost', panel).appendChild(video);
      panel.addEventListener('click', ev => {
        if (ev.target.closest('[data-close]')) { shutDown(); closeModal(); }
      });
    },
  });

  const loop = async () => {
    if (stop) return;
    try {
      const found = await detector.detect(video);
      if (found.length) {
        shutDown();
        closeModal();
        importCode(found[0].rawValue, rerender);
        return;
      }
    } catch { /* frame not ready */ }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ─────────────────────────── roadmap ─────────────────────────── */

const ROADMAP = [
  { icon: 'camera', title: 'Record the scoreboard locally',
    body: 'Stop depending on the official stream. Lag and drops cost us matches at the championship. A camera on the arena scoreboard removes the internet from the loop entirely.' },
  { icon: 'zap', title: 'Push the reader past triple speed',
    body: 'Three times real time is fine for quals and tight during elimination brackets. Faster decoding and frame skipping on static regions is the obvious next win.' },
  { icon: 'users', title: 'More hands on the workflow',
    body: 'Grow the scouting subteam so the schedule stops being brutal on the same four people every event.' },
  { icon: 'map', title: 'Streamline auto path tracking',
    body: 'Auto mapping is manual and slow. Inspired by 498 The Cobra Commanders: open the video beside the map, click the robot second by second, and generate the timestamped path from that.' },
  { icon: 'share', title: 'Real multi-device sync',
    body: 'The shared board works but it is a public JSON store. A small authenticated backend would let us drop the caveats and keep photos with their reports.' },
  { icon: 'cpu', title: 'Solve on device',
    body: 'The bounded ridge solve already runs in the browser. Feeding it live flags mid-match would give the drive team a rate before the match even ends.' },
];

export function renderRoadmap(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: 'What is next', title: 'Roadmap',
      lede: 'We are happy with the results. But if we pulled this off, we can do better.',
    })}
    <div class="g12">
      ${ROADMAP.map(r => `<div class="card c6">
        <div class="h-sub">${icon(r.icon)}${esc(r.title)}</div>
        <p class="prose" style="margin-top:var(--s2)">${esc(r.body)}</p>
      </div>`).join('')}
    </div>
    <div class="card" style="margin-top:var(--s4);text-align:center">
      <p class="prose" style="margin:0 auto">In the off season we sit down with the scouters and the whole
      team, walk the entire workflow, and work out what to build next.
      <b>This platform changed our 2026 season.</b></p>
      <p style="margin-top:var(--s4);font-family:var(--serif);font-style:italic;font-size:var(--t-md);color:var(--gold-300)">
        Golden Horn 8159</p>
    </div>`;

  hydrate(root);
}
