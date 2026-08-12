/* Shared helpers. Small, boring, used everywhere. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Everything that interpolates a value we did not author (team names from the
   API, scout names, free-text notes) goes through esc first. */
export function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp  = (a, b, t) => a + (b - a) * t;
export const sum   = arr => arr.reduce((a, b) => a + b, 0);
export const mean  = arr => (arr.length ? sum(arr) / arr.length : 0);
export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map(v => (v - m) ** 2)) / (arr.length - 1));
}
export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ---- formatting ---- */
export const dash = v => (v == null || Number.isNaN(v) ? '–' : v);
export function num(v, d = 1) {
  if (v == null || Number.isNaN(v)) return '–';
  return Number(v).toFixed(d);
}
export function fmtClock(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtRel(date) {
  if (!date) return 'never';
  const secs = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 90) return 'a minute ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
export function fmtCountdown(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return {
    h: String(Math.floor(t / 3600)).padStart(2, '0'),
    m: String(Math.floor((t % 3600) / 60)).padStart(2, '0'),
    s: String(t % 60).padStart(2, '0'),
    over: ms <= 0,
  };
}
export const ordinal = n => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/* ---- motion ---- */
export const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs fn after the next paint, or straight away if there will not be one.
 *  A hidden tab does not fire requestAnimationFrame, so anything that measures
 *  or animates has to fall back to running synchronously or it silently never
 *  happens and the page is left showing zeroes. */
export function afterPaint(fn) {
  if (document.hidden) { fn(); return; }
  requestAnimationFrame(fn);
}

const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -9 * t));

/** Animates a node's text from its current number up to `to`. Used on every
 *  stat tile so figures arrive rather than blink into place. */
export function countUp(node, to, { decimals = 0, suffix = '', prefix = '', ms = 900 } = {}) {
  if (!node) return;
  const target = Number(to);
  if (!Number.isFinite(target)) { node.textContent = to; return; }
  const write = v => { node.textContent = prefix + v.toFixed(decimals) + suffix; };
  if (reduced() || document.hidden) { write(target); return; }
  const from = Number(String(node.textContent).replace(/[^\d.-]/g, '')) || 0;
  if (from === target) { write(target); return; }
  const t0 = performance.now();
  cancelAnimationFrame(node._cu);
  const step = now => {
    const t = clamp((now - t0) / ms, 0, 1);
    write(lerp(from, target, easeOutExpo(t)));
    if (t < 1) node._cu = requestAnimationFrame(step);
  };
  node._cu = requestAnimationFrame(step);
}

/** Gives children an --i index so CSS can stagger their entrance, then strips
 *  the class once the animation should have finished.
 *
 *  The strip is the important half. A fade-in has to start from opacity 0, so
 *  for the length of the animation the content is hidden by CSS. If the
 *  animation never runs (a stalled compositor, a browser or extension that
 *  drops animations) the page would sit there invisible forever. setTimeout
 *  does not depend on frames being painted, so this guarantees the end state
 *  no matter what the animation does. */
export function stagger(root, sel = ':scope > *', cap = 14) {
  if (!root) return;
  const nodes = $$(sel, root);
  nodes.forEach((n, i) => {
    n.style.setProperty('--i', Math.min(i, cap));
    n.classList.add('rise');
  });
  clearTimeout(root._riseTimer);
  // Longest delay (cap * 45ms) plus the duration, plus headroom.
  root._riseTimer = setTimeout(() => nodes.forEach(n => n.classList.remove('rise')), 1500);
}

/** Widths set in the same frame as insertion do not transition. Bumping them
 *  on the next frame is what makes every bar and meter grow instead of jump. */
export function growBars(root = document) {
  afterPaint(() => {
    $$('[data-w]', root).forEach(n => { n.style.width = n.dataset.w; });
    $$('[data-h]', root).forEach(n => { n.style.height = n.dataset.h; });
  });
}

export const raf = () => new Promise(r => requestAnimationFrame(r));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---- storage ---- */
export const LS = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* quota or privacy mode */ } },
};

export const uid = () =>
  's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Stable non-cryptographic hash. Used for public leaderboard ids and to avoid
   holding raw passwords. Not a substitute for real server-side auth. */
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < String(s).length; i++) h = ((h << 5) + h + String(s).charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/* Deterministic PRNG so demo figures are stable between reloads rather than
   jittering every render. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/* ---- export ---- */
export function toCSV(rows, headers) {
  const cols = headers || Object.keys(rows[0] || {});
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}

export function downloadFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ---- tiny event bus ---- */
export function bus() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, payload) {
      (map.get(evt) || []).forEach(fn => {
        try { fn(payload); } catch (e) { console.error(`[bus:${evt}]`, e); }
      });
    },
  };
}
