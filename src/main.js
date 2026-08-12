/* Boot, routing and the wiring between pages. */

import { $, $$, debounce, afterPaint } from './util.js';
import { icon, mountIcons } from './icons.js';
import {
  state, events, resumeSession, startSession, endSession, signIn, signUp,
  getAccounts, syncBoard, flushQueue,
} from './store.js';
import { loadLive, loadSample } from './api.js';
import { initShell, registerCommands, openPalette, toast, closeAll } from './ui.js';

import * as Overview from './views/overview.js';
import * as Strategy from './views/strategy.js';
import * as Event from './views/event.js';
import * as Collect from './views/collect.js';
import * as Pipeline from './views/pipeline.js';
import * as Team from './views/team.js';

/* ─────────────────────────── page registry ─────────────────────────── */

const PAGES = {
  home:        { label: 'Dashboard',        icon: 'dashboard',  render: Overview.renderHome },
  analytics:   { label: 'Team Analytics',   icon: 'chart',      render: Overview.renderAnalytics },
  compare:     { label: 'Compare Robots',   icon: 'compare',    render: Overview.renderCompare },
  predictor:   { label: 'Match Predictor',  icon: 'target',     render: Strategy.renderPredictor },
  picklist:    { label: 'Pick List',        icon: 'picklist',   render: Strategy.renderPickList },
  draft:       { label: 'Alliance Draft',   icon: 'users',      render: Strategy.renderDraft },
  projection:  { label: 'Rank Projection',  icon: 'dice',       render: Strategy.renderProjection },
  schedule:    { label: 'Match Schedule',   icon: 'calendar',   render: Event.renderSchedule },
  assignments: { label: 'Scout Assignments',icon: 'table',      render: Event.renderAssignments },
  prescout:    { label: 'Pre-Scout',        icon: 'layers',     render: Collect.renderPrescout },
  pit:         { label: 'Pit Scout',        icon: 'robot',      render: Collect.renderPit },
  match:       { label: 'Match Scout',      icon: 'stopwatch',  render: Collect.renderMatch },
  cv:          { label: 'CV Scoreboard',    icon: 'camera',     render: Pipeline.renderCV },
  bps:         { label: 'The BPS Model',    icon: 'sigma',      render: Pipeline.renderBPS },
  leaderboard: { label: 'Scout Leaderboard',icon: 'trophy',     render: Team.renderLeaderboard },
  data:        { label: 'Data and Sync',    icon: 'database',   render: Team.renderData },
  roadmap:     { label: 'Roadmap',          icon: 'map',        render: Team.renderRoadmap },
};

let current = 'home';
const pageRoot = id => $(`#page-${id}`);
const rerender = id => () => PAGES[id].render(pageRoot(id));

/* Routes are real paths, so /picklist can be bookmarked, shared with the drive
   team, and opened cold. A rewrite sends every path to index.html; the hash
   form is still read so older links keep working. */
export function routeFromLocation() {
  const fromPath = location.pathname.replace(/^\/+|\/+$/g, '');
  const fromHash = location.hash.replace(/^#/, '');
  const candidate = fromPath || fromHash;
  return PAGES[candidate] ? candidate : 'home';
}

const pathFor = page => (page === 'home' ? '/' : `/${page}`);

export function go(page, { push = true } = {}) {
  if (!PAGES[page]) page = 'home';

  Overview.stopCountdown();
  Event.stopScheduleCountdown();

  current = page;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  $('#crumbNow').textContent = PAGES[page].label;
  document.title = `${PAGES[page].label} · Golden Horn 8159`;
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('on');

  PAGES[page].render(pageRoot(page));
  moveSeam();
  window.scrollTo({ top: 0 });

  // pushState, not replaceState. With replaceState the back button walks out of
  // the app entirely, which on a phone means leaving the site mid-match.
  if (push && pathFor(page) !== location.pathname) {
    history.pushState({ page }, '', pathFor(page));
  }
}

window.addEventListener('popstate', () => {
  if (appStarted) go(routeFromLocation(), { push: false });
});

/** Slides the gold hairline on the sidebar edge to sit against the active item. */
function moveSeam() {
  afterPaint(() => {
    const seam = $('#sideSeam');
    const active = $('.nav-item.active');
    if (!seam || !active || !active.offsetHeight) return;
    seam.style.height = `${active.offsetHeight - 12}px`;
    seam.style.transform = `translateY(${active.offsetTop + 6}px)`;
    seam.classList.add('on');
  });
}

/* ─────────────────────────── cross-page actions ─────────────────────────── */

const openTeam = team => Overview.openTeam(team, {
  onPick: t => { Strategy.addToPickList(t); go('picklist'); toast(`${t} added to the first pick column.`, 'pos'); },
  onCompare: t => { Overview.addToCompare(t); go('compare'); },
  onScout: (t, what) => go(what === 'pit' ? 'pit' : 'match'),
});

function bindPages() {
  // Analytics table sorting, filtering, and row clicks.
  Overview.bindAnalytics(pageRoot('analytics'), {
    onSort: () => rerender('analytics')(),
    onFilter: debounce(() => Overview.refreshAnalyticsBody(pageRoot('analytics')), 140),
  });
  Overview.bindCompare(pageRoot('compare'), rerender('compare'));

  Strategy.bindPredictor(pageRoot('predictor'));
  Strategy.bindPickList(pageRoot('picklist'), rerender('picklist'));
  Strategy.bindDraft(pageRoot('draft'), rerender('draft'));
  Strategy.bindProjection(pageRoot('projection'));

  Event.bindSchedule(pageRoot('schedule'), {
    rerender: rerender('schedule'),
    positionSegThumb: Overview.positionSegThumb,
    onScout: () => go('match'),
    onPredict: m => { if (m) { Strategy.setPredictorMatch(m); go('predictor'); } },
  });
  Event.bindAssignments(pageRoot('assignments'), rerender('assignments'));

  Collect.bindPit(pageRoot('pit'), rerender('pit'));
  Collect.bindMatch(pageRoot('match'), rerender('match'));

  Pipeline.bindCV(pageRoot('cv'));
  Pipeline.bindBPS(pageRoot('bps'));

  Team.bindLeaderboard(pageRoot('leaderboard'), rerender('leaderboard'));
  Team.bindData(pageRoot('data'), rerender('data'));

  // Anything anywhere can ask to navigate or open a team.
  $('#main').addEventListener('click', e => {
    const goTo = e.target.closest('[data-go]');
    if (goTo) { go(goTo.dataset.go); return; }

    const teamHit = e.target.closest('[data-click][data-team], .tchip[data-team]');
    if (teamHit) { openTeam(teamHit.dataset.team); return; }

    // The data-source strip appears on several pages and behaves the same on all.
    const act = e.target.closest('.srcbar [data-act]')?.dataset.act;
    if (act === 'retry') refreshLive();
    if (act === 'sample') { loadSample(); rerender(current)(); }
    if (act === 'source') go('data');
  });
}

/* ─────────────────────────── live data ─────────────────────────── */

async function refreshLive() {
  const btn = $('#refreshBtn');
  btn.classList.add('on');
  rerender(current)();
  const ok = await loadLive();
  btn.classList.remove('on');
  if (!ok) toast('No data feed responded. Check the event key on the Data page.', 'warn');
}

/* ─────────────────────────── topbar ─────────────────────────── */

function paintNetPill() {
  const host = $('#netPill');
  const queued = state.queue.length;

  if (!state.online) {
    host.innerHTML = `<span class="tag neg" title="Working offline. Everything is saved on this device and goes out when you reconnect.">
      ${icon('wifiOff')}Offline${queued ? ` · ${queued}` : ''}</span>`;
  } else if (state.boardStatus === 'missing') {
    host.innerHTML = `<span class="tag warn" title="The shared team board has expired. Everything still saves here. Set a new board on the Data page.">
      ${icon('database')}Local only</span>`;
  } else if (queued) {
    host.innerHTML = `<span class="tag warn">${icon('upload')}${queued} to sync</span>`;
  } else {
    host.innerHTML = `<span class="tag pos" title="Everything on this device is on the team board.">
      ${icon('check')}Synced</span>`;
  }
  mountIcons(host);
}

/* ─────────────────────────── command palette ─────────────────────────── */

function buildCommands() {
  const pageCmds = Object.entries(PAGES).map(([id, p]) => ({
    group: 'Go to', label: p.label, icon: p.icon, keywords: id, run: () => go(id),
  }));

  const teamCmds = state.teams.map(t => ({
    group: 'Teams', label: `${t.team} · ${t.name}`, icon: 'robot',
    keywords: `${t.team} ${t.name}`,
    hint: t.opr != null ? `OPR ${t.opr}` : '',
    run: () => openTeam(t.team),
  }));

  const actionCmds = [
    { group: 'Actions', label: 'Refresh live data', icon: 'refresh', run: refreshLive },
    { group: 'Actions', label: 'Push everything to the team board', icon: 'upload',
      run: async () => { try { await syncBoard(true); toast('Pushed.', 'pos'); } catch { toast('Board unreachable.', 'neg'); } } },
    { group: 'Actions', label: 'Print the pick list', icon: 'print', run: () => { go('picklist'); setTimeout(() => window.print(), 400); } },
    { group: 'Actions', label: 'Reseed the pick list from data', icon: 'picklist',
      run: () => { Strategy.seedPickList({ force: true }); go('picklist'); toast('Reseeded.', 'pos'); } },
    { group: 'Actions', label: 'Run a fresh alliance draft', icon: 'users',
      run: () => { Strategy.startDraft(); go('draft'); } },
    { group: 'Actions', label: 'Project our final rank', icon: 'dice',
      run: () => { go('projection'); setTimeout(() => Strategy.runProjection(pageRoot('projection')), 120); } },
    { group: 'Actions', label: 'Export everything as JSON', icon: 'save', run: () => go('data') },
    { group: 'Actions', label: 'Sign out', icon: 'logout', run: signOut },
  ];

  registerCommands([...pageCmds, ...actionCmds, ...teamCmds]);
}

/* ─────────────────────────── auth ─────────────────────────── */

let selectedRole = 'Scout';

function showError(id, message) {
  const box = $('#' + id);
  $('p', box).textContent = message;
  box.classList.remove('hidden');
}
const clearError = id => $('#' + id).classList.add('hidden');

function paintAccountCount() {
  const n = Object.keys(getAccounts()).length;
  $('#acctCount').textContent = n
    ? `${n} account${n > 1 ? 's' : ''} saved on this device`
    : 'No accounts here yet. Create one to get started.';
}

function moveAuthThumb() {
  const place = () => {
    const active = $('.auth-tab.active');
    const thumb = $('#authThumb');
    if (!active || !thumb || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  };
  afterPaint(place);
  // Fallback font metrics give the wrong width, so measure again once the
  // real faces have loaded.
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => afterPaint(place));
}

function bindAuth() {
  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    const which = tab.dataset.tab;
    $$('.auth-tab').forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    $('#paneIn').classList.toggle('active', which === 'in');
    $('#paneUp').classList.toggle('active', which === 'up');
    moveAuthThumb();
  }));

  $('#roleGrid').addEventListener('click', e => {
    const card = e.target.closest('.role');
    if (!card) return;
    $$('#roleGrid .role').forEach(r => r.classList.toggle('sel', r === card));
    selectedRole = card.dataset.role;
  });

  $('#paneIn').addEventListener('submit', e => {
    e.preventDefault();
    clearError('inErr');
    const { account, error } = signIn({
      email: $('#inEmail').value.trim(),
      pass: $('#inPass').value,
    });
    if (error) return showError('inErr', error);
    enterApp(account);
  });

  $('#paneUp').addEventListener('submit', e => {
    e.preventDefault();
    clearError('upErr');
    $('#upOk').classList.add('hidden');
    const name = $('#upName').value.trim();
    const email = $('#upEmail').value.trim();
    const pass = $('#upPass').value;
    const group = $('#upGroup').value.trim() || 'MARMARA-A';

    if (!name) return showError('upErr', 'We need a name to put on the leaderboard.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('upErr', 'That email does not look right.');
    if (pass.length < 6) return showError('upErr', 'Use at least six characters for the password.');

    const { account, error } = signUp({ name, email, pass, role: selectedRole, group });
    if (error) return showError('upErr', error);

    const ok = $('#upOk');
    $('p', ok).textContent = 'Account created. Signing you in.';
    ok.classList.remove('hidden');
    paintAccountCount();
    setTimeout(() => enterApp(account), 600);
  });
}

function enterAsGuest() {
  enterApp({
    name: 'Guest', email: '', role: 'Guest', group: 'browsing', guest: true,
  }, { remember: false });
  toast('Browsing as a guest. Anything you log stays on this device.', 'info', 5200);
}

function signOut() {
  endSession();
  location.assign('/');
}

/* ─────────────────────────── app entry ─────────────────────────── */

let appStarted = false;

function enterApp(account, { remember = true } = {}) {
  startSession(account, { remember });
  $('#login').style.display = 'none';
  $('#app').classList.add('show');

  const guest = Boolean(account.guest);
  $('#userAv').textContent = state.user.name[0].toUpperCase();
  $('#userAv').classList.toggle('me', !guest);
  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = guest
    ? 'Not credited on the board'
    : `${state.user.role} · ${state.user.group}`;
  $('#signOut').title = guest ? 'Create an account' : 'Sign out';
  $('#sideEvent').textContent = state.settings.event;

  if (appStarted) return;
  appStarted = true;

  bindPages();
  buildCommands();
  paintNetPill();

  // Landing on /picklist should open the pick list, not bounce to the dashboard.
  go(routeFromLocation(), { push: false });

  // First paint uses whatever is cached, then live data lands and repaints.
  loadLive().then(ok => {
    if (!ok && !state.teams.length) {
      toast('No live feed right now. Load sample data from the Data page to explore.', 'warn', 6000);
    }
  });
  syncBoard(false).catch(() => { /* offline, the cached board stands */ });
  flushQueue();
  // Poll the shared board, but stop once we know it has expired. Hammering a
  // URL that 404s every 45 seconds burns battery and fills the console.
  setInterval(() => {
    if (state.online && state.boardStatus !== 'missing') syncBoard(false).catch(() => {});
  }, 45000);
}

/* ─────────────────────────── global wiring ─────────────────────────── */

function bindChrome() {
  $('#menuBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    $('#scrim').classList.toggle('on');
  });
  $('#scrim').addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('on');
  });
  $('#nav').addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (item) go(item.dataset.page);
  });
  $('#nav').addEventListener('keydown', e => {
    const item = e.target.closest('.nav-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(item.dataset.page); }
  });
  $('#searchBtn').addEventListener('click', openPalette);
  $('#refreshBtn').addEventListener('click', refreshLive);
  $('#signOut').addEventListener('click', signOut);
  $('#guestBtn').addEventListener('click', enterAsGuest);

  window.addEventListener('resize', debounce(() => { moveSeam(); moveAuthThumb(); }, 120));

  document.addEventListener('keydown', e => {
    if (Collect.matchHotkeys(pageRoot('match'), e)) return;
    if (e.key === 'Escape') closeAll();
  });

  window.addEventListener('beforeunload', e => {
    if (Collect.matchIsLive()) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* State changes repaint whatever page is open, except a match in progress,
   which owns its own DOM until the scout is finished with it. */
events.on('change', () => {});
['teams', 'data', 'records', 'pits', 'board', 'queue', 'picks', 'draft'].forEach(evt => {
  events.on(evt, () => {
    if (!appStarted) return;
    paintNetPill();
    if (evt === 'teams') buildCommands();
    if (current === 'match' && Collect.matchIsLive()) return;
    PAGES[current]?.render(pageRoot(current));
  });
});
events.on('online', () => { paintNetPill(); if (state.online) toast('Back online. Syncing.', 'pos'); });

/* ─────────────────────────── progressive web app ─────────────────────────── */

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  const btn = $('#installBtn');
  btn.classList.remove('hidden');
  btn.onclick = async () => {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') { btn.classList.add('hidden'); toast('Installed. It works offline now.', 'pos'); }
    installPrompt = null;
  };
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[sw]', err));
  });
}

/* ─────────────────────────── boot ─────────────────────────── */

initShell();
bindAuth();
bindChrome();
mountIcons(document);
paintAccountCount();
moveAuthThumb();

const resumed = resumeSession();
if (resumed) enterApp(resumed);
