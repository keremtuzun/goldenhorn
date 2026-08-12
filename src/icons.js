/* Icon set.
   One family: 24x24 box, 1.6 stroke, round caps and joins, no fills except
   where a dot is genuinely a dot. Drawn for this app so nav, buttons, tags and
   empty states all share a weight. */

export const ICONS = {
  /* nav */
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
  chart:'<path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21"/><path d="m7 15 3.5-4 3 2.5L20 7"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22"/>',
  picklist:'<path d="M9.5 6h11M9.5 12h11M9.5 18h11"/><path d="m4 4.9 1.5-.9V9"/><path d="M3.4 15.1a1.6 1.6 0 1 1 2.7 1.2L3.4 19.1h2.9"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.2 20a5.9 5.9 0 0 1 11.6 0"/><path d="M16.4 5.5a3.2 3.2 0 0 1 0 5"/><path d="M17.6 14.5A6 6 0 0 1 20.8 20"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2.6"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard:'<path d="M9 4.5H7A1.8 1.8 0 0 0 5.2 6.3v13A1.8 1.8 0 0 0 7 21.1h10a1.8 1.8 0 0 0 1.8-1.8v-13A1.8 1.8 0 0 0 17 4.5h-2"/><rect x="9" y="2.6" width="6" height="3.8" rx="1.2"/><path d="M9 12h6M9 16h4"/>',
  stopwatch:'<circle cx="12" cy="13.6" r="7.4"/><path d="M12 9.8v3.9l2.4 1.4"/><path d="M9.6 2.4h4.8M12 2.4v3.8"/><path d="m18.9 7.2 1.6-1.6"/>',
  camera:'<path d="M3 9a2.5 2.5 0 0 1 2.5-2.5h1.7L8.4 4.4h7.2l1.2 2.1h1.7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
  sigma:'<path d="M18.4 4.6H6l6.4 7.4L6 19.4h12.4"/>',
  trophy:'<path d="M7.2 4h9.6v4.6a4.8 4.8 0 0 1-9.6 0z"/><path d="M7.2 6H4.4v1.4A3.4 3.4 0 0 0 7.5 10.8"/><path d="M16.8 6h2.8v1.4a3.4 3.4 0 0 1-3.1 3.4"/><path d="M12 13.4v3.2"/><path d="m9 20.6.6-4h4.8l.6 4z"/>',
  map:'<path d="M9 3.6 3 6.2v14.2L9 17.8l6 2.6 6-2.6V3.6l-6 2.6z"/><path d="M9 3.6v14.2M15 6.2v14.2"/>',
  robot:'<rect x="3.6" y="8" width="16.8" height="12.4" rx="3.2"/><path d="M12 4.6V8"/><circle cx="12" cy="3.2" r="1.4"/><path d="M8.8 13h.02M15.2 13h.02"/><path d="M9.6 16.8h4.8"/><path d="M1.4 12.4v3.4M22.6 12.4v3.4"/>',
  gauge:'<path d="M3.6 17.4a9 9 0 1 1 16.8 0"/><path d="m12.6 13.4 3.6-3.4"/><circle cx="12" cy="14.4" r="1.5"/>',
  compare:'<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M6 15.6V8.4A3.4 3.4 0 0 1 9.4 5h3.4"/><path d="m10.8 3 2.2 2-2.2 2"/><path d="M18 8.4v7.2A3.4 3.4 0 0 1 14.6 19h-3.4"/><path d="m13.2 21-2.2-2 2.2-2"/>',
  dice:'<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.6"/><circle cx="8.6" cy="8.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.25" fill="currentColor" stroke="none"/>',
  shield:'<path d="M12 2.6 4.6 5.6v5.8c0 4.9 3.1 8.5 7.4 10 4.3-1.5 7.4-5.1 7.4-10V5.6z"/>',
  layers:'<path d="m12 3 8.8 4.4L12 11.8 3.2 7.4z"/><path d="m3.2 12.4 8.8 4.4 8.8-4.4"/><path d="m3.2 17 8.8 4.4L20.8 17"/>',

  /* actions */
  search:'<circle cx="10.5" cy="10.5" r="6.6"/><path d="m20 20-4.8-4.8"/>',
  command:'<path d="M15 9V6.6a2.4 2.4 0 1 1 2.4 2.4H15zM9 9H6.6A2.4 2.4 0 1 1 9 6.6zM9 15v2.4A2.4 2.4 0 1 1 6.6 15zM15 15h2.4A2.4 2.4 0 1 1 15 17.4z"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  download:'<path d="M12 3.4v11.8"/><path d="m7.6 10.8 4.4 4.4 4.4-4.4"/><path d="M4 17.2v2.2A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6v-2.2"/>',
  upload:'<path d="M12 20.6V8.8"/><path d="m7.6 13.2 4.4-4.4 4.4 4.4"/><path d="M4 6.8V4.6A1.6 1.6 0 0 1 5.6 3h12.8A1.6 1.6 0 0 1 20 4.6v2.2"/>',
  refresh:'<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.4 4.2v5.4H15"/>',
  save:'<path d="M5 3.6h11.2L20.4 7.8v11.6A1.6 1.6 0 0 1 18.8 21H5a1.6 1.6 0 0 1-1.6-1.6V5.2A1.6 1.6 0 0 1 5 3.6z"/><path d="M8 3.6v5h7v-5"/><path d="M7.6 21v-6h8.8v6"/>',
  print:'<path d="M7 8.4V3.6h10v4.8"/><path d="M7 18.4H5.2a2 2 0 0 1-2-2v-4.2a2 2 0 0 1 2-2h13.6a2 2 0 0 1 2 2v4.2a2 2 0 0 1-2 2H17"/><rect x="7" y="14.4" width="10" height="6.6" rx="1.2"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M14 14h3.2v3.2H14zM20.4 14H21M14 20.4h3.2M20.6 17.6V21"/>',
  scan:'<path d="M4 8.4V6A2 2 0 0 1 6 4h2.4M15.6 4H18a2 2 0 0 1 2 2v2.4M20 15.6V18a2 2 0 0 1-2 2h-2.4M8.4 20H6a2 2 0 0 1-2-2v-2.4"/><path d="M4 12h16"/>',
  filter:'<path d="M3.4 5h17.2l-6.6 8v6.2l-4 1.8V13z"/>',
  sliders:'<path d="M4 7.4h8.4M17.6 7.4H20M4 16.6h2.4M11.6 16.6H20"/><circle cx="15" cy="7.4" r="2.4"/><circle cx="9" cy="16.6" r="2.4"/>',
  play:'<path d="M7.4 4.6 19 12 7.4 19.4z"/>',
  stop:'<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2"/>',
  pause:'<path d="M9.2 5v14M14.8 5v14"/>',
  undo:'<path d="M4 9.4h9.8a5.4 5.4 0 0 1 0 10.8h-2.6"/><path d="m7.8 5.6-3.8 3.8 3.8 3.8"/>',
  trash:'<path d="M4.2 6.4h15.6"/><path d="M9.2 6.4V4.6A1.6 1.6 0 0 1 10.8 3h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8"/><path d="m6.6 6.4.9 13.1A1.6 1.6 0 0 0 9.1 21h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-13.1"/>',
  edit:'<path d="M4 20h4L18.4 9.6a2.2 2.2 0 0 0-3.1-3.1L4.9 16.9z"/><path d="m14.6 6.8 3 3"/>',
  copy:'<rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2.2"/><path d="M15.6 8.4V6.2A2.2 2.2 0 0 0 13.4 4H6.2A2.2 2.2 0 0 0 4 6.2v7.2a2.2 2.2 0 0 0 2.2 2.2h2.2"/>',
  external:'<path d="M14 3.6h6.4V10"/><path d="M20.4 3.6 11.6 12.4"/><path d="M18 13.6v4.8A1.6 1.6 0 0 1 16.4 20H5.6A1.6 1.6 0 0 1 4 18.4V7.6A1.6 1.6 0 0 1 5.6 6h4.8"/>',
  share:'<circle cx="17.8" cy="5.6" r="2.5"/><circle cx="6.2" cy="12" r="2.5"/><circle cx="17.8" cy="18.4" r="2.5"/><path d="m8.4 10.8 7.2-3.9M8.4 13.2l7.2 3.9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  menu:'<path d="M3.6 7h16.8M3.6 12h16.8M3.6 17h16.8"/>',
  more:'<circle cx="5.2" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="18.8" cy="12" r="1.35" fill="currentColor" stroke="none"/>',
  grip:'<circle cx="9" cy="6" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.35" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.35" fill="currentColor" stroke="none"/>',

  /* chevrons + arrows */
  down:'<path d="m6 9 6 6 6-6"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  left:'<path d="m14.6 5.4-6.6 6.6 6.6 6.6"/>',
  right:'<path d="m9.4 5.4 6.6 6.6-6.6 6.6"/>',
  arrowRight:'<path d="M4 12h15.6"/><path d="m13.8 6.2 5.8 5.8-5.8 5.8"/>',
  arrowUpRight:'<path d="M7 17 17 7"/><path d="M8.4 7H17v8.6"/>',
  swap:'<path d="M7 4.4v15.2"/><path d="m3.6 7.8 3.4-3.4 3.4 3.4"/><path d="M17 19.6V4.4"/><path d="m13.6 16.2 3.4 3.4 3.4-3.4"/>',

  /* status */
  check:'<path d="m5 12.6 4.6 4.6L19 7"/>',
  checkCircle:'<circle cx="12" cy="12" r="8.8"/><path d="m8 12.2 2.8 2.8L16.2 9.6"/>',
  x:'<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
  xCircle:'<circle cx="12" cy="12" r="8.8"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  alert:'<path d="M12 4.4 2.9 20.1h18.2z"/><path d="M12 10.2v4"/><path d="M12 17.2h.02"/>',
  info:'<circle cx="12" cy="12" r="8.8"/><path d="M12 11.2v5"/><path d="M12 8.2h.02"/>',
  clock:'<circle cx="12" cy="12" r="8.8"/><path d="M12 6.8v5.4l3.4 2"/>',
  history:'<path d="M3.2 12a8.8 8.8 0 1 0 2.9-6.5"/><path d="M3.2 4.6v4.8H8"/><path d="M12 7.6V12l3 1.9"/>',
  wifi:'<path d="M2.6 9.2a15 15 0 0 1 18.8 0"/><path d="M6.1 12.8a10 10 0 0 1 11.8 0"/><path d="M9.4 16.3a5 5 0 0 1 5.2 0"/><path d="M12 19.6h.02"/>',
  wifiOff:'<path d="m2.4 2.4 19.2 19.2"/><path d="M9 16.3a5 5 0 0 1 5.4-.4"/><path d="M5.4 12.4a10 10 0 0 1 3.2-2.1"/><path d="M18.9 12.6a10 10 0 0 0-6.4-2.7"/><path d="M2.6 9.2a15 15 0 0 1 4.2-2.8"/><path d="M21.4 9.2a15 15 0 0 0-9.9-3.7"/><path d="M12 19.6h.02"/>',
  radio:'<circle cx="12" cy="12" r="2.2"/><path d="M8.3 8.3a5.3 5.3 0 0 0 0 7.4M15.7 15.7a5.3 5.3 0 0 0 0-7.4"/><path d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 18.5a9.2 9.2 0 0 0 0-13"/>',
  zap:'<path d="M13.2 2.4 4.4 13.8h6.3L10.8 21.6l8.8-11.4h-6.3z"/>',
  activity:'<path d="M2.6 12h4.2l2.8-7.6 4.8 15.2 2.8-7.6h4.2"/>',
  trending:'<path d="m3.4 17 5.8-5.8 3.8 3.8 7.6-7.6"/><path d="M15 7.4h5.6V13"/>',
  crosshair:'<circle cx="12" cy="12" r="8.4"/><path d="M12 1.8v4.4M12 17.8v4.4M1.8 12h4.4M17.8 12h4.4"/>',
  star:'<path d="m12 3.4 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.8l6.1-.9z"/>',
  flag:'<path d="M5.2 21V3.6"/><path d="M5.2 4.6h11l-1.7 3.6 1.7 3.6h-11z"/>',
  pin:'<path d="M12 21.4s6.9-6.2 6.9-11.4a6.9 6.9 0 1 0-13.8 0c0 5.2 6.9 11.4 6.9 11.4z"/><circle cx="12" cy="9.8" r="2.6"/>',
  battery:'<rect x="2.6" y="7.6" width="16" height="8.8" rx="2.2"/><path d="M21.4 10.6v2.8"/><path d="M5.6 10.6h4v2.8h-4z"/>',
  inbox:'<path d="M3.2 13.4h5l1.5 3h4.6l1.5-3h5"/><path d="M5.6 4.6h12.8l2.4 8.8v5A1.6 1.6 0 0 1 19.2 20H4.8a1.6 1.6 0 0 1-1.6-1.6v-5z"/>',
  keyboard:'<rect x="2.4" y="6.2" width="19.2" height="11.6" rx="2.4"/><path d="M6.2 9.8h.02M9.7 9.8h.02M13.2 9.8h.02M16.7 9.8h.02M6.2 13.4h.02M17.8 9.8h.02M17.8 13.4h.02M9.4 13.4h5.2"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
  logout:'<path d="M14.6 4.6h3.8A1.6 1.6 0 0 1 20 6.2v11.6a1.6 1.6 0 0 1-1.6 1.6h-3.8"/><path d="m10.4 8.2 3.8 3.8-3.8 3.8"/><path d="M14.2 12H4"/>',
  lock:'<rect x="4.6" y="10" width="14.8" height="10.4" rx="2.6"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/>',
  key:'<circle cx="8" cy="15" r="4.4"/><path d="m11.2 11.8 7.2-7.2"/><path d="m16 7 2.4 2.4"/><path d="m18.6 4.4 2 2"/>',
  mail:'<rect x="2.6" y="5" width="18.8" height="14" rx="2.4"/><path d="m3.6 7 8.4 5.8L20.4 7"/>',
  eye:'<path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3"/>',
  bell:'<path d="M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 4.8 1.9 6.2 1.9 6.2H4.3s1.9-1.4 1.9-6.2z"/><path d="M10 18.6a2.2 2.2 0 0 0 4 0"/>',
  wrench:'<path d="M15.4 3.6a5.4 5.4 0 0 0-4.7 7.9l-7 7a2 2 0 0 0 2.8 2.8l7-7a5.4 5.4 0 0 0 6.7-7.2l-3.3 3.3-2.8-2.8 3.3-3.3a5.5 5.5 0 0 0-2-.7z"/>',
  cpu:'<rect x="4.6" y="4.6" width="14.8" height="14.8" rx="3"/><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4"/><path d="M9.2 2.2v2.4M14.8 2.2v2.4M9.2 19.4v2.4M14.8 19.4v2.4M2.2 9.2h2.4M2.2 14.8h2.4M19.4 9.2h2.4M19.4 14.8h2.4"/>',
  database:'<ellipse cx="12" cy="6" rx="7.8" ry="3.2"/><path d="M4.2 6v12c0 1.8 3.5 3.2 7.8 3.2s7.8-1.4 7.8-3.2V6"/><path d="M4.2 12c0 1.8 3.5 3.2 7.8 3.2s7.8-1.4 7.8-3.2"/>',
  table:'<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.4"/><path d="M3.2 9.6h17.6M9.4 9.6v9.8M14.6 9.6v9.8"/>',
};

const OPEN = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

/** Returns an <svg> string for the named icon. Unknown names render nothing
 *  rather than a broken box, so a typo never ships a visual bug. */
export function icon(name, extraClass = '') {
  const body = ICONS[name];
  if (!body) return '';
  const cls = extraClass ? `ic ${extraClass}` : 'ic';
  return OPEN.replace('class="ic"', `class="${cls}"`) + body + '</svg>';
}

/** Replaces every <i data-ic="name"> in a subtree with the real icon. Lets the
 *  markup stay readable and keeps icon swaps to one place. */
export function mountIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => {
    const name = el.dataset.ic;
    if (!ICONS[name]) { el.remove(); return; }
    const extra = el.className ? el.className.replace(/\bic\b/g, '').trim() : '';
    el.outerHTML = icon(name, extra);
  });
}
