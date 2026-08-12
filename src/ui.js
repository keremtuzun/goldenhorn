/* Shell components: toasts, modal, drawer, command palette.
   All of them trap focus, close on Escape, and restore focus on the way out,
   because a scout on a laptop drives this with a keyboard. */

import { $, $$, esc, countUp, growBars, stagger, afterPaint } from './util.js';
import { icon, mountIcons } from './icons.js';

/** Everything a freshly rendered subtree needs: real icons in place of the
 *  <i data-ic> placeholders, numbers counting up instead of blinking in, bars
 *  growing from zero, and children entering on a stagger. One call per render
 *  so no page can forget half of it. */
export function hydrate(root = document, { animate = true } = {}) {
  mountIcons(root);
  $$('[data-count]', root).forEach(n => countUp(n, Number(n.dataset.count), {
    decimals: Number(n.dataset.decimals || 0),
    suffix: n.dataset.suffix || '',
  }));
  growBars(root);
  positionThumbs(root);
  if (animate) stagger(root);
  return root;
}

/** Segmented controls slide a pill under the active button, which means
 *  measuring it. Measuring has to wait a frame after insertion, and again
 *  after webfonts land, or the pill ends up sized for fallback metrics. */
export function positionThumbs(root = document) {
  const place = () => $$('.seg', root).forEach(seg => {
    const thumb = $('.seg-thumb', seg);
    const active = $('button.on', seg);
    if (!thumb || !active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  });
  afterPaint(place);
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => afterPaint(place));
}

/* ---------------- toasts ---------------- */
const TOAST_ICON = { pos: 'checkCircle', neg: 'xCircle', warn: 'alert', info: 'info' };

export function toast(message, kind = 'info', ms = 3600) {
  const host = $('#toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.setAttribute('role', kind === 'neg' ? 'alert' : 'status');
  node.innerHTML = icon(TOAST_ICON[kind] || 'info') + `<span>${esc(message)}</span>`;
  host.appendChild(node);
  // More than four stacked toasts is noise, not feedback.
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add('out');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }, ms);
}

/* ---------------- overlays ---------------- */
let lastFocused = null;

function trapFocus(container, ev) {
  const focusables = $$(
    'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
    container);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables.at(-1);
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

function openOverlay(id, innerHTML, { onMount, autofocus = true } = {}) {
  const overlay = $(id);
  const panel = overlay.firstElementChild;
  lastFocused = document.activeElement;
  panel.innerHTML = innerHTML;
  mountIcons(panel);
  overlay.classList.add('on');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  onMount?.(panel);
  if (autofocus) {
    const target = $('[data-autofocus]', panel) ||
      $('input,button,select,textarea,[tabindex]', panel);
    target?.focus();
  }
  return panel;
}

function closeOverlay(id) {
  const overlay = $(id);
  if (!overlay?.classList.contains('on')) return;
  overlay.classList.remove('on');
  overlay.setAttribute('aria-hidden', 'true');
  if (!$$('.overlay.on').length) document.body.style.overflow = '';
  lastFocused?.focus?.();
}

export const openModal   = (html, opts) => openOverlay('#overlay-modal', html, opts);
export const closeModal  = () => closeOverlay('#overlay-modal');
export const openDrawer  = (html, opts) => openOverlay('#overlay-drawer', html, opts);
export const closeDrawer = () => closeOverlay('#overlay-drawer');
export const closeAll    = () => { closeModal(); closeDrawer(); closePalette(); };

/** Promise-based confirm so destructive actions read linearly at the call site. */
export function confirmAction({ title, body, confirmLabel = 'Confirm', kind = 'neg' }) {
  return new Promise(resolve => {
    const panel = openModal(`
      <h3 class="h-sec">${esc(title)}</h3>
      <p class="prose" style="margin-top:var(--s3)">${esc(body)}</p>
      <div class="row end" style="margin-top:var(--s6);gap:var(--s2)">
        <button class="btn ghost" data-act="no">Keep it</button>
        <button class="btn ${kind}" data-act="yes" data-autofocus>${esc(confirmLabel)}</button>
      </div>`);
    panel.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      closeModal();
      resolve(act === 'yes');
    });
  });
}

/* ---------------- command palette ---------------- */
let COMMANDS = [];
let palIndex = 0;
let palItems = [];

export function registerCommands(list) { COMMANDS = list; }

function renderPalette(query = '') {
  const q = query.trim().toLowerCase();
  const matches = !q ? COMMANDS : COMMANDS.filter(c => {
    const hay = `${c.label} ${c.group || ''} ${c.keywords || ''}`.toLowerCase();
    return q.split(/\s+/).every(part => hay.includes(part));
  });
  palItems = matches.slice(0, 40);
  palIndex = Math.min(palIndex, Math.max(0, palItems.length - 1));

  const list = $('#pal-list');
  if (!palItems.length) {
    list.innerHTML = `<div class="empty inline">
      <div class="e-ic">${icon('search')}</div>
      <b>Nothing matches "${esc(query)}"</b>
      <p>Try a team number, a page name, or an action like export.</p>
    </div>`;
    return;
  }
  let html = '', group = null;
  palItems.forEach((c, i) => {
    if (c.group !== group) { group = c.group; html += `<div class="pal-sec">${esc(group)}</div>`; }
    html += `<div class="pal-item${i === palIndex ? ' sel' : ''}" data-i="${i}" role="option">
      ${icon(c.icon || 'right')}<span>${esc(c.label)}</span>
      ${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}
    </div>`;
  });
  list.innerHTML = html;
  $('.pal-item.sel', list)?.scrollIntoView({ block: 'nearest' });
}

export function openPalette() {
  const overlay = $('#overlay-palette');
  lastFocused = document.activeElement;
  overlay.classList.add('on');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const input = $('#pal-input');
  input.value = '';
  palIndex = 0;
  renderPalette('');
  input.focus();
}

export function closePalette() { closeOverlay('#overlay-palette'); }

function runPaletteItem(i) {
  const cmd = palItems[i];
  if (!cmd) return;
  closePalette();
  setTimeout(() => cmd.run(), 60);
}

export function initShell() {
  // Click the backdrop to dismiss, but never a click inside the panel.
  $$('.overlay').forEach(overlay => {
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) closeOverlay('#' + overlay.id);
    });
  });

  const input = $('#pal-input');
  input.addEventListener('input', () => { palIndex = 0; renderPalette(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palIndex = Math.min(palIndex + 1, palItems.length - 1); renderPalette(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palIndex = Math.max(palIndex - 1, 0); renderPalette(input.value); }
    else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(palIndex); }
  });
  $('#pal-list').addEventListener('click', e => {
    const item = e.target.closest('.pal-item');
    if (item) runPaletteItem(Number(item.dataset.i));
  });

  document.addEventListener('keydown', e => {
    const open = $$('.overlay.on');
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $('#overlay-palette').classList.contains('on') ? closePalette() : openPalette();
      return;
    }
    if (e.key === 'Escape' && open.length) { e.preventDefault(); closeOverlay('#' + open.at(-1).id); return; }
    if (e.key === 'Tab' && open.length) trapFocus(open.at(-1), e);
  });
}
