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
    state = msg;
    if (msg.you !== undefined) you = msg.you;
    selected = null;
    renderState();
  }
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const lobby = el('lobby'), hud = el('hud');

el('createBtn').onclick = () => sendWs({ type: 'create' });
el('joinBtn').onclick = () => {
  const code = el('codeInput').value.trim().toUpperCase();
  if (code.length === 4) sendWs({ type: 'join', code });
  else setLobbyMsg('Enter a 4-letter code.');
};
el('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('joinBtn').click(); });
el('rollBtn').onclick = () => sendWs({ type: 'roll' });
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
    turnChip.textContent = `${state.winner} wins`;
  } else {
    const mine = state.current === you;
    turnChip.textContent = mine ? 'Your turn' : `${state.current}'s turn`;
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

  // Roll button.
  const canRoll = state.status === 'playing' && state.current === you && !state.turn;
  el('rollBtn').classList.toggle('hidden', !canRoll);

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
    banner.innerHTML = `${state.winner === you ? '🏆 You win!' : `${cap(state.winner)} wins`}
      <small>Click “New game” to play again.</small>`;
  } else {
    banner.classList.add('hidden');
  }

  drawHighlights();
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function COLORS_hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

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
  controls.update();
  renderer.render(scene, camera);
}
animate();

connect();
