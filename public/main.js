'use strict';
// BATTLE DONGS client: menus, networking, draft, shot replays, rendering, input.
const $ = s => document.querySelector(s);
const cv = $('#screen'), g = cv.getContext('2d');
const WW = 640, WH = 300;          // world size in pixels (same as server.py)
const RES = 2;                     // canvas pixels per world pixel (tanks use the extra detail)
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
function makeWorld(H) {
  return { H: Float32Array.from(H), disp: Float32Array.from(H), dirty: true,
           tanks: [], fx: [], parts: [], fires: [], marks: [], texts: [], shake: 0 };
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
      if (was) { toast('DISCONNECTED FROM SERVER'); show('menu'); Sound.play('menu'); }
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
      if (App.toMenu) { App.toMenu = false; show('menu'); Sound.play('menu'); } else show('lobby');
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

document.addEventListener('pointerdown', () => { Sound.init(); Sound.play(G ? 'battle' : 'menu'); });
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) Sound.sfx('click'); });

function updateMusicLabels() {
  $('#btnMusic').textContent = 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF');
  $('#muteBtn').classList.toggle('off', !Sound.musicOn);
  $('#btnPauseMusic').textContent = 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF');
}
$('#btnMusic').onclick = $('#muteBtn').onclick = () => { Sound.init(); Sound.setMusic(!Sound.musicOn); updateMusicLabels(); };
updateMusicLabels();

$('#btnPlay').onclick = async () => {
  Sound.init(); Sound.play('menu');
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
$('#btnHow').onclick = () => { Sound.init(); Sound.play('menu'); show('how'); };
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
  $('#roomTitle').textContent = r.name.toUpperCase();
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
  Sound.play('menu');
  if (App.room) { show('room'); renderRoom(); } else show('lobby');
};

// ------------------------------------------------------------------ game state
const myPlayer = () => G && G.players.get(App.myId);
const myTurn = () => G && G.cur === App.myId && G.phase === 'aim';
const css = p => PLAYER_COLORS[p.color].css;

function startGame(m) {
  Object.assign(PHYS, m.physics || {});
  const world = makeWorld(m.state.H);
  G = {
    world, players: new Map(), order: m.players.map(p => p.id),
    powers: new Map(m.powers.map(p => [p.name, p])),
    phase: 'draft', cur: null, deadline: 0, turnN: 0, replay: null, draft: null,
    w: 0, banner: null, lastAimSent: 0, aimTimer: null, hpMax: m.hp || 250, face: 1,
  };
  for (const p of m.players) {
    const t = { ...p, x: 0, y: 0, dx: 0, dy: 0, da: 45, angle: 45, power: 60, w: 0, score: 0, taken: 0, moves: 4, inv: [], gone: false,
                flash: 0, roll: 0, wood: 1, recoil: 0, charging: false, chargeT0: 0, lastPow: null };
    G.players.set(p.id, t);
    world.tanks.push(t);
  }
  applyState(m.state, true);
  Sound.play('battle');
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
    Object.assign(p, { x: t.x, y: t.y, score: t.score, taken: t.taken || 0, moves: t.moves, inv: t.inv, gone: t.gone });
    if (!keepAim) { p.angle = t.angle; p.power = t.power; }
    if (snap) { p.dx = t.x; p.dy = t.y; p.da = t.angle; }
  }
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
  $('#btnResume').textContent = pausable() ? 'RESUME' : 'BACK';
  if (pausable() && !G.paused) {
    send({ t: 'pause', on: true });
    $('#pauseTitle').textContent = 'PAUSED';
    $('#pauseInfo').textContent = 'Game paused for everyone.';
  } else if (!pausable()) {
    $('#pauseTitle').textContent = 'MENU';
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
    $('#pauseTitle').textContent = 'PAUSED';
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
  else { G = null; show('menu'); Sound.play('menu'); }
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
    li.textContent = `${r.name}  -  ${r.score}${r.gone ? ' (LEFT)' : ''}`;
    li.style.color = PLAYER_COLORS[r.color].css;
    ol.appendChild(li);
  }
  const won = m.winner && m.winner.id === App.myId;
  $('#overTitle').textContent = m.winner ? (won ? 'YOU WIN!' : `${m.winner.name.toUpperCase()} WINS!`) : "IT'S A TIE!";
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

function burst(W, x, y, c, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random() * 0.7);
    W.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.6, c, life: 0.5 + Math.random() * 0.7, s: Math.random() < 0.3 ? 2 : 1 });
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
    d.className = 'sc' + (G.cur === id ? ' cur' : '') + (p.gone ? ' gone' : '');
    const n = document.createElement('span'); n.textContent = p.name.toUpperCase(); n.style.color = css(p);
    const s = document.createElement('span'); s.textContent = p.score;
    const w = document.createElement('small'); w.textContent = `${p.inv.length} LEFT`;
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
const terrCv = canvasOf(WW, WH), terrCtx = terrCv.getContext('2d');
const terrImg = terrCtx.createImageData(WW, WH), terrPx = new Uint32Array(terrImg.data.buffer);
let DIRT = null, lastWorld = null;

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
    if (Math.abs(p.dx - p.x) > 0.5) {   // driving
      const d = Math.sign(p.x - p.dx) * Math.min(Math.abs(p.x - p.dx), 45 * dt);
      p.dx += d; p.roll += d * 2;
    } else p.dx = p.x;
    const target = groundAt(W.disp, p.dx);
    p.dy = p.dy > target ? Math.max(target, p.dy - 150 * dt) : target;
    let diff = p.angle - p.da;
    p.da += diff * Math.min(1, dt * 12);
    const wt = G && W === G.world ? woodOf(p) : (p.woodT == null ? 1 : p.woodT);
    p.wood = (p.wood == null ? 1 : p.wood) + (wt - (p.wood == null ? 1 : p.wood)) * Math.min(1, dt * 1.2);
    p.recoil = Math.max(0, (p.recoil || 0) - dt * 3.5);
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
  for (const o of G.players.values()) if (o !== p && !o.gone && (lead === null || o.score > lead)) lead = o.score;
  const behind = lead === null ? 0 : Math.max(0, lead - p.score);
  return health * (1 - 0.6 * clamp(behind / 120, 0, 1));
}

function renderTerrain(W) {
  if (!W.dirty && lastWorld === W) return;
  W.dirty = false; lastWorld = W;
  for (let x = 0; x < WW; x++) {
    const top = WH - Math.round(W.disp[x]);
    for (let y = 0; y < WH; y++) {
      const i = y * WW + x, d = y - top;
      terrPx[i] = d < 0 ? 0 : d < 3 ? CRUST[d] : DIRT[i];
    }
  }
  terrCtx.putImageData(terrImg, 0, 0);
}

function drawWorld(W, t, extra) {
  const sx = W.shake > 0.3 ? Math.round((Math.random() - 0.5) * W.shake) : 0;
  const sy = W.shake > 0.3 ? Math.round((Math.random() - 0.5) * W.shake) : 0;
  g.save(); g.translate(sx, sy);
  drawBackground(g, WW, WH, t, 0);
  renderTerrain(W);
  g.drawImage(terrCv, 0, 0);
  // air strike markers
  W.marks = W.marks.filter(m => t - m.t0 < 900);
  for (const m of W.marks) {
    const k = (t - m.t0) / 900, gy = WH - W.disp[clamp(Math.floor(m.x), 0, WW - 1)];
    g.fillStyle = ((t / 80) | 0) % 2 ? '#ff5a4a' : '#ffd84a';
    for (let y = gy - 6; y > 0; y -= 6) if (Math.random() > k) g.fillRect(Math.round(m.x), y, 1, 3);
    disk(m.x, gy - 2, 2, '#ff5a4a');
  }
  for (const p of W.tanks) {
    if (p.gone) continue;
    const ch = G && W === G.world ? chargeOf(p) / 100 : 0;
    p.tip = drawTank(p.dx, WH - p.dy, p.da, p.color, t, {
      flash: p.flash > t, roll: p.roll, erect: p.wood, face: G && W === G.world && p.id === App.myId && G.cur === p.id ? G.face : 0, recoil: p.recoil, charge: ch, moving: Math.abs(p.dx - p.x) > 0.5,
    });
  }
  if (extra) extra(t);
  // fires
  W.fires = W.fires.filter(f => t - f.t0 < f.dur);
  for (const f of W.fires) {
    const k = (t - f.t0) / f.dur;
    for (const x of f.xs) {
      const gy = WH - Math.round(W.disp[clamp(x, 0, WW - 1)]);
      const h = Math.round((3 + ((x * 7 + (t / 70 | 0)) % 5)) * (1 - k * 0.7));
      g.fillStyle = OUT; g.fillRect(x - 1, gy - h - 1, 4, h + 1);
      g.fillStyle = f.c; g.fillRect(x, gy - h, 2, h);
      g.fillStyle = '#ffd84a'; g.fillRect(x, gy - Math.ceil(h / 2), 2, Math.ceil(h / 2));
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
  for (const q of W.parts) { g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
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
    const [x, y] = projPos(P, rt), [px, py] = projPos(P, Math.max(P.t0, rt - 0.02));
    // trail
    for (let k = 4; k >= 1; k--) {
      const tt = rt - k * 0.03;
      if (tt < P.t0) continue;
      const [tx, ty] = projPos(P, tt);
      g.fillStyle = P.c; g.globalAlpha = 0.5 - k * 0.1;
      g.fillRect(Math.round(tx), Math.round(WH - ty), k < 3 ? 2 : 1, k < 3 ? 2 : 1);
    }
    g.globalAlpha = 1;
    if (WH - y < -2) {   // above the top of the screen: show a marker
      const ax = Math.round(clamp(x, 3, WW - 4));
      g.fillStyle = OUT; g.fillRect(ax - 2, 0, 5, 4);
      g.fillStyle = P.c; g.fillRect(ax - 1, 1, 3, 1); g.fillRect(ax, 2, 1, 1);
      continue;
    }
    drawProjectile(P.look, x, WH - y, x - px, -(y - py), P.s, P.c, t);
  }
}

function drawGameOverlay(t) {
  // names, health bars, turn arrow
  for (const p of G.world.tanks) {
    if (p.gone) continue;
    const sx = Math.round(p.dx), sy = Math.round(WH - p.dy);
    pixText(p.name, sx, sy - 46, css(p), { align: 'center' });
    const hp = clamp(1 - p.taken / G.hpMax, 0, 1), bw = 22, fill = Math.round(bw * hp);
    g.fillStyle = OUT; g.fillRect(sx - bw / 2 - 1, sy - 39, bw + 2, 4);
    g.fillStyle = '#3a1418'; g.fillRect(sx - bw / 2, sy - 38, bw, 2);
    g.fillStyle = hp > 0.6 ? '#5ae86a' : hp > 0.3 ? '#ffd84a' : '#ff5a4a'; g.fillRect(sx - bw / 2, sy - 38, fill, 2);
    if (G.cur === p.id && G.phase !== 'anim') {
      const by = sy - 58 + Math.round(Math.sin(t / 150) * 2);
      g.fillStyle = OUT; g.fillRect(sx - 4, by - 1, 9, 2); g.fillRect(sx - 3, by + 1, 7, 2); g.fillRect(sx - 2, by + 3, 5, 1);
      g.fillStyle = css(p); g.fillRect(sx - 3, by, 7, 1); g.fillRect(sx - 2, by + 1, 5, 1); g.fillRect(sx - 1, by + 2, 3, 1); g.fillRect(sx, by + 3, 1, 1);
    }
  }
  // the aiming player's crosshair + wind-up wedge (everyone sees it, like worms)
  const cur = G.cur && G.players.get(G.cur);
  if (cur && !cur.gone && (G.phase === 'aim' || G.phase === 'firing')) {
    const a = cur.angle * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a);
    const px = cur.dx, py = WH - (cur.dy + PHYS.pivot);
    const lvl = chargeOf(cur) / 100;
    if (lvl > 0) {
      const L = 8 + lvl * (CROSS_D - 12);
      for (let d = 8; d <= L; d += 1) disk(px + ux * d, py + uy * d, 1.4 + (d - 8) * 0.12, OUT);
      for (let d = 8; d <= L; d += 1) {
        const f = (d - 8) / (CROSS_D - 12);
        disk(px + ux * d, py + uy * d, 0.6 + (d - 8) * 0.12, f < 0.35 ? '#ffd84a' : f < 0.7 ? '#ff9a1f' : '#ff3a2a');
      }
    }
    const cx = Math.round(px + ux * CROSS_D), cy = Math.round(py + uy * CROSS_D);
    const col = css(cur), pulse = ((t / 250) | 0) % 2;
    const ring = (c, r) => {
      g.fillStyle = c;
      for (let i = 0; i < 16; i++) { const q = i / 16 * Math.PI * 2 + t / 900; g.fillRect(Math.round(cx + Math.cos(q) * r), Math.round(cy + Math.sin(q) * r), 1, 1); }
    };
    ring(OUT, 5); ring(OUT, 3); ring(pulse ? col : '#fffbe8', 4);
    g.fillStyle = OUT; g.fillRect(cx - 8, cy - 1, 5, 3); g.fillRect(cx + 4, cy - 1, 5, 3); g.fillRect(cx - 1, cy - 8, 3, 5); g.fillRect(cx - 1, cy + 4, 3, 5);
    g.fillStyle = col; g.fillRect(cx - 7, cy, 3, 1); g.fillRect(cx + 5, cy, 3, 1); g.fillRect(cx, cy - 7, 1, 3); g.fillRect(cx, cy + 5, 1, 3);
    g.fillStyle = '#fffbe8'; g.fillRect(cx, cy, 1, 1);
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
  const W = makeWorld(makeDemoTerrain());
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

buildBackground(WW, WH);
DIRT = buildDirt(WW, WH);
show('menu');
requestAnimationFrame(frame);
