// Pixel-art assets for BATTLE DONGS, built at runtime. Font, colors, sky and helpers come from BALLISTIC.
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

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function pixmap(rows, colors) {
  const c = canvasOf(rows[0].length, rows.length), x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    const col = colors[ch];
    if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
  }));
  return c;
}

// per-pixel painter: fn(x, y) -> color | null
function paint(w, h, fn) {
  const c = canvasOf(w, h), x = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const col = fn(i, y);
    if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
  }
  return c;
}

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function whiteOut(src, fill) {   // silhouette of a sprite in one color (hit flash / ghost)
  const c = canvasOf(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
  x.fillStyle = fill; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// --------------------------------------------------------------- bitmap font (3x5)
const FONT = (() => {
  const g = {
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
    '_': '000000000000111', '&': '010101010101011', ' ': '000000000000000',
  };
  return g;
})();
const textWidth = (s, scale = 1) => (s.length * 4 - 1) * scale;

// draws on the main canvas context `g` (declared in main.js)
function pixText(str, x, y, color = '#fff', o = {}) {
  const s = o.scale || 1;
  str = String(str).toUpperCase();
  const w = textWidth(str, s);
  x = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
  y = Math.round(y);
  const shadow = o.shadow === undefined ? OUT : o.shadow;
  const pass = (ox, oy, col) => {
    g.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const bits = FONT[str[i]] || FONT['?'];
      for (let b = 0; b < 15; b++) if (bits[b] === '1') g.fillRect(x + (i * 4 + b % 3) * s + ox, y + ((b / 3) | 0) * s + oy, s, s);
    }
  };
  if (shadow) { pass(s, 0, shadow); pass(0, s, shadow); pass(s, s, shadow); pass(-s, 0, shadow); pass(0, -s, shadow); }
  pass(0, 0, color);
  return w;
}

// --------------------------------------------------------------- background (junkyard dusk)
const BG = { sky: null, far: null, near: null, w: 0, h: 0 };

function buildBackground(W, H) {
  if (BG.w === W && BG.h === H) return;
  BG.w = W; BG.h = H;
  const bands = ['#1c0f1f', '#2a1428', '#3d1a2c', '#55222e', '#6e2c2e', '#8a3a2c', '#a64e2a', '#c0662a', '#d6802e', '#e69a38', '#f0b44a', '#f6cc66'];
  const bh = H * 0.8 / bands.length;
  const D = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const sunX = W * 0.68, sunY = H * 0.55, sunR = H * 0.2;
  const r = rng(7);
  const clouds = Array.from({ length: 7 }, () => ({ x: r() * W, y: H * (0.15 + r() * 0.35), w: 30 + r() * 70, h: 4 + r() * 6 }));
  BG.sky = paint(W, H, (x, y) => {
    const f = y / bh, i = Math.min(bands.length - 1, Math.floor(f)), frac = f - i;
    let col = bands[frac > 0.5 + D[y & 3][x & 3] / 32 ? Math.min(bands.length - 1, i + 1) : i];
    const sd = Math.hypot(x - sunX, (y - sunY) * 1.1);
    if (sd < sunR) col = sd < sunR - 2 ? (y % 6 < 2 && y > sunY ? '#f0b44a' : '#fae0a0') : '#f6cc66';
    // dithered smog clouds drifting in front of the sun
    for (const c of clouds) {
      const dx = (x - c.x) / c.w, dy = (y - c.y) / c.h, d = dx * dx + dy * dy;
      if (d < 1) { col = d < 0.55 ? '#7a3a34' : ((x + y) & 1 ? '#7a3a34' : col); break; }
    }
    return col;
  });
  BG.far = makeJunkLayer(W * 2, Math.round(H * 0.5), '#3a1a26', '#5a2a30', 11, 0.35);
  BG.near = makeJunkLayer(W * 2, Math.round(H * 0.4), '#1e0c14', '#3a1a20', 23, 0.25);
}

function makeJunkLayer(w, h, col, rim, seed, amp) {
  const r = rng(seed), A = h * amp;
  const top = new Array(w);
  for (let x = 0; x < w; x++) {
    const a = 2 * Math.PI * x / w;
    top[x] = h - A - A * 0.5 * Math.sin(a * 3 + seed) - A * 0.3 * Math.sin(a * 11 + seed * 2) - A * 0.12 * Math.sin(a * 37);
  }
  const shapes = [];
  for (let i = 0; i < w / 28; i++) {
    const x = r() * w, base = top[Math.floor(x)];
    const k = r();
    if (k < 0.35) shapes.push({ t: 'tire', x, y: base - 3, rr: 4 + r() * 4 });
    else if (k < 0.6) shapes.push({ t: 'box', x, y: base, w: 8 + r() * 10, h: 10 + r() * 14 });
    else if (k < 0.8) shapes.push({ t: 'car', x, y: base, w: 26 + r() * 10 });
    else if (k < 0.88) shapes.push({ t: 'crane', x, y: base, h: h * 0.7 });
  }
  const solid = (x, y) => {
    if (y >= top[((x % w) + w) % w]) return true;
    for (const s of shapes) {
      const dx = x - s.x;
      if (s.t === 'tire' && Math.hypot(dx, y - s.y) < s.rr && Math.hypot(dx, y - s.y) > s.rr * 0.45) return true;
      if (s.t === 'box' && dx >= 0 && dx < s.w && y > s.y - s.h && y <= s.y) return true;
      if (s.t === 'car' && dx >= 0 && dx < s.w && ((y > s.y - 7 && y <= s.y) || (y > s.y - 12 && dx > s.w * 0.25 && dx < s.w * 0.7))) return true;
      if (s.t === 'crane' && ((dx >= 0 && dx < 3 && y > s.y - s.h) || (y > s.y - s.h - 2 && y <= s.y - s.h && dx > -30 && dx < 12) || (dx === -24 && y > s.y - s.h && y < s.y - s.h + 18))) return true;
    }
    return false;
  };
  return paint(w, h, (x, y) => {
    if (!solid(x, y)) return null;
    if (!solid(x, y - 1)) return rim;
    if (hash(x, y, seed) % 61 === 0) return rim;
    return col;
  });
}

function drawBackground(g, W, H, t, camX = 0) {
  g.drawImage(BG.sky, 0, 0);
  const off1 = (((Math.round(camX * 0.15 + t * 0.002)) % BG.far.width) + BG.far.width) % BG.far.width;
  g.drawImage(BG.far, -off1, H - BG.far.height); g.drawImage(BG.far, BG.far.width - off1, H - BG.far.height);
  const off2 = (((Math.round(camX * 0.35 + t * 0.005)) % BG.near.width) + BG.near.width) % BG.near.width;
  g.drawImage(BG.near, -off2, H - BG.near.height); g.drawImage(BG.near, BG.near.width - off2, H - BG.near.height);
}

// buzzing flies around a point (pure function of time, no state)
function drawFlies(g, x, y, t, n = 2, seed = 0) {
  for (let i = 0; i < n; i++) {
    const k = seed * 7.3 + i * 2.1;
    const fx = Math.round(x + Math.sin(t * 0.004 * (1 + i * 0.3) + k) * 9 + Math.sin(t * 0.017 + k) * 2);
    const fy = Math.round(y + Math.cos(t * 0.006 * (1 + i * 0.2) + k) * 5 + Math.sin(t * 0.021 + k) * 2);
    g.fillStyle = OUT; g.fillRect(fx, fy, 1, 1);
    g.fillStyle = (t / 40 + i) % 2 < 1 ? '#d8e0e8' : '#8a9098'; g.fillRect(fx, fy - 1, 1, 1);
  }
}

// --------------------------------------------------------------- terrain texture
const toU32 = h => { const [r, gg, b] = rgbOf(h); return ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0; };
const CRUST = [toU32(OUT), toU32('#d8a468'), toU32('#b07c48')];

// Layered junkyard dirt with buried trash, as packed RGBA pixels for ImageData.
function buildDirt(W, H) {
  const cols = ['#7a4e2a', '#6e4426', '#84552e', '#5e3a1e', '#734a28', '#68401f'];
  const lite = cols.map(c => toU32(c)), dark = cols.map(c => toU32(mix(c, '#000000', 0.18)));
  const debris = ['#9a9a9a', '#c83a2a', '#e8e0c8', '#4a8a3a', '#3a3a4a', '#d8b040', '#5a9bff'].map(toU32);
  const px = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const band = Math.floor((y + 6 * Math.sin(x * 0.05 + y * 0.02) + 3 * Math.sin(x * 0.13)) / 9);
    const i = ((band % cols.length) + cols.length) % cols.length, h = hash(x, y, 3);
    let c = (h % 5 === 0 || ((x + y) & 1 && h % 3 === 0)) ? dark[i] : lite[i];
    if (h % 113 === 0) c = debris[h % debris.length];
    if (hash(x >> 2, y >> 2, 9) % 61 === 0 && h % 2) c = dark[(i + 2) % cols.length];   // pebbles
    px[y * W + x] = c;
  }
  return px;
}

// --------------------------------------------------------------- balls, disks, tanks
const ballCache = new Map();
function getBall(w, h, skin = '#e0a090') {   // wrinkly, slightly hairy
  const k = w + 'x' + h + skin;
  if (ballCache.has(k)) return ballCache.get(k);
  const base = mix(skin, '#7a2a3a', 0.22), W2 = w + 2, H2 = h + 2, cx = W2 / 2, cy = H2 / 2;
  const inside = (x, y) => { const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2); return dx * dx + dy * dy <= 1; };
  const c = paint(W2, H2, (x, y) => {
    if (!inside(x, y)) return inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1) ? OUT : null;
    const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2);
    if (dx < -0.2 && dx > -0.7 && dy < -0.15 && dy > -0.75) return mix(base, '#ffffff', 0.35);
    if (w > 6 && Math.abs(Math.sin(x * 1.3 + y * 0.6)) < 0.13 && dy > -0.4) return mix(base, '#000000', 0.28);
    if (w > 6 && hash(x, y, 5) % 17 === 0) return OUT;
    return dx > 0.45 || dy > 0.55 ? mix(base, '#000000', 0.2) : base;
  });
  ballCache.set(k, c);
  return c;
}

// filled pixel circle on the main canvas `g`
function disk(cx, cy, r, col) {
  g.fillStyle = col;
  cx = Math.round(cx); cy = Math.round(cy);
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = r * r - dy * dy;
    if (w < 0) continue;
    const wi = Math.round(Math.sqrt(w));
    g.fillRect(cx - wi, cy + dy, wi * 2 + 1, 1);
  }
}

const SKIN = '#e8a890', SKIN_D = '#c07868', HEAD = '#f08a9a', HEAD_D = '#c85a6a';
const VEIN = '#7a5aa8', HAIR = '#3a2014';

// Tanks are drawn at TR x the world resolution so they get finer pixels than the terrain.
const TR = 2;

// A big wrinkly testicle with bulging veins and a few stray hairs, at tank (hi-res) scale.
const veinyCache = new Map();
function getVeinyBall(w, h, skin, seed) {
  const k = [w, h, skin, seed].join();
  if (veinyCache.has(k)) return veinyCache.get(k);
  const base = mix(skin, '#9a3a4a', 0.2), W2 = w + 6, H2 = h + 6, cx = W2 / 2, cy = H2 / 2 + 1;
  const nx = (x, y) => [(x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2)];
  const inside = (x, y) => { const [dx, dy] = nx(x, y); return dx * dx + dy * dy <= 1; };
  const r = rng(seed * 31 + w), veins = new Set(), hairs = new Set();
  // veins: random walks creeping up from the bottom, sometimes forking
  const walk = (x, y, a, len) => {
    for (let i = 0; i < len; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (!inside(Math.round(x), Math.round(y))) return;
      veins.add(Math.round(x) + ',' + Math.round(y));
      if (i > 3 && r() < 0.08) walk(x, y, a + (r() < 0.5 ? -1 : 1) * 0.9, len - i - 2);
    }
  };
  for (let v = 0; v < 3; v++) {
    const t = Math.PI * (0.15 + r() * 0.7);
    walk(cx + Math.cos(t) * w * 0.4, cy + Math.sin(t) * h * 0.4, t + Math.PI + (r() - 0.5), 9 + r() * 7);
  }
  // hairs: short curly strands sticking out of the outline
  for (let n = 0; n < 5; n++) {
    const t = Math.PI * (0.9 + r() * 1.2);   // mostly on the sides / top
    let x = cx + Math.cos(t) * (w / 2 + 0.5), y = cy + Math.sin(t) * (h / 2 + 0.5), a = t + (r() - 0.5);
    for (let i = 0; i < 3; i++) { x += Math.cos(a); y += Math.sin(a); a += 0.7; hairs.add(Math.round(x) + ',' + Math.round(y)); }
  }
  const c = paint(W2, H2, (x, y) => {
    if (!inside(x, y)) {
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) return OUT;
      return hairs.has(x + ',' + y) ? HAIR : null;
    }
    const [dx, dy] = nx(x, y), dith = ((x + y) & 1) ? 0.06 : -0.06;
    const l = -dx * 0.55 - dy * 0.75 + dith;                // light from the top-left
    if (dx > -0.55 && dx < -0.3 && dy > -0.62 && dy < -0.4) return mix(base, '#ffffff', 0.55);   // shine
    if (veins.has(x + ',' + y)) return mix(VEIN, base, l > 0 ? 0.25 : 0.05);
    if (veins.has(x + ',' + (y + 1)) && l > -0.2) return mix(base, '#ffffff', 0.18);   // vein bulge catches light
    const wr = Math.abs(Math.sin(y * 0.85 + Math.sin(x * 0.45 + seed) * 1.6));
    if (wr < 0.14 && dy > -0.45) return mix(base, '#000000', 0.26);          // wrinkles
    if (hash(x, y, 5 + seed) % 29 === 0) return mix(base, HAIR, 0.6);       // follicles
    return l > 0.45 ? mix(base, '#ffffff', 0.22) : l > 0.12 ? mix(base, '#ffffff', 0.08)
      : l < -0.5 ? mix(base, '#000000', 0.32) : l < -0.12 ? mix(base, '#000000', 0.16) : base;
  });
  veinyCache.set(k, c);
  return c;
}

// The dick tank. (sx, sy) = ground under its middle (world px); ang in degrees (0 = right, 90 = up).
// o: { face: 1 / -1 (optional), flash, roll, erect: 0..1 (1 = rock hard, 0 = limp noodle), recoil: 0..1, charge: 0..1, moving }
// Returns the tip of the head in world px (where the load comes out).
function drawTank(sx, sy, ang, color, t, o = {}) {
  const pc = PLAYER_COLORS[color];
  const flash = o.flash && ((t / 60) | 0) % 2 === 0;
  const C = c => (flash ? '#ffffff' : c);
  const e = o.erect == null ? 1 : Math.max(0, Math.min(1, o.erect));
  const face = o.face || (Math.cos(ang * Math.PI / 180) < -1e-6 ? -1 : 1);
  g.save(); g.scale(1 / TR, 1 / TR);
  const X = Math.round(sx * TR), Y = Math.round(sy * TR);
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const roll = o.roll || 0;

  // ---- exhaust pipe at the back, puffing while driving
  const ex = X - face * 21;
  rect(ex - 2, Y - 27, 5, 10, OUT); rect(ex - 1, Y - 26, 3, 9, C('#6a6460')); rect(ex - 1, Y - 26, 1, 9, C('#9a948c'));
  if (o.moving) for (let k = 0; k < 3; k++) {
    const ph = (t / 400 + k / 3) % 1;
    disk(ex - face * ph * 6, Y - 29 - ph * 12, 1 + ph * 2.5, ph < 0.5 ? '#8a8078' : '#5a5250');
  }

  // ---- treads: rubber loop, road wheels, moving lugs
  const capsule = (cy, rr, c) => { disk(X - 19, cy, rr, c); disk(X + 19, cy, rr, c); rect(X - 19, cy - rr, 38, Math.round(rr * 2) + 1, c); };
  capsule(Y - 7, 7.5, OUT);
  capsule(Y - 7, 6.5, C('#2b2724'));
  capsule(Y - 7, 4.6, C('#46403a'));
  for (let i = 0; i < 9; i++) {   // lugs ride the bottom run and the top run in opposite directions
    const ob = ((i * 5 - roll * 2) % 45 + 45) % 45 - 22, ot = ((i * 5 + roll * 2) % 45 + 45) % 45 - 22;
    rect(X + ob, Y - 1, 2, 1, C('#8a8478'));
    rect(X + ot, Y - 14, 2, 1, C('#5a554e'));
  }
  for (const wx of [-19, -9.5, 0, 9.5, 19]) {
    const cx = X + wx, cy = Y - 7, wa = roll * 0.35 + wx;
    disk(cx, cy, 4.6, OUT); disk(cx, cy, 3.6, C('#8a8478')); disk(cx, cy, 2.4, C('#5a554e')); disk(cx - 1, cy - 1, 1, C('#c8c0b0'));
    rect(cx + Math.cos(wa) * 2.6, cy + Math.sin(wa) * 2.6, 1, 1, C('#c8c0b0'));
    rect(cx - Math.cos(wa) * 2.6, cy - Math.sin(wa) * 2.6, 1, 1, OUT);
  }
  // fender plate in team colors
  rect(X - 25, Y - 19, 50, 7, OUT);
  rect(X - 24, Y - 18, 48, 5, C(pc.b));
  rect(X - 24, Y - 18, 48, 1, C(pc.l));
  rect(X - 24, Y - 14, 48, 1, C(pc.d));
  for (let k = -20; k <= 20; k += 8) { rect(X + k, Y - 16, 1, 1, C(pc.d)); rect(X + k, Y - 17, 1, 1, C(pc.l)); }

  // ---- the balls = turret. Jiggle when driving or hit, hang lower when it's limp.
  const jig = (o.moving || o.flash) ? Math.round(Math.sin(t / 45)) : 0;
  const sag = Math.round((1 - e) * 2);
  const bl = getVeinyBall(22, 20 + sag, SKIN, 1), br = getVeinyBall(24, 22 + sag, SKIN, 2);
  const bL = flash ? whiteOutCached(bl, '#ffffff') : bl, bR = flash ? whiteOutCached(br, '#ffffff') : br;
  const back = face > 0 ? [bL, -1] : [bR, 1], front = face > 0 ? [bR, 1] : [bL, -1];
  for (const [img, side] of [back, front]) {
    g.drawImage(img, (X + side * 10 - img.width / 2) | 0, Y - 17 - img.height + 3 + (side > 0 ? jig : -jig));
  }
  // the seam between them
  g.fillStyle = C(mix(SKIN, '#000000', 0.4));
  for (let y = Y - 34; y < Y - 19; y++) g.fillRect(X + Math.round(Math.sin(y * 0.7)), y, 1, 1);

  // ---- the shaft = barrel. Points along the aim, droops and shrinks as the wood fades.
  const P = { x: X, y: Y - 12 * TR };                       // pivot (server PIVOT = 12 world px)
  const rh = rng(7 + color);                                // pubes
  g.fillStyle = C(HAIR);
  for (let n = 0; n < 22; n++) {
    const a = Math.PI * (1.05 + rh() * 0.9), d = 4 + rh() * 5;
    const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    g.fillRect(Math.round(x + Math.cos(a + 1.2)), Math.round(y + Math.sin(a + 1.2)), 1, 1);
  }
  const theta = ang * Math.PI / 180, limp = 1 - e;
  const target = (face > 0 ? -80 : 260) * Math.PI / 180;    // where gravity pulls a floppy one
  const sway = limp * 0.12 * Math.sin(t / 650 + color);
  const beat = (t % 1000) < 110 ? 1 : 0;                    // heartbeat throb
  const shake = (o.charge || 0) * 0.8;
  const L = (9 + 6 * e) * TR * (1 - 0.3 * (o.recoil || 0));
  const R0 = (2.2 + 0.4 * e) * TR + beat * e * 0.5;
  const N = Math.max(6, Math.ceil(L / 1.5));
  const pts = [];
  let x = P.x, y = P.y;
  for (let i = 0; i <= N; i++) {
    const s = i / N, k = Math.min(1, limp * (0.25 + 0.85 * Math.pow(s, 1.2)) + sway * s);
    const phi = theta + (target - theta) * k;
    pts.push({ x: x + (Math.random() - 0.5) * shake, y: y + (Math.random() - 0.5) * shake, phi, r: R0 * (1 - 0.1 * s) });
    x += Math.cos(phi) * (L / N); y -= Math.sin(phi) * (L / N);
  }
  // unit normal pointing at the screen-bottom side of the shaft (the shadow side)
  const under = q => { let nx = Math.sin(q.phi), ny = Math.cos(q.phi); if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } return [nx, ny]; };
  const shaftCol = mix(mix(SKIN, '#d8b4a4', limp * 0.5), '#f0889a', e * 0.25);
  const end = pts[pts.length - 1], dx = Math.cos(end.phi), dy = -Math.sin(end.phi);
  const HR = R0 * 1.3, hx = end.x + dx * 2, hy = end.y + dy * 2;
  for (const q of pts) disk(q.x, q.y, q.r + 1, OUT);
  disk(hx - dx * 1.5, hy - dy * 1.5, HR + 1, OUT); disk(hx + dx * 1.2, hy + dy * 1.2, HR + 0.6, OUT);
  for (const q of pts) disk(q.x, q.y, q.r, C(shaftCol));
  for (const q of pts) { const [ux, uy] = under(q); disk(q.x + ux * q.r * 0.55, q.y + uy * q.r * 0.55, q.r * 0.5, C(mix(shaftCol, '#7a2a3a', 0.35))); }
  for (const q of pts) { const [ux, uy] = under(q); disk(q.x - ux * q.r * 0.5, q.y - uy * q.r * 0.5, q.r * 0.3, C(mix(shaftCol, '#ffffff', 0.3))); }
  // veins: bulge more the harder it is, flash brighter on each throb
  if (!flash && e > 0.15) {
    g.fillStyle = mix(shaftCol, VEIN, 0.25 + 0.5 * e + beat * 0.15);
    pts.forEach((q, i) => {
      if (i < 2 || i > pts.length - 2) return;
      const [ux, uy] = under(q), s = i / N;
      const o1 = q.r * (0.1 + 0.45 * Math.sin(s * 8 + color)), o2 = q.r * (-0.55 + 0.25 * Math.sin(s * 11 + 2));
      g.fillRect(Math.round(q.x + ux * o1), Math.round(q.y + uy * o1), 1, 1);
      if (e > 0.45) g.fillRect(Math.round(q.x + ux * o2), Math.round(q.y + uy * o2), 1, 1);
      if (i % 5 === 3 && e > 0.6) g.fillRect(Math.round(q.x + ux * (o1 + 1) + dx), Math.round(q.y + uy * (o1 + 1) + dy), 1, 1);
    });
  }
  // ---- the head: corona ring, shading, shine, pee hole
  const head = mix(mix(HEAD, '#c8a0aa', limp * 0.6), '#ff6a8a', e * 0.15), headD = mix(head, '#5a1a2a', 0.35);
  const [ux, uy] = under(end);
  disk(hx - dx * 1.5, hy - dy * 1.5, HR, C(headD));
  disk(hx + dx * 1.2, hy + dy * 1.2, HR - 0.3, C(head));
  disk(hx + dx * 1.5 + ux * HR * 0.45, hy + dy * 1.5 + uy * HR * 0.45, HR * 0.45, C(mix(head, '#7a2a3a', 0.25)));
  disk(hx + dx * 1.5 - ux * HR * 0.5, hy + dy * 1.5 - uy * HR * 0.5, HR * 0.28, C(mix(head, '#ffffff', 0.5)));
  const tx = hx + dx * (HR + 0.5), ty = hy + dy * (HR + 0.5);
  if (!flash) {
    g.fillStyle = mix(head, '#3a0a1a', 0.6);
    g.fillRect(Math.round(tx - ux), Math.round(ty - uy), 1, 1); g.fillRect(Math.round(tx), Math.round(ty), 1, 1);
    // pre-cum glistens while charging
    if (o.charge > 0.05) disk(tx + dx * (1 + o.charge * 1.5), ty + dy * (1 + o.charge * 1.5), 0.6 + o.charge * 1.2, (t / 90 | 0) % 2 ? '#fffbe8' : '#d8e8ff');
    // bandana tied across the head, tails flapping behind it
    const bcx = hx - dx * 0.8, bcy = hy - dy * 0.8, ri = Math.ceil(HR + 1);
    g.fillStyle = pc.b;
    for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
      const along = i * dx + j * dy, across = i * ux + j * uy;
      if (Math.abs(along) <= 1.6 && Math.abs(across) <= HR + 0.3) g.fillRect(Math.round(bcx) + i, Math.round(bcy) + j, 1, 1);
    }
    const kx = bcx - ux * HR, ky = bcy - uy * HR;
    for (let tail = 0; tail < 2; tail++) {
      g.fillStyle = tail ? pc.d : pc.b;
      for (let k = 1; k <= 7; k++) {
        const w = Math.sin(t / 110 + k * 0.6 + tail * 1.7) * k * 0.25 + (tail ? 1.5 : -0.5);
        g.fillRect(Math.round(kx - dx * k - ux * (w + k * 0.35)), Math.round(ky - dy * k - uy * (w + k * 0.35)), 2, 1);
      }
    }
    disk(kx, ky, 1.2, pc.d);
    // googly eyes peeking through the mask, looking where it's aiming
    for (const sd of [-1, 1]) {
      const ex2 = bcx + ux * sd * HR * 0.48, ey2 = bcy + uy * sd * HR * 0.48;
      disk(ex2, ey2, 1.3, '#ffffff');
      g.fillStyle = OUT; g.fillRect(Math.round(ex2 + dx * 0.8), Math.round(ey2 + dy * 0.8), 1, 1);
    }
    // nervous sweat drop when it's going soft
    if (e < 0.35) {
      const ph = (t / 1400 + color * 0.3) % 1;
      disk(hx - ux * (HR + 2), hy - uy * (HR + 2) + ph * 6, 1, '#8ac8ff');
    }
  }
  g.restore();
  return { x: tx / TR, y: ty / TR };
}
const whiteCache = new Map();
function whiteOutCached(src, fill) {
  if (!whiteCache.has(src)) whiteCache.set(src, whiteOut(src, fill));
  return whiteCache.get(src);
}

// --------------------------------------------------------------- projectiles
function drawProjectile(look, x, y, vx, vy, size, col, t) {
  const r = Math.max(1, size / 2);
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  switch (look) {
    case 'ball': {
      const b = getBall(size + 3, size + 2, mix(col, SKIN, 0.4));
      g.drawImage(b, Math.round(x - b.width / 2), Math.round(y - b.height / 2));
      return;
    }
    case 'nuts': {   // a big pair, jiggling as it flies
      const bw = Math.max(4, Math.round(size * 0.72)), bh = Math.max(4, Math.round(size * 0.85));
      const skin = mix(col, SKIN, 0.4), wob = Math.round(Math.sin(t / 90));
      const L = getBall(bw, bh, skin), R = getBall(bw, bh + 1, skin);
      const off = Math.round(bw * 0.42);
      g.drawImage(L, Math.round(x - off - L.width / 2), Math.round(y - L.height / 2) + wob);
      g.drawImage(R, Math.round(x + off - R.width / 2), Math.round(y - R.height / 2) - wob);
      g.fillStyle = mix(skin, '#000000', 0.45);   // the seam
      g.fillRect(Math.round(x), Math.round(y - bh / 2 + 1), 1, Math.max(2, bh - 3));
      return;
    }
    case 'rocket':
    case 'probe': {
      const len = look === 'rocket' ? 4 : 5;
      for (let d = 0; d <= len; d++) disk(x - ux * d, y - uy * d, r + 1, OUT);
      for (let d = 0; d <= len; d++) disk(x - ux * d, y - uy * d, r, d === 0 ? (look === 'probe' ? HEAD : '#ffffff') : col);
      if (look === 'rocket') {
        g.fillStyle = (t / 50 | 0) % 2 ? '#ffd84a' : '#ff7a1f';
        g.fillRect(Math.round(x - ux * (len + 2)), Math.round(y - uy * (len + 2)), 2, 2);
      }
      return;
    }
    case 'drop':
      disk(x, y, r + 1, OUT); disk(x - ux * 1.5, y - uy * 1.5, r, col); disk(x, y, r, col);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(x - 1), Math.round(y - 1), 1, 1);
      return;
    case 'dirt':
      disk(x, y, r + 1, OUT); disk(x, y, r, col);
      g.fillStyle = mix(col, '#000000', 0.35); g.fillRect(Math.round(x), Math.round(y), 1, 1);
      return;
    default:   // glob / pearl
      disk(x, y, r + 1, OUT); disk(x, y, r, col);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), look === 'pearl' ? 2 : 1, 1);
  }
}
