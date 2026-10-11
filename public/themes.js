// Per-match environments for BATTLE DONGS. A theme = sky, two parallax silhouette layers, layered dirt
// full of buried junk, surface tufts and standing props. Everything is generated at canvas resolution
// (RES x world) from a seed, so every match looks different. The seed comes from the terrain itself,
// so all players in a room see the same place.

const THEMES = [
  {
    key: 'junk', name: 'THE JUNKYARD', song: 'battle',
    sky: ['#1c0f1f', '#2a1428', '#3d1a2c', '#55222e', '#6e2c2e', '#8a3a2c', '#a64e2a', '#c0662a', '#d6802e', '#e69a38', '#f0b44a', '#f6cc66'],
    orb: { kind: 'sun', x: 0.68, y: 0.55, r: 0.2, c: '#fae0a0', c2: '#f0b44a', rim: '#f6cc66' }, cloud: '#7a3a34', stars: 0,
    far: { gen: 'junk', col: '#3a1a26', rim: '#5a2a30', c2: '#6a3a30' }, near: { gen: 'junk', col: '#1e0c14', rim: '#3a1a20', c2: '#4a2a20' },
    strata: ['#7a4e2a', '#6e4426', '#84552e', '#5e3a1e', '#734a28', '#68401f'],
    crust: ['#d8a468', '#d8a468', '#c08a50', '#b07c48', '#94643a'], tuft: ['#8a9a3a', '#6a7a2a', '#b0a040'], tuftP: 0.3, tuftMax: 5,
    items: ['tire', 'can', 'bone', 'bottle', 'rock', 'spring', 'worm', 'skull'], props: ['tire', 'crate', 'toilet', 'sign', 'fridge', 'tire'],
  },
  {
    key: 'desert', name: 'BALLSACK CANYON', song: 'desert',
    sky: ['#2a58c8', '#3464d0', '#3e70d8', '#4a7ede', '#588ce2', '#689ae6', '#7aa8ea', '#8eb6ec', '#a4c4ec', '#bcd2ea', '#d6dee6', '#ece4d6'],
    orb: { kind: 'glow', x: 0.2, y: 0.17, r: 0.07, c: '#fffef0', c2: '#fff4c0', rim: '#fffbe0' }, cloud: '#eef2fa', stars: 0,
    far: { gen: 'mesa', col: '#c0704a', rim: '#e09068', c2: '#a85a3a' }, near: { gen: 'dunes', col: '#8a4a2a', rim: '#b0683a', c2: '#6a3a1e' },
    strata: ['#d08a4a', '#c47a3e', '#d89a5a', '#b86e38', '#e0a868', '#c88246', '#a8603a'],
    crust: ['#f8e0a0', '#f8e0a0', '#f0d090', '#e8c078', '#d8a868'], tuft: ['#a89a4a', '#8a7a3a', '#c8b060'], tuftP: 0.08, tuftMax: 4,
    items: ['skull', 'bone', 'fossil', 'rock', 'pottery', 'bone', 'fossil'], props: ['cactus', 'cactus', 'cowskull', 'sign', 'tumbleweed', 'cactus'],
  },
  {
    key: 'toxic', name: 'SEWER SLUDGE', song: 'toxic',
    sky: ['#05080a', '#080e0c', '#0c140e', '#101a12', '#142216', '#1a2c1a', '#20361e', '#284224', '#304e28', '#3a5a2c', '#466630', '#547234'],
    orb: { kind: 'moon', x: 0.26, y: 0.26, r: 0.1, c: '#d8f0a0', c2: '#a8c870', rim: '#c8e890' }, cloud: '#26361e', stars: 1,
    far: { gen: 'factory', col: '#141e18', rim: '#24322a', c2: '#c8ff6a' }, near: { gen: 'swamp', col: '#090e0b', rim: '#1a2618', c2: '#8aef4a' },
    strata: ['#4a4a3a', '#3e4234', '#545440', '#383a2e', '#4a5038', '#42463a'],
    crust: ['#c8ff6a', '#8aef4a', '#8aef4a', '#5ac83a', '#3a9a2a'], tuft: ['#8aef4a', '#c8ff6a', '#5ac83a'], tuftP: 0.22, tuftMax: 4, drip: '#5ac83a',
    items: ['barrel', 'pipe', 'bone', 'skull', 'can', 'worm', 'tire'], props: ['barrel', 'mushroom', 'deadtree', 'pipe', 'barrel', 'mushroom'],
  },
  {
    key: 'frozen', name: 'SHRINKAGE PEAKS', song: 'frozen',
    sky: ['#080826', '#0e1036', '#141646', '#1c1e56', '#262866', '#323476', '#404286', '#505494', '#6266a2', '#787cae', '#9096ba', '#aaaec6'],
    orb: { kind: 'moon', x: 0.76, y: 0.2, r: 0.07, c: '#f0f4ff', c2: '#c8d0e8', rim: '#e0e8ff' }, cloud: '#36386c', stars: 1, aurora: 1,
    far: { gen: 'mountain', col: '#2a2e5a', rim: '#4a508a', c2: '#e8f0ff' }, near: { gen: 'pines', col: '#121634', rim: '#2e3466', c2: '#c8d8f0' },
    strata: ['#5a6a8a', '#4e5e7e', '#66789a', '#46546e', '#5e6e90', '#526280'],
    crust: ['#ffffff', '#ffffff', '#f0f6ff', '#e0ecff', '#e0ecff', '#c8d8f0', '#a8bce0'], tuft: ['#ffffff', '#f0f6ff'], tuftP: 0.6, tuftMax: 2,
    items: ['crystal', 'rock', 'fossil', 'bone', 'crystal', 'skull'], props: ['pine', 'pine', 'snowdong', 'snowrock', 'sign', 'pine'],
  },
  {
    key: 'neon', name: 'THE STRIP DISTRICT', song: 'neon',
    sky: ['#0a0414', '#120620', '#1a082c', '#240a38', '#300c44', '#3e0e50', '#4e105a', '#621262', '#781468', '#90186a', '#a81e6a', '#c02a6a'],
    orb: { kind: 'moon', x: 0.8, y: 0.28, r: 0.09, c: '#ffc0e8', c2: '#ff80c8', rim: '#ffa0d8' }, cloud: '#2a0a3a', stars: 1,
    far: { gen: 'city', col: '#1c0a2c', rim: '#34185a', c2: '#ffd86a', c3: '#ff4ad8', c5: '#4ae8ff' }, near: { gen: 'city', col: '#0c0414', rim: '#2a0a3a', c2: '#ffb84a', c3: '#ff4ad8', c5: '#4ae8ff' },
    strata: ['#3a3440', '#443e4a', '#34303a', '#4a4450', '#3e3846', '#36323c'],
    crust: ['#8a8490', '#8a8490', '#6a6470', '#6a6470', '#4a4450'], tuft: ['#ff4ad8', '#4ae8ff', '#6a8a3a'], tuftP: 0.06, tuftMax: 3,
    items: ['can', 'pipe', 'cable', 'bottle', 'phone', 'rock', 'cable'], props: ['cone', 'hydrant', 'lamp', 'trashcan', 'toilet', 'cone'],
  },
];

// ------------------------------------------------------------------ small sprites (canvas px, outlined)
function spr(w, h, fn, line = OUT) {
  const art = paint(w + 2, h + 2, (x, y) => (x < 1 || y < 1 || x > w || y > h ? null : fn(x - 1, y - 1)));
  return outline(K < 1 ? halve(art) : art, line);
}
// 2:1 pixel-art reduction: each 2x2 block becomes its most common opaque color (or clear if mostly clear)
function halve(c) {
  const w = c.width, h = c.height, src = new Uint32Array(c.getContext('2d').getImageData(0, 0, w, h).data.buffer);
  const w2 = Math.ceil(w / 2) + 1, h2 = Math.ceil(h / 2) + 1;
  return paint(w2, h2, (x, y) => {
    const cnt = new Map();
    let opaque = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const sx = x * 2 + i, sy = y * 2 + j;
      if (sx >= w || sy >= h) continue;
      const v = src[sy * w + sx];
      if (!(v >>> 24)) continue;
      opaque++; cnt.set(v, (cnt.get(v) || 0) + 1);
    }
    if (opaque < 2) return null;
    let best = 0, bn = 0;
    for (const [v, n] of cnt) if (n > bn) { bn = n; best = v; }
    return best;
  });
}
const ell = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;

const ITEM = {
  tire: () => spr(16, 16, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); if (d > 7.6 || d < 2.2) return null; if (d < 3.4) return '#8a8478'; return d > 5.6 && ((Math.atan2(y - 7.5, x - 7.5) * 4 / Math.PI + 8) | 0) % 2 ? '#454545' : '#2a2a2a'; }, '#24160e'),
  can: () => spr(8, 12, (x, y) => (y === 0 ? '#b8b8b8' : y >= 4 && y <= 6 ? '#e8e0c8' : x === 1 ? '#ff7a6a' : x === 6 ? '#8a1f1a' : '#c83a2a'), '#24160e'),
  bone: () => spr(16, 6, (x, y) => { const k = ell(x, y, 2, 1.5, 2, 1.6) < 1 || ell(x, y, 2, 4.5, 2, 1.6) < 1 || ell(x, y, 14, 1.5, 2, 1.6) < 1 || ell(x, y, 14, 4.5, 2, 1.6) < 1 || (x > 2 && x < 14 && y > 1 && y < 5); return k ? (y >= 4 ? '#c8b898' : '#ece4d0') : null; }, '#24160e'),
  bottle: () => spr(6, 14, (x, y) => (y < 4 ? (x >= 2 && x <= 3 ? '#2a6a3a' : null) : y >= 7 && y <= 9 ? '#e8d8a0' : x === 1 ? '#7ad08a' : '#3a8a4a'), '#24160e'),
  rock: () => spr(10, 8, (x, y) => (ell(x, y, 5, 4, 5, 4) < 1 ? (y < 3 && x < 5 ? '#9a9088' : y > 5 ? '#5a524c' : '#7a7068') : null), '#24160e'),
  spring: () => spr(7, 12, (x, y) => (y % 3 === 0 ? '#c0c0c0' : x === 0 || x === 6 ? '#8a8a8a' : null), '#24160e'),
  skull: () => spr(11, 10, (x, y) => { if (y < 7 && ell(x, y, 5.5, 4, 5.5, 4.2) >= 1) return null; if (y >= 7 && (x < 2 || x > 8)) return null; if ((ell(x, y, 3.5, 4, 1.4, 1.5) < 1) || (ell(x, y, 7.5, 4, 1.4, 1.5) < 1)) return '#2a1810'; if (y === 8 && x % 2) return '#2a1810'; return y > 5 ? '#d0c4a8' : '#ece4d0'; }, '#24160e'),
  fossil: () => spr(12, 12, (x, y) => { const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy); if (d > 5.8) return null; const a = Math.atan2(dy, dx) + Math.PI; return ((d - a * 0.95) % 3 + 3) % 3 < 1.1 ? '#8a7458' : '#c8b088'; }, '#3a2a1a'),
  pottery: () => spr(10, 7, (x, y) => (y + x * 0.4 > 9 ? null : y === 2 || y === 3 ? '#e8c890' : '#b0583a'), '#24160e'),
  barrel: () => spr(10, 13, (x, y) => (y === 2 || y === 10 ? '#5a4a10' : ell(x, y, 5, 6.5, 2, 2) < 1 ? '#1a1a1a' : x === 1 ? '#f0d050' : '#c8a020'), '#24160e'),
  pipe: () => spr(18, 6, (x, y) => (x < 2 ? (y > 0 && y < 5 ? '#1a1a1a' : '#9a9a9a') : x > 15 ? '#9a9a9a' : y === 1 ? '#a8a8a8' : y === 4 ? '#4a4a4a' : '#6a6a6a'), '#24160e'),
  crystal: () => spr(7, 12, (x, y) => { const w = y < 4 ? y : y > 8 ? 12 - y : 3.5; if (Math.abs(x - 3) > w) return null; return x < 3 ? '#e8fbff' : x === 3 ? '#a0e8ff' : '#5ab0e0'; }, '#1a2a4a'),
  cable: () => spr(20, 6, (x, y) => (Math.abs(y - 2.5 - Math.sin(x * 0.5) * 1.6) < 1 ? (Math.abs(y - 2.5 - Math.sin(x * 0.5) * 1.6) < 0.4 ? '#ff6a4a' : '#c8402a') : null), '#1a1010'),
  phone: () => spr(6, 10, (x, y) => (x > 0 && x < 5 && y > 0 && y < 8 ? ((x + y) % 5 ? '#4ae8ff' : '#ffffff') : '#1a1a1a'), '#0a0a0a'),
  worm: () => spr(12, 5, (x, y) => (Math.abs(y - 2 - Math.sin(x * 0.7) * 1.2) < 1 ? (x === 3 ? '#c86a7a' : '#f09aaa') : null), '#5a2a2a'),
};

// standing props: () => [sprite, px sunk into the ground, debris color]
const PROP = {
  tire: () => [spr(18, 18, (x, y) => { const d = Math.hypot(x - 8.5, y - 8.5); if (d > 8.8 || d < 3) return null; if (d < 4.4) return '#6a6460'; return d > 6.8 && ((Math.atan2(y - 8.5, x - 8.5) * 5 / Math.PI + 10) | 0) % 2 ? '#4a4a4a' : y < 6 && x < 8 ? '#3e3e3e' : '#262626'; }), 4, '#3a3a3a'],
  crate: () => [spr(16, 15, (x, y) => (x === 0 || x === 15 || y === 0 || y === 14 || Math.abs(x - y) < 1.2 ? '#7a4e22' : y % 5 === 4 ? '#8a5a2a' : x < 3 ? '#d09050' : '#b07838')), 1, '#b07838'],
  toilet: () => [spr(14, 18, (x, y) => { if (y < 7) return x >= 7 && x <= 13 ? (y === 0 ? '#c8d0d8' : x === 8 ? '#ffffff' : '#e8eef4') : null; if (y < 11) return ell(x, y, 6.5, 9, 7, 2.6) < 1 ? (y === 7 ? '#ffffff' : y === 8 && x > 2 && x < 11 ? '#5a8ab0' : '#dde4ea') : null; return x > 3 && x < 11 ? (x === 4 ? '#ffffff' : '#c8d0d8') : null; }), 1, '#e8eef4'],
  sign: () => [spr(18, 22, (x, y) => {
    if (y < 9) {
      if (x > 13 + (4 - Math.abs(y - 4))) return null;
      if ((y === 4 && x >= 3 && x <= 11) || ((y === 3 || y === 5) && x === 10) || ((y === 2 || y === 6) && x === 9)) return '#1a0b10';
      return y < 2 ? '#e0a860' : '#c88a48';
    }
    return x === 7 || x === 8 ? (x === 7 ? '#a0703a' : '#7a4e22') : null;
  }), 2, '#c88a48'],
  fridge: () => [spr(14, 24, (x, y) => (y === 8 ? '#8a8a7a' : x === 11 && (y === 4 || (y > 11 && y < 16)) ? '#5a5a50' : hashP(x, y) % 7 === 0 ? '#a0603a' : x < 2 ? '#f0f0e0' : '#d0d0c0')), 1, '#d0d0c0'],
  cactus: () => [spr(18, 30, (x, y) => { const trunk = Math.abs(x - 8.5) < 3.2 && (y > 2 || Math.abs(x - 8.5) < 2.2); const arm1 = (y > 12 && y < 16 && x < 8 && x > 1) || (x > 0.5 && x < 4.5 && y > 4 && y < 16 && (y > 5 || Math.abs(x - 2.5) < 1.2)); const arm2 = (y > 16 && y < 20 && x > 9 && x < 16) || (x > 12.5 && x < 16.5 && y > 9 && y < 20 && (y > 10 || Math.abs(x - 14.5) < 1.2)); if (!(trunk || arm1 || arm2)) return null; if ((x + y * 3) % 7 === 0) return '#c8e8a0'; return (trunk ? x < 8 : arm1 ? x < 2 : x < 14) ? '#5aa84a' : '#3a7a34'; }), 1, '#4a9a3a'],
  cowskull: () => [spr(18, 11, (x, y) => { if (y < 4 && (x < 4 || x > 13)) return (x < 4 ? y > 3 - x * 0.8 : y > (x - 14) * 0.8) ? '#ece4d0' : null; if (ell(x, y, 9, 5, 5, 4) < 1 || (y > 5 && Math.abs(x - 9) < 3 - (y - 6) * 0.3)) { if (ell(x, y, 7, 4.5, 1.2, 1.3) < 1 || ell(x, y, 11, 4.5, 1.2, 1.3) < 1) return '#2a1810'; return y > 7 ? '#d0c4a8' : '#ece4d0'; } return null; }), 0, '#ece4d0'],
  tumbleweed: () => [spr(15, 14, (x, y) => { const d = ell(x, y, 7.5, 7, 7.5, 7); if (d > 1) return null; return (hashP(x, y) % 3 === 0 || Math.abs(Math.sin(x * 1.3 + y * 0.7)) < 0.3) ? (y < 6 ? '#c8a060' : '#9a7840') : null; }, '#5a4020'), 1, '#b08a50'],
  barrel: () => [spr(12, 17, (x, y) => { if (y < 2) return x > 1 && x < 10 ? (x % 3 ? '#8aef4a' : '#c8ff6a') : null; if (y === 4 || y === 13) return '#3a3a20'; const d = Math.hypot(x - 5.5, y - 8.5); if (d < 2.6) { const a = (Math.atan2(y - 8.5, x - 5.5) * 3 / Math.PI + 6) | 0; return d < 0.9 || a % 2 ? '#1a1a1a' : '#e8c020'; } return x === 1 ? '#f0d850' : x > 9 ? '#a88a10' : '#d8b020'; }), 1, '#d8b020'],
  mushroom: () => [spr(15, 11, (x, y) => { const caps = [[3.5, 3, 3.5, 2.6], [10, 4, 4, 3], [7, 6, 2.5, 2]]; for (const [cx, cy, rx, ry] of caps) { if (y <= cy && ell(x, y, cx, cy, rx, ry) < 1) return (x + y) % 4 === 0 ? '#f0ffc0' : '#8aef4a'; if (y > cy && y < 11 && Math.abs(x - cx) < 1) return '#d8e0c0'; } return null; }), 0, '#8aef4a'],
  deadtree: () => {
    const m = new Set(), line = (x0, y0, x1, y1, th) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k <= n; k++) for (let a = 0; a < th; a++) m.add(Math.round(x0 + (x1 - x0) * k / n + a * 0.5) + ',' + Math.round(y0 + (y1 - y0) * k / n)); };
    line(11, 34, 11, 14, 3); line(11, 18, 3, 8, 2); line(11, 15, 19, 5, 2); line(5, 10, 3, 2, 1); line(17, 7, 21, 3, 1); line(11, 14, 12, 2, 2); line(7, 13, 6, 9, 1);
    return [spr(23, 35, (x, y) => (m.has(x + ',' + y) ? (x % 3 ? '#2e241a' : '#40342a') : null)), 1, '#2e241a'];
  },
  pipe: () => [spr(14, 22, (x, y) => {
    if (y < 6) return x >= 3 ? (y === 0 || y === 5 ? '#4a4a4a' : y === 1 ? '#a8a8a8' : '#7a7a7a') : null;
    if (x >= 3 && x <= 8) return x === 3 ? '#a8a8a8' : x === 8 ? '#4a4a4a' : '#7a7a7a';
    if ((x === 11 || x === 12) && y < 10) return '#8aef4a';
    return x === 12 && y === 12 ? '#8aef4a' : null;
  }), 1, '#7a7a7a'],
  pine: () => [spr(20, 34, (x, y) => { if (y > 29) return Math.abs(x - 9.5) < 2 ? '#4a3020' : null; const tier = y < 11 ? [0, 11, 5] : y < 20 ? [7, 20, 7.5] : [14, 30, 10]; const w = (y - tier[0]) / (tier[1] - tier[0]) * tier[2]; if (Math.abs(x - 9.5) > w) return null; if (y - tier[0] < 3 || (Math.abs(x - 9.5) > w - 2 && (x + y) % 3 === 0)) return '#f0f6ff'; return x < 9.5 ? '#2a6a4a' : '#1a4a3a'; }), 1, '#2a6a4a'],
  snowdong: () => [spr(24, 30, (x, y) => { const lb = ell(x, y, 6.5, 23, 6.5, 6.5) < 1, rb = ell(x, y, 17.5, 23, 6.5, 6.5) < 1, sh = Math.abs(x - 12) < 4.2 && y > 6 && y < 22, hd = ell(x, y, 12, 6, 4.8, 4.5) < 1; if (!(lb || rb || sh || hd)) return null; if (hd && y === 5 && (x === 10 || x === 14)) return '#1a1a1a'; if (y === 9 && x === 12) return '#ff8a1f'; if (sh && (y === 12 || y === 13) && Math.abs(x - 12) < 4.2) return '#e8433a'; return (x + y) % 9 === 0 ? '#c8d8f0' : x < 10 ? '#ffffff' : '#e0ecff'; }), 2, '#ffffff'],
  snowrock: () => [spr(16, 11, (x, y) => { if (ell(x, y, 8, 7, 8, 5.5) > 1) return null; if (y < 4 + Math.sin(x) * 0.8) return '#ffffff'; return x < 7 ? '#7a7890' : '#5a586e'; }), 2, '#7a7890'],
  cone: () => [spr(12, 15, (x, y) => { if (y > 12) return '#e85a1a'; const w = 1 + y * 0.35; if (Math.abs(x - 5.5) > w) return null; return y > 4 && y < 8 ? '#ffffff' : x < 5 ? '#ff9a3a' : '#e8641a'; }), 0, '#ff8a1f'],
  hydrant: () => [spr(12, 15, (x, y) => { if (y < 3) return Math.abs(x - 5.5) < 2.5 ? '#ff5a4a' : null; if (y >= 5 && y <= 7 && (x < 2 || x > 9)) return '#c8342a'; if (y === 13 || y === 14) return x > 0 && x < 11 ? '#9a2a22' : null; if (Math.abs(x - 5.5) < 3.6) return x < 4 ? '#ff7a6a' : '#e8433a'; return null; }), 0, '#e8433a'],
  lamp: () => [spr(14, 46, (x, y) => { if (y < 4) return x > 1 && x < 13 ? '#3a3a4a' : null; if (y < 7) return x > 2 && x < 12 ? (x % 2 ? '#ffe0f8' : '#ff8ae0') : null; if (y > 42) return x > 3 && x < 10 ? '#2a2a3a' : null; return x >= 6 && x <= 7 ? (x === 6 ? '#5a5a6a' : '#3a3a4a') : null; }), 1, '#ff8ae0'],
  trashcan: () => [spr(12, 15, (x, y) => (y < 2 ? '#a8a8b0' : y === 2 ? '#5a5a62' : x % 3 === 0 ? '#6a6a72' : x < 3 ? '#b0b0b8' : '#888890')), 0, '#888890'],
};
const hashP = (x, y) => hash(x, y, 77);

// ------------------------------------------------------------------ backgrounds
function paintSky(T, w, h, r) {
  const S = T.spec, bands = S.sky.map(u32), n = bands.length, bh = h * 0.8 / n;
  const D = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const o = S.orb, ox = w * o.x, oy = h * o.y, orr = h * o.r;
  const oc = u32(o.c), oc2 = u32(o.c2), orim = u32(o.rim), crater = u32(mix(o.c2, '#000000', 0.12)), halo = u32(mix(S.sky[Math.min(n - 1, Math.floor(oy / bh))], o.rim, 0.35));
  const clouds = Array.from({ length: 8 }, () => ({ x: r() * w, y: h * (0.1 + r() * 0.4), w: (50 + r() * 140) * K, h: (6 + r() * 12) * K }));
  const dk = K < 1 ? 0 : 1;   // dither cell: 1 canvas px on the 1x grid, 2 on the 2x grid
  const cloud = u32(S.cloud), cloudHi = u32(mix(S.cloud, '#ffffff', 0.15));
  const craters = Array.from({ length: 6 }, () => ({ x: (r() - 0.5) * 1.2 * orr, y: (r() - 0.5) * 1.2 * orr, r: orr * (0.08 + r() * 0.16) }));
  const star = u32('#fffbe8'), star2 = u32('#a8a0c0');
  const aur = [u32('#3affb0'), u32('#2ad890'), u32('#6affd8'), u32('#9a6aff')];
  return paint(w, h, (x, y) => {
    const f = y / bh, i = Math.min(n - 1, Math.floor(f)), frac = f - i;
    let col = bands[frac > 0.5 + D[(y >> dk) & 3][(x >> dk) & 3] / 32 ? Math.min(n - 1, i + 1) : i];
    if (S.stars && y < h * 0.65) {
      const hs = hash(x >> dk, y >> dk, 11);
      if (hs % 1500 === 0) col = star; else if (hs % 700 === 0 && !((x ^ y) & 1)) col = star2;
    }
    if (S.aurora) {
      const cy = h * (0.16 + 0.05 * Math.sin(x * 0.004 / K + 1) + 0.02 * Math.sin(x * 0.013 / K)), d = (y - cy) / (h * 0.07);
      if (d > -1 && d < 1.6) {
        const k = (1 - Math.abs(d - 0.3) / 1.3) * (0.6 + 0.4 * Math.sin(x * 0.03 / K + Math.sin(x * 0.007 / K) * 3));
        if (k > 0.15 && D[y & 3][(x >> dk) & 3] / 16 < k) col = aur[(Math.floor(x / (40 * K)) + (d > 0.6 ? 1 : 0)) % 3 + (d < -0.4 ? 1 : 0)];
      }
    }
    const sd = Math.hypot(x - ox, (y - oy) * 1.05);
    if (sd < orr * 1.35 && sd >= orr && D[y & 3][x & 3] / 16 < (1 - (sd - orr) / (orr * 0.35)) * 0.7) col = halo;
    if (sd < orr) {
      if (o.kind === 'sun') col = sd < orr - 2 * K ? (y % Math.round(10 * K) < Math.round(3 * K) && y > oy ? oc2 : oc) : orim;
      else if (o.kind === 'glow') col = sd < orr * 0.8 ? oc : (D[y & 3][x & 3] / 16 < 0.5 ? oc : oc2);
      else {
        col = sd > orr - 2 * K ? orim : (x - ox) + (y - oy) > orr * 0.5 ? oc2 : oc;
        for (const c of craters) if (Math.hypot(x - ox - c.x, y - oy - c.y) < c.r) col = crater;
      }
    }
    for (const c of clouds) {
      const dx = (x - c.x) / c.w, dy = (y - c.y) / c.h, d = dx * dx + dy * dy;
      if (d < 1) { col = d < 0.5 ? (dy < -0.3 ? cloudHi : cloud) : ((x + y) & 1 ? cloud : col); break; }
    }
    return col;
  });
}

// silhouette layer, tiles horizontally. Values: 1 solid, 2/3/5 lights, 4 snow.
function silhouette(W0, H0, L, seed, amp) {
  const w = Math.round(W0 / K), h = Math.round(H0 / K);   // design grid
  const r = rng(seed), m = new Uint8Array(w * h);
  const set = (x, y, v = 1) => { x = ((Math.round(x) % w) + w) % w; y = Math.round(y); if (y >= 0 && y < h) m[y * w + x] = v; };
  const rect = (x, y, rw, rh, v = 1) => { for (let j = Math.round(y); j < Math.round(y + rh); j++) for (let i = Math.round(x); i < Math.round(x + rw); i++) set(i, j, v); };
  const circ = (cx, cy, rr, v = 1, inner = 0) => { for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) { const d = Math.hypot(i, j); if (d <= rr && d >= inner) set(cx + i, cy + j, v); } };
  const line = (x0, y0, x1, y1, th, v = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k <= n; k++) rect(x0 + (x1 - x0) * k / n - th / 2, y0 + (y1 - y0) * k / n - th / 2, th, th, v); };
  const top = new Float32Array(w), A = h * amp, ph = r() * 6;
  for (let x = 0; x < w; x++) {
    const a = 2 * Math.PI * x / w;
    top[x] = h - A - A * 0.5 * Math.sin(a * 3 + ph) - A * 0.3 * Math.sin(a * 11 + ph * 2) - A * 0.12 * Math.sin(a * 37 + ph);
  }
  const gen = L.gen;
  if (gen === 'mountain') for (let x = 0; x < w; x++) {
    const a = 2 * Math.PI * x / w;
    let v = 0;
    for (let k = 0; k < 6; k++) v += Math.abs(Math.sin(a * (3 + k * 4) + ph * (k + 1))) * h * 0.55 / (k + 1.5);
    top[x] = h - v * 1.15;
  }
  for (let x = 0; x < w; x++) for (let y = Math.max(0, Math.floor(top[x])); y < h; y++) m[y * w + x] = 1;
  const ground = x => top[((Math.round(x) % w) + w) % w];
  const N = Math.round(w / 56);
  if (gen === 'junk') for (let i = 0; i < N; i++) {
    const x = r() * w, b = ground(x), k = r();
    if (k < 0.35) { const rr = 8 + r() * 8; circ(x, b - rr * 0.5, Math.round(rr), 1, rr * 0.45); }
    else if (k < 0.6) rect(x, b - 20 - r() * 28, 16 + r() * 20, 50);
    else if (k < 0.8) { const cw = 52 + r() * 20; rect(x, b - 14, cw, 16); rect(x + cw * 0.25, b - 24, cw * 0.45, 12); circ(x + 10, b, 5, 1); circ(x + cw - 10, b, 5, 1); }
    else if (k < 0.88) { const ch = h * 0.7; rect(x, b - ch, 6, ch); rect(x - 60, b - ch - 4, 84, 4); line(x - 48, b - ch, x - 48, b - ch + 36, 1); }
  }
  if (gen === 'mesa') for (let i = 0; i < 6; i++) {
    const cx = r() * w, bw = 160 + r() * 260, mh = h * (0.3 + r() * 0.35), tw = bw * (0.45 + r() * 0.25), base = h;
    for (let j = 0; j < mh; j++) { const ww = tw + (bw - tw) * (j / mh) ** 1.6; rect(cx - ww / 2, base - mh + j, ww, 1); }
    for (let k = 0; k < 3; k++) { const sx = cx + (r() - 0.5) * bw; rect(sx, base - mh * (0.5 + r() * 0.6), 6 + r() * 8, h); }
  }
  if (gen === 'dunes') for (let i = 0; i < N * 0.6; i++) {
    const x = r() * w, b = ground(x) + 2, th = 30 + r() * 40;
    rect(x - 4, b - th, 8, th + 4);
    const ah = th * (0.4 + r() * 0.3); rect(x - 16, b - ah, 12, 6); rect(x - 16, b - ah - 18, 6, 22);
    if (r() < 0.7) { const bh2 = th * (0.3 + r() * 0.3); rect(x + 4, b - bh2, 12, 6); rect(x + 10, b - bh2 - 14, 6, 18); }
  }
  if (gen === 'factory') for (let i = 0; i < N * 0.7; i++) {
    const x = r() * w, b = ground(x) + 4, bw = 50 + r() * 110, bh = 40 + r() * 110;
    rect(x, b - bh, bw, bh + 4);
    if (r() < 0.6) { const sx = x + r() * bw * 0.7; rect(sx, b - bh - 60 - r() * 90, 10 + r() * 6, 200); }
    if (r() < 0.5) { for (let k = 0; k < bw; k += 14) rect(x + k, b - bh - 10, 10, 10); }
    for (let wy = b - bh + 8; wy < b - 8; wy += 10) for (let wx = x + 6; wx < x + bw - 6; wx += 9) if (r() < 0.14) rect(wx, wy, 4, 5, 2);
  }
  if (gen === 'swamp') for (let i = 0; i < N * 0.8; i++) {
    const x = r() * w, b = ground(x) + 2, k = r();
    if (k < 0.55) {
      const th = 50 + r() * 70;
      line(x, b, x + (r() - 0.5) * 10, b - th, 5);
      for (let j = 0; j < 4; j++) { const by2 = b - th * (0.4 + r() * 0.6), dir = r() < 0.5 ? -1 : 1, len = 14 + r() * 24; line(x, by2, x + dir * len, by2 - len * (0.4 + r() * 0.6), 2); }
    } else if (k < 0.8) { rect(x, b - 36, 60, 8); rect(x + 50, b - 36, 8, 40); rect(x - 4, b - 38, 6, 12); }
    else { for (let j = 0; j < 3; j++) { const mx = x + j * 7; rect(mx, b - 8, 2, 8); circ(mx + 1, b - 9, 4, 2); } }
  }
  if (gen === 'pines') for (let i = 0; i < N * 1.2; i++) {
    const x = r() * w, b = ground(x) + 2, th = 40 + r() * 50, tw = 12 + r() * 10;
    rect(x - 2, b - 8, 5, 10);
    for (let t = 0; t < 3; t++) { const ty = b - 6 - th * t / 3.2, tt = th * 0.55; for (let j = 0; j < tt; j++) { const ww = tw * (1 - t * 0.22) * (j / tt); rect(x - ww, ty - tt + j, ww * 2 + 1, 1); } }
  }
  if (gen === 'city') for (let i = 0; i < N * 1.3; i++) {
    const x = r() * w, b = ground(x) + 4, bw = 36 + r() * 90, bh = 50 + r() * (h * 0.8);
    rect(x, b - bh, bw, bh + 4);
    if (r() < 0.3) { rect(x + bw / 2, b - bh - 30, 2, 30); set(x + bw / 2, b - bh - 31, 3); }
    for (let wy = b - bh + 6; wy < b - 6; wy += 8) for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (r() < 0.3) rect(wx, wy, 3, 4, 2);
    if (r() < 0.45) {   // neon sign
      const sw = 20 + r() * 30, sh = 10 + r() * 8, sx = x + r() * (bw - sw), sy = b - bh + 10 + r() * Math.max(1, bh * 0.4), v = r() < 0.5 ? 3 : 5;
      rect(sx, sy, sw, 2, v); rect(sx, sy + sh, sw, 2, v); rect(sx, sy, 2, sh + 2, v); rect(sx + sw - 2, sy, 2, sh + 2, v);
      for (let k = 6; k < sw - 6; k += 6) rect(sx + k, sy + 4, 3, sh - 4, v);
    }
  }
  if (gen === 'mountain') for (let x = 0; x < w; x++) for (let y = Math.max(0, Math.floor(top[x])); y < h; y++) {
    const d = y - top[x];
    if (top[x] < h * 0.55 && d < 10 + 6 * Math.sin(x * 0.11) + 4 * Math.sin(x * 0.37) && ((x + y) & 1 || d < 8)) m[y * w + x] = 4;
  }
  let M = m, MW = w, MH = h;
  if (K < 1) {   // down to the real grid: any light in a 2x2 block survives, otherwise majority solid
    MW = W0; MH = H0; M = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      let solid = 0, light = 0, snowN = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const v = m[Math.min(h - 1, y * 2 + j) * w + Math.min(w - 1, x * 2 + i)];
        if (v) solid++;
        if (v === 2 || v === 3 || v === 5) light = v;
        if (v === 4) snowN++;
      }
      M[y * MW + x] = light || (snowN >= 2 ? 4 : solid >= 2 ? 1 : 0);
    }
  }
  const col = u32(L.col), rim = u32(L.rim), c2 = u32(L.c2 || L.rim), c3 = u32(L.c3 || L.c2 || L.rim), c5 = u32(L.c5 || L.c2 || L.rim), snow = u32(L.c2 || '#ffffff');
  return paint(MW, MH, (x, y) => {
    const v = M[y * MW + x];
    if (!v) return null;
    if (v === 2) return c2;
    if (v === 3) return c3;
    if (v === 5) return c5;
    if (v === 4) return snow;
    if (y === 0 || !M[(y - 1) * MW + x]) return gen === 'pines' ? snow : rim;
    if (hash(x, y, seed) % 61 === 0) return rim;
    return col;
  });
}

// ------------------------------------------------------------------ dirt + surface
function buildDirt(T, w, h, r) {
  const S = T.spec, cols = S.strata, lite = cols.map(u32), dark = cols.map(c => u32(mix(c, '#000000', 0.18))), hi = cols.map(c => u32(mix(c, '#ffffff', 0.1)));
  const px = new Uint32Array(w * h), ph1 = r() * 9, ph2 = r() * 9, ph3 = r() * 9, bandH = (16 + r() * 8) * K, tilt = (r() - 0.5) * 0.08;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x / K, Y = y / K;   // design coords
    const band = Math.floor((y + x * tilt + (12 * Math.sin(X * 0.025 + Y * 0.01 + ph1) + 6 * Math.sin(X * 0.065 + ph2) + 3 * Math.sin(X * 0.17 + ph3)) * K) / bandH);
    const i = ((band % cols.length) + cols.length) % cols.length, hs = hash(x, y, 3);
    let c = (hs % 5 === 0 || ((x + y) & 1 && hs % 3 === 0)) ? dark[i] : hs % 11 === 0 ? hi[i] : lite[i];
    if (hash(Math.floor(x / (4 * K)), Math.floor(y / (4 * K)), 9 + (ph1 * 10 | 0)) % 53 === 0 && hs % 2) c = dark[(i + 2) % cols.length];   // pebbles
    px[y * w + x] = c;
  }
  // buried junk
  const sprites = new Map();
  const count = Math.round((70 + (r() * 30 | 0)) * (K < 1 ? 0.8 : 1));
  for (let n = 0; n < count; n++) {
    const kind = S.items[(r() * S.items.length) | 0];
    if (!sprites.has(kind)) {
      const c = ITEM[kind](), d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      sprites.set(kind, { w: c.width, h: c.height, p: new Uint32Array(d.data.buffer) });
    }
    const s = sprites.get(kind), ox = (r() * (w - s.w)) | 0, oy = (h * 0.28 + r() * (h * 0.72 - s.h)) | 0, flip = r() < 0.5;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = s.p[y * s.w + (flip ? s.w - 1 - x : x)];
      if (v >>> 24) px[(oy + y) * w + ox + x] = v;
    }
  }
  return px;
}

const themeCache = new Map();
// W, H = world size. Returns a theme instance for theme `idx` built from `seed`.
function getTheme(idx, seed, W, H) {
  const key = idx + ':' + seed;
  if (themeCache.has(key)) return themeCache.get(key);
  const spec = THEMES[idx % THEMES.length], r = rng(seed), w = W * RES, h = H * RES;
  const T = { spec, seed, idx, name: spec.name, song: spec.song };
  T.sky = paintSky(T, w, h, r);
  T.far = silhouette(w * 2, Math.round(h * 0.5), spec.far, seed + 11, 0.35);
  T.near = silhouette(w * 2, Math.round(h * 0.4), spec.near, seed + 23, 0.25);
  T.dirt = buildDirt(T, w, h, r);
  T.crust = spec.crust.filter((c, i) => K >= 1 || i % 2 === 0).map(u32);
  T.out = u32(OUT);
  T.tuftH = new Uint8Array(w); T.tuftC = new Uint32Array(w); T.drip = new Uint8Array(w);
  const tc = spec.tuft.map(u32), dripC = spec.drip ? u32(spec.drip) : 0;
  T.dripC = dripC;
  for (let x = 0; x < w; x++) {
    const clump = (hash(Math.floor(x / (8 * K)), 7, seed) % 1000) / 1000 < spec.tuftP;
    if (clump) {
      const tm = Math.max(1, Math.round(spec.tuftMax * K));
      const hh = tm <= 1 ? (hash(x, 5, seed) % 3 > 0 ? 1 : 0) : spec.tuftMax <= 2 ? 1 + ((hash(x >> 1, 5, seed) % 3) > 0 ? 1 : 0) : hash(x, 3, seed) % (tm + 1);
      T.tuftH[x] = hh; T.tuftC[x] = tc[hash(x, 4, seed) % tc.length];
    }
    if (dripC && hash(Math.floor(x / (2 * K)), 9, seed) % 6 === 0) T.drip[x] = Math.round((2 + hash(Math.floor(x / (2 * K)), 10, seed) % 9) * K);
  }
  themeCache.set(key, T);
  if (themeCache.size > 3) themeCache.delete(themeCache.keys().next().value);
  return T;
}

// standing props for one match; avoid spawning right on top of tanks
function makeProps(T, W, avoid) {
  const r = rng(T.seed + 5), out = [], n = 9 + (r() * 6 | 0);
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const x = 10 + r() * (W - 20);
    if (avoid.some(a => Math.abs(a - x) < 22) || out.some(p => Math.abs(p.x - x) < 20)) continue;
    const kind = T.spec.props[(r() * T.spec.props.length) | 0];
    const [img, sink, c] = PROP[kind]();
    out.push({ x, kind, img, sink, c, flip: r() < 0.5 });
  }
  return out;
}
const flipCache = new Map();
function flipped(img) {
  let f = flipCache.get(img);
  if (!f) { f = canvasOf(img.width, img.height); const x = f.getContext('2d'); x.scale(-1, 1); x.drawImage(img, -img.width, 0); flipCache.set(img, f); }
  return f;
}

function drawBackground(T, W, H, t) {
  g.drawImage(T.sky, 0, 0, W, H);
  for (const [L, sp] of [[T.far, 0.004], [T.near, 0.01]]) {
    const off = Math.round(t * sp) % L.width, y = H - L.height * U;
    g.drawImage(L, -off * U, y, L.width * U, L.height * U);
    g.drawImage(L, (L.width - off) * U, y, L.width * U, L.height * U);
  }
}
