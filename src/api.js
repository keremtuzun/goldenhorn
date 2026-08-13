/* Live data.
   Statbotics gives EPA with no key. The Blue Alliance gives real OPR, DPR,
   CCWM, rankings and the actual match schedule. When both are unreachable we
   say so instead of inventing numbers. */

import { state, emit, recordsFor } from './store.js';
import { seeded, mean, stdev, clamp } from './util.js';

/* Roster verified from The Blue Alliance, Marmara Regional 2026 (2026tuis3),
   the real Istanbul event Team 8159 competed at. Used to seed the table before
   any network call returns, and as the name fallback if a feed omits one. */
export const ROSTER = [
  { team: 5655, name: 'KelRot' }, { team: 5665, name: 'FENERBAHÇE DOGUS SPARC' },
  { team: 6038, name: 'ITOBOT' }, { team: 6459, name: 'AG Robotik' },
  { team: 6941, name: 'IronPulse Robotics' }, { team: 6948, name: 'EAGLES' },
  { team: 7086, name: 'IOROBOT' }, { team: 7466, name: 'Cymurghs' },
  { team: 7742, name: 'Cosmos Robot Works' }, { team: 8056, name: 'Laissez Faire' },
  { team: 8153, name: 'Tech4Peace' }, { team: 8159, name: 'Golden Horn' },
  { team: 8209, name: 'SEZMECH' }, { team: 8595, name: 'This Is How We Play' },
  { team: 8747, name: 'BLACK SEA ROBOTICS' }, { team: 8795, name: 'The Chaotics' },
  { team: 8806, name: 'Our Lady of Providence Dream League' },
  { team: 9020, name: 'MCT Galatasaray Robotics' }, { team: 9025, name: 'Mechameleons' },
  { team: 9026, name: 'Aero' }, { team: 9028, name: 'GFORCE' },
  { team: 9043, name: 'Valkyrie' }, { team: 9231, name: 'Haydarpasa Panthers' },
  { team: 9451, name: 'Aydos' }, { team: 9468, name: 'Team Sirius' },
  { team: 9692, name: 'Sigma' }, { team: 10131, name: 'Royal Turtles' },
  { team: 10132, name: 'Kuanta Robotics' }, { team: 10185, name: 'Nexify Robotics' },
  { team: 10205, name: 'MAGNETAR' }, { team: 10234, name: 'TEDRA' },
  { team: 10383, name: 'Robistim' }, { team: 10502, name: 'HARPIA ROBOTICS' },
  { team: 10576, name: 'ASHINA' }, { team: 10598, name: 'TADroid' },
  { team: 10947, name: 'Antioch Rising' }, { team: 10953, name: 'LYRON' },
  { team: 10959, name: 'ORHANIYE R SPORTS' }, { team: 10999, name: 'Cezeri Robotics' },
  { team: 11000, name: 'NEOCHIRON' }, { team: 11120, name: 'Frostbite Robotics' },
  { team: 11216, name: 'FLAZIA ROBOTICS' }, { team: 11240, name: 'Rotatech' },
];

export const NAMES = Object.fromEntries(ROSTER.map(r => [r.team, r.name]));
export const teamName = t => state.teams.find(x => x.team === Number(t))?.name || NAMES[t] || `Team ${t}`;

/* A read key ships with the app so the deployed site is live for anyone who
   opens it. It is a read-only TBA key, but it is public in this repo: rotate it
   from thebluealliance.com/account if it ever gets abused. A key pasted in the
   data-source dialog overrides it. */
const PUBLIC_TBA_KEY = '0WFrGIMesW5oqvRqeCkkHHY6mqLROTI4CPuCKR6Az2oE2XgVDwXoODb2tTPeP6Ft';
const tbaKey = () => state.settings.tbaKey || PUBLIC_TBA_KEY;

async function fetchJSON(url, headers, timeout = 9000) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(to); }
}

function pick(obj, paths) {
  for (const p of paths) {
    let v = obj, ok = true;
    for (const k of p.split('.')) {
      if (v && typeof v === 'object' && k in v) v = v[k]; else { ok = false; break; }
    }
    if (ok && v != null && typeof v !== 'object') return v;
  }
  return null;
}

/* ---------------- derived metrics ---------------- */

/** Endgame reliability: how often this robot actually got up the tower, as a
 *  percentage of its played matches.
 *
 *  This is one of the few genuinely per-robot facts the feed publishes, in
 *  endGameTowerRobot1/2/3. Alliance points cannot be split between three robots
 *  without a solver, so we do not pretend to: everything else on a team row is
 *  either a measured contribution metric like OPR or is labelled alliance
 *  level. Needs two matches before it means anything. */
function consistencyFor(team) {
  const recs = recordsFor(team);
  if (recs.length < 2) return null;
  const climbs = recs.filter(r => r.climbed).length;
  return Math.round(clamp((climbs / recs.length) * 100, 0, 100));
}

const norm = (v, lo, hi) => (v == null || hi === lo ? 0 : clamp((v - lo) / (hi - lo), 0, 1));

/** Composite pick score. Deliberately transparent: every input is a column the
 *  user can see, and the weights are theirs to move on the pick list page. */
export function scoreTeams(teams, weights = state.settings.weights) {
  const f = key => teams.map(t => t[key]).filter(v => v != null);
  const range = key => {
    const vals = f(key);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  };
  const [oLo, oHi] = range('opr');
  const [aLo, aHi] = range('autoBps');
  const [tLo, tHi] = range('teleopBps');
  const [dLo, dHi] = range('dpr');
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return teams.map(t => {
    const parts = {
      opr        : norm(t.opr, oLo, oHi) * weights.opr,
      auto       : norm(t.autoBps, aLo, aHi) * weights.auto,
      teleop     : norm(t.teleopBps, tLo, tHi) * weights.teleop,
      // Low DPR means opponents scored less against them, so invert.
      defense    : (1 - norm(t.dpr, dLo, dHi)) * weights.defense,
      consistency: ((t.consistency ?? 50) / 100) * weights.consistency,
      pit        : (t.hasPit ? 1 : 0) * weights.pit,
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { ...t, score: Math.round((total / wSum) * 1000) / 10, scoreParts: parts };
  });
}

function rankTeams(rows) {
  const anyOpr = rows.some(t => t.opr != null);
  const key = t => (t.opr != null ? t.opr : anyOpr ? -1e9 : 0);
  return [...rows].sort((a, b) => key(b) - key(a)).map((r, i) => ({ ...r, rank: i + 1 }));
}

function decorate(rows) {
  const withLocal = rows.map(t => ({
    ...t,
    consistency: consistencyFor(t.team),
    hasPit: state.pits.some(p => String(p.team) === String(t.team)),
    scouted: recordsFor(t.team).length,
  }));
  return rankTeams(scoreTeams(withLocal));
}

/** Recomputes everything derived from local scouting without refetching. */
export function refreshDerived() {
  state.teams = decorate(state.teams);
  emit('teams');
}

/* ---------------- fallback ---------------- */

/** Clearly-labelled sample numbers so the interface can be explored with no
 *  network. Every row carries sample:true and the UI badges it. */
export function loadSample() {
  const rnd = seeded(8159);
  state.teams = decorate(ROSTER.map(r => {
    const base = rnd() * 0.9 + 0.35;
    const bps = +(base * 1.9 + (r.team === 8159 ? 0.85 : 0)).toFixed(2);
    const autoBps = +(bps * (0.2 + rnd() * 0.14)).toFixed(2);
    const opr = +(bps * 22 * (0.9 + rnd() * 0.25)).toFixed(1);
    const w = Math.round(4 + rnd() * 8), l = Math.round(rnd() * 6);
    return {
      team: r.team, name: r.name, sample: true,
      bps, autoBps, teleopBps: +(bps - autoBps).toFixed(2),
      opr, epa: +(opr * (0.92 + rnd() * 0.16)).toFixed(1),
      ccwm: +(opr * (0.3 + rnd() * 0.4)).toFixed(1),
      dpr: +(rnd() * 38).toFixed(1),
      wins: w, losses: l, ties: 0, played: w + l,
      winPct: Math.round((w / (w + l)) * 100),
      record: `${w}-${l}-0`, evtRank: null, live: false,
    };
  }));
  state.matches = sampleSchedule();
  state.matchesAreReal = false;
  state.data = { source: 'sample', updated: new Date(), error: null, loading: false };
  emit('teams');
}

function sampleSchedule() {
  const ids = ROSTER.map(r => r.team);
  const start = Date.now() + 25 * 60 * 1000;
  return Array.from({ length: 24 }, (_, i) => {
    const b = i * 6;
    const at = n => ids[(b + n) % ids.length];
    return {
      key: `qm${i + 1}`, number: i + 1, level: 'qm',
      red: [at(0), at(1), at(2)], blue: [at(3), at(4), at(5)],
      time: start + i * 9 * 60 * 1000,
      redScore: null, blueScore: null, winner: null, played: false,
    };
  });
}

/* ---------------- live ---------------- */

export async function loadLive() {
  state.data = { ...state.data, loading: true, error: null };
  emit('data');

  const ev = state.settings.event;
  const merged = {};
  let source = null, oprs = null, dprs = null, ccwms = null;
  const problems = [];

  // 1. Statbotics. No key, gives EPA, names, rank, record.
  try {
    const sb = await fetchJSON(
      `https://api.statbotics.io/v3/team_events?event=${encodeURIComponent(ev)}&limit=200`,
      null, 6000);
    if (Array.isArray(sb) && sb.length) {
      sb.forEach(r => {
        if (!r.team) return;
        const rec = r.record && (r.record.qual || r.record.total || r.record);
        merged[r.team] = {
          name: r.team_name || r.name,
          epa: pick(r, ['epa.breakdown.total_points', 'epa.total_points.mean', 'epa.total_points', 'epa_end']),
          epaAuto: pick(r, ['epa.breakdown.auto_points', 'epa.auto_points.mean', 'epa.auto_points']),
          epaTele: pick(r, ['epa.breakdown.teleop_points', 'epa.teleop_points.mean', 'epa.teleop_points']),
          evtRank: r.rank,
          wins: rec?.wins ?? 0, losses: rec?.losses ?? 0, ties: rec?.ties ?? 0,
        };
      });
      source = 'statbotics';
    }
  } catch (e) { problems.push(`Statbotics: ${e.message}`); }

  // 2. The Blue Alliance. Real OPR, DPR, CCWM, rankings, schedule.
  const key = tbaKey();
  if (key) {
    const H = { 'X-TBA-Auth-Key': key };
    const B = `https://www.thebluealliance.com/api/v3/event/${ev}`;
    const settled = await Promise.allSettled([
      fetchJSON(`${B}/oprs`, H),
      fetchJSON(`${B}/teams/simple`, H),
      fetchJSON(`${B}/rankings`, H),
      fetchJSON(`${B}/matches/simple`, H),
    ]);
    const [o, ts, rk, ms] = settled;

    if (o.status === 'fulfilled') {
      oprs = o.value.oprs || null; dprs = o.value.dprs || null; ccwms = o.value.ccwms || null;
      if (oprs) source = 'tba';
    } else problems.push('TBA OPR unavailable');

    if (ts.status === 'fulfilled') {
      ts.value.forEach(t => {
        const n = t.team_number;
        merged[n] = merged[n] || {};
        merged[n].name = t.nickname || merged[n].name;
        merged[n].loc = [t.city, t.country].filter(Boolean).join(', ');
      });
      source = source || 'tba';
    }

    if (rk.status === 'fulfilled') {
      (rk.value?.rankings || []).forEach(r => {
        const n = +r.team_key.replace('frc', '');
        merged[n] = merged[n] || {};
        merged[n].evtRank = r.rank;
        if (r.record) Object.assign(merged[n], r.record);
      });
    }

    if (ms.status === 'fulfilled') {
      state.matches = ms.value
        .filter(m => m.comp_level === 'qm')
        .sort((a, b) => a.match_number - b.match_number)
        .map(m => ({
          key: m.key, number: m.match_number, level: m.comp_level,
          red : m.alliances.red.team_keys.map(k => +k.replace('frc', '')),
          blue: m.alliances.blue.team_keys.map(k => +k.replace('frc', '')),
          time: (m.actual_time || m.predicted_time || m.time || 0) * 1000 || null,
          redScore : m.alliances.red.score  >= 0 ? m.alliances.red.score  : null,
          blueScore: m.alliances.blue.score >= 0 ? m.alliances.blue.score : null,
          winner: m.winning_alliance || null,
          played: m.alliances.red.score >= 0,
        }));
      state.matchesAreReal = state.matches.length > 0;
    } else problems.push('TBA schedule unavailable');
  }

  const ids = Object.keys(merged).map(Number);
  if (!ids.length) {
    state.data = {
      source: 'none', updated: null, loading: false,
      error: problems.join(' · ') || 'No data feed responded.',
    };
    emit('data');
    return false;
  }

  const all = [...new Set([...ROSTER.map(r => r.team), ...ids])];
  state.teams = decorate(all.map(t => {
    const m = merged[t] || {};
    const opr  = oprs  && oprs['frc' + t]  != null ? +oprs['frc' + t]  : null;
    const dpr  = dprs  && dprs['frc' + t]  != null ? +dprs['frc' + t]  : null;
    const ccwm = ccwms && ccwms['frc' + t] != null ? +ccwms['frc' + t] : null;
    const epa  = m.epa != null ? +m.epa : null;

    // BPS here is a scoring-rate index scaled off the real contribution metric,
    // not a second measurement. The BPS page explains the solved version.
    const basis = opr ?? epa;
    const bps = basis != null ? +(basis / 100).toFixed(2) : null;
    const autoBps = m.epaAuto != null ? +(m.epaAuto / 100).toFixed(2)
                  : bps != null ? +(bps * 0.3).toFixed(2) : null;
    const w = m.wins || 0, l = m.losses || 0, ti = m.ties || 0;
    const played = w + l + ti;

    return {
      team: t, name: m.name || NAMES[t] || `Team ${t}`, loc: m.loc || '',
      opr: opr != null ? +opr.toFixed(1) : null,
      epa: epa != null ? +epa.toFixed(1) : null,
      ccwm: ccwm != null ? +ccwm.toFixed(1) : null,
      dpr: dpr != null ? +dpr.toFixed(1) : null,
      bps, autoBps,
      teleopBps: bps != null && autoBps != null ? +(bps - autoBps).toFixed(2) : null,
      wins: w, losses: l, ties: ti, played: played || null,
      winPct: played ? Math.round((w / played) * 100) : null,
      record: played ? `${w}-${l}-${ti}` : null,
      evtRank: m.evtRank || null, live: true, sample: false,
    };
  }));

  if (!state.matches.length) { state.matches = sampleSchedule(); state.matchesAreReal = false; }

  state.data = {
    source, updated: new Date(), loading: false,
    error: problems.length ? problems.join(' · ') : null,
  };
  emit('teams');
  return true;
}

/* ---------------- match data from the feed ---------------- */

/* The 2026 breakdown publishes three useful shapes:
     per robot   endGameTowerRobot1..3, autoTowerRobot1..3
     per phase   hubScore, split into auto, transition, four shifts and endgame
     per alliance totalAutoPoints, totalTeleopPoints, rp, fouls
   Only the first is attributable to a single robot. The rest is alliance level
   and is labelled that way everywhere it is shown. */
const PHASES = [
  ['auto', 'autoCount'], ['transition', 'transitionCount'],
  ['shift1', 'shift1Count'], ['shift2', 'shift2Count'],
  ['shift3', 'shift3Count'], ['shift4', 'shift4Count'],
  ['endgame', 'endgameCount'],
];

function recordsFromMatch(m) {
  const out = [];
  if (!m.score_breakdown) return out;
  const at = new Date((m.actual_time || m.time || 0) * 1000).toISOString();

  for (const side of ['red', 'blue']) {
    const sb = m.score_breakdown[side];
    const other = side === 'red' ? 'blue' : 'red';
    if (!sb) continue;
    const hub = sb.hubScore || {};
    const teams = m.alliances[side].team_keys.map(k => +k.replace('frc', ''));

    teams.forEach((team, i) => {
      const tower = sb[`endGameTowerRobot${i + 1}`];
      const autoTower = sb[`autoTowerRobot${i + 1}`];
      out.push({
        id: `${m.key}_${team}`,          // stable, so re-importing updates rather than duplicates
        at, by: 'The Blue Alliance', source: 'tba',
        team, match: `Q${m.match_number}`, matchKey: m.key, station: i + 1,
        alliance: side,
        allianceScore: m.alliances[side].score,
        opponentScore: m.alliances[other].score,
        won: m.winning_alliance === side,
        tied: !m.winning_alliance,
        rp: sb.rp ?? null,
        autoPoints: sb.totalAutoPoints ?? null,
        teleopPoints: sb.totalTeleopPoints ?? null,
        endgamePoints: hub.endgamePoints ?? null,
        hubTotal: hub.totalPoints ?? null,
        phases: Object.fromEntries(PHASES.map(([name, key]) => [name, hub[key] ?? 0])),
        tower: tower && tower !== 'None' ? tower : null,
        climbed: Boolean(tower && tower !== 'None'),
        autoTower: autoTower && autoTower !== 'None' ? autoTower : null,
        majorFouls: sb.majorFoulCount ?? 0,
        minorFouls: sb.minorFoulCount ?? 0,
      });
    });
  }
  return out;
}

/** Pulls every played qualification match with its full score breakdown and
 *  turns it into one row per robot per match. */
export async function importMatchData() {
  const key = tbaKey();
  if (!key) throw new Error('A Blue Alliance key is needed to read score breakdowns.');
  const ev = state.settings.event;

  const all = await fetchJSON(
    `https://www.thebluealliance.com/api/v3/event/${ev}/matches`,
    { 'X-TBA-Auth-Key': key }, 20000);

  const played = all
    .filter(m => m.comp_level === 'qm' && m.score_breakdown && m.alliances.red.score >= 0)
    .sort((a, b) => a.match_number - b.match_number);

  const records = played.flatMap(recordsFromMatch);
  return { matches: played, records, skipped: all.length - played.length };
}

/* ---------------- prediction ---------------- */

/** Win probability from an alliance score gap.
 *  The old build used red / (red + blue), which is a share of projected points,
 *  not a probability: two alliances at 60 and 40 are not a 60% favourite. This
 *  is a logistic on the score margin, with sigma taken from the spread of real
 *  OPRs at the event so it scales with how competitive the field actually is. */
export function winProbability(marginPts, teams = state.teams) {
  const oprs = teams.map(t => t.opr).filter(v => v != null);
  const sigma = Math.max(6, (stdev(oprs) || 12) * 1.35);
  return 1 / (1 + Math.exp(-marginPts / sigma));
}

export function predictAlliance(teamNums, teams = state.teams) {
  const rows = teamNums.map(n => teams.find(t => t.team === Number(n))).filter(Boolean);
  // OPR is by construction a team's contribution to its alliance score, so the
  // sum is the projected alliance score.
  const score = rows.reduce((s, t) => s + (t.opr ?? (t.bps != null ? t.bps * 100 : 0)), 0);
  return { rows, score };
}
