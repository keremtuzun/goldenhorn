/* Application state.
   One object, one change event, persisted to localStorage. Views read from
   here and never from each other. */

import { LS, uid, hash, bus } from './util.js';
import * as DB from './db.js';

const K = {
  accounts: 'gh_accounts',
  session : 'gh_session',
  pits    : 'gh_pits',
  matches : 'gh_matches',
  picks   : 'gh_picks',
  queue   : 'gh_queue',
  settings: 'gh_settings',
  board   : 'gh_board_cache',
};

/* Shared board. A public, unauthenticated JSON document is how a scouting
   laptop and six tablets see the same numbers without us running a server.
   Nothing private goes in it (see publicDoc below).

   These stores expire. The original board is gone, which is why the URL is a
   setting rather than a constant: when it dies, someone makes a new one and
   pastes it in on the Data page, and every device picks it up. Until then the
   app runs perfectly well against local storage and says so. */
export const DEFAULT_BOARD_URL =
  'https://jsonblob.com/api/jsonBlob/019f994c-0bc4-7236-bcdd-1599ccf838bd';

const DEFAULT_SETTINGS = {
  event: '2026tuis3',
  tbaKey: '',
  ourTeam: 8159,
  units: 'metric',
  boardUrl: DEFAULT_BOARD_URL,
  /* Supabase project. When both are set the app uses a real database with real
     accounts; when they are blank it runs exactly as before on local storage. */
  dbUrl: '',
  dbKey: '',
  weights: { opr: 40, auto: 15, teleop: 15, defense: 10, consistency: 10, pit: 10 },
};

export const events = bus();

export const state = {
  user: null,
  teams: [],            // metric rows, live or fallback
  matches: [],          // schedule from TBA when available
  matchesAreReal: false,
  pits: LS.get(K.pits, []),
  records: LS.get(K.matches, []),      // scouted match records
  picks: LS.get(K.picks, { order: [], tier: {}, notes: {}, seeded: false }),
  queue: LS.get(K.queue, []),
  board: LS.get(K.board, { scouts: {}, matches: [], pits: [] }),
  settings: { ...DEFAULT_SETTINGS, ...LS.get(K.settings, {}) },
  /* 'idle' | 'ok' | 'missing' (the board 404s) | 'offline' | 'error' */
  boardStatus: 'idle',
  boardSynced: null,
  data: { source: 'idle', updated: null, error: null, loading: false },
  online: navigator.onLine,
  draft: null,
  assignments: LS.get('gh_assign', null),
};

export function emit(what = 'change') { events.emit(what, state); }

/* ---------------- persistence ---------------- */
/** Writes the named slices to localStorage. Returns false if any write was
 *  rejected, which in practice means the quota is full. */
export function persist(...keys) {
  const map = {
    pits: () => LS.set(K.pits, state.pits),
    records: () => LS.set(K.matches, state.records),
    picks: () => LS.set(K.picks, state.picks),
    queue: () => LS.set(K.queue, state.queue),
    settings: () => LS.set(K.settings, state.settings),
    board: () => LS.set(K.board, state.board),
    assignments: () => LS.set('gh_assign', state.assignments),
  };
  return (keys.length ? keys : Object.keys(map))
    .map(k => (map[k] ? map[k]() : true))
    .every(Boolean);
}

export function setSettings(patch) {
  Object.assign(state.settings, patch);
  persist('settings');
  emit('settings');
}

/* ---------------- accounts ---------------- */
export const getAccounts = () => LS.get(K.accounts, {});
const saveAccounts = a => LS.set(K.accounts, a);
export const pubId = email => hash(String(email || '').toLowerCase());

/* With a database configured these go to real auth, where the password is
   hashed server side and never touches this device. Without one they fall back
   to the original local accounts, which are a convenience for a shared tablet
   and were never real security. */
export async function signUp({ name, email, pass, role, group }) {
  const key = email.toLowerCase();

  if (DB.dbConfigured()) {
    try {
      const res = await DB.dbSignUp({ email: key, password: pass, name, role, group });
      if (res.needsConfirmation) {
        return { needsConfirmation: true, message: 'Account created. Check your email to confirm it, then sign in.' };
      }
      return { account: { name, email: key, role, group, remote: true } };
    } catch (e) {
      return { error: e.message };
    }
  }

  const accts = getAccounts();
  if (accts[key]) return { error: 'An account with that email already exists. Try signing in.' };
  accts[key] = {
    name, email: key, role, group,
    pass: hash(pass), created: new Date().toISOString(),
    matches: 0, pit: 0,
  };
  saveAccounts(accts);
  return { account: accts[key] };
}

export async function signIn({ email, pass }) {
  const key = email.toLowerCase();

  if (DB.dbConfigured()) {
    try {
      await DB.dbSignIn({ email: key, password: pass });
      const meta = DB.dbUser()?.meta || {};
      return {
        account: {
          name: meta.name || key.split('@')[0],
          email: key,
          role: meta.role || 'Scout',
          group: meta.team_group || 'MARMARA-A',
          remote: true,
        },
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  const accts = getAccounts();
  const a = accts[key];
  if (!a) return { error: 'No account found for that email. Create one first.' };
  if (a.pass !== hash(pass)) return { error: 'That password does not match. Try again.' };
  return { account: a };
}

export function startSession(account, { remember = true } = {}) {
  state.user = {
    name: account.name, email: account.email,
    role: account.role, group: account.group,
    guest: Boolean(account.guest),
  };
  // A guest session is deliberately not remembered: closing the tab should not
  // leave someone permanently signed in as nobody.
  if (remember && account.email) LS.set(K.session, account.email);
  emit('user');
}

export function endSession() {
  LS.del(K.session);
  if (DB.dbConfigured()) DB.dbSignOut().catch(() => {});
}

export function resumeSession() {
  // A live database session outranks the local one: it is the account that can
  // actually write to the team's data.
  if (DB.dbConfigured() && DB.signedIn()) {
    const u = DB.dbUser();
    const meta = u?.meta || {};
    const account = {
      name: meta.name || u?.email?.split('@')[0] || 'Scout',
      email: u?.email || '',
      role: meta.role || 'Scout',
      group: meta.team_group || 'MARMARA-A',
      remote: true,
    };
    startSession(account);
    return account;
  }
  const email = LS.get(K.session);
  if (!email) return null;
  const a = getAccounts()[email];
  if (a) { startSession(a); return a; }
  return null;
}

/** Credits the signed-in scout and queues the change for the shared board. */
export function credit(field, n = 1) {
  if (!state.user) return;
  const accts = getAccounts();
  const a = accts[state.user.email];
  if (!a) return;
  a[field] = (a[field] || 0) + n;
  saveAccounts(accts);
  // With a database the leaderboard is counted from the rows themselves, so
  // there is no tally to push.
  if (!DB.dbConfigured()) enqueue('board', {});
}

/** Persists the pick list and queues it for the team. */
export function savePicks() {
  persist('picks');
  enqueue('picks', state.picks);
  emit('picks');
}

/* ---------------- scouting records ---------------- */
/** Replaces the feed-derived match rows with a fresh import.
 *
 *  These are not pushed to the database on purpose. They are public, objective
 *  and reproducible from the event key alone, so syncing them between devices
 *  would only duplicate The Blue Alliance into a free tier that is better spent
 *  on the things a human actually produced: pit reports and the pick list. */
export function importRecords(records) {
  const mine = state.records.filter(r => r.source !== 'tba');
  state.records = [...records, ...mine];
  persist('records');
  emit('records');
  return state.records.length;
}

export function savePitReport(rep) {
  const existing = state.pits.findIndex(p => String(p.team) === String(rep.team));
  const full = {
    id: existing >= 0 ? state.pits[existing].id : uid(),
    at: new Date().toISOString(),
    by: state.user?.name || 'Unknown',
    ...rep,
  };
  if (existing >= 0) state.pits[existing] = full; else state.pits.unshift(full);

  // Photos are the only thing here big enough to fill the quota. If the write
  // is rejected, drop photos oldest first and try again: losing a picture is
  // survivable, losing the report is not.
  let dropped = 0;
  while (!persist('pits')) {
    const victim = [...state.pits].reverse().find(p => p.photo);
    if (!victim) { state.pits = state.pits.filter(p => p.id !== full.id); emit('pits'); return { ...full, failed: true }; }
    delete victim.photo;
    dropped++;
  }

  if (existing < 0) credit('pit', 1);
  enqueue('pit', { ...full, photo: undefined });   // photos never leave the device
  emit('pits');
  return { ...full, droppedPhotos: dropped };
}

export function deletePitReport(id) {
  state.pits = state.pits.filter(p => p.id !== id);
  persist('pits');
  emit('pits');
}

/* Everything this device knows about a team, in one place. */
export function teamRow(team) { return state.teams.find(t => t.team === Number(team)) || null; }
export function pitFor(team)  { return state.pits.find(p => String(p.team) === String(team)) || null; }
export function recordsFor(team) {
  return state.records.filter(r => String(r.team) === String(team));
}

/* ---------------- offline queue ---------------- */
export function enqueue(type, payload) {
  state.queue.push({ id: uid(), type, payload, at: Date.now(), tries: 0 });
  persist('queue');
  emit('queue');
  if (state.online) flushQueue();
}

let flushing = false;

/** Sends everything waiting. With a database each item goes to its own table
 *  and only the ones that succeed leave the queue, so a single bad row cannot
 *  strand the rest of a shift's work. */
export async function flushQueue() {
  if (flushing || !state.queue.length || !state.online) return;

  if (DB.dbConfigured()) {
    if (!DB.signedIn()) return;          // nothing to authenticate with yet
    flushing = true;
    const survivors = [];
    for (const item of state.queue) {
      try {
        if (item.type === 'match') await DB.pushMatch(item.payload);
        else if (item.type === 'pit') await DB.pushPit(item.payload);
        else if (item.type === 'picks') await DB.pushPicks(item.payload);
        // 'board' items are from the old public-JSON path and have no meaning here.
      } catch (e) {
        item.tries++;
        item.error = e.message;
        // Give up on a row the server will never accept, rather than retrying
        // it forever behind everything else.
        if (item.tries < 6) survivors.push(item);
      }
    }
    state.queue = survivors;
    state.boardStatus = survivors.length ? 'error' : 'ok';
    persist('queue');
    emit('queue');
    flushing = false;
    return;
  }

  // Legacy public-JSON board.
  if (state.boardStatus === 'missing') {
    state.queue = [];
    persist('queue');
    emit('queue');
    return;
  }
  flushing = true;
  try {
    await syncBoard(true);
    state.queue = [];
  } catch {
    if (state.boardStatus === 'missing') state.queue = [];
    else state.queue.forEach(q => q.tries++);
  } finally {
    persist('queue');
    emit('queue');
    flushing = false;
  }
}

/* ---------------- shared board ---------------- */
function localScouts() {
  const out = {};
  for (const a of Object.values(getAccounts())) {
    out[pubId(a.email)] = { name: a.name, matches: a.matches || 0, pit: a.pit || 0 };
  }
  return out;
}

/* Only these fields leave the device. No emails, no password hashes, no photos. */
function publicDoc() {
  return {
    scouts: localScouts(),
    matches: state.records.map(r => ({
      id: r.id, at: r.at, by: r.by, team: r.team, match: r.match, alliance: r.alliance,
      totals: r.totals, tracked: r.tracked, defense: r.defense, driver: r.driver,
      broke: r.broke, notes: r.notes,
    })),
    pits: state.pits.map(p => ({ ...p, photo: undefined })),
  };
}

function mergeScouts(a, b) {
  const out = {};
  for (const src of [a || {}, b || {}]) {
    for (const id in src) {
      const v = src[id] || {}, e = out[id];
      out[id] = e
        ? { name: v.name || e.name,
            matches: Math.max(e.matches || 0, v.matches || 0),
            pit: Math.max(e.pit || 0, v.pit || 0) }
        : { name: v.name || 'Scout', matches: v.matches || 0, pit: v.pit || 0 };
    }
  }
  return out;
}

/* Union by id, newest write wins, newest N kept so the blob stays small. */
function mergeRecords(a = [], b = [], cap) {
  const by = new Map();
  for (const r of [...a, ...b]) {
    if (!r || !r.id) continue;
    const prev = by.get(r.id);
    if (!prev || new Date(r.at) > new Date(prev.at)) by.set(r.id, r);
  }
  return [...by.values()].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, cap);
}

export async function syncBoard(push = false) {
  /* Database path. Pull the whole team's work for this event and merge it with
     what is on the device, newest write per id wins. Local rows that have not
     been pushed yet survive the merge, so pulling never eats unsynced work. */
  if (DB.dbConfigured()) {
    if (!state.online) { state.boardStatus = 'offline'; emit('board'); return state.board; }
    if (!DB.signedIn()) { state.boardStatus = 'idle'; emit('board'); return state.board; }
    try {
      if (push) await flushQueue();
      const remote = await DB.pullAll();

      state.records = mergeRecords(state.records, remote.records, 2000);
      // Keep the local copy of a pit report when it exists, because only the
      // device that wrote it has the photo.
      const localPhotos = new Map(state.pits.filter(p => p.photo).map(p => [String(p.team), p.photo]));
      state.pits = mergeRecords(state.pits, remote.pits, 400)
        .map(p => (localPhotos.has(String(p.team)) ? { ...p, photo: localPhotos.get(String(p.team)) } : p));
      if (remote.picks && !state.picks.seeded) state.picks = remote.picks;

      state.board = { scouts: remote.board, matches: state.records, pits: state.pits };
      state.boardStatus = 'ok';
      state.boardSynced = new Date();
      persist('records', 'pits', 'picks', 'board');
      emit('board');
      emit('records');
      return state.board;
    } catch (e) {
      state.boardStatus = 'error';
      state.boardError = e.message;
      emit('board');
      if (push) throw e;
      return state.board;
    }
  }

  const mine = publicDoc();
  const url = state.settings.boardUrl;
  let remote = null;

  if (!state.online) {
    state.boardStatus = 'offline';
  } else if (!url) {
    state.boardStatus = 'idle';
  } else {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.status === 404) state.boardStatus = 'missing';
      else if (!r.ok) state.boardStatus = 'error';
      else { remote = await r.json(); state.boardStatus = 'ok'; }
    } catch {
      state.boardStatus = 'offline';
    }
  }

  // The device's own view is always merged in, so the leaderboard is correct
  // locally whatever the board is doing.
  state.board = {
    scouts : mergeScouts(state.board.scouts, mergeScouts(mine.scouts, remote?.scouts)),
    matches: mergeRecords(mine.matches, remote?.matches || [], 400),
    pits   : mergeRecords(mine.pits, remote?.pits || [], 150),
  };
  persist('board');

  if (push && state.boardStatus === 'ok') {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.board, updated: new Date().toISOString() }),
    });
    if (!res.ok) { state.boardStatus = 'error'; emit('board'); throw new Error(`board PUT ${res.status}`); }
    state.boardSynced = new Date();
  } else if (push) {
    emit('board');
    throw new Error(`board unavailable (${state.boardStatus})`);
  }

  emit('board');
  return state.board;
}

/* ---------------- connectivity ---------------- */
window.addEventListener('online',  () => { state.online = true;  emit('online'); flushQueue(); });
window.addEventListener('offline', () => { state.online = false; emit('online'); });
