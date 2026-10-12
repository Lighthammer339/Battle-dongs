'use strict';
// BATTLE DONGS client: menus, networking, draft, shot replays, rendering, input.
const $ = s => document.querySelector(s);
const cv = $('#screen'), g = cv.getContext('2d');
const WW = 640, WH = 300;          // world size in pixels (same as server.py)
cv.width = WW * RES; cv.height = WH * RES;
const PHYS = { g: 200, vmax: 410, pivot: 12, barrel: 14, aimMin: -45, aimMax: 225, charge: 1.6 };
const CROSS_D = 44;                // crosshair distance from the pivot, world px
const SDT = 4 / 120;               // time between recorded path points (server SAMPLE * DT)

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const easeOut = t => 1 - (1 - t) * (1 - t);

let SCALE = 2;
function layout() {
  const hudH = $('#hud').hidden ? 0 : 118;
  const aw = innerWidth, ah = innerHeight - hudH;
  let s = Math.min(aw / WW, ah / WH);
  if (s >= 1) s = Math.max(1, Math.floor(s * 2) / 2);
  SCALE = s;
  cv.style.width = WW * s + 'px';
  cv.style.height = WH * s + 'px';
  cv.style.left = Math.round((aw - WW * s) / 2) + 'px';
  cv.style.top = Math.round(Math.max(0, (ah - WH * s) / 2)) + 'px';
  g.imageSmoothingEnabled = false;
}
addEventListener('resize', layout);

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ terrain math (mirrors server.py)
function carveH(H, cx, cy, r) {
  for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(WW, Math.floor(cx + r) + 1); x++) {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) >= r) continue;
    const h = Math.sqrt(r * r - dx * dx);
    const lo = Math.max(cy - h, 0), hi = Math.min(cy + h, H[x]);
    if (hi > lo) H[x] -= hi - lo;
  }
}
function addDirtH(H, cx, cy, r, shape, height) {
  for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(WW, Math.floor(cx + r) + 1); x++) {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) >= r) continue;
    let add;
    if (shape === 'wall') add = height;
    else {
      const h = Math.sqrt(r * r - dx * dx), lo = cy - h, hi = cy + h;
      add = 2 * h - Math.max(0, Math.min(hi, H[x]) - Math.max(lo, 0));
    }
    H[x] = Math.min(WH - 10, H[x] + Math.max(0, add));
  }
}
function groundAt(H, x) {
  const xi = clamp(Math.floor(x), 0, WW - 1);
  let m = 0;
  for (let i = Math.max(0, xi - 4); i < Math.min(WW, xi + 5); i++) m = Math.max(m, H[i]);
  return m;
}

// A drawable battlefield: terrain + tanks + effects. Used by the real game and the menu demo.
function makeWorld(H, themeIdx, seed) {
  return { H: Float32Array.from(H), disp: Float32Array.from(H), dirty: true, theme: getTheme(themeIdx, seed, WW, WH), props: [], crates: [],
           tanks: [], fx: [], parts: [], fires: [], marks: [], texts: [], shake: 0 };
}
// every client derives the same environment from the terrain the server sent
function themeSeedOf(H) {
  let h = 7;
  for (let i = 0; i < H.length; i += 13) h = (Math.imul(h, 31) + Math.round(H[i] * 10)) | 0;
  return h >>> 0;
}

// ------------------------------------------------------------------ app / net
const App = { screen: 'menu', myId: null, name: '', room: null, ws: null, connected: false };
let G = null;

function connect() {
  return new Promise((res, rej) => {
    if (App.ws && App.ws.readyState === 1) return res();
    if (!location.host) return rej(new Error('Open the game via the server: run "python server.py" then visit http://localhost:8080'));
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    App.ws = ws;
    ws.onopen = () => { App.connected = true; res(); };
    ws.onerror = () => rej(new Error('Could not reach the server'));
    ws.onclose = () => {
      const was = App.connected;
      App.connected = false; App.ws = null; App.room = null; G = null;
      if (was) { toast('DISCONNECTED FROM SERVER'); show('menu'); Sound.play(MENU_SONG); }
    };
    ws.onmessage = e => onMessage(JSON.parse(e.data));
  });
}
const send = o => { if (App.ws && App.ws.readyState === 1) App.ws.send(JSON.stringify(o)); };
setInterval(() => send({ t: 'ping' }), 25000); // keeps hosting proxies from dropping idle sockets

function onMessage(m) {
  switch (m.t) {
    case 'welcome': App.myId = m.id; App.name = m.name; break;
    case 'rooms': renderRoomList(m.rooms); break;
    case 'room':
      App.room = m.room;
      if (['menu', 'how', 'lobby'].includes(App.screen)) { show('room'); $('#chatLog').innerHTML = ''; }
      if (App.screen === 'room') renderRoom();
      break;
    case 'left':
      App.room = null; G = null; closePause();
      if (App.screen === 'bye') break;
      if (App.toMenu) { App.toMenu = false; show('menu'); Sound.play(MENU_SONG); } else show('lobby');
      break;
    case 'error': toast(m.msg.toUpperCase()); break;
    case 'chat': addChat(m); break;
    case 'gameStart': startGame(m); break;
    case 'draft': if (G) onDraft(m); break;
    case 'turn': if (G) onTurn(m); break;
    case 'aim': if (G) onAim(m); break;
    case 'moved': if (G) onMoved(m); break;
    case 'shot': if (G) onShot(m); break;
    case 'over': if (G) onOver(m); break;
    case 'pause': if (G) onPause(m); break;
    case 'crate':
      if (G) {
        G.world.crates.push({ ...m.crate, t0: now() });
        floatText(G.world, 'SUPPLY DROP!', m.crate.x, 40, CRATE_INFO[m.crate.kind].c);
        Sound.sfx('whistle');
      }
      break;
    case 'picked': if (G) { onPick(G.world, m); applyState(m.state, false); updateHud(); } break;
  }
}

// ------------------------------------------------------------------ screens
const SCREENS = ['menu', 'how', 'lobby', 'room', 'draft', 'over', 'bye'];
function show(name) {
  App.screen = name;
  SCREENS.forEach(s => ($('#' + s).hidden = s !== name));
  $('#hud').hidden = name !== 'game';
  $('#muteBtn').hidden = name === 'game';
  if (name !== 'game') $('#wList').hidden = true;
  layout();
}

const nick = $('#nick');
try { nick.value = localStorage.getItem('battledongs.nick') || ''; } catch (e) {}

const MENU_SONG = Math.random() < 0.5 ? 'menu' : 'sleaze';
const BATTLE_POOL = ['march', 'lounge', 'metal', 'battle'];
document.addEventListener('pointerdown', () => { Sound.init(); Sound.play(G ? G.song : MENU_SONG); });

// ---- DOM text in the game's own 3x5 pixel font
function pixLabel(el, text, o = {}) {
  if (!el) return;
  if (text == null) text = el.dataset.txt != null ? el.dataset.txt : el.textContent.trim();
  text = String(text).toUpperCase().replace(/\s+/g, ' ');
  el.dataset.txt = text;
  el.setAttribute('aria-label', text);
  const color = o.color || el.dataset.col || getComputedStyle(el).color;
  el.dataset.col = color;
  const px = o.px || +el.dataset.px || 2;
  el.dataset.px = px;
  const c = fontCanvas(text, o.style || el.dataset.st || 'plain', color);
  el.dataset.st = o.style || el.dataset.st || 'plain';
  c.className = 'pix';
  c.style.width = c.width * px + 'px';
  el.replaceChildren(c);
}
const setTxt = (el, t) => (el.dataset.txt != null ? pixLabel(el, t) : (el.textContent = t));
function pixelizeUI() {
  pixLabel($('.logo'), 'BATTLE DONGS', { px: 5, style: 'logo' });
  pixLabel($('.tagline'), null, { px: 3, color: '#ffd84a' });
  document.querySelectorAll('.foot, #menu label').forEach(el => pixLabel(el, null, { px: 2 }));
  document.querySelectorAll('h2').forEach(el => pixLabel(el, null, { px: 3, style: 'outline', color: '#ffd84a' }));
  document.querySelectorAll('.panel button:not(.arrow):not(.card)').forEach(el => el.closest('[id$="Seg"]') || pixLabel(el, null, { px: el.classList.contains('big') ? 4 : 3, style: 'flat' }));
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) Sound.sfx('click'); });

function updateMusicLabels() {
  setTxt($('#btnMusic'), 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF'));
  $('#muteBtn').classList.toggle('off', !Sound.musicOn);
  setTxt($('#btnPauseMusic'), 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF'));
}
$('#btnMusic').onclick = $('#muteBtn').onclick = () => { Sound.init(); Sound.setMusic(!Sound.musicOn); updateMusicLabels(); };
updateMusicLabels();

$('#btnPlay').onclick = async () => {
  Sound.init(); Sound.play(MENU_SONG);
  const name = nick.value.trim() || 'Dong' + Math.floor(Math.random() * 900 + 100);
  nick.value = name;
  try { localStorage.setItem('battledongs.nick', name); } catch (e) {}
  try {
    await connect();
    send({ t: 'hello', name });
    $('#roomName').value = `${name}'s battlefield`;
    show('lobby');
  } catch (err) { toast(err.message.toUpperCase(), 5000); }
};
nick.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnPlay').click(); });
$('#btnHow').onclick = () => { Sound.init(); Sound.play(MENU_SONG); show('how'); };
document.querySelectorAll('.back').forEach(b => (b.onclick = () => show('menu')));

// lobby
$('#btnCreate').onclick = () => send({ t: 'create', name: $('#roomName').value, turnSec: 60, public: $('#roomPublic').checked });
$('#btnJoin').onclick = () => { const c = $('#joinCode').value.trim(); if (c) send({ t: 'join', code: c }); };
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });

function renderRoomList(rooms) {
  const el = $('#roomList');
  el.innerHTML = '';
  if (!rooms.length) {
    const d = document.createElement('div');
    d.className = 'empty'; d.textContent = 'NO ROOMS YET. CREATE ONE!';
    el.appendChild(d); return;
  }
  for (const r of rooms) {
    const d = document.createElement('div');
    d.className = 'item clickable';
    const name = document.createElement('span'); name.className = 'grow'; name.textContent = r.name;
    const info = document.createElement('span'); info.className = 'tag' + (r.state !== 'lobby' ? ' busy' : '');
    info.textContent = r.state !== 'lobby' ? 'IN GAME' : `${r.count}/${r.max}`;
    d.append(name, info);
    d.onclick = () => send({ t: 'join', code: r.code });
    el.appendChild(d);
  }
}

// room
function renderRoom() {
  const r = App.room; if (!r) return;
  const host = r.host === App.myId;
  setTxt($('#roomTitle'), r.name.toUpperCase());
  $('#roomCode').textContent = r.code;
  document.querySelectorAll('.hostonly').forEach(e => (e.hidden = !host));
  document.querySelectorAll('.guestonly').forEach(e => (e.hidden = host));
  const seg = (id, v) => $(id).querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === String(v)); b.disabled = !host; });
  seg('#turnSeg', r.turnSec); seg('#weaponSeg', r.weapons); seg('#draftSeg', r.draft ? 1 : 0);
  $('#btnStart').disabled = r.players.length < 2;
  $('#btnBot').disabled = r.players.length >= 4;
  const el = $('#playerList');
  el.innerHTML = '';
  for (const p of r.players) {
    const d = document.createElement('div');
    d.className = 'item';
    const name = document.createElement('span'); name.className = 'grow';
    name.textContent = p.name + (p.id === App.myId ? ' (YOU)' : '');
    name.style.color = PLAYER_COLORS[p.color].css;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = p.id === r.host ? 'HOST' : p.bot ? 'BOT' : '';
    d.append(name, tag);
    if (p.bot && host) {
      const k = document.createElement('button'); k.textContent = 'X';
      k.onclick = () => send({ t: 'kick', id: p.id });
      d.appendChild(k);
    }
    el.appendChild(d);
  }
  for (let i = r.players.length; i < 4; i++) {
    const d = document.createElement('div'); d.className = 'item'; d.style.opacity = .35;
    d.textContent = 'EMPTY SLOT'; el.appendChild(d);
  }
}
$('#btnBot').onclick = () => send({ t: 'addBot' });
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnLeave').onclick = () => send({ t: 'leave' });
$('#turnSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send({ t: 'settings', turnSec: +b.dataset.v }); });
$('#weaponSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send({ t: 'settings', weapons: +b.dataset.v }); });
$('#draftSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send({ t: 'settings', draft: b.dataset.v === '1' }); });
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (v) send({ t: 'chat', text: v });
  $('#chatInput').value = '';
});
function addChat(m) {
  const log = $('#chatLog');
  const d = document.createElement('div');
  if (m.sys) { d.className = 'sys'; d.textContent = '* ' + m.text; }
  else {
    const n = document.createElement('span');
    n.textContent = m.name + ': '; n.style.color = PLAYER_COLORS[m.color].css;
    d.append(n, document.createTextNode(m.text));
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

$('#btnBackRoom').onclick = () => {
  G = null;
  Sound.play(MENU_SONG);
  if (App.room) { show('room'); renderRoom(); } else show('lobby');
};

// ------------------------------------------------------------------ game state
const myPlayer = () => G && G.players.get(App.myId);
const myTurn = () => G && G.cur === App.myId && G.phase === 'aim';
const css = p => PLAYER_COLORS[p.color].css;

function startGame(m) {
  Object.assign(PHYS, m.physics || {});
  const seed = themeSeedOf(m.state.H), world = makeWorld(m.state.H, seed % THEMES.length, seed);
  G = {
    world, players: new Map(), order: m.players.map(p => p.id),
    powers: new Map(m.powers.map(p => [p.name, p])),
    phase: 'draft', cur: null, deadline: 0, turnN: 0, replay: null, draft: null,
    w: 0, banner: null, lastAimSent: 0, aimTimer: null, hpMax: m.hp || 150, face: 1, song: [world.theme.song, ...BATTLE_POOL][seed % (BATTLE_POOL.length + 1)],
  };
  for (const p of m.players) {
    const t = { ...p, x: 0, y: 0, dx: 0, dy: 0, da: 45, angle: 45, power: 60, w: 0, score: 0, taken: 0, dead: false, boost: false, slide: false, moves: 4, inv: [], gone: false,
                flash: 0, roll: 0, wood: 1, recoil: 0, charging: false, chargeT0: 0, lastPow: null };
    G.players.set(p.id, t);
    world.tanks.push(t);
  }
  applyState(m.state, true);
  world.props = makeProps(world.theme, WW, m.state.tanks.map(t => t.x));
  Sound.play(G.song);
  toast('WELCOME TO ' + world.theme.name, 3000);
  show('draft');
  $('#draftInfo').textContent = 'SHUFFLING THE POWERS...';
  $('#draftGrid').innerHTML = ''; $('#draftHands').innerHTML = '';
}

function applyState(s, snap) {
  const W = G.world;
  for (const t of s.tanks) {
    const p = G.players.get(t.id);
    if (!p) continue;
    const keepAim = p.id === App.myId && myTurn();
    Object.assign(p, { x: t.x, y: t.y, score: t.score, taken: t.taken || 0, dead: !!t.dead, boost: !!t.boost, moves: t.moves, inv: t.inv, gone: t.gone });
    if (!keepAim) { p.angle = t.angle; p.power = t.power; }
    if (snap) { p.dx = t.x; p.dy = t.y; p.da = t.angle; }
  }
  if (s.crates) W.crates = s.crates.map(c => { const old = W.crates.find(o => o.id === c.id); return { ...c, t0: old ? old.t0 : 0 }; });
  W.H = Float32Array.from(s.H);
  if (snap) W.disp = Float32Array.from(s.H);
  W.dirty = true;
}

// ---- draft
function onDraft(m) {
  G.draft = m;
  G.draftDeadline = now() + (m.ms || 0);
  if (App.screen !== 'draft') show('draft');
  renderDraft();
  if (m.turn === App.myId) Sound.sfx('turn');
}

function statLine(s) {
  const bits = [], dmg = () => { if (s.damage) bits.push(`DMG ${s.damage}`); if (s.radius) bits.push(`SIZE ${s.radius}`); };
  switch (s.type) {
    case 'dirt': bits.push(s.shape === 'wall' ? `WALL ${s.height}PX TALL` : `DIRT BALL ${s.radius}PX`); break;
    case 'teleport': bits.push('MOVES YOU THERE'); break;
    case 'airstrike': bits.push(`${s.count} BOMBS X ${s.frag_damage}`); break;
    case 'napalm': bits.push(`${s.damage} PER FLAME`, `FLOWS ${s.reach}PX`); break;
    case 'digger': if (s.damage) bits.push(`DMG ${s.damage}`); bits.push(`DIGS ${s.reach}PX`); break;
    case 'cluster': dmg(); bits.push(`+${s.count} X ${s.frag_damage}`); break;
    case 'roller': dmg(); bits.push(`ROLLS ${s.reach}PX`); break;
    case 'seeker': dmg(); bits.push(`HOMES ${s.reach}PX`); break;
    case 'jackhammer': dmg(); bits.push(`${s.count + 1} HITS`); break;
    case 'teabag': dmg(); bits.push(`${s.count} SLAMS`); break;
    case 'bouncer': dmg(); bits.push(`${s.count} BOUNCES`); break;
    case 'spread': case 'stream': case 'split': dmg(); bits.push(`X${s.count}`); break;
    default: dmg();
  }
  return bits.join(' / ');
}

function renderDraft() {
  const m = G.draft;
  const mine = m.turn === App.myId;
  const picker = m.turn && G.players.get(m.turn);
  $('#draftInfo').textContent = m.dealt ? "RANDOM DEAL - HERE'S WHAT EVERYONE GOT"
    : !m.turn ? 'DRAFT DONE! GET READY...'
    : mine ? `YOUR PICK! (${m.pick}/${m.total})` : `${picker.name.toUpperCase()} IS PICKING... (${m.pick}/${m.total})`;
  $('#draftInfo').style.color = picker ? css(picker) : '#ffd84a';
  const grid = $('#draftGrid');
  grid.innerHTML = '';
  m.pool.forEach((name, i) => {
    const s = G.powers.get(name) || { type: '?', description: '' };
    const owner = m.taken[i] && G.players.get(m.taken[i]);
    const b = document.createElement('button');
    b.className = 'card' + (owner ? ' taken' : '') + (owner && owner.id === App.myId ? ' mine' : '');
    const nm = document.createElement('b'); nm.textContent = name.toUpperCase(); nm.style.color = s.color;
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = s.type.toUpperCase() + ' - ' + statLine(s);
    const ds = document.createElement('small'); ds.textContent = s.description;
    b.append(nm, tag, ds);
    if (owner) {
      const w = document.createElement('span'); w.className = 'who';
      w.textContent = 'TAKEN BY ' + owner.name.toUpperCase(); w.style.color = css(owner);
      b.append(w);
      if (owner.id === App.myId) b.style.borderColor = css(owner);
    }
    b.disabled = !mine || !!owner;
    b.onclick = () => { send({ t: 'pick', i }); b.disabled = true; };
    grid.appendChild(b);
  });
  const hands = $('#draftHands');
  hands.innerHTML = '';
  for (const id of G.order) {
    const p = G.players.get(id), d = document.createElement('div');
    const h = document.createElement('b'); h.textContent = p.name.toUpperCase() + (p.id === App.myId ? ' (YOU)' : ''); h.style.color = css(p);
    d.append(h);
    m.pool.forEach((name, i) => { if (m.taken[i] === id) { const l = document.createElement('div'); l.textContent = '- ' + name; d.append(l); } });
    hands.appendChild(d);
  }
}

// ---- ESC menu / pause
const pausable = () => G && G.phase !== 'over' && (App.screen === 'game' || App.screen === 'draft');
function openPause() {
  if (App.screen === 'bye') return;
  $('#pause').hidden = false;
  $('#wList').hidden = true;
  stopCharge();
  dragging = false;
  $('#btnToMenu').hidden = App.screen === 'menu';
  setTxt($('#btnResume'), pausable() ? 'RESUME' : 'BACK');
  if (pausable() && !G.paused) {
    send({ t: 'pause', on: true });
    setTxt($('#pauseTitle'), 'PAUSED');
    $('#pauseInfo').textContent = 'Game paused for everyone.';
  } else if (!pausable()) {
    setTxt($('#pauseTitle'), 'MENU');
    $('#pauseInfo').textContent = '';
  }
  updateMusicLabels();
}
function closePause() { $('#pause').hidden = true; }
function resumeGame() {
  if (G && G.paused) send({ t: 'pause', on: false });   // the server's echo closes everyone's menu
  else closePause();
}
function onPause(m) {
  if (m.on) {
    G.paused = true; G.pausedAt = now();
    openPause();
    setTxt($('#pauseTitle'), 'PAUSED');
    $('#pauseInfo').textContent = m.id === App.myId ? 'Game paused for everyone.' : `${m.by.toUpperCase()} PAUSED THE GAME. Anyone can resume.`;
  } else {
    // restart the clocks from what the server says is left
    if (m.ms != null) { if (G.phase === 'aim') G.deadline = now() + m.ms; else G.draftDeadline = now() + m.ms; }
    else { const d = now() - G.pausedAt; G.deadline += d; G.draftDeadline += d; }
    G.paused = false;
    closePause();
    if (m.id !== App.myId) toast(`${m.by.toUpperCase()} RESUMED`, 1500);
  }
}
$('#btnResume').onclick = resumeGame;
$('#btnPauseMusic').onclick = () => { Sound.init(); Sound.setMusic(!Sound.musicOn); updateMusicLabels(); };
$('#btnToMenu').onclick = () => {
  closePause();
  if (App.room) { App.toMenu = true; send({ t: 'leave' }); }
  else { G = null; show('menu'); Sound.play(MENU_SONG); }
};
$('#btnQuit').onclick = () => {
  closePause();
  if (App.room) send({ t: 'leave' });
  G = null; App.room = null;
  if (App.ws) { App.connected = false; setTimeout(() => App.ws && App.ws.close(), 150); }
  Sound.stop();
  show('bye');
  window.close();   // only works if the browser allows it; otherwise the goodbye screen stays up
};
$('#btnAgain').onclick = () => location.reload();

// ---- turns
function onTurn(m) {
  if (G.replay) finishReplay();
  G.phase = 'aim'; G.cur = m.id; G.turnN = m.n;
  G.deadline = now() + m.ms;
  applyState(m.state, false);
  stopCharge();
  for (const q of G.players.values()) q.charging = false;
  if (App.screen !== 'game' && App.screen !== 'over') show('game');
  const p = G.players.get(m.id);
  if (m.id === App.myId) {
    G.w = clamp(G.w, 0, Math.max(0, p.inv.length - 1));
    G.face = p.angle > 90 ? -1 : p.angle < 90 ? 1 : (p.x < WW / 2 ? 1 : -1);
    banner('YOUR TURN!', 1500, css(p));
    Sound.sfx('turn');
    sendAim(true);
  } else banner(`${p.name.toUpperCase()}'S TURN`, 1300, css(p));
  updateHud();
}

function onAim(m) {
  if (m.id === App.myId) return;
  const p = G.players.get(m.id);
  if (!p) return;
  p.angle = m.angle; p.power = m.power; p.w = m.w;
  if (m.c && !p.charging) { p.charging = true; p.chargeT0 = now(); }
  updateHud();
}

function onMoved(m) {
  const p = G.players.get(m.id);
  if (!p) return;
  p.x = m.x; p.y = m.y; p.moves = m.moves;
  Sound.sfx('drive');
  updateHud();
}

function onShot(m) {
  if (G.replay) finishReplay();
  G.phase = 'anim'; G.cur = m.id;
  const p = G.players.get(m.id);
  p.angle = m.angle; p.power = m.power; p.lastPow = m.power;
  stopCharge();
  p.charging = false; p.recoil = 1;
  const i = p.inv.indexOf(m.weapon);
  if (i >= 0) p.inv.splice(i, 1);
  G.replay = { t0: now(), projs: m.projs, events: m.events, ei: 0, dur: m.dur, after: m.after };
  const spec = G.powers.get(m.weapon);
  banner(m.weapon.toUpperCase(), 1600, spec ? spec.color : '#ffd84a');
  Sound.sfx('shoot');
  // splash from the tip of the dong
  const tip = p.tip || { x: p.dx + Math.cos(m.angle * Math.PI / 180) * PHYS.barrel, y: WH - (p.dy + PHYS.pivot + Math.sin(m.angle * Math.PI / 180) * PHYS.barrel) };
  burst(G.world, tip.x, tip.y, spec ? spec.color : '#fffbe8', 8, 50);
  $('#wList').hidden = true;
  updateHud();
}

function finishReplay() {
  const R = G.replay;
  if (!R) return;
  while (R.ei < R.events.length) runEvent(G.world, R.events[R.ei++]);
  G.replay = null;
  applyState(R.after, false);
  updateHud();
}

function updateReplay(t) {
  const R = G.replay, rt = (t - R.t0) / 1000;
  while (R.ei < R.events.length && R.events[R.ei].t <= rt) runEvent(G.world, R.events[R.ei++]);
  if (rt > R.dur + 0.8) finishReplay();
}

function onOver(m) {
  if (G.replay) finishReplay();
  G.phase = 'over'; G.cur = null;
  const ol = $('#ranking');
  ol.innerHTML = '';
  for (const r of m.ranking) {
    const li = document.createElement('li');
    li.textContent = `${r.name}  -  ${r.score}${r.gone ? ' (LEFT)' : r.dead ? ' (DEAD)' : ''}`;
    li.style.color = PLAYER_COLORS[r.color].css;
    ol.appendChild(li);
  }
  const won = m.winner && m.winner.id === App.myId;
  setTxt($('#overTitle'), m.winner ? (won ? 'YOU WIN!' : `${m.winner.name.toUpperCase()} WINS!`) : "IT'S A TIE!");
  Sound.sfx(won ? 'win' : 'lose');
  setTimeout(() => { if (G && G.phase === 'over') show('over'); }, 1200);
}

// ------------------------------------------------------------------ replay events -> effects
function runEvent(W, e) {
  const sy = y => WH - y;
  const sfx = (n, v) => { if (!W.silent) Sound.sfx(n, v); };   // the menu demo plays without sound
  switch (e.k) {
    case 'boom':
      W.fx.push({ x: e.x, y: sy(e.y), r: Math.max(3, e.r), c: e.c, t0: now() });
      if (e.carve && e.r > 0) { carveH(W.H, e.x, e.y, e.r); W.dirty = true; }
      W.props = W.props.filter(pr => {
        const gy = W.disp[clamp(Math.floor(pr.x), 0, WW - 1)];
        if (Math.hypot(pr.x - e.x, gy + 5 - e.y) > Math.max(e.r, 4) + 6) return true;
        burst(W, pr.x, WH - gy - 5, pr.c, 18, 90); burst(W, pr.x, WH - gy - 5, OUT, 6, 70);
        return false;
      });
      burst(W, e.x, sy(e.y), '#8a5a32', Math.min(40, 6 + e.r), 60 + e.r * 3);
      burst(W, e.x, sy(e.y), e.c, Math.min(20, 4 + e.r / 2), 40 + e.r * 2);
      W.shake = Math.min(8, W.shake + e.r / 7);
      sfx('boom', e.r);
      break;
    case 'dmg': {
      if (!G || W !== G.world) break;
      const v = G.players.get(e.id), by = G.players.get(e.by);
      if (!v || !by) break;
      by.score += e.own ? -e.n : e.n;
      v.taken += e.n;
      v.flash = now() + 450;
      floatText(W, (e.own ? '-' : '+') + e.n, v.dx, WH - v.dy - 40, e.own ? '#ff5a4a' : css(by));
      sfx('hit');
      updateHud();
      break;
    }
    case 'pop': burst(W, e.x, sy(e.y), e.c, 10, 70); sfx('pop'); break;
    case 'bounce': sfx('boing'); break;
    case 'dirt':
      addDirtH(W.H, e.x, e.y, e.r, e.shape, e.h); W.dirty = true;
      W.disp.set(W.H);   // dirt appears instantly
      burst(W, e.x, sy(e.y), e.c, 24, 90);
      sfx('dirt');
      break;
    case 'dig': {
      const L = Math.hypot(e.x2 - e.x, e.y2 - e.y) || 1, ux = (e.x2 - e.x) / L, uy = (e.y2 - e.y) / L;
      for (let d = 0; d <= L; d += 2) carveH(W.H, e.x + ux * d, e.y + uy * d, e.r);
      W.dirty = true;
      burst(W, e.x, sy(e.y), '#8a5a32', 20, 80);
      sfx('dirt');
      break;
    }
    case 'fire': W.fires.push({ xs: e.xs, c: e.c, t0: now(), dur: 2200 }); sfx('sizzle'); break;
    case 'mark': W.marks.push({ x: e.x, t0: now(), c: e.c }); sfx('whistle'); break;
    case 'die': {
      if (!G || W !== G.world) break;
      const v = G.players.get(e.id), by = G.players.get(e.by);
      if (!v) break;
      v.dead = true;
      if (by && e.bonus) by.score += e.bonus;
      const vy = WH - v.dy - 8;
      burst(W, v.dx, vy, SKIN, 30, 120); burst(W, v.dx, vy, '#ff5a4a', 18, 100); burst(W, v.dx, vy, '#fffbe8', 14, 150);
      floatText(W, e.bonus ? `KILL +${e.bonus}` : 'R.I.P.', v.dx, vy - 26, by ? css(by) : '#ff5a4a');
      banner(`${v.name.toUpperCase()} GOT DICKED!`, 2000, '#ff5a4a');
      W.shake = 8;
      sfx('death');
      updateHud();
      break;
    }
    case 'pick': onPick(W, e); break;
    case 'shove': {
      if (!G || W !== G.world) break;
      const p = G.players.get(e.id);
      if (!p || Math.abs(p.x - e.x) < 0.5) break;
      p.x = e.x; p.y = e.y; p.slide = true;
      sfx('boing');
      break;
    }
    case 'tp': {
      if (!G || W !== G.world) break;
      const p = G.players.get(e.id);
      if (!p) break;
      burst(W, p.dx, WH - p.dy - 8, '#c87aff', 16, 80);
      p.x = p.dx = e.x; p.y = p.dy = e.y;
      burst(W, p.dx, WH - p.dy - 8, '#c87aff', 16, 80);
      sfx('zap');
      break;
    }
  }
}

// a crate got grabbed (by walking over it or by shooting it)
function onPick(W, e) {
  if (!G || W !== G.world) return;
  const i = W.crates.findIndex(c => c.id === e.cid), c = i >= 0 ? W.crates.splice(i, 1)[0] : null;
  const p = G.players.get(e.id);
  if (!p) return;
  const col = CRATE_INFO[e.kind].c;
  if (c) { const cy = WH - W.disp[clamp(Math.floor(c.x), 0, WW - 1)] - 4; burst(W, c.x, cy, col, 18, 90); burst(W, c.x, cy, '#b07838', 8, 70); }
  let txt;
  if (e.kind === 'health') { p.taken = Math.max(0, p.taken - e.n); txt = `+${e.n} HP`; }
  else if (e.kind === 'ammo') { txt = `+ ${e.name}`; if (p.id === App.myId && !p.inv.includes(e.name)) p.inv.push(e.name); }
  else { p.boost = true; txt = 'VIAGRA! NEXT SHOT X1.5'; }
  floatText(W, txt.toUpperCase(), p.dx, WH - p.dy - 54, col);
  if (!W.silent) Sound.sfx('pickup');
  updateHud();
}

function burst(W, x, y, c, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random() * 0.7);
    W.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.6, c, life: 0.5 + Math.random() * 0.7, s: Math.random() < 0.25 ? 3 : Math.random() < 0.5 ? 2 : 1 });
  }
}
function floatText(W, text, x, y, color) { W.texts.push({ text, x, y, color, t0: now(), dur: 1400 }); }
function banner(text, dur, color = '#ffd84a') { if (G) G.banner = { text, t0: now(), dur, color }; }

// ------------------------------------------------------------------ HUD (DOM)
function updateHud() {
  if (!G) return;
  const me = myPlayer(), mine = myTurn();
  const sc = $('#scores');
  sc.innerHTML = '';
  for (const id of G.order) {
    const p = G.players.get(id), d = document.createElement('div');
    d.className = 'sc' + (G.cur === id ? ' cur' : '') + (p.gone || p.dead ? ' gone' : '');
    const n = document.createElement('span'); n.textContent = p.name.toUpperCase(); n.style.color = css(p);
    const s = document.createElement('span'); s.textContent = p.score;
    const w = document.createElement('small');
    w.textContent = p.dead ? 'R.I.P.' : `${Math.max(0, Math.round(G.hpMax - p.taken))}HP ${p.inv.length}W${p.boost ? ' V!' : ''}`;
    d.append(n, w, s);
    sc.appendChild(d);
  }
  $('.ctl').classList.toggle('off', !mine);
  $('.ctl').querySelectorAll('button').forEach(b => (b.disabled = !mine));
  if (!me) return;
  G.w = clamp(G.w, 0, Math.max(0, me.inv.length - 1));
  const wn = me.inv[G.w], spec = wn && G.powers.get(wn);
  $('#wName b').textContent = wn ? wn.toUpperCase() : 'OUT OF POWERS';
  $('#wName b').style.color = spec ? spec.color : '#c8a070';
  $('#flipBtn').disabled = !mine;
  $('#wName small').textContent = spec ? `${spec.type.toUpperCase()} - ${statLine(spec)}   (${G.w + 1}/${me.inv.length})` : '';
  $('#wDesc').textContent = spec ? spec.description : '';
  const fc = G.cur === me.id ? G.face : faceOf(me.angle), el = Math.round(elevOf(me.angle, fc));
  $('#angVal').textContent = fc > 0 ? `${el}>` : `<${el}`;
  drawPowerMeter(me);
  $('#moveLbl').textContent = `MOVES ${me.moves}`;
  $('#moveL').disabled = $('#moveR').disabled = !mine || me.moves <= 0;
  $('#wPrev').disabled = $('#wNext').disabled = !mine || me.inv.length < 2;
  const cur = G.cur && G.players.get(G.cur);
  $('#turnWho').textContent = G.phase === 'anim' ? `${cur ? cur.name.toUpperCase() : ''} FIRED!`
    : mine ? 'YOUR TURN!' : cur ? `${cur.name.toUpperCase()} IS AIMING...` : '';
  $('#turnWho').style.color = cur ? css(cur) : '#f6e8c8';
  if (!$('#wList').hidden) renderWList();
}

function renderWList() {
  const me = myPlayer(), el = $('#wList');
  el.innerHTML = '';
  me.inv.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name.toUpperCase();
    b.className = i === G.w ? 'on' : '';
    b.title = (G.powers.get(name) || {}).description || '';
    b.onclick = () => { G.w = i; el.hidden = true; sendAim(); updateHud(); };
    el.appendChild(b);
  });
}

function sendAim(force) {
  const me = myPlayer();
  if (!me || !myTurn()) return;
  clearTimeout(G.aimTimer);
  const go = () => {
    G.lastAimSent = now();
    send({ t: 'aim', a: { angle: Math.round(me.angle * 10) / 10, power: Math.round(me.power * 10) / 10, w: G.w, c: CH.on } });
  };
  if (force || now() - G.lastAimSent > 90) go();
  else G.aimTimer = setTimeout(go, 90);
}

// ---- worms-style aiming: the crosshair swings up/down on the side you face
const faceOf = ang => (Math.cos(ang * Math.PI / 180) < -1e-6 ? -1 : 1);
const elevOf = (ang, face) => (face > 0 ? ang : 180 - ang);
function setElev(me, el) {
  el = clamp(el, PHYS.aimMin, 90);
  me.angle = G.face > 0 ? el : 180 - el;
}
function nudgeElev(d) {
  const me = myPlayer();
  if (!myTurn() || !me) return;
  setElev(me, elevOf(me.angle, G.face) + d);
  sendAim(); updateHud();
}
function setFace(f) {
  const me = myPlayer();
  if (!myTurn() || !me || G.face === f) return;
  const el = elevOf(me.angle, G.face);
  G.face = f; setElev(me, el);
  Sound.sfx('hover'); sendAim(); updateHud();
}

// ---- worms-style firing: hold SPACE (or the FIRE button) to wind up, let go to shoot
const CH = { on: false, t0: 0, ticks: 0 };
const chargeOf = p => {
  if (p.id === App.myId && CH.on) return clamp((now() - CH.t0) / 1000 / PHYS.charge * 100, 0, 100);
  if (p.charging) return clamp((now() - p.chargeT0) / 1000 / PHYS.charge * 100, 0, 100);
  return 0;
};
function startCharge() {
  const me = myPlayer();
  if (CH.on || !myTurn() || !me || !me.inv.length || G.paused) return;
  CH.on = true; CH.t0 = now(); CH.ticks = 0;
  me.power = 0;
  sendAim(true); updateHud();
}
function stepCharge() {
  if (!CH.on) return;
  const me = myPlayer();
  if (!myTurn() || !me) { stopCharge(); return; }
  const lvl = chargeOf(me);
  me.power = lvl;
  if (lvl >= CH.ticks * 10) { Sound.sfx('rev', CH.ticks * 10); CH.ticks++; }
  sendAim();
  if (lvl >= 100) releaseCharge();
}
function releaseCharge() {
  if (!CH.on) return;
  const me = myPlayer();
  const lvl = me ? chargeOf(me) : 0;
  CH.on = false;
  if (!me || !myTurn()) return;
  me.power = Math.max(1, Math.round(lvl));
  fire();
}
function stopCharge() { CH.on = false; }

function cycleWeapon(d) {
  const me = myPlayer();
  if (!myTurn() || !me || !me.inv.length) return;
  G.w = (G.w + d + me.inv.length) % me.inv.length;
  Sound.sfx('hover'); sendAim(); updateHud();
}
function fire() {
  const me = myPlayer();
  if (!myTurn() || !me || !me.inv.length) return;
  CH.on = false;
  G.phase = 'firing';
  send({ t: 'fire', a: { angle: me.angle, power: me.power, w: G.w } });
  updateHud();
}
function drive(d) {
  const me = myPlayer();
  if (!myTurn() || !me || me.moves <= 0) return;
  send({ t: 'move', dir: d });
}

// power meter in the HUD: live charge, plus a notch where your last shot was
function drawPowerMeter(me) {
  const lvl = CH.on ? chargeOf(me) : me.power;
  $('#powVal').textContent = Math.round(lvl);
  $('#powBar').style.width = lvl + '%';
  $('#powLast').hidden = me.lastPow == null;
  if (me.lastPow != null) $('#powLast').style.left = me.lastPow + '%';
}

// hold-to-repeat buttons
function holdButton(el, fn) {
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  el.addEventListener('pointerdown', e => {
    if (el.disabled) return;
    e.preventDefault(); fn();
    t1 = setTimeout(() => (t2 = setInterval(fn, 45)), 320);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
}
document.querySelectorAll('[data-adj]').forEach(b => holdButton(b, () => nudgeElev(+b.dataset.d)));
holdButton($('#wPrev'), () => cycleWeapon(-1));
holdButton($('#wNext'), () => cycleWeapon(1));
$('#moveL').onclick = () => drive(-1);
$('#moveR').onclick = () => drive(1);
$('#flipBtn').onclick = () => setFace(-G.face);
const fireBtn = $('#btnFire');
fireBtn.addEventListener('pointerdown', e => { if (fireBtn.disabled) return; e.preventDefault(); fireBtn.setPointerCapture(e.pointerId); startCharge(); });
fireBtn.addEventListener('pointerup', releaseCharge);
fireBtn.addEventListener('pointercancel', releaseCharge);
$('#wName').onclick = () => { if (!myTurn()) return; $('#wList').hidden = !$('#wList').hidden; renderWList(); };

// UP / DOWN swing the crosshair: one degree per tap, accelerating sweep when held
const held = {};
function stepAimKeys(dt) {
  const me = myPlayer();
  if (!me || !myTurn()) return;
  const d = (held.ArrowUp ? 1 : 0) - (held.ArrowDown ? 1 : 0);
  if (!d) return;
  const k = held.ArrowUp && held.ArrowDown ? 0 : (now() - (d > 0 ? held.ArrowUp : held.ArrowDown)) / 1000;
  if (k < 0.18) return;                                         // the tap already moved it a degree
  const rate = held.shift ? 10 : 30 + Math.min(1, (k - 0.18) / 0.8) * 60;   // deg/s
  setElev(me, elevOf(me.angle, G.face) + d * rate * dt);
  sendAim(); updateHud();
}
addEventListener('keyup', e => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') held[e.key] = 0;
  if (e.key === 'Shift') held.shift = false;
  if (e.key === ' ') { e.preventDefault(); releaseCharge(); }
});
addEventListener('blur', () => { held.ArrowUp = held.ArrowDown = 0; releaseCharge(); });

addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); $('#pause').hidden ? openPause() : resumeGame(); return; }
  if (!$('#pause').hidden) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'm' || e.key === 'M') { Sound.init(); Sound.setMusic(!Sound.musicOn); updateMusicLabels(); return; }
  if (!G || App.screen !== 'game') return;
  const k = e.key;
  held.shift = e.shiftKey;
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    if (!e.repeat) { held[k] = now(); nudgeElev(k === 'ArrowUp' ? 1 : -1); }
  }
  else if (k === 'ArrowLeft') setFace(-1);
  else if (k === 'ArrowRight') setFace(1);
  else if (k === 'a' || k === 'A') { if (!e.repeat) drive(-1); }
  else if (k === 'd' || k === 'D') { if (!e.repeat) drive(1); }
  else if (k === 'w' || k === 'W') cycleWeapon(-1);
  else if (k === 's' || k === 'S') cycleWeapon(1);
  else if (k === ' ') { if (!e.repeat) startCharge(); }
  else if (k === 'Enter') { if (!e.repeat && !CH.on) fire(); }   // re-fire at your last power
  else return;
  e.preventDefault();
});

// click / drag on the field points the crosshair (power still comes from holding SPACE / FIRE)
let dragging = false;
function aimAt(e) {
  const me = myPlayer(), r = cv.getBoundingClientRect();
  const wx = (e.clientX - r.left) / r.width * WW, wy = WH - (e.clientY - r.top) / r.height * WH;
  const dx = wx - me.dx, dy = wy - (me.dy + PHYS.pivot);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  G.face = dx >= 0 ? 1 : -1;
  setElev(me, G.face > 0 ? a : 180 - (a < 0 ? a + 360 : a));
  sendAim(); updateHud();
}
cv.addEventListener('pointerdown', e => { if (myTurn()) { dragging = true; cv.setPointerCapture(e.pointerId); aimAt(e); } });
cv.addEventListener('pointermove', e => { if (dragging && myTurn()) aimAt(e); });
cv.addEventListener('pointerup', () => (dragging = false));

// ------------------------------------------------------------------ rendering
const TW = WW * RES, TH = WH * RES;
const terrCv = canvasOf(TW, TH), terrCtx = terrCv.getContext('2d');
const terrImg = terrCtx.createImageData(TW, TH), terrPx = new Uint32Array(terrImg.data.buffer);
const lastTop = new Int16Array(TW);
let lastWorld = null, lastTheme = null;

function stepWorld(W, dt) {
  // ground settles: dirt above a crater slides down rather than snapping
  let moving = false;
  for (let x = 0; x < WW; x++) {
    if (W.disp[x] > W.H[x]) { W.disp[x] = Math.max(W.H[x], W.disp[x] - 170 * dt); moving = true; }
    else if (W.disp[x] < W.H[x]) W.disp[x] = W.H[x];
  }
  if (moving) W.dirty = true;
  for (const p of W.tanks) {
    if (p.gone) continue;
    if (Math.abs(p.dx - p.x) > 0.5) {   // walking (or getting shoved)
      const d = Math.sign(p.x - p.dx) * Math.min(Math.abs(p.x - p.dx), (p.slide ? 230 : 45) * dt);
      p.dx += d; if (!p.slide) p.roll += d * 2;
    } else { p.dx = p.x; p.slide = false; }
    const target = groundAt(W.disp, p.dx);
    p.dy = p.dy > target ? Math.max(target, p.dy - 150 * dt) : target;
    let diff = p.angle - p.da;
    p.da += diff * Math.min(1, dt * 12);
    const wt = p.dead ? 0 : G && W === G.world ? woodOf(p) : (p.woodT == null ? 1 : p.woodT);
    p.wood = (p.wood == null ? 1 : p.wood) + (wt - (p.wood == null ? 1 : p.wood)) * Math.min(1, dt * 1.2);
    p.recoil = Math.max(0, (p.recoil || 0) - dt * 3.5);
    stepIdle(W, p);
  }
  for (const q of W.parts) { q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  W.parts = W.parts.filter(q => q.life > 0 && q.y < WH + 10);
  W.shake = Math.max(0, W.shake - dt * 14);
}

// How hard a dong is, 0..1: full health and in the lead = rock hard. Taking damage or
// falling behind the leader makes it go soft.
function woodOf(p) {
  const health = clamp(1 - p.taken / G.hpMax, 0, 1);
  let lead = null;
  for (const o of G.players.values()) if (o !== p && !o.gone && !o.dead && (lead === null || o.score > lead)) lead = o.score;
  const behind = lead === null ? 0 : Math.max(0, lead - p.score);
  // stays rock hard down to ~80% health; only really wilts when hurt badly or way behind
  return clamp((health * (1 - 0.35 * clamp(behind / 150, 0, 1)) - 0.1) / 0.7, 0, 1);
}

// idle fidgets: every few seconds a dong that isn't busy does a random little routine
function stepIdle(W, p) {
  const t = now();
  // no fidgeting while a shot is in the air, so what you see is exactly what can be hit
  const busy = p.dead || Math.abs(p.dx - p.x) > 0.5 || p.flash > t || (G && W === G.world && (G.phase === 'anim' || G.phase === 'firing')) || (G && W === G.world && G.cur === p.id && G.phase !== 'over')
    || (demo.proj && demo.proj.me === p);
  if (busy) { p.idle = null; if (!p.idleNext || p.idleNext < t + 1200) p.idleNext = t + 1200 + Math.random() * 2500; return; }
  if (p.idle) {
    if (t - p.idle.t0 > IDLES[p.idle.k].dur) { p.idle = null; p.idleNext = t + 2500 + Math.random() * 6000; }
    return;
  }
  if (!p.idleNext) p.idleNext = t + 800 + Math.random() * 4000;
  if (t > p.idleNext) {
    let k;
    do k = IDLE_KINDS[(Math.random() * IDLE_KINDS.length) | 0]; while (k === p.lastIdle);
    p.lastIdle = k; p.idle = { k, t0: t };
  }
}

// terrain at canvas resolution: tufts above the surface, a dark rim, the theme's crust, then dirt.
// Only columns whose surface moved get rewritten.
function renderTerrain(W) {
  const T = W.theme, full = lastWorld !== W || lastTheme !== T;
  if (!W.dirty && !full) return;
  W.dirty = false; lastWorld = W; lastTheme = T;
  const crust = T.crust, cl = crust.length, dirt = T.dirt, out = T.out;
  for (let cx = 0; cx < TW; cx++) {
    const xw = (cx + 0.5) / RES - 0.5, i0 = clamp(Math.floor(xw), 0, WW - 1), i1 = Math.min(WW - 1, i0 + 1), f = clamp(xw - Math.floor(xw), 0, 1);
    const top = Math.round((WH - (W.disp[i0] + (W.disp[i1] - W.disp[i0]) * f)) * RES);
    if (!full && top === lastTop[cx]) continue;
    lastTop[cx] = top;
    const th = T.tuftH[cx], tc = T.tuftC[cx], dn = cl + T.drip[cx];
    for (let y = 0; y < TH; y++) {
      const d = y - top, i = y * TW + cx;
      terrPx[i] = d < -th ? 0 : d < 0 ? tc : d === 0 ? out : d <= cl ? crust[d - 1] : d <= dn ? T.dripC : dirt[i];
    }
  }
  terrCtx.putImageData(terrImg, 0, 0);
}

function drawWorld(W, t, extra) {
  const sx = W.shake > 0.3 ? Math.round((Math.random() - 0.5) * W.shake) : 0;
  const sy = W.shake > 0.3 ? Math.round((Math.random() - 0.5) * W.shake) : 0;
  g.save(); g.translate(sx, sy);
  drawBackground(W.theme, WW, WH, t);
  renderTerrain(W);
  g.drawImage(terrCv, 0, 0, WW, WH);
  for (const pr of W.props) {
    const gy = WH - W.disp[clamp(Math.floor(pr.x), 0, WW - 1)], img = pr.flip ? flipped(pr.img) : pr.img;
    blit(img, pr.x - img.width * U / 2, gy - (img.height - pr.sink) * U);
  }
  // air strike markers
  W.marks = W.marks.filter(m => t - m.t0 < 900);
  for (const m of W.marks) {
    const k = (t - m.t0) / 900, gy = WH - W.disp[clamp(Math.floor(m.x), 0, WW - 1)];
    const mc = ((t / 80) | 0) % 2 ? '#ff5a4a' : '#ffd84a';
    for (let y = gy - 6; y > 0; y -= 5) if (Math.random() > k) px(m.x - U / 2, y, 1, kp(5), mc);
    disk(m.x, gy - 2, 2.5, OUT); disk(m.x, gy - 2, 2, '#ff5a4a'); disk(m.x, gy - 2, 1, '#ffd84a');
  }
  for (const c of W.crates) {
    const gy = WH - W.disp[clamp(Math.floor(c.x), 0, WW - 1)], img = crateSprite(c.kind), k = c.t0 ? clamp((t - c.t0) / 1700, 0, 1) : 1;
    const y = k < 1 ? lerp(-12, gy, k) : gy, x = c.x + (k < 1 ? Math.sin(t / 260) * 3 * (1 - k) : 0);
    if (k < 1) {   // parachute
      const cy = y - img.height * U - 10;
      for (let i = -7; i <= 7; i++) {
        const h = Math.sqrt(49 - i * i) * 0.8;
        px(x + i, cy - h - U, 1, 1, OUT);
        px(x + i, cy - h, 1, Math.max(1, Math.round(h * RES)), ((i + 7) >> 1) % 2 ? '#e8433a' : '#fffbe8');
      }
      for (let j = 0; j < 8; j++) { px(x - 7 + j * 0.8, cy + j * 1.1, 1, 1, '#c8c0b0'); px(x + 7 - j * 0.8, cy + j * 1.1, 1, 1, '#c8c0b0'); }
    } else if (((t / 400) | 0) % 2) px(x - U / 2, y - img.height * U - 3, 1, kp(2), CRATE_INFO[c.kind].c);   // blinky beacon
    blit(img, x - img.width * U / 2, y - img.height * U + U);
  }
  for (const p of W.tanks) {
    if (p.gone) continue;
    if (p.dead) {
      const img = tombSprite();
      blit(img, p.dx - img.width * U / 2, WH - p.dy - img.height * U + U);
      continue;
    }
    const ch = G && W === G.world ? chargeOf(p) / 100 : 0;
    p.tip = drawTank(p.dx, WH - p.dy, p.da, p.color, t, {
      flash: p.flash > t, walk: p.roll, erect: p.wood,
      idle: p.idle ? { k: p.idle.k, p: clamp((t - p.idle.t0) / IDLES[p.idle.k].dur, 0, 1) } : null, face: G && W === G.world && p.id === App.myId && G.cur === p.id ? G.face : 0, recoil: p.recoil, charge: ch, moving: Math.abs(p.dx - p.x) > 0.5 && !p.slide,
    });
  }
  if (extra) extra(t);
  // fires
  W.fires = W.fires.filter(f => t - f.t0 < f.dur);
  for (const f of W.fires) {
    const k = (t - f.t0) / f.dur;
    for (const x of f.xs) {
      const gy = WH - W.disp[clamp(x, 0, WW - 1)];
      for (let j = 0; j < RES * 2; j++) {   // two world px of flame per burning column, one canvas px per tongue
        const cx = x * RES + j - 1, h = Math.max(1, Math.round((6 + ((cx * 7 + (t / 60 | 0)) % 10)) * K * (1 - k * 0.7))), X = x + (j - 1) * U;
        px(X, gy - (h + 1) * U, 1, h + 1, OUT);
        px(X, gy - h * U, 1, h, f.c);
        px(X, gy - Math.ceil(h * 0.6) * U, 1, Math.ceil(h * 0.6), '#ff9a1f');
        px(X, gy - Math.ceil(h * 0.3) * U, 1, Math.ceil(h * 0.3), '#ffd84a');
      }
    }
  }
  // explosions
  W.fx = W.fx.filter(f => t - f.t0 < 520);
  for (const f of W.fx) {
    const k = (t - f.t0) / 520, R = f.r * (0.45 + 0.55 * easeOut(Math.min(1, k * 2.2)));
    g.globalAlpha = 1 - k * k;
    disk(f.x, f.y, R + 1, OUT);
    disk(f.x, f.y, R, k < 0.15 ? '#ffffff' : f.c);
    disk(f.x, f.y, R * 0.7 * (1 - k), '#ff9a1f');
    disk(f.x, f.y, R * 0.45 * (1 - k), '#ffd84a');
    disk(f.x, f.y, R * 0.2 * (1 - k), '#ffffff');
    g.globalAlpha = 1;
  }
  for (const q of W.parts) px(q.x, q.y, kp(q.s), kp(q.s), q.c);
  W.texts = W.texts.filter(x => t - x.t0 < x.dur);
  for (const x of W.texts) {
    const k = (t - x.t0) / x.dur;
    pixText(x.text, x.x, x.y - k * 18, x.color, { align: 'center', scale: 2 });
  }
  g.restore();
}

function projPos(P, t) {
  const n = P.pts.length, last = n - 2, k = (t - P.t0) / SDT;
  if (k < last) {
    const i = Math.max(0, Math.floor(k)), f = k - i, a = P.pts[i], b = P.pts[i + 1];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  }
  const tl = P.t0 + last * SDT, f = clamp((t - tl) / Math.max(1e-6, P.te - tl), 0, 1);
  const a = P.pts[last], b = P.pts[n - 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
}

function drawProjectiles(t) {
  const R = G.replay;
  if (!R) return;
  const rt = (t - R.t0) / 1000;
  for (const P of R.projs) {
    if (rt < P.t0 || rt > P.te) continue;
    const [x, y] = projPos(P, rt), [qx, qy] = projPos(P, Math.max(P.t0, rt - 0.02));
    // trail
    for (let k = 4; k >= 1; k--) {
      const tt = rt - k * 0.03;
      if (tt < P.t0) continue;
      const [tx, ty] = projPos(P, tt);
      g.globalAlpha = 0.55 - k * 0.1;
      px(tx - U, WH - ty - U, kp(k < 3 ? 3 : 2), kp(k < 3 ? 3 : 2), P.c);
    }
    g.globalAlpha = 1;
    if (WH - y < -2) {   // above the top of the screen: show a marker
      const ax = clamp(x, 4, WW - 5);
      const rows = kp(6);
      for (let r = 0; r < rows; r++) px(ax - (2 * (rows - r) - 1) * U / 2, r * U, 2 * (rows - r) - 1, 1, OUT);
      for (let r = 0; r < rows - 2; r++) px(ax - (2 * (rows - r) - 5) * U / 2, (r + 1) * U, 2 * (rows - r) - 5, 1, P.c);
      continue;
    }
    drawProjectile(P.look, x, WH - y, x - qx, -(y - qy), P.s, P.c, t);
  }
}

function drawGameOverlay(t) {
  // names, health bars, turn arrow
  for (const p of G.world.tanks) {
    if (p.gone) continue;
    const sx = Math.round(p.dx), sy = Math.round(WH - p.dy);
    if (p.dead) { pixText(p.name, sx, sy - 22, '#8a8890', { align: 'center' }); continue; }
    pixText(p.name, sx, sy - 46, css(p), { align: 'center' });
    if (p.boost) {   // viagra pill next to the name
      const bx = sx + textWidth(p.name) / 2 + 3;
      px(bx - U, sy - 47, kp(8) + 2, kp(5) + 2, OUT); px(bx, sy - 46, kp(8), kp(5), '#5a9bff'); px(bx, sy - 46, kp(4), 1, '#9ad0ff');
    }
    const hp = clamp(1 - p.taken / G.hpMax, 0, 1), bw = kp(44), bh = kp(4), fill = Math.round(bw * hp), bx = sx - bw * U / 2, by = sy - 39;
    const hc = hp > 0.6 ? ['#5ae86a', '#b0ffb8', '#2a9a3a'] : hp > 0.3 ? ['#ffd84a', '#fff0a0', '#c89a1a'] : ['#ff5a4a', '#ffa090', '#a82a22'];
    px(bx - U, by - U, bw + 2, bh + 2, OUT);
    px(bx, by, bw, bh, '#3a1418');
    px(bx, by, fill, bh, hc[0]);
    if (bh >= 3) { px(bx, by, fill, 1, hc[1]); px(bx, by + (bh - 1) * U, fill, 1, hc[2]); }
    for (let k = kp(11); k < bw; k += kp(11)) px(bx + k * U, by, 1, bh, OUT);
    if (G.cur === p.id && G.phase !== 'anim') {
      const ay = sy - 60 + Math.sin(t / 150) * 2;
      const rows = kp(6);
      for (let r = 0; r < rows + 2; r++) px(sx - (2 * (rows - r) + 3) * U / 2, ay + (r - 1) * U, 2 * (rows - r) + 3, 1, OUT);
      for (let r = 0; r < rows; r++) px(sx - (2 * (rows - r) - 1) * U / 2, ay + r * U, 2 * (rows - r) - 1, 1, r < 1 && rows > 3 ? '#fffbe8' : css(p));
    }
  }
  // the aiming player's crosshair + wind-up wedge (everyone sees it, like worms)
  const cur = G.cur && G.players.get(G.cur);
  if (cur && !cur.gone && (G.phase === 'aim' || G.phase === 'firing')) {
    const a = cur.angle * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a);
    const pvx = cur.dx, pvy = WH - (cur.dy + PHYS.pivot);
    const lvl = chargeOf(cur) / 100;
    if (lvl > 0) {
      const L = 8 + lvl * (CROSS_D - 12);
      for (let d = 8; d <= L; d += 0.5) disk(pvx + ux * d, pvy + uy * d, 1.4 + (d - 8) * 0.12, OUT);
      for (let d = 8; d <= L; d += 0.5) {
        const f = (d - 8) / (CROSS_D - 12);
        disk(pvx + ux * d, pvy + uy * d, 0.6 + (d - 8) * 0.12, f < 0.35 ? '#ffd84a' : f < 0.7 ? '#ff9a1f' : '#ff3a2a');
      }
    }
    const cx = pvx + ux * CROSS_D, cy = pvy + uy * CROSS_D;
    const col = css(cur), pulse = ((t / 250) | 0) % 2;
    const ring = (c, r, n) => { for (let i = 0; i < n; i++) { const q = i / n * Math.PI * 2; px(cx + Math.cos(q) * r, cy + Math.sin(q) * r, 1, 1, c); } };
    if (K < 1) { ring(OUT, 5, 40); ring(OUT, 3, 24); ring(pulse ? col : '#fffbe8', 4, 32); }
    else { ring(OUT, 5, 72); ring(OUT, 4, 64); ring(pulse ? col : '#fffbe8', 4.5, 72); }
    const Lc = Math.max(3, Math.round(5 * K));   // crosshair arm length, canvas px
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x0 = cx + ax * 5.5, y0 = cy + ay * 5.5;
      // arm: Lc long, 1 thick, inside a 1px OUT border, extending away from the center
      const ox = ax > 0 ? 0 : ax < 0 ? -Lc * U : 0, oy = ay > 0 ? 0 : ay < 0 ? -Lc * U : 0;
      px(x0 + ox - U, y0 + oy - U, ax ? Lc + 2 : 3, ay ? Lc + 2 : 3, OUT);
      px(x0 + ox, y0 + oy, ax ? Lc : 1, ay ? Lc : 1, col);
    }
    px(cx - (K < 1 ? 0 : U), cy - (K < 1 ? 0 : U), kp(2), kp(2), '#fffbe8');
  }
  if (G.replay) drawProjectiles(t);
}

function drawBanner(t) {
  const b = G && G.banner;
  if (!b) return;
  const k = (t - b.t0) / b.dur;
  if (k > 1) { G.banner = null; return; }
  const y = 26 + Math.round(Math.max(0, 1 - k * 6) * -20);
  pixText(b.text, WW / 2, y, b.color, { align: 'center', scale: 3 });
}

let hudTick = 0;
function updateTimers(t) {
  if (t - hudTick < 200) return;
  hudTick = t;
  if (G.paused) t = G.pausedAt;   // clocks freeze while paused
  if (App.screen === 'game' && G.phase === 'aim') {
    const s = Math.max(0, Math.ceil((G.deadline - t) / 1000));
    $('#turnTime').textContent = s;
    $('#turnTime').classList.toggle('low', s <= 5);
    if (myTurn() && s <= 5 && s > 0 && s !== updateTimers.last) Sound.sfx('tick');
    updateTimers.last = s;
  } else $('#turnTime').textContent = '';
  if (App.screen === 'draft' && G.draft && G.draft.turn) {
    const s = Math.max(0, Math.ceil((G.draftDeadline - t) / 1000));
    const base = $('#draftInfo').textContent.replace(/ - \d+S$/, '');
    $('#draftInfo').textContent = `${base} - ${s}S`;
  }
}

// ------------------------------------------------------------------ menu demo: two bots duking it out
const demo = { world: null, t: 0, shots: 0, proj: null, turn: 0 };
function makeDemoTerrain() {
  const H = [], b = 70 + Math.random() * 40, ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  for (let x = 0; x < WW; x++) {
    const u = x / WW * Math.PI * 2;
    H.push(clamp(b + 40 * Math.sin(u * 1.3 + ph[0]) + 18 * Math.sin(u * 3.7 + ph[1]) + 4 * Math.sin(u * 11 + ph[2]), 20, 200));
  }
  return H;
}
function resetDemo() {
  const W = makeWorld(makeDemoTerrain(), (Math.random() * THEMES.length) | 0, (Math.random() * 1e9) | 0);
  W.props = makeProps(W.theme, WW, [110, 530]);
  [110, 530].forEach((x, i) => {
    const y = groundAt(W.H, x);
    W.tanks.push({ id: 'd' + i, name: '', color: i ? 1 : 0, x, dx: x, y, dy: y, angle: i ? 135 : 45, da: i ? 135 : 45, roll: 0, flash: 0 });
  });
  W.silent = true;
  demo.world = W; demo.shots = 0; demo.proj = null; demo.t = now() + 1200;
}
function stepDemo(t, dt) {
  const W = demo.world;
  if (!demo.proj && t > demo.t) {
    const me = W.tanks[demo.turn % 2], foe = W.tanks[(demo.turn + 1) % 2];
    demo.turn++;
    const ang = 40 + Math.random() * 25, a = (me.x < foe.x ? ang : 180 - ang) * Math.PI / 180;
    const R = Math.abs(foe.x - me.x), v = Math.sqrt(R * PHYS.g / Math.sin(2 * ang * Math.PI / 180)) * (0.92 + Math.random() * 0.14);
    me.angle = a * 180 / Math.PI;
    const x = me.x + Math.cos(a) * PHYS.barrel, y = me.dy + PHYS.pivot + Math.sin(a) * PHYS.barrel;
    demo.proj = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: ['#fffbe8', '#ffd84a', '#ff7af2', '#8aef4a'][Math.random() * 4 | 0], me };
  }
  const P = demo.proj;
  if (P) {
    for (let i = 0; i < 4; i++) {
      P.vy -= PHYS.g * dt / 4; P.x += P.vx * dt / 4; P.y += P.vy * dt / 4;
      const hitTank = W.tanks.find(k => k !== P.me && Math.hypot(P.x - k.dx, P.y - (k.dy + 6)) < 8);
      const xi = Math.floor(P.x);
      if (hitTank || (xi >= 0 && xi < WW && P.y <= W.H[xi]) || P.x < -30 || P.x > WW + 30) {
        if (P.x > -30 && P.x < WW + 30) runEvent(W, { k: 'boom', x: P.x, y: P.y, r: 16, c: P.c, carve: true });
        if (hitTank) { hitTank.flash = t + 450; hitTank.woodT = Math.max(0, (hitTank.woodT == null ? 1 : hitTank.woodT) - 0.3); floatText(W, '+30', hitTank.dx, WH - hitTank.dy - 40, PLAYER_COLORS[P.me.color].css); }
        demo.proj = null; demo.t = t + 1400 + Math.random() * 600;
        if (++demo.shots > 10) setTimeout(resetDemo, 1500);
        break;
      }
    }
  }
}
function drawDemoProj(t) {
  const P = demo.proj;
  if (P) drawProjectile('glob', P.x, WH - P.y, P.vx, -P.vy, 3, P.c, t);
}

// ------------------------------------------------------------------ main loop
let last = now();
function frame(t) {
  requestAnimationFrame(frame);   // first, so one bad frame can never freeze the game
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  if (G && App.screen !== 'menu' && App.screen !== 'how' && App.screen !== 'lobby' && App.screen !== 'room') {
    if (G.replay) updateReplay(t);
    stepAimKeys(dt);
    stepCharge();
    if (CH.on || [...G.players.values()].some(q => q.charging)) { const me = myPlayer(); if (me) drawPowerMeter(me); }
    stepWorld(G.world, dt);
    drawWorld(G.world, t, drawGameOverlay);
    drawBanner(t);
    updateTimers(t);
  } else {
    if (!demo.world) resetDemo();
    stepDemo(t, dt);
    stepWorld(demo.world, dt);
    drawWorld(demo.world, t, drawDemoProj);
  }
}

pixelizeUI();
updateMusicLabels();
show('menu');
requestAnimationFrame(frame);
