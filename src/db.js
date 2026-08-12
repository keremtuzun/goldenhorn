/* The database layer.
   Talks to a Supabase project over its REST and auth endpoints directly, with
   no SDK, so there is no extra script to load and nothing to keep in sync with
   the rest of this build-free app.

   Two rules shape everything here:

   1. The app stays offline first. Every write lands in localStorage first and
      is pushed when there is a network. An arena has no usable wifi and a
      scout cannot wait for a round trip between game pieces.
   2. When the database is not configured the app behaves exactly as it did
      before, on local storage alone, and says so. Nothing here is allowed to
      become a hard dependency. */

import { state } from './store.js';
import { LS } from './util.js';

const SESSION_KEY = 'gh_db_session';

export const dbConfigured = () =>
  Boolean(state.settings.dbUrl && state.settings.dbKey);

const base = () => String(state.settings.dbUrl || '').replace(/\/+$/, '');
const anonKey = () => state.settings.dbKey;

export const getSession = () => LS.get(SESSION_KEY, null);
const setSession = s => (s ? LS.set(SESSION_KEY, s) : LS.del(SESSION_KEY));

export const dbUser = () => getSession()?.user || null;
export const signedIn = () => Boolean(getSession()?.access_token);

/* ---------------- low level ---------------- */

async function call(path, { method = 'GET', body, token, headers = {}, timeout = 12000 } = {}) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(base() + path, {
      method,
      signal: ac.signal,
      headers: {
        apikey: anonKey(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = data?.msg || data?.message || data?.error_description
        || data?.error || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return data;
  } finally { clearTimeout(to); }
}

/** Access tokens last an hour. Refresh a minute early so a long shift in the
 *  stands never hits an expired token mid-save. */
async function freshToken() {
  const s = getSession();
  if (!s) return null;
  if (Date.now() < (s.expires_at || 0) - 60_000) return s.access_token;
  try {
    const next = await call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: s.refresh_token },
    });
    const saved = storeSession(next);
    return saved.access_token;
  } catch {
    // Refresh token is dead. Keep working locally rather than logging out
    // mid-match; the next explicit sign in will fix it.
    return null;
  }
}

function storeSession(payload) {
  const s = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + (payload.expires_in || 3600) * 1000,
    user: payload.user
      ? { id: payload.user.id, email: payload.user.email, meta: payload.user.user_metadata || {} }
      : getSession()?.user,
  };
  setSession(s);
  return s;
}

const rest = async (path, opts = {}) => {
  const token = await freshToken();
  if (!token) throw new Error('Not signed in to the database.');
  return call('/rest/v1' + path, { ...opts, token });
};

/* ---------------- auth ---------------- */

export async function dbSignUp({ email, password, name, role, group }) {
  const payload = await call('/auth/v1/signup', {
    method: 'POST',
    body: { email, password, data: { name, role, team_group: group } },
  });
  // Projects with email confirmation on return no session. That is a valid
  // state, not an error: the account exists and they sign in after confirming.
  if (!payload.access_token) {
    return { needsConfirmation: true, email };
  }
  const s = storeSession(payload);
  await upsertProfile({ name, role, group }).catch(() => {});
  return { session: s };
}

export async function dbSignIn({ email, password }) {
  const payload = await call('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  return { session: storeSession(payload) };
}

export async function dbSignOut() {
  const token = await freshToken();
  if (token) await call('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
  setSession(null);
}

export async function upsertProfile({ name, role, group }) {
  const user = dbUser();
  if (!user) return null;
  return rest('/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [{ id: user.id, name, role, team_group: group }],
  });
}

/* ---------------- pushing scouting work up ---------------- */

const eventKey = () => state.settings.event;

export async function pushMatch(rec) {
  const user = dbUser();
  return rest('/match_records', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [{
      id: rec.id,
      scout_id: user?.id ?? null,
      scout_name: rec.by || null,
      event: eventKey(),
      team: Number(rec.team),
      match: String(rec.match),
      alliance: rec.alliance || null,
      tracked: rec.tracked ?? null,
      totals: rec.totals || {},
      spans: rec.spans || [],
      defense: rec.defense ?? null,
      driver: rec.driver ?? null,
      broke: Boolean(rec.broke),
      notes: rec.notes || null,
      created_at: rec.at || new Date().toISOString(),
    }],
  });
}

export async function pushPit(report) {
  const user = dbUser();
  // Photos stay on the device. They are large, and a free tier is not the
  // place for a few hundred robot pictures.
  const { photo, ...rest_ } = report;
  return rest('/pit_reports?on_conflict=event,team', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [{
      id: report.id,
      scout_id: user?.id ?? null,
      scout_name: report.by || null,
      event: eventKey(),
      team: Number(report.team),
      data: rest_,
      updated_at: report.at || new Date().toISOString(),
    }],
  });
}

export async function pushPicks(picks) {
  return rest('/pick_lists?on_conflict=event', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [{
      event: eventKey(),
      data: picks,
      updated_by: state.user?.name || 'unknown',
      updated_at: new Date().toISOString(),
    }],
  });
}

/* ---------------- pulling the team's work down ---------------- */

export async function pullAll() {
  const ev = encodeURIComponent(eventKey());
  const [matches, pits, board, picks] = await Promise.all([
    rest(`/match_records?event=eq.${ev}&select=*&order=created_at.desc&limit=2000`),
    rest(`/pit_reports?event=eq.${ev}&select=*`),
    rest('/scout_board?select=*'),
    rest(`/pick_lists?event=eq.${ev}&select=*`).catch(() => []),
  ]);

  return {
    records: (matches || []).map(m => ({
      id: m.id, at: m.created_at, by: m.scout_name || 'Scout',
      team: m.team, match: m.match, alliance: m.alliance, tracked: m.tracked,
      totals: m.totals || {}, spans: m.spans || [],
      defense: m.defense, driver: m.driver, broke: m.broke, notes: m.notes,
    })),
    pits: (pits || []).map(p => ({
      id: p.id, at: p.updated_at, by: p.scout_name || 'Scout',
      team: p.team, ...(p.data || {}),
    })),
    board: Object.fromEntries((board || []).map(s => [
      s.id, { name: s.name, matches: Number(s.matches) || 0, pit: Number(s.pits) || 0 },
    ])),
    picks: picks?.[0]?.data || null,
  };
}

/** Round trip test used by the Data page so a misconfigured project fails
 *  loudly at setup rather than silently at the event. */
export async function dbHealthcheck() {
  if (!dbConfigured()) return { ok: false, reason: 'No project URL or key set.' };

  /* Probe a real table, not the API root. The root returns 401 to an anonymous
     key, which made a perfectly healthy project look unreachable. A table that
     exists answers 200 with an empty array once row level security has filtered
     it, and a table that does not exist answers 404, which is exactly how we
     tell "schema not run" apart from "wrong URL". */
  try {
    const res = await fetch(`${base()}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey(), Accept: 'application/json' },
    });
    if (res.status === 404) {
      return { ok: false, reason: 'Project reachable, but the tables are missing. Run the schema SQL.' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'The project rejected that key. Check the anon or publishable key.' };
    }
    if (!res.ok) return { ok: false, reason: `Project answered HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, reason: `Cannot reach the project: ${e.message}` };
  }

  if (!signedIn()) {
    return { ok: true, signedIn: false, reason: 'Project reachable and the tables are there. Sign in to start syncing.' };
  }
  try {
    await rest('/profiles?select=id&limit=1');
    return { ok: true, signedIn: true };
  } catch (e) {
    return { ok: false, signedIn: true, reason: `Signed in but queries fail: ${e.message}` };
  }
}
