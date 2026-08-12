/* Pieces every page reuses: headers, stat tiles, and the three states a data
   surface can be in. Loading and empty are designed here once so no page ever
   ships a blank rectangle. */

import { esc, fmtRel, num } from '../util.js';
import { icon } from '../icons.js';
import { state } from '../store.js';

export function pageHead({ eyebrow, title, lede, actions = '' }) {
  return `<div class="page-head">
    <div>
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1 class="h-page">${esc(title)}</h1>
      ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
    </div>
    ${actions ? `<div class="pa">${actions}</div>` : ''}
  </div>`;
}

export function statTile({ label, value, icon: ic, sub = '', decimals = 0, suffix = '', small = false }) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  return `<div class="stat">
    <div class="s-top">${ic ? icon(ic) : ''}<span class="s-lbl">${esc(label)}</span></div>
    <div class="s-val${small ? ' sm' : ''}"
      ${isNumeric ? `data-count="${value}" data-decimals="${decimals}" data-suffix="${esc(suffix)}"` : ''}
      >${isNumeric ? '0' : esc(value)}</div>
    ${sub ? `<div class="s-sub">${sub}</div>` : ''}
  </div>`;
}

export function emptyState({ icon: ic = 'inbox', title, body, action = '' }) {
  return `<div class="empty">
    <div class="e-ic">${icon(ic)}</div>
    <b>${esc(title)}</b>
    <p>${esc(body)}</p>
    ${action}
  </div>`;
}

export function skeletonRows(cols = 4, rows = 6) {
  return Array.from({ length: rows }, (_, r) => `<tr>${
    Array.from({ length: cols }, (_, c) => {
      const w = c === 0 ? '1.5rem' : c === 1 ? '9rem' : '3rem';
      return `<td><div class="skel skel-line" style="width:${w};margin:0;opacity:${1 - r * 0.11}"></div></td>`;
    }).join('')
  }</tr>`).join('');
}

export function skeletonBlock(height = '10rem') {
  return `<div class="skel" style="height:${height};border-radius:var(--r-sm)"></div>`;
}

/** The strip that tells you where the numbers came from and how old they are.
 *  It has a state for loading, live, sample, and total failure, because all
 *  four happen at an event. */
export function dataStrip() {
  const d = state.data;
  const count = state.teams.length;

  if (d.loading) {
    return `<div class="srcbar"><span class="pulse warn"></span>
      Pulling live data for <b>${esc(state.settings.event)}</b>…</div>`;
  }
  if (d.source === 'none' || !count) {
    return `<div class="srcbar">
      <span class="tag neg">${icon('wifiOff')} No feed</span>
      <span>${esc(d.error || 'No data source responded.')}</span>
      <span class="push"></span>
      <button class="btn sm ghost" data-act="retry">${icon('refresh')}Retry</button>
      <button class="btn sm subtle" data-act="sample">Use sample data</button>
      <button class="btn sm ghost" data-act="source">Data source</button>
    </div>`;
  }
  if (d.source === 'sample') {
    return `<div class="srcbar">
      <span class="tag warn">Sample</span>
      <span>Real Marmara Regional roster with invented numbers, so you can try the interface. Nothing here is a measurement.</span>
      <span class="push"></span>
      <button class="btn sm" data-act="retry">${icon('refresh')}Go live</button>
    </div>`;
  }
  const label = d.source === 'tba' ? 'The Blue Alliance · live OPR' : 'Statbotics · live EPA';
  return `<div class="srcbar">
    <span class="tag pos"><span class="pulse"></span>Live</span>
    <span>${esc(label)} · <b>${esc(state.settings.event)}</b> · ${count} teams · updated ${esc(fmtRel(d.updated))}</span>
    ${d.error ? `<span class="tag warn" title="${esc(d.error)}">partial</span>` : ''}
    <span class="push"></span>
    <button class="btn sm ghost" data-act="source">${icon('sliders')}Data source</button>
  </div>`;
}

/** Small labelled figure used inside cards and the team drawer. */
export function figure(label, value, { decimals = 1, suffix = '', tone = '' } = {}) {
  const shown = typeof value === 'number' ? num(value, decimals) + suffix
    : value == null ? '–' : esc(value) + suffix;
  return `<div>
    <div class="s-lbl">${esc(label)}</div>
    <div class="mono" style="font-size:var(--t-md);margin-top:2px;color:${tone || 'var(--text)'}">${shown}</div>
  </div>`;
}

export const sampleBadge = () =>
  state.data.source === 'sample' ? '<span class="tag warn">sample</span>' : '';
