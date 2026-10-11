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

// The dick tank. (sx, sy) = ground under its middle; ang in degrees (0 = right, 90 = up).
function drawTank(sx, sy, ang, color, t, o = {}) {
  const pc = PLAYER_COLORS[color], a = ang * Math.PI / 180;
  const ux = Math.cos(a), uy = -Math.sin(a);
  const px = sx, py = sy - 12;                     // pivot (server PIVOT = 12)
  sx = Math.round(sx); sy = Math.round(sy);
  const flash = o.flash && ((t / 60) | 0) % 2 === 0;
  // shaft = barrel
  for (let d = 0; d <= 10; d++) disk(px + ux * d, py + uy * d, 3, OUT);
  disk(px + ux * 13, py + uy * 13, 4.4, OUT);
  for (let d = 0; d <= 10; d++) disk(px + ux * d, py + uy * d, 2, flash ? '#ffffff' : (d % 4 === 2 ? SKIN_D : SKIN));
  const hx = px + ux * 13, hy = py + uy * 13;
  disk(hx, hy, 3.4, flash ? '#ffffff' : HEAD);
  // bandana across the head, tails flapping behind it
  if (!flash) {
    g.fillStyle = pc.b;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const along = i * ux + j * uy;
      if (i * i + j * j <= 12 && along > -1.6 && along < 0.4) g.fillRect(Math.round(hx) + i, Math.round(hy) + j, 1, 1);
    }
    const bx = hx - ux * 1, by = hy - uy * 1, wav = Math.sin(t / 120);
    g.fillStyle = pc.d;
    for (let k = 1; k <= 4; k++) {
      g.fillRect(Math.round(bx - ux * k - uy * (3 + wav * k * 0.3)), Math.round(by - uy * k + ux * (3 + wav * k * 0.3)), 1, 1);
      g.fillRect(Math.round(bx - ux * k - uy * (2 - wav * k * 0.4)), Math.round(by - uy * k + ux * (2 - wav * k * 0.4)), 1, 1);
    }
    // googly eyes on the bandana
    const ex = -uy, ey = ux;
    for (const s of [-1.6, 1.6]) {
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(hx - ux * 0.6 + ex * s), Math.round(hy - uy * 0.6 + ey * s), 1, 1);
    }
    g.fillStyle = HEAD_D; g.fillRect(Math.round(hx + ux * 2.4), Math.round(hy + uy * 2.4), 1, 1);   // pee hole
  }
  // the balls = turret
  const ball = flash ? whiteOutCached(getBall(11, 10, SKIN), '#ffffff') : getBall(11, 10, SKIN);
  g.drawImage(ball, sx - 12, sy - 15);
  g.drawImage(ball, sx - 1, sy - 15);
  // treads
  g.fillStyle = OUT; g.fillRect(sx - 11, sy - 6, 22, 6); g.fillRect(sx - 12, sy - 5, 24, 4);
  g.fillStyle = pc.d; g.fillRect(sx - 10, sy - 6, 20, 1);
  g.fillStyle = '#3a3632'; g.fillRect(sx - 10, sy - 4, 20, 3); g.fillRect(sx - 11, sy - 3, 22, 1);
  g.fillStyle = pc.b; g.fillRect(sx - 10, sy - 5, 20, 1);
  const roll = (o.roll || 0) | 0;
  g.fillStyle = '#8a8478';
  for (let k = 0; k < 6; k++) g.fillRect(sx - 9 + ((k * 4 + roll) % 20 + 20) % 20, sy - 3, 2, 1);
  g.fillStyle = '#c8c0b0';
  for (const wx of [-7, -2, 3, 8]) g.fillRect(sx + wx - 1, sy - 2, 1, 1);
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
