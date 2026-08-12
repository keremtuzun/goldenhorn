/* The BPS solver, for real.
   The model page used to describe this maths and then show nothing. This is the
   actual bounded weighted ridge regression, running in the browser, so the page
   can solve a match in front of you and report its own residual per sweep. */

import { clamp, mean } from './util.js';

/**
 * Design matrix for a set of scoring windows.
 * One row per window w:  sum over teams i in A_w of  BPS_i * L_w  ~=  S_w
 *
 * @param {Array<{teams:number[], length:number, score:number}>} windows
 * @param {number[]} teams  column order
 */
export function buildDesign(windows, teams) {
  const index = new Map(teams.map((t, j) => [t, j]));
  const X = [], y = [], w = [];
  for (const win of windows) {
    if (!win.teams?.length || !(win.length > 0)) continue;
    const row = new Float64Array(teams.length);
    let hit = 0;
    for (const t of win.teams) {
      const j = index.get(Number(t));
      if (j != null) { row[j] = win.length; hit++; }
    }
    if (!hit) continue;
    X.push(row);
    y.push(win.score);
    // A long window with one scorer attributes cleanly. A short window with
    // three scorers barely constrains anything, so it counts for less.
    w.push(win.weight != null ? win.weight : win.length / hit);
  }
  return { X, y, w, teams };
}

/**
 * Bounded weighted ridge by cyclic coordinate descent.
 * Minimises  || W^1/2 (X b - y) ||^2 + lambda * ||b||^2   subject to 0 <= b_j <= cap_j.
 *
 * Coordinate descent is used rather than a normal-equation solve because the
 * box constraint is what makes the answer physical, and clamping each
 * coordinate as it updates enforces it exactly instead of after the fact.
 */
export function solveBPS({ X, y, w, teams }, opts = {}) {
  const {
    lambda = 0.35,
    caps = null,
    sweeps = 60,
    tol = 1e-7,
    prior = null,       // per-team shrink target for pass two
    priorWeight = 0,
  } = opts;

  const n = X.length, p = teams.length;
  const beta = new Float64Array(p);
  const history = [];
  if (!n) return { beta: Array.from(beta), history, sweeps: 0, r2: null };

  // Residual kept incrementally so a sweep is O(nnz) rather than O(n*p) twice.
  const resid = new Float64Array(n);
  for (let i = 0; i < n; i++) resid[i] = y[i];

  // Precompute the denominator for each column: sum_i w_i x_ij^2 + lambda.
  const denom = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    let d = lambda + priorWeight;
    for (let i = 0; i < n; i++) { const x = X[i][j]; if (x) d += w[i] * x * x; }
    denom[j] = d || 1;
  }

  const cap = j => (caps ? caps[j] : Infinity);
  let last = Infinity, done = 0;

  for (let s = 0; s < sweeps; s++) {
    for (let j = 0; j < p; j++) {
      let numer = priorWeight * (prior ? prior[j] || 0 : 0);
      for (let i = 0; i < n; i++) {
        const x = X[i][j];
        if (x) numer += w[i] * x * (resid[i] + x * beta[j]);
      }
      const next = clamp(numer / denom[j], 0, cap(j));
      const delta = next - beta[j];
      if (delta) {
        for (let i = 0; i < n; i++) { const x = X[i][j]; if (x) resid[i] -= x * delta; }
        beta[j] = next;
      }
    }
    let rss = 0;
    for (let i = 0; i < n; i++) rss += w[i] * resid[i] * resid[i];
    history.push({ sweep: s + 1, rss });
    done = s + 1;
    if (Math.abs(last - rss) < tol * Math.max(1, rss)) break;
    last = rss;
  }

  // Weighted R^2 against the weighted mean, so the page can say how much of the
  // scoring the solve actually explains.
  const wSum = w.reduce((a, b) => a + b, 0) || 1;
  const yBar = y.reduce((a, v, i) => a + w[i] * v, 0) / wSum;
  let tss = 0;
  for (let i = 0; i < n; i++) tss += w[i] * (y[i] - yBar) ** 2;
  const rss = history.at(-1)?.rss ?? 0;
  const r2 = tss > 0 ? 1 - rss / tss : null;

  return { beta: Array.from(beta), history, sweeps: done, r2, rows: n };
}

/**
 * Two pass solve with prior shrinkage.
 * Pass one gets an event wide baseline per team. Pass two re-solves each match
 * with those baselines as a shrink target, which stops a single noisy match
 * from handing a team an absurd rate.
 */
export function twoPassSolve(matchWindows, teams, opts = {}) {
  const { shrink = 0.5, ...rest } = opts;

  const pooled = buildDesign(matchWindows.flat(), teams);
  const pass1 = solveBPS(pooled, rest);

  const perMatch = matchWindows.map(windows => {
    const design = buildDesign(windows, teams);
    return solveBPS(design, { ...rest, prior: pass1.beta, priorWeight: shrink });
  }).filter(r => r.rows > 0);

  const final = teams.map((_, j) => {
    const vals = perMatch.map(m => m.beta[j]).filter(v => v > 0);
    return vals.length ? mean(vals) : pass1.beta[j];
  });

  return { pass1, perMatch, beta: final, teams };
}

/**
 * Turns a scouted match plus a stream of CV score deltas into windows.
 * A new window opens whenever the set of teams flagged as actively scoring
 * changes, which is the whole point of the model: attribution at the moment the
 * roster of scorers changes, not once per match.
 */
export function windowsFromFlags(flagSpans, deltas, matchLength = 150) {
  const marks = new Set([0, matchLength]);
  flagSpans.forEach(f => { marks.add(clamp(f.start, 0, matchLength)); marks.add(clamp(f.end, 0, matchLength)); });
  const edges = [...marks].sort((a, b) => a - b);

  const windows = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    const length = b - a;
    if (length <= 0) continue;
    const active = [...new Set(flagSpans.filter(f => f.start < b && f.end > a).map(f => f.team))];
    if (!active.length) continue;
    const score = deltas.filter(d => d.t > a && d.t <= b).reduce((s, d) => s + d.pts, 0);
    windows.push({ teams: active, length, score, from: a, to: b });
  }
  return windows;
}
