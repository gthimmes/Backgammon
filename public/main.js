import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const SP = 1.0;              // spacing between point columns
const BAR_HALF = 0.7;        // half-width of the central bar gap
const CH_R = 0.42;           // checker radius
const CH_H = 0.22;           // checker height
const NEAR_Z = 6.2;          // z of the outer edge, near row (bottom)
const FAR_Z = -6.2;          // z of the outer edge, far row (top)
const BOARD_TOP = 0.25;
const CH_Y = BOARD_TOP + CH_H / 2 + 0.01;
const HALF_X = 7.4;
const HALF_Z = 7.0;

const COLORS = {
  feltA: 0x0f5c3f, feltB: 0x0b4a33,
  frame: 0x5a3a24, frameEdge: 0x714a2e,
  pointA: 0xc9a06a, pointB: 0x7d4a2b,
  white: 0xf1ecdf, black: 0x25262c,
  highlight: 0x6ee7a8, select: 0xffd166,
};

// point number -> { x, z, near }
function pointPos(n) {
  let x, near;
  if (n >= 1 && n <= 6) { x = BAR_HALF + 0.5 * SP + (6 - n) * SP; near = true; }
  else if (n >= 7 && n <= 12) { x = -(BAR_HALF + 0.5 * SP + (n - 7) * SP); near = true; }
  else if (n >= 13 && n <= 18) { x = -(BAR_HALF + 0.5 * SP + (18 - n) * SP); near = false; }
  else { x = BAR_HALF + 0.5 * SP + (n - 19) * SP; near = false; }
  return { x, z: near ? NEAR_Z : FAR_Z, near };
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 13, 13);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.screenSpacePanning = false;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(6, 18, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -14; key.shadow.camera.right = 14;
key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
key.shadow.camera.far = 60;
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
fill.position.set(-8, 10, -6);
scene.add(fill);

// ---------------------------------------------------------------------------
// Static board geometry
// ---------------------------------------------------------------------------
function buildBoard() {
  const g = new THREE.Group();

  // Outer wooden frame.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_X * 2, 0.5, HALF_Z * 2),
    new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.85 })
  );
  frame.position.y = 0;
  frame.receiveShadow = true;
  g.add(frame);

  // Felt playing surface (two halves so the bar reads as a raised divider).
  const feltMat = new THREE.MeshStandardMaterial({ color: COLORS.feltA, roughness: 0.95 });
  const feltW = HALF_X - BAR_HALF - 0.2;
  for (const sign of [-1, 1]) {
    const felt = new THREE.Mesh(new THREE.BoxGeometry(feltW, 0.04, HALF_Z * 2 - 0.8), feltMat);
    felt.position.set(sign * (BAR_HALF + 0.1 + feltW / 2), BOARD_TOP + 0.001, 0);
    felt.receiveShadow = true;
    g.add(felt);
  }

  // Central bar (raised).
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(BAR_HALF * 2, 0.62, HALF_Z * 2 - 0.4),
    new THREE.MeshStandardMaterial({ color: COLORS.frameEdge, roughness: 0.8 })
  );
  bar.position.y = 0.06;
  bar.castShadow = true; bar.receiveShadow = true;
  g.add(bar);

  // Triangular points.
  for (let n = 1; n <= 24; n++) {
    const { x, z, near } = pointPos(n);
    const tipZ = near ? z - 4.6 : z + 4.6;
    const halfW = CH_R * 1.02;
    const shape = new THREE.Shape();
    shape.moveTo(x - halfW, z);
    shape.lineTo(x + halfW, z);
    shape.lineTo(x, tipZ);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: (n % 2 === 0) ? COLORS.pointA : COLORS.pointB,
      roughness: 0.7,
    });
    const tri = new THREE.Mesh(geo, mat);
    tri.position.y = BOARD_TOP + 0.02;
    tri.receiveShadow = true;
    g.add(tri);
  }

  scene.add(g);
}
buildBoard();

// ---------------------------------------------------------------------------
// Pickable zones (transparent, but ray-castable)
// ---------------------------------------------------------------------------
const pickables = [];
function addZone(x, z, w, d, data) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 2, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  mesh.position.set(x, BOARD_TOP + 0.5, z);
  mesh.userData = data;
  scene.add(mesh);
  pickables.push(mesh);
  return mesh;
}

for (let n = 1; n <= 24; n++) {
  const { x, z, near } = pointPos(n);
  const cz = near ? z - 2.3 : z + 2.3;
  addZone(x, cz, CH_R * 2.1, 5.0, { point: n });
}
// Bar zones: white re-enters "from 25", black "from 0".
addZone(0, 2.4, BAR_HALF * 1.8, 4.4, { point: 25 });   // white bar
addZone(0, -2.4, BAR_HALF * 1.8, 4.4, { point: 0 });   // black bar
// Bear-off trays on the right edge. White bears off past 0, black past 25.
const OFF_X = HALF_X - 0.35;
addZone(OFF_X, 3.4, 0.6, 5.5, { offTarget: 0 });       // white off (near)
addZone(OFF_X, -3.4, 0.6, 5.5, { offTarget: 25 });     // black off (far)

// ---------------------------------------------------------------------------
// Dynamic layer: checkers + highlights
// ---------------------------------------------------------------------------
const checkerGeo = new THREE.CylinderGeometry(CH_R, CH_R, CH_H, 40);
const checkerMats = {
  white: new THREE.MeshStandardMaterial({ color: COLORS.white, roughness: 0.35, metalness: 0.1 }),
  black: new THREE.MeshStandardMaterial({ color: COLORS.black, roughness: 0.4, metalness: 0.15 }),
};
const dynamic = new THREE.Group();
scene.add(dynamic);
const highlights = new THREE.Group();
scene.add(highlights);
const animGroup = new THREE.Group();
scene.add(animGroup);
const clock = new THREE.Clock();

// ---- Move animation: tween a checker from source to destination -----------
// Each broadcast is a single sub-move, so the delta between two consecutive
// boards is at most one checker per color moving (plus a possible hit).
let anims = [];

function locWorld(color, loc) {
  if (loc === 'bar') return { x: 0, y: CH_Y + 0.4, z: color === 'white' ? 0.7 : -0.7 };
  if (loc === 'off') return { x: OFF_X, y: CH_Y, z: color === 'white' ? 5.6 : -5.6 };
  const n = Number(loc);
  const { x, z, near } = pointPos(n);
  return { x, y: CH_Y, z: z + (near ? -1 : 1) * CH_R };
}

// Map a board to { loc: count } for one color (loc = 1..24 | 'bar' | 'off').
function locCounts(board, color) {
  const m = {};
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === color) m[p] = c.count;
  }
  if (board.bar[color]) m.bar = board.bar[color];
  if (board.off[color]) m.off = board.off[color];
  return m;
}

// Pair each vacated slot with a newly filled slot to reconstruct moves.
function diffColor(prev, next, color) {
  const a = locCounts(prev, color), b = locCounts(next, color);
  const locs = new Set([...Object.keys(a), ...Object.keys(b)]);
  const dec = [], inc = [];
  for (const l of locs) {
    const d = (b[l] || 0) - (a[l] || 0);
    for (let i = 0; i < -d; i++) dec.push(l);
    for (let i = 0; i < d; i++) inc.push(l);
  }
  const moves = [];
  for (let i = 0; i < Math.min(dec.length, inc.length); i++) {
    moves.push({ color, from: dec[i], to: inc[i] });
  }
  return moves;
}

function computeAnims(prev, next) {
  const moves = [...diffColor(prev, next, 'white'), ...diffColor(prev, next, 'black')];
  if (moves.length === 0 || moves.length > 4) return []; // skip resets/big jumps
  return moves;
}

function spawnMoveAnim(m) {
  const mesh = new THREE.Mesh(checkerGeo, checkerMats[m.color]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  animGroup.add(mesh);
  anims.push({ mesh, from: locWorld(m.color, m.from), to: locWorld(m.color, m.to), t: 0, dur: 0.3 });
}

function stepAnims(dt) {
  if (anims.length === 0) return;
  for (const a of anims) {
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2; // easeInOut
    const arc = Math.sin(Math.PI * a.t) * 0.7;
    a.mesh.position.set(
      a.from.x + (a.to.x - a.from.x) * e,
      a.from.y + (a.to.y - a.from.y) * e + arc,
      a.from.z + (a.to.z - a.from.z) * e,
    );
  }
  anims = anims.filter((a) => {
    if (a.t >= 1) { animGroup.remove(a.mesh); return false; }
    return true;
  });
}

// ---- 3D doubling cube (sits on the left rail) -----------------------------
let cubeMesh = null;
let cubeShownVal = null;

function makeCubeTexture(v) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe9da';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#b9ac8c'; ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = '#1a1206';
  ctx.font = `bold ${v >= 10 ? 62 : 78}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(v), 64, 70);
  return new THREE.CanvasTexture(c);
}

function updateCube(st) {
  if (!st.cube || st.status === 'waiting') {
    if (cubeMesh) cubeMesh.visible = false;
    return;
  }
  if (!cubeMesh) {
    cubeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.85),
      new THREE.MeshStandardMaterial({ roughness: 0.5 })
    );
    cubeMesh.castShadow = true;
    scene.add(cubeMesh);
  }
  cubeMesh.visible = true;
  if (st.cube.value !== cubeShownVal) {
    cubeMesh.material.map = makeCubeTexture(st.cube.value);
    cubeMesh.material.needsUpdate = true;
    cubeShownVal = st.cube.value;
  }
  // Centered when unowned, otherwise parked on its owner's side of the rail.
  const owner = st.cube.owner;
  const z = owner === 'white' ? 4.8 : owner === 'black' ? -4.8 : 0;
  cubeMesh.position.set(-(HALF_X - 0.55), BOARD_TOP + 0.55, z);
}

function makeCountLabel(count, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color === 'white' ? '#1a1206' : '#f1ecdf';
  ctx.font = 'bold 74px Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(count), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(0.7, 0.7, 0.7);
  return spr;
}

function addChecker(color, x, y, z) {
  const m = new THREE.Mesh(checkerGeo, checkerMats[color]);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  dynamic.add(m);
  return m;
}

function renderCheckers(state) {
  dynamic.clear();
  const b = state.board;

  // Points.
  for (let n = 1; n <= 24; n++) {
    const cell = b.points[n];
    if (!cell) continue;
    const { x, z, near } = pointPos(n);
    const dirZ = near ? -1 : 1;
    const count = cell.count;
    const shown = Math.min(count, 5);
    const spacing = count > 5 ? (4.4 / count) : CH_R * 1.95;
    for (let i = 0; i < count; i++) {
      const cz = z + dirZ * (CH_R + i * spacing);
      addChecker(cell.color, x, CH_Y, cz);
    }
    if (count > 1) {
      const lbl = makeCountLabel(count, cell.color);
      const topZ = z + dirZ * (CH_R + (count - 1) * spacing);
      lbl.position.set(x, CH_Y + 0.35, topZ);
      dynamic.add(lbl);
    }
  }

  // Bar.
  for (const color of ['white', 'black']) {
    const n = b.bar[color];
    const dirZ = color === 'white' ? 1 : -1;
    for (let i = 0; i < n; i++) {
      addChecker(color, 0, CH_Y, dirZ * (0.7 + i * CH_R * 1.95));
    }
  }

  // Borne off (stacked flat against the right frame).
  for (const color of ['white', 'black']) {
    const n = b.off[color];
    const baseZ = color === 'white' ? 5.6 : -5.6;
    const dirZ = color === 'white' ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const m = addChecker(color, OFF_X, BOARD_TOP + CH_H / 2 + 0.01 + 0, baseZ + dirZ * i * 0.14);
      m.scale.y = 0.5;
    }
  }
}

// ---------------------------------------------------------------------------
// Networking + game state
// ---------------------------------------------------------------------------
let ws;
let you = null;          // 'white' | 'black' | null (spectator)
let state = null;
let prevBoard = null;    // last rendered board, for move animation
let selected = null;     // currently selected source point
let reconnectAttempts = 0;

// Persisted session so a refresh or dropped connection reclaims the same seat.
const SESSION_KEY = 'bg_session';
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} }
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    reconnectAttempts = 0;
    const s = loadSession();
    if (s && s.code && s.token) sendWs({ type: 'rejoin', code: s.code, token: s.token });
  };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    // Only auto-reconnect if we still hold a session to reclaim.
    if (loadSession() && reconnectAttempts < 10) {
      reconnectAttempts++;
      flashStatus('Connection lost — reconnecting…');
      setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
    } else {
      setLobbyMsg('Disconnected. Refresh to reconnect.');
    }
  };
}
function sendWs(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function onMessage(msg) {
  if (msg.type === 'joined') {
    you = msg.color;
    // Remember a real seat (with its token) so we can reconnect to it later.
    if (msg.color && msg.token) saveSession({ code: msg.code, color: msg.color, token: msg.token });
    enterGame(msg.code);
  } else if (msg.type === 'error') {
    // A failed rejoin means the saved seat is gone — drop it and return to lobby.
    if (msg.code === 'no-room' || msg.code === 'bad-token') {
      clearSession();
      you = null;
      state = null;
      lobby.classList.remove('hidden');
      hud.classList.add('hidden');
    }
    setLobbyMsg(msg.message);
    flashStatus(msg.message);
  } else if (msg.type === 'state') {
    // Animate the checker(s) that moved since the previous board.
    const moves = prevBoard ? computeAnims(prevBoard, msg.board) : [];
    state = msg;
    if (msg.you !== undefined) you = msg.you;
    selected = null;
    renderState();
    for (const m of moves) spawnMoveAnim(m);
    prevBoard = msg.board;
  }
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const lobby = el('lobby'), hud = el('hud');

el('soloBtn').onclick = () => sendWs({ type: 'create', vsAI: true });
el('createBtn').onclick = () => sendWs({ type: 'create' });
el('joinBtn').onclick = () => {
  const code = el('codeInput').value.trim().toUpperCase();
  if (code.length === 4) sendWs({ type: 'join', code });
  else setLobbyMsg('Enter a 4-letter code.');
};
el('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('joinBtn').click(); });
el('rollBtn').onclick = () => sendWs({ type: 'roll' });
el('doubleBtn').onclick = () => sendWs({ type: 'double' });
el('takeBtn').onclick = () => sendWs({ type: 'respondDouble', accept: true });
el('dropBtn').onclick = () => sendWs({ type: 'respondDouble', accept: false });
el('newGameBtn').onclick = () => sendWs({ type: 'reset' });

function setLobbyMsg(m) { el('lobbyMsg').textContent = m || ''; }
function enterGame(code) {
  lobby.classList.add('hidden');
  hud.classList.remove('hidden');
  el('roomCode').textContent = code;
  el('youChip').textContent = you ? `You: ${you}` : 'Spectating';
}

let statusTimer = null;
function flashStatus(text) {
  el('statusMsg').textContent = text;
  clearTimeout(statusTimer);
}

function renderState() {
  if (!state) return;
  renderCheckers(state);

  // Turn chip.
  const turnChip = el('turnChip');
  if (state.status === 'waiting') {
    turnChip.textContent = state.players.white && state.players.black
      ? 'Starting…' : 'Waiting for opponent…';
  } else if (state.status === 'finished') {
    turnChip.textContent = `${seatName(state.winner)} wins`;
  } else {
    const mine = state.current === you;
    turnChip.textContent = mine ? 'Your turn'
      : state.current === state.ai ? 'Computer is thinking…'
      : `${state.current}'s turn`;
    turnChip.style.color = mine ? COLORS_hex(COLORS.select) : '';
  }

  // Dice.
  const dice = el('dice');
  dice.innerHTML = '';
  if (state.turn && state.status === 'playing') {
    const remaining = [...state.turn.remaining];
    for (const d of state.turn.dice) {
      const div = document.createElement('div');
      div.className = 'die';
      div.textContent = d;
      const ri = remaining.indexOf(d);
      if (ri >= 0) remaining.splice(ri, 1); else div.classList.add('used');
      dice.appendChild(div);
    }
  }

  // Score + cube chips.
  if (state.score) el('scoreChip').textContent = `${state.score.white} – ${state.score.black}`;
  if (state.cube) {
    const ownerTxt = !state.cube.owner ? 'center'
      : state.cube.owner === you ? 'yours' : state.cube.owner;
    el('cubeChip').textContent = `Cube ×${state.cube.value} (${ownerTxt})`;
  }
  updateCube(state);

  // Pip count chip.
  el('pipChip').textContent = `Pips  W ${pipCount(state.board, 'white')} · B ${pipCount(state.board, 'black')}`;

  // Action buttons: roll / double / take / drop.
  const pd = state.pendingDouble;
  const myDecision = pd && you && pd.by !== you && state.status === 'playing';
  const canRoll = state.status === 'playing' && state.current === you && !state.turn && !pd;
  const canDouble = canRoll && (!state.cube || !state.cube.owner || state.cube.owner === you);
  el('rollBtn').classList.toggle('hidden', !canRoll);
  el('doubleBtn').classList.toggle('hidden', !canDouble);
  el('doubleBtn').textContent = state.cube ? `Double to ${state.cube.value * 2}` : 'Double';
  el('takeBtn').classList.toggle('hidden', !myDecision);
  el('dropBtn').classList.toggle('hidden', !myDecision);

  // Status message — flag a disconnected opponent while the game is live.
  let statusText = state.message || '';
  if (you && state.status !== 'finished' && state.connected) {
    const opp = you === 'white' ? 'black' : 'white';
    if (state.players[opp] && !state.connected[opp]) {
      statusText = `Opponent (${opp}) disconnected — waiting for them to reconnect…`;
    }
  }
  el('statusMsg').textContent = statusText;

  // Win banner.
  const banner = el('winBanner');
  if (state.status === 'finished') {
    banner.classList.remove('hidden');
    banner.innerHTML = `${state.winner === you ? '🏆 You win!' : `${seatName(state.winner)} wins`}
      <small>Click “New game” to play again.</small>`;
  } else {
    banner.classList.add('hidden');
  }

  drawHighlights();
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
// Display name for a seat: the computer opponent is labelled "Computer".
function seatName(color) { return state && state.ai === color ? 'Computer' : cap(color); }
function COLORS_hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

// Pip count: total distance all a color's checkers must travel to bear off.
// White bears off past 0 (pip = point number); black past 25 (pip = 25 - p);
// a checker on the bar is 25 pips from home for either side.
function pipCount(board, color) {
  let s = board.bar[color] * 25;
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === color) s += (color === 'white' ? p : 25 - p) * c.count;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Move selection + highlights
// ---------------------------------------------------------------------------
function myLegal() {
  if (!state || state.status !== 'playing' || state.current !== you || !state.turn) return [];
  return state.legal || [];
}
function movableFroms() { return new Set(myLegal().map((m) => m.from)); }
function targetsFor(from) { return myLegal().filter((m) => m.from === from); }

function ringAt(x, z, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(CH_R * 1.1, 0.06, 12, 32),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, BOARD_TOP + 0.06, z);
  highlights.add(ring);
}

function pointAnchor(p) {
  // Where to draw a marker for a "from"/"to" location.
  if (p === 25) return { x: 0, z: 1.4 };            // white bar
  if (p === 0) return { x: 0, z: -1.4 };            // black bar (as source)
  const { x, z, near } = pointPos(p);
  return { x, z: z + (near ? -1 : 1) * 0.6 };
}

function drawHighlights() {
  highlights.clear();
  const froms = movableFroms();
  if (selected == null) {
    // Show every movable source.
    for (const f of froms) {
      const a = pointAnchor(f);
      ringAt(a.x, a.z, COLORS.highlight);
    }
  } else {
    const sa = pointAnchor(selected);
    ringAt(sa.x, sa.z, COLORS.select);
    for (const m of targetsFor(selected)) {
      if (m.to === 0 || m.to === 25) {
        ringAt(OFF_X, m.to === 0 ? 3.4 : -3.4, COLORS.highlight);
      } else {
        const { x, z, near } = pointPos(m.to);
        ringAt(x, z + (near ? -1 : 1) * 0.6, COLORS.highlight);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;

canvas.addEventListener('pointerdown', (e) => { downXY = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
  downXY = null;
  if (moved > 6) return; // was an orbit/pan drag, not a click
  handleClick(e);
});

function handleClick(e) {
  if (!state || state.current !== you || !state.turn) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return;
  const data = hits[0].object.userData;

  if (data.offTarget !== undefined) {
    if (selected != null) tryMove(selected, data.offTarget);
    return;
  }

  const p = data.point;
  const froms = movableFroms();
  if (selected == null) {
    if (froms.has(p)) { selected = p; drawHighlights(); }
  } else {
    const t = targetsFor(selected).find((m) => m.to === p);
    if (t) tryMove(selected, p);
    else if (froms.has(p)) { selected = p; drawHighlights(); }
    else { selected = null; drawHighlights(); }
  }
}

function tryMove(from, to) {
  sendWs({ type: 'move', from, to });
  selected = null;
  highlights.clear();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();
  stepAnims(dt);
  renderer.render(scene, camera);
}
animate();

connect();
