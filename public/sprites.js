// Pixel-art assets for BATTLE DONGS, built at runtime.
// Everything on screen lives on ONE pixel grid: RES canvas pixels per world pixel. World code draws in
// world units under a scale(RES) transform and snaps to 1/RES; tank code draws directly in canvas pixels.
const OUT = '#1a0b10';
// Player colors = TMNT-style bandana colors
const PLAYER_COLORS = [
  { name: 'RED',    b: '#e8433a', l: '#ff8a6b', d: '#9c1f2a', css: '#ff5a4a' },
  { name: 'BLUE',   b: '#3a7be8', l: '#86bbff', d: '#1f3d9c', css: '#5a9bff' },
  { name: 'GREEN',  b: '#3ec44a', l: '#9cf28a', d: '#1c7a34', css: '#5ae86a' },
  { name: 'YELLOW', b: '#f2c230', l: '#fff38a', d: '#a8741c', css: '#ffd84a' },
  { name: 'PURPLE', b: '#a24be8', l: '#d9a6ff', d: '#5e2296', css: '#c27aff' },
  { name: 'ORANGE', b: '#ff8a1f', l: '#ffc47a', d: '#b04a12', css: '#ffa04a' },
];

const RES = 1;            // canvas pixels per world pixel: 1 = 640x300, late-90s chunky pixels
const U = 1 / RES;        // one canvas pixel, in world units
const K = RES / 2;        // art below is designed for a 2x grid; K scales those sizes to the real grid
const kp = n => Math.max(1, Math.round(n * K));   // a design-pixel length on the real grid (never < 1)
let DPX = U;              // size of one canvas pixel in the CURRENT drawing space (1 inside drawTank)

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const U32 = new Map();
function u32(hex) {   // css hex -> packed little-endian RGBA for ImageData
  let v = U32.get(hex);
  if (v === undefined) { const [r, gg, b] = rgbOf(hex); v = ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0; U32.set(hex, v); }
  return v;
}
const toU32 = u32;

// per-pixel painter: fn(x, y) -> css color | packed u32 | null
function paint(w, h, fn) {
  const c = canvasOf(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), p = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const col = fn(i, y);
    if (col) p[y * w + i] = typeof col === 'number' ? col : u32(col);
  }
  x.putImageData(img, 0, 0);
  return c;
}
// adds a 1px OUT outline around the opaque pixels of a sprite (sprite needs a 1px transparent margin)
function outline(c, col = OUT) {
  const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height), p = new Uint32Array(img.data.buffer), w = c.width, h = c.height;
  const src = Uint32Array.from(p), o = u32(col);
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    if (src[y * w + i]) continue;
    if ((i > 0 && src[y * w + i - 1]) || (i < w - 1 && src[y * w + i + 1]) || (y > 0 && src[(y - 1) * w + i]) || (y < h - 1 && src[(y + 1) * w + i])) p[y * w + i] = o;
  }
  x.putImageData(img, 0, 0);
  return c;
}
function whiteOut(src, fill) {   // silhouette of a sprite in one color (hit flash / ghost)
  const c = canvasOf(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
  x.fillStyle = fill; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const whiteCache = new Map();
function whiteOutCached(src, fill) {
  if (!whiteCache.has(src)) whiteCache.set(src, whiteOut(src, fill));
  return whiteCache.get(src);
}

// ---- grid-snapped primitives (draw on the main canvas `g`, declared in main.js)
const snap = v => Math.round(v / DPX) * DPX;
function px(x, y, w, h, col) { g.fillStyle = col; g.fillRect(snap(x), snap(y), w * DPX, h * DPX); }
// filled pixel circle; radius in current units, drawn at full canvas resolution
function disk(cx, cy, r, col) {
  const u = DPX;
  g.fillStyle = col;
  const X = Math.round(cx / u), Y = Math.round(cy / u), R = r / u, ri = Math.ceil(R);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = R * R - dy * dy;
    if (w < 0) continue;
    const wi = Math.round(Math.sqrt(w));
    g.fillRect((X - wi) * u, (Y + dy) * u, (wi * 2 + 1) * u, u);
  }
}
// draw a canvas-pixel sprite at world coords without resampling
function blit(img, x, y) { g.drawImage(img, snap(x), snap(y), img.width * DPX, img.height * DPX); }

// --------------------------------------------------------------- bitmap font: 3x5 glyphs, smoothed up with EPX
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '111101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100',
  ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', "'": '010010000000000',
  '(': '001010010010001', ')': '100010010010100', '%': '101001010100101', '>': '100010001010100', '<': '001010100010001',
  '=': '000111000111000', '*': '101010101000000', '#': '101111101111101', '[': '011010010010011', ']': '110010010010110',
  '_': '000000000000111', '&': '010101010101011', ' ': '000000000000000', '~': '000110011000000', '·': '000000010000000',
  '"': '101101000000000', ';': '000010000010100', '$': '011110010011110', '@': '010101111100011',
};
const textWidth = (s, scale = 1) => (s.length * 4 - 1) * scale;

function scale2x(b, w, h) {   // EPX
  const o = new Uint8Array(w * h * 4), at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : b[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1), W = w * 2;
    o[(2 * y) * W + 2 * x] = C === A && C !== D && A !== B ? A : P;
    o[(2 * y) * W + 2 * x + 1] = A === B && A !== C && B !== D ? B : P;
    o[(2 * y + 1) * W + 2 * x] = D === C && D !== B && C !== A ? C : P;
    o[(2 * y + 1) * W + 2 * x + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return o;
}
function scale3x(b, w, h) {   // AdvMAME3x
  const o = new Uint8Array(w * h * 9), at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : b[y * w + x]), W = w * 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = at(x, y), F = at(x + 1, y), G = at(x - 1, y + 1), H = at(x, y + 1), I = at(x + 1, y + 1);
    const e = [
      D === B && B !== F && D !== H ? D : E,
      (D === B && B !== F && D !== H && E !== C) || (B === F && B !== D && F !== H && E !== A) ? B : E,
      B === F && B !== D && F !== H ? F : E,
      (D === B && B !== F && D !== H && E !== G) || (D === H && D !== B && H !== F && E !== A) ? D : E,
      E,
      (B === F && B !== D && F !== H && E !== I) || (H === F && D !== H && B !== F && E !== C) ? F : E,
      D === H && D !== B && H !== F ? D : E,
      (H === F && D !== H && B !== F && E !== G) || (D === H && D !== B && H !== F && E !== I) ? H : E,
      H === F && D !== H && B !== F ? F : E,
    ];
    for (let k = 0; k < 9; k++) o[(3 * y + (k / 3 | 0)) * W + 3 * x + k % 3] = e[k];
  }
  return o;
}
const glyphCache = new Map();
function glyph(ch, f, col) {
  const k = ch + '|' + f + '|' + col;
  let c = glyphCache.get(k);
  if (c) return c;
  let b = Uint8Array.from((FONT[ch] || FONT['?']).split('').map(Number)), w = 3, h = 5;
  if (f === 6) { b = scale3x(scale2x(b, w, h), 6, 10); w = 9 * 2; h = 15 * 2; }
  else if (f === 3) { b = scale3x(b, w, h); w = 9; h = 15; }
  else { let k2 = 1; while (k2 < f) { b = scale2x(b, w, h); w *= 2; h *= 2; k2 *= 2; } }
  const bw = w, bb = b;
  c = paint(bw, h, (x, y) => (bb[y * bw + x] ? col : null));
  glyphCache.set(k, c);
  return c;
}

// pixel text in world coords
function pixText(str, x, y, color = '#fff', o = {}) {
  const s = o.scale || 1, f = RES * s;
  str = String(str).toUpperCase();
  const w = textWidth(str, s);
  x = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  const shadow = o.shadow === undefined ? OUT : o.shadow;
  const pass = (ox, oy, col) => {
    for (let i = 0; i < str.length; i++) {
      if (str[i] === ' ') continue;
      const gc = glyph(str[i], f, col);
      g.drawImage(gc, snap(x + i * 4 * s + ox), snap(y + oy), gc.width * U, gc.height * U);
    }
  };
  if (shadow) { pass(s, 0, shadow); pass(0, s, shadow); pass(s, s, shadow); pass(-s, 0, shadow); pass(0, -s, shadow); }
  pass(0, 0, color);
  return w;
}

// --------------------------------------------------------------- balls (projectiles)
const SKIN = '#e8a890', SKIN_D = '#c07868', HEAD = '#f08a9a', HEAD_D = '#c85a6a';
const VEIN = '#7a5aa8', HAIR = '#3a2014';

// A wrinkly testicle with bulging veins and a few stray hairs, in canvas pixels.
const veinyCache = new Map();
function getVeinyBall(w, h, skin, seed) {
  const k = [w, h, skin, seed].join();
  if (veinyCache.has(k)) return veinyCache.get(k);
  const base = mix(skin, '#9a3a4a', 0.2), W2 = w + 6, H2 = h + 6, cx = W2 / 2, cy = H2 / 2 + 1;
  const nx = (x, y) => [(x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2)];
  const inside = (x, y) => { const [dx, dy] = nx(x, y); return dx * dx + dy * dy <= 1; };
  const r = rng(seed * 31 + w), veins = new Set(), hairs = new Set();
  const walk = (x, y, a, len) => {
    for (let i = 0; i < len; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (!inside(Math.round(x), Math.round(y))) return;
      veins.add(Math.round(x) + ',' + Math.round(y));
      if (i > 3 && r() < 0.08) walk(x, y, a + (r() < 0.5 ? -1 : 1) * 0.9, len - i - 2);
    }
  };
  if (w > 8) for (let v = 0; v < 3; v++) {
    const t = Math.PI * (0.15 + r() * 0.7);
    walk(cx + Math.cos(t) * w * 0.4, cy + Math.sin(t) * h * 0.4, t + Math.PI + (r() - 0.5), w * 0.4 + r() * w * 0.3);
  }
  if (w > 8) for (let n = 0; n < 4; n++) {
    const t = Math.PI * (0.9 + r() * 1.2);
    let x = cx + Math.cos(t) * (w / 2 + 0.5), y = cy + Math.sin(t) * (h / 2 + 0.5), a = t + (r() - 0.5);
    for (let i = 0; i < 3; i++) { x += Math.cos(a); y += Math.sin(a); a += 0.7; hairs.add(Math.round(x) + ',' + Math.round(y)); }
  }
  const c = paint(W2, H2, (x, y) => {
    if (!inside(x, y)) {
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) return OUT;
      return hairs.has(x + ',' + y) ? HAIR : null;
    }
    const [dx, dy] = nx(x, y), dith = ((x + y) & 1) ? 0.06 : -0.06;
    const l = -dx * 0.55 - dy * 0.75 + dith;
    if (dx > -0.55 && dx < -0.3 && dy > -0.62 && dy < -0.4) return mix(base, '#ffffff', 0.55);
    if (veins.has(x + ',' + y)) return mix(VEIN, base, l > 0 ? 0.25 : 0.05);
    const wr = Math.abs(Math.sin(y * 0.85 + Math.sin(x * 0.45 + seed) * 1.6));
    if (w > 8 && wr < 0.14 && dy > -0.45) return mix(base, '#000000', 0.26);
    return l > 0.45 ? mix(base, '#ffffff', 0.22) : l > 0.12 ? mix(base, '#ffffff', 0.08)
      : l < -0.5 ? mix(base, '#000000', 0.32) : l < -0.12 ? mix(base, '#000000', 0.16) : base;
  });
  veinyCache.set(k, c);
  return c;
}

// --------------------------------------------------------------- the ballsack walker
// The body is a metaball "sack" around two balls (the feet) and a neck blob under the shaft,
// re-rendered every frame so the skin stretches as the balls step, bounce and scratch.
const SW = Math.round(88 * K), SH = Math.round(62 * K), SOX = Math.round(44 * K), SOY = Math.round(58 * K);   // scratch canvas, origin = ground point
const sackCv = canvasOf(SW, SH), sackCtx = sackCv.getContext('2d');
const sackImg = sackCtx.createImageData(SW, SH), sackPx = new Uint32Array(sackImg.data.buffer);
const sackF = new Float32Array(SW * SH), sackDom = new Int8Array(SW * SH), sackCr = new Uint8Array(SW * SH);
const SACK_PAL = (() => {
  const base = mix(SKIN, '#9a3a4a', 0.2);
  return {
    base: u32(base), hi2: u32(mix(base, '#ffffff', 0.22)), hi1: u32(mix(base, '#ffffff', 0.08)),
    sh1: u32(mix(base, '#000000', 0.16)), sh2: u32(mix(base, '#000000', 0.32)), wr: u32(mix(base, '#000000', 0.26)),
    vein: u32(mix(VEIN, base, 0.05)), veinHi: u32(mix(VEIN, base, 0.3)), bulge: u32(mix(base, '#ffffff', 0.18)),
    crease: u32(mix(base, '#3a0a1a', 0.45)), foll: u32(mix(base, HAIR, 0.6)), shine: u32(mix(base, '#ffffff', 0.55)),
    white: u32('#ffffff'), out: u32(OUT),
  };
})();
// fixed vein maps + hair strands for the two balls (offsets from each ball's center)
const BALL_DETAIL = [1, 2].map(seed => {
  const r = rng(seed * 977), veins = new Set(), hairs = [], RX = 12 * K, RY = 11 * K;
  const inside = (x, y) => (x / RX) ** 2 + (y / RY) ** 2 < 0.92;
  const walk = (x, y, a, len) => {
    for (let i = 0; i < len; i++) {
      a += (r() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a);
      if (!inside(x, y)) return;
      veins.add(((Math.round(x) + 32) << 6) | (Math.round(y) + 32));
      if (i > 3 && r() < 0.1) walk(x, y, a + (r() < 0.5 ? -1 : 1) * 0.9, len - i - 2);
    }
  };
  for (let v = 0; v < (K < 1 ? 2 : 4); v++) {
    const t = Math.PI * (0.1 + r() * 0.8);
    walk(Math.cos(t) * RX * 0.8, Math.sin(t) * RY * 0.8, t + Math.PI + (r() - 0.5), (8 + r() * 9) * K);
  }
  for (let n = 0; n < Math.round(6 * K); n++) {
    const t = Math.PI * (0.95 + r() * 1.1);
    let x = Math.cos(t) * (RX + 0.6), y = Math.sin(t) * (RY + 0.6), a = t + (r() - 0.5);
    const strand = [];
    for (let i = 0; i < Math.round((3 + (r() * 2 | 0)) * K); i++) { x += Math.cos(a); y += Math.sin(a); a += 0.6 * (n % 2 ? 1 : -1); strand.push([x, y]); }
    hairs.push(strand);
  }
  return { veins, hairs, seed };
});

function renderSack(parts, flash) {
  const P = SACK_PAL;
  sackPx.fill(0);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    let f = 0, best = 0, bc = -1;
    const cb = [0, 0];
    for (let i = 0; i < parts.length; i++) {
      const b = parts[i], dx = (x + 0.5 - b.x) / b.rx, dy = (y + 0.5 - b.y) / b.ry, q = dx * dx + dy * dy;
      const c = (q < 0.004 ? 4000 : Math.pow(q, -1.6)) * b.w;
      f += c;
      if (i < 2) cb[i] = c;
      if (c > bc) { bc = c; best = i; }
    }
    const k = y * SW + x;
    sackF[k] = f; sackDom[k] = best;
    sackCr[k] = cb[0] > 0.28 && cb[1] > 0.28 && Math.abs(cb[0] - cb[1]) / (cb[0] + cb[1]) < 0.09 ? 1 : 0;
  }
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const k = y * SW + x;
    if (sackF[k] < 1) {
      if ((x > 0 && sackF[k - 1] >= 1) || (x < SW - 1 && sackF[k + 1] >= 1) || (y > 0 && sackF[k - SW] >= 1) || (y < SH - 1 && sackF[k + SW] >= 1)) sackPx[k] = P.out;
      continue;
    }
    if (flash) { sackPx[k] = P.white; continue; }
    const b = parts[sackDom[k]], lx = x + 0.5 - b.x, ly = y + 0.5 - b.y, nx = lx / b.rx, ny = ly / b.ry;
    const l = -nx * 0.55 - ny * 0.75 + (((x + y) & 1) ? 0.06 : -0.06) - (sackF[k] < 1.25 ? 0.25 : 0);
    let c;
    if (sackCr[k] && ly > -b.ry * 0.7) c = P.crease;
    else if (K < 1 && nx > -0.6 && nx < -0.2 && ny > -0.7 && ny < -0.3) c = P.shine;
    else if (b.d) {
      const vk = ((Math.round(lx) + 32) << 6) | (Math.round(ly) + 32), vb = ((Math.round(lx) + 32) << 6) | (Math.round(ly) + 33);
      if (nx > -0.55 && nx < -0.28 && ny > -0.65 && ny < -0.4) c = P.shine;
      else if (b.d.veins.has(vk)) c = l > 0 ? P.veinHi : P.vein;
      else if (b.d.veins.has(vb) && l > -0.2) c = P.bulge;
      else if (K >= 1 && Math.abs(Math.sin(ly * 0.85 + Math.sin(lx * 0.45 + b.d.seed) * 1.6)) < 0.13 && ny > -0.4) c = P.wr;
      else if (K < 1 && ny > 0.1 && (Math.round(ly) & 1) && Math.abs(nx) < 0.6 && hash(Math.round(lx) + 40, 3, b.d.seed) % 3 === 0) c = P.wr;
      else if (K >= 1 && hash(Math.round(lx) + 40, Math.round(ly) + 40, b.d.seed) % 31 === 0) c = P.foll;
    }
    if (!c) c = l > 0.45 ? P.hi2 : l > 0.12 ? P.hi1 : l < -0.5 ? P.sh2 : l < -0.12 ? P.sh1 : P.base;
    sackPx[k] = c;
  }
  sackCtx.putImageData(sackImg, 0, 0);
}

// ---- idle animations: each tweaks a pose; p = 0..1 progress, t = ms clock
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const envOf = p => smooth(0, 0.15, p) * (1 - smooth(0.85, 1, p));
const lerpAng = (a, b, k) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * k; };
const IDLES = {
  // lifts a ball like a dog's hind leg and scratches its head with it
  scratch: { dur: 2600, fn(p, t, s) {
    const e = envOf(p), fr = s.face;
    s.ball[1].dy -= 9 * e; s.ball[1].dx += fr * 5 * e + Math.sin(t / 26) * 2.2 * e;
    s.ball[0].dy += 0; s.sx -= fr * 2 * e;
    s.ang = lerpAng(s.ang, fr > 0 ? -12 : 192, e); s.lenMul *= 1 - 0.12 * e;
    if (e > 0.5) s.eyes = 'happy';
  } },
  // little shuffle dance, balls stepping to the beat, shaft wagging
  shuffle: { dur: 3000, fn(p, t, s) {
    const e = envOf(p), b = t / 115;
    s.bob -= Math.abs(Math.sin(b)) * 3 * e; s.sx += Math.sin(b / 2) * 4 * e;
    s.ball[0].dy -= Math.max(0, Math.sin(b)) * 4 * e; s.ball[1].dy -= Math.max(0, -Math.sin(b)) * 4 * e;
    s.ang = lerpAng(s.ang, 90 + Math.sin(b / 2) * 35, e); s.notes = e; s.eyes = 'happy';
  } },
  // big morning stretch: shoots straight up, mouth open... then flops
  yawn: { dur: 2600, fn(p, t, s) {
    const up = smooth(0, 0.35, p) * (1 - smooth(0.55, 0.7, p)), e = envOf(p);
    s.ang = lerpAng(s.ang, 90, up); s.lenMul *= 1 + 0.3 * up; s.mouth = up;
    s.limpAdd += 0.7 * Math.sin(Math.PI * smooth(0.55, 1, p)) * e;
    s.ball[0].dy -= up * 1.5; s.ball[1].dy -= up * 1.5;
    if (up > 0.3) s.eyes = 'closed';
  } },
  // looks around, left then right, eyes wide
  look: { dur: 2800, fn(p, t, s) {
    const e = envOf(p);
    s.ang = lerpAng(s.ang, 90 + 72 * Math.sin(p * Math.PI * 2), e); s.eyes = 'wide';
  } },
  // the helicopter
  helicopter: { dur: 2400, fn(p, t, s) {
    const e = envOf(p), k = smooth(0.05, 0.95, p);
    s.ang = s.ang + 1080 * k * s.face; s.lenMul *= 1 - 0.12 * e; s.heli = e;
    s.bob -= Math.abs(Math.sin(t / 60)) * 1.5 * e; s.eyes = 'happy';
  } },
  // winds up... ACHOO, sprays everybody
  sneeze: { dur: 2000, fn(p, t, s) {
    const wind = smooth(0, 0.55, p) * (1 - smooth(0.55, 0.6, p)), snap = smooth(0.55, 0.6, p) * (1 - smooth(0.7, 1, p));
    s.ang = s.ang + s.face * (28 * wind - 14 * snap); s.lenMul *= 1 - 0.3 * wind + 0.18 * snap;
    s.bob += 2 * wind - 2 * snap;
    if (wind > 0.5) s.eyes = 'closed';
    if (p > 0.56) s.spray = (p - 0.56) / 0.44;
  } },
};
const IDLE_KINDS = Object.keys(IDLES);

// The dick tank. (sx, sy) = ground under its middle (world px); ang in degrees (0 = right, 90 = up).
// o: { face, flash, walk (stride phase), moving, erect 0..1, recoil 0..1, charge 0..1, idle: { k, p } }
// Returns the tip of the head in world px (where the load comes out).
function drawTank(sx, sy, ang, color, t, o = {}) {
  const pc = PLAYER_COLORS[color];
  const flash = o.flash && ((t / 60) | 0) % 2 === 0;
  const C = c => (flash ? '#ffffff' : c);
  const face = o.face || (Math.cos(ang * Math.PI / 180) < -1e-6 ? -1 : 1);
  const s = { face, ang, lenMul: 1, bob: 0, sx: 0, ball: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], eyes: 'open', mouth: 0, limpAdd: 0, spray: 0, notes: 0, heli: 0 };
  // walking: the balls take turns stepping forward inside the sack
  if (o.moving) {
    const ph = (o.walk || 0) * 0.55;
    for (let i = 0; i < 2; i++) {
      const q = ph + i * Math.PI;
      s.ball[i].dy -= Math.max(0, Math.sin(q)) * 5;
      s.ball[i].dx += Math.cos(q) * 3 * face;   // (design px; scaled by K below)
    }
    s.bob -= Math.abs(Math.sin(ph)) * 1.5;
    s.ang += Math.sin(ph * 2) * 6;
  }
  if (o.idle && IDLES[o.idle.k]) IDLES[o.idle.k].fn(o.idle.p, t, s);
  const e = Math.max(0, Math.min(1, (o.erect == null ? 1 : o.erect) - s.limpAdd));
  const jig = o.flash ? Math.round(Math.sin(t / 40) * 1.5 * K) : 0;
  s.bob *= K; s.sx *= K;
  for (const b of s.ball) { b.dx *= K; b.dy *= K; }

  g.save(); g.scale(1 / RES, 1 / RES);
  const saved = DPX; DPX = 1;
  const X = Math.round(sx * RES), Y = Math.round(sy * RES);

  // ---- ground shadow
  g.globalAlpha = 0.28; g.fillStyle = '#000000';
  g.fillRect(Math.round(X - 22 * K + s.sx), Y - 1, kp(44), kp(2)); g.fillRect(Math.round(X - 17 * K + s.sx), Y + kp(2) - 1, kp(34), 1);
  g.globalAlpha = 1;

  // ---- the sack: back ball, front ball, neck blob under the shaft
  const sag = (1 - e) * 2.5 * K, bx = SOX + s.sx, by = SOY + s.bob;
  const balls = [-1, 1].map((side, i) => {
    const RX = (i ? 12.5 : 11.5) * K, RY = (i ? 11.5 : 10.5) * K + sag;
    return { x: bx + side * face * 10 * K + s.ball[i].dx, y: SOY - RY - 0.5 + s.ball[i].dy + s.bob * 0.4 + (i ? jig : -jig), rx: RX, ry: RY, w: 1, d: BALL_DETAIL[i] };
  });
  const neck = { x: bx, y: by - 22 * K + sag * 0.5, rx: 7 * K, ry: 6 * K, w: 0.55, d: null };
  renderSack([balls[0], balls[1], neck], flash);
  g.drawImage(sackCv, X - SOX, Y - SOY);
  if (!flash) {   // stray hairs on the sack
    g.fillStyle = HAIR;
    balls.forEach(b => b.d.hairs.forEach(st => st.forEach(([hx, hy]) => g.fillRect(Math.round(X - SOX + b.x + hx * face), Math.round(Y - SOY + b.y + hy), 1, 1))));
  }

  // ---- the shaft = barrel. Points along the aim, droops and shrinks as the wood fades.
  const P = { x: X + s.sx, y: Y - 12 * RES + s.bob };     // pivot (server PIVOT = 12 world px)
  const rh = rng(7 + color);                                // pubes
  g.fillStyle = C(HAIR);
  for (let n = 0; n < Math.round(26 * K); n++) {
    const a = Math.PI * (1.0 + rh() * 1.0), d = (4 + rh() * 5) * K;
    const x = P.x + Math.cos(a) * d, y = P.y + 2 * K + Math.sin(a) * d * 0.8;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    if (K >= 1) g.fillRect(Math.round(x + Math.cos(a + 1.2)), Math.round(y + Math.sin(a + 1.2)), 1, 1);
  }
  const theta = s.ang * Math.PI / 180, limp = 1 - e;
  let droopD = (face > 0 ? -80 : 260) - s.ang;               // where gravity pulls a floppy one (shortest way round)
  droopD = ((droopD % 360) + 540) % 360 - 180;
  const target = theta + droopD * Math.PI / 180;
  const sway = limp * 0.12 * Math.sin(t / 650 + color);
  const beat = (t % 1000) < 110 ? 1 : 0;                   // heartbeat throb
  const shake = (o.charge || 0) * 0.8;
  const L = (10 + 7 * e) * RES * (1 - 0.3 * (o.recoil || 0)) * s.lenMul;
  const R0 = (2.2 + 0.6 * e) * RES + beat * e * 0.5 * K;
  const N = Math.max(6, Math.ceil(L / (1.5 * K)));
  const pts = [];
  let x = P.x, y = P.y;
  for (let i = 0; i <= N; i++) {
    const q = i / N, k = Math.min(1, limp * (0.25 + 0.85 * Math.pow(q, 1.2)) + sway * q);
    const phi = theta + (target - theta) * k;
    pts.push({ x: x + (Math.random() - 0.5) * shake, y: y + (Math.random() - 0.5) * shake, phi, r: R0 * (1 - 0.1 * q) });
    x += Math.cos(phi) * (L / N); y -= Math.sin(phi) * (L / N);
  }
  // helicopter: motion blur ring
  if (s.heli > 0.3) {
    g.globalAlpha = 0.35 * s.heli; g.fillStyle = '#fffbe8';
    for (let i = 0; i < 40 * K; i++) { const a = i / (40 * K) * Math.PI * 2; g.fillRect(Math.round(P.x + Math.cos(a) * L * 0.95), Math.round(P.y - Math.sin(a) * L * 0.95), 1, 1); }
    g.globalAlpha = 1;
  }
  // unit normal pointing at the screen-bottom side of the shaft (the shadow side)
  const under = q => { let nx = Math.sin(q.phi), ny = Math.cos(q.phi); if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } return [nx, ny]; };
  const shaftCol = mix(mix(SKIN, '#d8b4a4', limp * 0.5), '#f0889a', e * 0.25);
  const end = pts[pts.length - 1], dx = Math.cos(end.phi), dy = -Math.sin(end.phi);
  const HR = R0 * 1.3, hx = end.x + dx * 2 * K, hy = end.y + dy * 2 * K;
  for (const q of pts) disk(q.x, q.y, q.r + 1, OUT);
  disk(hx - dx * 1.5 * K, hy - dy * 1.5 * K, HR + 1, OUT); disk(hx + dx * 1.2 * K, hy + dy * 1.2 * K, HR + 0.6, OUT);
  for (const q of pts) disk(q.x, q.y, q.r, C(shaftCol));
  for (const q of pts) { const [ux, uy] = under(q); disk(q.x + ux * q.r * 0.55, q.y + uy * q.r * 0.55, q.r * 0.5, C(mix(shaftCol, '#7a2a3a', 0.35))); }
  for (const q of pts) { const [ux, uy] = under(q); disk(q.x - ux * q.r * 0.5, q.y - uy * q.r * 0.5, q.r * 0.3, C(mix(shaftCol, '#ffffff', 0.3))); }
  // veins: bulge more the harder it is, flash brighter on each throb
  if (!flash && e > 0.15) {
    g.fillStyle = mix(shaftCol, VEIN, 0.25 + 0.5 * e + beat * 0.15);
    pts.forEach((q, i) => {
      if (i < 3 || i > pts.length - 2) return;
      const [ux, uy] = under(q), f = i / N;
      const o1 = q.r * (0.1 + 0.45 * Math.sin(f * 8 + color)), o2 = q.r * (-0.55 + 0.25 * Math.sin(f * 11 + 2));
      g.fillRect(Math.round(q.x + ux * o1), Math.round(q.y + uy * o1), 1, 1);
      if (e > 0.45) g.fillRect(Math.round(q.x + ux * o2), Math.round(q.y + uy * o2), 1, 1);
      if (i % 5 === 3 && e > 0.6) g.fillRect(Math.round(q.x + ux * (o1 + 1) + dx), Math.round(q.y + uy * (o1 + 1) + dy), 1, 1);
    });
  }
  // cock ring in team colors at the base
  if (!flash) {
    const q = pts[Math.min(2, pts.length - 1)], cx = Math.cos(q.phi), cy = -Math.sin(q.phi), [ux, uy] = under(q), ri = Math.ceil(q.r + 2);
    for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
      const along = i * cx + j * cy, across = i * ux + j * uy;
      if (Math.abs(along) <= 1.1 && Math.abs(across) <= q.r + 1.2) {
        g.fillStyle = Math.abs(across) > q.r + 0.4 ? OUT : across < -q.r * 0.3 ? pc.l : across > q.r * 0.4 ? pc.d : pc.b;
        g.fillRect(Math.round(q.x) + i, Math.round(q.y) + j, 1, 1);
      }
    }
  }
  // ---- the head: corona ring, shading, shine, pee hole
  const head = mix(mix(HEAD, '#c8a0aa', limp * 0.6), '#ff6a8a', e * 0.15), headD = mix(head, '#5a1a2a', 0.35);
  const [ux, uy] = under(end);
  disk(hx - dx * 1.5 * K, hy - dy * 1.5 * K, HR, C(headD));
  disk(hx + dx * 1.2 * K, hy + dy * 1.2 * K, HR - 0.3, C(head));
  disk(hx + dx * 1.5 + ux * HR * 0.45, hy + dy * 1.5 + uy * HR * 0.45, HR * 0.45, C(mix(head, '#7a2a3a', 0.25)));
  disk(hx + dx * 1.5 - ux * HR * 0.5, hy + dy * 1.5 - uy * HR * 0.5, HR * 0.28, C(mix(head, '#ffffff', 0.5)));
  const tx = hx + dx * (HR + 0.5 * K), ty = hy + dy * (HR + 0.5 * K);
  if (!flash) {
    if (s.mouth > 0.1) disk(tx - dx * 1.2 * K, ty - dy * 1.2 * K, (0.8 + s.mouth * 1.6) * K, '#4a0a1a');   // big yawn
    else {
      g.fillStyle = mix(head, '#3a0a1a', 0.6);
      g.fillRect(Math.round(tx), Math.round(ty), 1, 1); if (K >= 1) g.fillRect(Math.round(tx - ux), Math.round(ty - uy), 1, 1);
    }
    // pre-cum glistens while charging
    if (o.charge > 0.05) disk(tx + dx * (1 + o.charge * 1.5) * K, ty + dy * (1 + o.charge * 1.5) * K, (0.6 + o.charge * 1.2) * K, (t / 90 | 0) % 2 ? '#fffbe8' : '#d8e8ff');
    // bandana tied across the head, tails flapping behind it
    const bcx = hx - dx * 0.8 * K, bcy = hy - dy * 0.8 * K, ri = Math.ceil(HR + 1);
    g.fillStyle = pc.b;
    for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
      const along = i * dx + j * dy, across = i * ux + j * uy;
      if (Math.abs(along) <= Math.max(0.6, 1.6 * K) && Math.abs(across) <= HR + 0.3) g.fillRect(Math.round(bcx) + i, Math.round(bcy) + j, 1, 1);
    }
    const kx = bcx - ux * HR, ky = bcy - uy * HR;
    for (let tail = 0; tail < 2; tail++) {
      g.fillStyle = tail ? pc.d : pc.b;
      for (let k = 1; k <= kp(7); k++) {
        const w = (Math.sin(t / 110 + k / K * 0.6 + tail * 1.7) * k * 0.25 + (tail ? 1.5 : -0.5)) * K;
        g.fillRect(Math.round(kx - dx * k - ux * (w + k * 0.35)), Math.round(ky - dy * k - uy * (w + k * 0.35)), kp(2), 1);
      }
    }
    disk(kx, ky, 1.2 * K, pc.d);
    // eyes peeking through the mask
    for (const sd of [-1, 1]) {
      const ex = bcx + ux * sd * HR * 0.48, ey = bcy + uy * sd * HR * 0.48;
      if (s.eyes === 'closed' || s.eyes === 'happy') {
        g.fillStyle = OUT;
        if (K < 1) g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
        else for (let k = -1; k <= 1; k++) g.fillRect(Math.round(ex + dx * k), Math.round(ey + dy * k - (s.eyes === 'happy' && k === 0 ? 1 : 0)), 1, 1);
      } else if (K < 1) {   // one-pixel eyes; wide eyes get a pupil pixel next to them
        g.fillStyle = '#ffffff'; g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
        if (s.eyes === 'wide') { g.fillStyle = OUT; g.fillRect(Math.round(ex + dx), Math.round(ey + dy), 1, 1); }
      } else {
        disk(ex, ey, s.eyes === 'wide' ? 1.8 : 1.3, '#ffffff');
        g.fillStyle = OUT; g.fillRect(Math.round(ex + dx * 0.8), Math.round(ey + dy * 0.8), 1, 1);
      }
    }
    // nervous sweat drop when it's going soft
    if (e < 0.35) {
      const ph = (t / 1400 + color * 0.3) % 1;
      disk(hx - ux * (HR + 2 * K), hy - uy * (HR + 2 * K) + ph * 6 * K, K, '#8ac8ff');
    }
    // sneeze spray: a cone of droplets arcing out of the tip
    if (s.spray > 0 && s.spray < 1) {
      const rs = rng(31 + color);
      for (let i = 0; i < 9; i++) {
        const a = Math.atan2(dy, dx) + (rs() - 0.5) * 0.9, v = (22 + rs() * 26) * K, k = s.spray;
        const ddx = tx + Math.cos(a) * v * k, ddy = ty + Math.sin(a) * v * k + 40 * K * k * k;
        disk(ddx, ddy, (1 + rs() * 0.8 * (1 - k)) * K, i % 3 ? '#e8f4ff' : '#fffbe8');
      }
    }
    // dance notes
    if (s.notes > 0.3) {
      for (let i = 0; i < 2; i++) {
        const ph = (t / 900 + i * 0.5) % 1, nx = Math.round(X + s.sx + ((i ? 14 : -14) + Math.sin(ph * 6) * 3) * K), ny = Math.round(Y - (48 + ph * 18) * K);
        g.globalAlpha = Math.min(1, (1 - ph) * 2) * s.notes;
        if (K < 1) {   // tiny 2x4 note
          for (const [ox, oy, c] of [[1, 1, OUT], [0, 0, i ? pc.l : '#fffbe8']]) {   // note with a drop shadow
            g.fillStyle = c; g.fillRect(nx + ox, ny + 3 + oy, 2, 2); g.fillRect(nx + 1 + ox, ny + oy, 1, 3); g.fillRect(nx + 2 + ox, ny + oy, 1, 1);
          }
        } else {
          g.fillStyle = OUT; g.fillRect(nx - 1, ny + 3, 4, 3); g.fillRect(nx + 2, ny - 4, 2, 8);
          g.fillStyle = i ? pc.l : '#fffbe8'; g.fillRect(nx, ny + 4, 2, 1); g.fillRect(nx + 2, ny - 3, 1, 7); g.fillRect(nx + 3, ny - 3, 2, 1);
        }
        g.globalAlpha = 1;
      }
    }
  }
  DPX = saved;
  g.restore();
  return { x: tx / RES, y: ty / RES };
}

// --------------------------------------------------------------- projectiles (world coords)
function drawProjectile(look, x, y, vx, vy, size, col, t) {
  const r = Math.max(1, size / 2);
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  switch (look) {
    case 'ball': {
      const b = getVeinyBall(Math.round((size + 3) * RES), Math.round((size + 2) * RES), mix(col, SKIN, 0.4), 3);
      blit(b, x - b.width * U / 2, y - b.height * U / 2);
      return;
    }
    case 'nuts': {   // a big pair, jiggling as it flies
      const bw = Math.max(4, Math.round(size * 0.72 * RES)), bh = Math.max(4, Math.round(size * 0.85 * RES));
      const skin = mix(col, SKIN, 0.4), wob = Math.round(Math.sin(t / 90) * 2 * K) * U;
      const L = getVeinyBall(bw, bh, skin, 4), R = getVeinyBall(bw, bh + 2, skin, 5);
      const off = bw * 0.42 * U;
      blit(L, x - off - L.width * U / 2, y - L.height * U / 2 + wob);
      blit(R, x + off - R.width * U / 2, y - R.height * U / 2 - wob);
      px(x, y - bh * U / 2 + kp(2) * U, 1, Math.max(2, bh - kp(5)), mix(skin, '#000000', 0.45));   // the seam
      return;
    }
    case 'rocket':
    case 'probe': {
      const len = look === 'rocket' ? 4 : 5;
      for (let d = 0; d <= len; d += 0.5) disk(x - ux * d, y - uy * d, r + kp(2) * U, OUT);
      for (let d = 0; d <= len; d += 0.5) disk(x - ux * d, y - uy * d, r, d < 1 ? (look === 'probe' ? HEAD : '#ffffff') : col);
      if (K >= 1) disk(x - ux * len * 0.5 - uy * r * 0.4, y - uy * len * 0.5 + ux * r * 0.4, r * 0.35, mix(col, '#ffffff', 0.4));
      if (look === 'rocket') {
        const fl = (t / 50 | 0) % 2;
        disk(x - ux * (len + 1.5), y - uy * (len + 1.5), 1.5, fl ? '#ffd84a' : '#ff7a1f');
        disk(x - ux * (len + 3), y - uy * (len + 3), 1, fl ? '#ff7a1f' : '#ffd84a');
      }
      return;
    }
    case 'drop':
      disk(x, y, r + kp(2) * U, OUT); disk(x - ux * 1.5, y - uy * 1.5, r, col); disk(x, y, r, col);
      px(x - r / 2, y - r / 2, kp(2), kp(2), '#ffffff');
      return;
    case 'dirt':
      disk(x, y, r + kp(2) * U, OUT); disk(x, y, r, col);
      px(x, y, kp(2), kp(2), mix(col, '#000000', 0.35)); if (K >= 1) px(x - r / 2, y + r / 3, 1, 1, mix(col, '#000000', 0.35));
      return;
    default:   // glob / pearl
      disk(x, y, r + kp(2) * U, OUT); disk(x, y, r, col);
      if (K >= 1 || r >= 2) disk(x + r * 0.25, y + r * 0.25, r * 0.55, mix(col, '#000000', 0.15));
      px(x - r / 2, y - r / 2, kp(look === 'pearl' ? 3 : 2), kp(2), '#ffffff');
  }
}

// --------------------------------------------------------------- DOM labels in the game font
// Renders text with the 3x5 bitmap font onto a small canvas (1 font pixel = 1 canvas pixel);
// CSS scales it up with image-rendering: pixelated. style: 'logo' | 'outline' | 'plain'.
const LOGO_ROWS = ['#f4ff9a', '#d8fa70', '#b8f048', '#8ad838', '#62c02a', '#4aa820', '#2a7a12'];
// style: 'logo' (3x smoothed, gradient, outline + red drop shadow), 'outline' (2x smoothed, outlined),
// 'plain' (1x, dark drop shadow), 'flat' (1x, no shadow - for text on buttons)
function fontCanvas(text, style = 'plain', color = '#fffbe8') {
  text = String(text).toUpperCase();
  const f = style === 'logo' ? 3 : style === 'outline' ? 2 : 1;
  let w = Math.max(1, textWidth(text)), h = 5, b = new Uint8Array(w * h);
  for (let i = 0; i < text.length; i++) {
    const g2 = FONT[text[i]] || FONT['?'];
    for (let k = 0; k < 15; k++) if (g2[k] === '1') b[((k / 3) | 0) * w + i * 4 + (k % 3)] = 1;
  }
  if (f === 2) { b = scale2x(b, w, h); w *= 2; h *= 2; }
  if (f === 3) { b = scale3x(b, w, h); w *= 3; h *= 3; }
  const pad = style === 'flat' ? 0 : style === 'plain' ? 1 : 3;
  const c = canvasOf(w + pad * 2, h + pad * 2), x = c.getContext('2d');
  const put = (ox, oy, col) => { x.fillStyle = col; for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (b[y * w + i]) x.fillRect(i + ox, y + oy, 1, 1); };
  const o = pad;
  if (style === 'logo' || style === 'outline') {
    const sh = style === 'logo' ? 2 : 1;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) put(o + sh + dx, o + sh + dy, OUT);   // shadow outline
    put(o + sh, o + sh, style === 'logo' ? '#c8402a' : '#9c1f2a');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) put(o + dx, o + dy, OUT);
    if (style === 'logo') {
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (b[y * w + i]) { x.fillStyle = LOGO_ROWS[Math.min(LOGO_ROWS.length - 1, Math.floor(y / h * LOGO_ROWS.length))]; x.fillRect(i + o, y + o, 1, 1); }
      x.fillStyle = 'rgba(255,255,255,0.55)';   // a shine line along the top of each stroke
      for (let y = 1; y < h; y++) for (let i = 0; i < w; i++) if (b[y * w + i] && !b[(y - 1) * w + i] && y < h * 0.6) x.fillRect(i + o, y + o, 1, 1);
    } else put(o, o, color);
  } else {
    if (style === 'plain') put(o + 1, o + 1, OUT);
    put(o, o, color);
  }
  return c;
}
