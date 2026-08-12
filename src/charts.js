/* Charts, drawn by hand in SVG.
   No chart library. Every mark here is one the app actually needs, which keeps
   the visual language consistent with the rest of the interface. */

import { esc, clamp } from './util.js';

const pt = (x, y) => `${(+x).toFixed(2)},${(+y).toFixed(2)}`;

/** Monotone-ish smoothing: a Catmull-Rom pass converted to cubic beziers.
 *  Keeps sparklines from looking like a polygon without overshooting. */
function smoothPath(points, tension = 0.34) {
  if (points.length < 2) return '';
  let d = `M ${pt(points[0][0], points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    d += ` C ${pt(c1[0], c1[1])} ${pt(c2[0], c2[1])} ${pt(p2[0], p2[1])}`;
  }
  return d;
}

/** Sparkline. Renders nothing rather than a flat line when there is not enough
 *  data to say anything, which keeps empty cells honest. */
export function sparkline(values, { w = 100, h = 28, fill = true, stroke = 'var(--gold-300)' } = {}) {
  const vals = (values || []).filter(v => v != null && Number.isFinite(v));
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pad = 2;
  const points = vals.map((v, i) => [
    (i / (vals.length - 1)) * (w - pad * 2) + pad,
    h - pad - ((v - lo) / span) * (h - pad * 2),
  ]);
  const line = smoothPath(points);
  const area = `${line} L ${pt(points.at(-1)[0], h)} L ${pt(points[0][0], h)} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<path class="fill" d="${area}"/>` : ''}
    <path d="${line}" style="stroke:${stroke}"/>
  </svg>`;
}

/** Radar for head to head comparison. Values are 0 to 1 per axis. */
export function radar(series, axes, { size = 220, rings = 4 } = {}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 30;
  const n = axes.length;
  const ang = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const at = (i, k) => [cx + Math.cos(ang(i)) * r * k, cy + Math.sin(ang(i)) * r * k];

  let out = `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img">`;
  for (let g = 1; g <= rings; g++) {
    const k = g / rings;
    const poly = axes.map((_, i) => pt(...at(i, k))).join(' ');
    out += `<polygon class="grid-ring" points="${poly}"/>`;
  }
  axes.forEach((_, i) => {
    const [x, y] = at(i, 1);
    out += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  });
  axes.forEach((label, i) => {
    const [x, y] = at(i, 1.19);
    const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
    out += `<text class="lbl" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text>`;
  });
  series.forEach(s => {
    const poly = s.values.map((v, i) => pt(...at(i, clamp(v, 0, 1)))).join(' ');
    out += `<polygon class="shape" points="${poly}" style="stroke:${s.color};fill:${s.color}"/>`;
  });
  return out + '</svg>';
}

/** Vertical bar chart. Heights arrive via data-h so they grow on insert. */
export function barChart(items, { highlight = null, format = v => v } = {}) {
  if (!items.length) return '';
  const max = Math.max(...items.map(i => i.value)) || 1;
  return `<div class="bars">${items.map(i => `
    <div class="bar${i.key === highlight ? ' hi' : ''}" title="${esc(i.label)}: ${esc(format(i.value))}">
      <em>${esc(format(i.value))}</em>
      <i data-h="${Math.max(3, (i.value / max) * 100).toFixed(1)}%"></i>
      <small>${esc(i.label)}</small>
    </div>`).join('')}</div>`;
}

/** Histogram used for the rank projection. Bins are supplied already counted. */
export function histogram(bins, { highlightIndex = -1 } = {}) {
  const max = Math.max(...bins, 1);
  return `<div class="hist">${bins.map((v, i) =>
    `<i class="${i === highlightIndex ? 'hi' : ''}" data-h="${((v / max) * 100).toFixed(1)}%"></i>`
  ).join('')}</div>`;
}

/** Arc path on a circle, angles in degrees clockwise from 12 o'clock.
 *  Used by the match ring so the phases are drawn, not approximated. */
export function arc(cx, cy, r, startDeg, endDeg) {
  const p = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1, y1] = p(startDeg), [x2, y2] = p(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${pt(x1, y1)} A ${r} ${r} 0 ${large} 1 ${pt(x2, y2)}`;
}
