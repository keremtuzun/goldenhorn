/* QR encoder, byte mode, error correction level M.
   Written for this app rather than pulled in, because the whole point is that a
   tablet with no network can put a scouted match on screen and a laptop can
   read it off the glass. Level M survives a scuffed tablet screen and arena
   lighting; L does not.

   Versions 1 to 14, so up to 362 bytes, which is well past the roughly 90 a
   packed match record needs.

   Verified end to end against an independent decoder across every version in
   that range, including UTF-8 payloads and the exact capacity boundary. */

/* ---- GF(256), primitive polynomial 0x11D ---- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* Product of (x - a^0)(x - a^1)...(x - a^(degree-1)), highest power first, so
   poly[0] is the leading 1 and poly[i+1] are the divisor terms. Getting the two
   halves of this multiply the wrong way round reverses the whole polynomial,
   which still produces a plausible looking QR that no scanner can read. */
function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                        // shifted up by the x term
      next[j + 1] ^= gfMul(poly[j], EXP[i]);     // scaled by a^i
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data, count) {
  const gen = generatorPoly(count);
  const rem = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[count - 1] = 0;
    if (factor) for (let i = 0; i < count; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

/* ---- block structure, level M: [ecPerBlock, [[blocks, dataCodewords], ...]] ---- */
const EC_M = {
  1:  [10, [[1, 16]]],
  2:  [16, [[1, 28]]],
  3:  [26, [[1, 44]]],
  4:  [18, [[2, 32]]],
  5:  [24, [[2, 43]]],
  6:  [16, [[4, 27]]],
  7:  [18, [[4, 31]]],
  8:  [22, [[2, 38], [2, 39]]],
  9:  [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
  11: [30, [[1, 50], [4, 51]]],
  12: [22, [[6, 36], [2, 37]]],
  13: [22, [[8, 37], [1, 38]]],
  14: [24, [[4, 40], [5, 41]]],
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
};

const dataCapacity = v => EC_M[v][1].reduce((s, [n, d]) => s + n * d, 0);

/* Byte mode header is 4 mode bits plus a character count that widens at v10. */
const byteCapacity = v => dataCapacity(v) - (v < 10 ? 2 : 3);

function chooseVersion(len) {
  for (let v = 1; v <= 14; v++) if (byteCapacity(v) >= len) return v;
  return null;
}

/* ---- bit stream ---- */
class Bits {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length() { return this.bits.length; }
}

function buildCodewords(bytes, version) {
  const total = dataCapacity(version);
  const bits = new Bits();
  bits.push(0b0100, 4);                          // byte mode
  bits.push(bytes.length, version < 10 ? 8 : 16); // character count
  bytes.forEach(b => bits.push(b, 8));

  const capacityBits = total * 8;
  bits.push(0, Math.min(4, capacityBits - bits.length));  // terminator
  while (bits.length % 8) bits.bits.push(0);              // byte align

  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits.bits[i + j];
    words.push(b);
  }
  const PAD = [0xec, 0x11];
  let p = 0;
  while (words.length < total) words.push(PAD[p++ % 2]);
  return words;
}

/* Split into blocks, compute EC per block, then interleave both halves. */
function interleave(words, version) {
  const [ecLen, groups] = EC_M[version];
  const blocks = [];
  let at = 0;
  for (const [count, dataLen] of groups) {
    for (let i = 0; i < count; i++) {
      const data = words.slice(at, at + dataLen);
      at += dataLen;
      blocks.push({ data, ec: ecCodewords(data, ecLen) });
    }
  }
  const out = [];
  const maxData = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLen; i++)
    for (const b of blocks) out.push(b.ec[i]);
  return out;
}

/* ---- matrix ---- */
function newMatrix(size) {
  return {
    size,
    m: Array.from({ length: size }, () => new Int8Array(size).fill(-1)),
    fn: Array.from({ length: size }, () => new Uint8Array(size)),
    set(r, c, v, isFn) { this.m[r][c] = v; if (isFn) this.fn[r][c] = 1; },
  };
}

function placeFinder(M, r, c) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= M.size || cc >= M.size) continue;
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
        (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
         (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      M.set(rr, cc, inRing ? 1 : 0, true);
    }
  }
}

function placeAlignment(M, r, c) {
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++)
      M.set(r + dr, c + dc,
        Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0, true);
}

function buildFunctionPatterns(M, version) {
  const n = M.size;
  placeFinder(M, 0, 0);
  placeFinder(M, 0, n - 7);
  placeFinder(M, n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    M.set(6, i, v, true);
    M.set(i, 6, v, true);
  }

  const pos = ALIGN[version];
  for (const r of pos) for (const c of pos) {
    const nearFinder =
      (r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8);
    if (!nearFinder) placeAlignment(M, r, c);
  }

  M.set(n - 8, 8, 1, true);                    // permanently dark module

  // Reserve the format information strips.
  for (let i = 0; i < 9; i++) {
    if (M.m[8][i] === -1) M.set(8, i, 0, true);
    if (M.m[i][8] === -1) M.set(i, 8, 0, true);
  }
  for (let i = 0; i < 8; i++) {
    if (M.m[8][n - 1 - i] === -1) M.set(8, n - 1 - i, 0, true);
    if (M.m[n - 1 - i][8] === -1) M.set(n - 1 - i, 8, 0, true);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      M.set(n - 11 + c, r, 0, true);
      M.set(r, n - 11 + c, 0, true);
    }
  }
}

function placeData(M, bytes) {
  const n = M.size;
  let bit = 0;
  const nextBit = () => {
    const i = bit >> 3;
    const v = i < bytes.length ? (bytes[i] >> (7 - (bit & 7))) & 1 : 0;
    bit++;
    return v;
  };
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;                 // skip the vertical timing column
    for (let step = 0; step < n; step++) {
      const row = upward ? n - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (M.fn[row][col]) continue;
        M.m[row][col] = nextBit();
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m, n) {
  let score = 0;

  // Rule 1: runs of five or more of the same colour.
  const runScore = line => {
    let s = 0, run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
      else run = 1;
    }
    return s;
  };
  for (let r = 0; r < n; r++) score += runScore(m[r]);
  for (let c = 0; c < n; c++) score += runScore(m.map(row => row[c]));

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }

  // Rule 3: the finder-lookalike 1:1:3:1:1 sequence.
  const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const hasAt = (get, i) =>
    P1.every((v, k) => get(i + k) === v) || P2.every((v, k) => get(i + k) === v);
  for (let r = 0; r < n; r++)
    for (let c = 0; c + 11 <= n; c++)
      if (hasAt(i => m[r][i], c)) score += 40;
  for (let c = 0; c < n; c++)
    for (let r = 0; r + 11 <= n; r++)
      if (hasAt(i => m[i][c], r)) score += 40;

  // Rule 4: deviation from a 50/50 light-dark balance.
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

function formatBits(mask) {
  // EC level M is 0b00.
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

function applyFormat(M, mask) {
  const n = M.size;
  const bits = formatBits(mask);
  const get = i => (bits >> i) & 1;
  // First copy: down column 8, then left along row 8.
  for (let i = 0; i <= 5; i++) M.m[i][8] = get(i);
  M.m[7][8] = get(6);
  M.m[8][8] = get(7);
  M.m[8][7] = get(8);
  for (let i = 9; i <= 14; i++) M.m[8][14 - i] = get(i);
  // Second copy: right along row 8, then up column 8 from the bottom.
  for (let i = 0; i <= 7; i++) M.m[8][n - 1 - i] = get(i);
  for (let i = 8; i <= 14; i++) M.m[n - 15 + i][8] = get(i);
  M.m[n - 8][8] = 1;
}

function applyVersionInfo(M, version) {
  if (version < 7) return;
  const n = M.size;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const v = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = i % 3;
    M.m[n - 11 + c][r] = v;
    M.m[r][n - 11 + c] = v;
  }
}

/** Encodes text and returns { size, modules } where modules is a size x size
 *  array of 0 and 1. Throws when the payload will not fit version 14. */
export function encode(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length);
  if (!version) {
    throw new Error(`Payload is ${bytes.length} bytes, the limit is ${byteCapacity(14)}.`);
  }

  const words = interleave(buildCodewords(bytes, version), version);
  const size = 17 + version * 4;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const M = newMatrix(size);
    buildFunctionPatterns(M, version);
    placeData(M, words);
    const fn = MASKS[mask];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!M.fn[r][c] && fn(r, c)) M.m[r][c] ^= 1;
    applyFormat(M, mask);
    applyVersionInfo(M, version);
    const grid = M.m.map(row => Array.from(row));
    const score = penalty(grid, size);
    if (!best || score < best.score) best = { score, grid, version, mask };
  }
  return { size, modules: best.grid, version, mask: best.mask };
}

/** SVG output. Vector so it stays sharp when printed or zoomed on a phone. */
export function toSVG(text, { quiet = 3 } = {}) {
  const { size, modules } = encode(text);
  const dim = size + quiet * 2;
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!modules[r][c]) { c++; continue; }
      let run = 1;
      while (c + run < size && modules[r][c + run]) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Scan to import this match">
    <rect width="${dim}" height="${dim}" fill="#ffffff"/>
    <path d="${d}" fill="#0d0507"/>
  </svg>`;
}

/* ---- payload packing ----
   A match record as JSON is roughly 300 bytes. Packed into fields it is under
   120, which drops the QR from version 12 to version 6 and makes it read from
   across a pit table. */

const ACTION_KEYS = { Scoring: 'S', Intaking: 'I', Passing: 'P', Climbing: 'C',
  Defending: 'D', Traveling: 'T', Idle: 'X' };
const KEY_ACTIONS = Object.fromEntries(Object.entries(ACTION_KEYS).map(([k, v]) => [v, k]));

export function packRecord(r) {
  const totals = Object.entries(r.totals || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${ACTION_KEYS[k] || k[0]}${v}`)
    .join('.');
  return [
    'GH1', r.team, r.match, (r.alliance || 'r')[0], r.by || '',
    r.tracked ?? 0, totals,
    r.defense ?? '', r.driver ?? '', r.broke ? 1 : 0,
    (r.notes || '').slice(0, 60).replace(/\|/g, '/'),
  ].join('|');
}

export function unpackRecord(str) {
  const p = String(str).split('|');
  if (p[0] !== 'GH1') throw new Error('Not a Golden Horn match code.');
  const totals = {};
  (p[6] || '').split('.').filter(Boolean).forEach(chunk => {
    const key = KEY_ACTIONS[chunk[0]];
    if (key) totals[key] = Number(chunk.slice(1)) || 0;
  });
  return {
    team: Number(p[1]), match: p[2],
    alliance: p[3] === 'b' ? 'blue' : 'red',
    by: p[4], tracked: Number(p[5]) || 0, totals,
    defense: p[7] === '' ? null : Number(p[7]),
    driver: p[8] === '' ? null : Number(p[8]),
    broke: p[9] === '1', notes: p[10] || '',
    imported: true,
  };
}
