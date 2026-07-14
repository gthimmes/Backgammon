// Shared helpers for server integration / end-to-end tests.
// Starts the real server in-process on an OS-assigned port and provides a
// small WebSocket client with promise-based waiting so tests are deterministic
// despite random dice and the AI's timer-paced moves.
import { WebSocket } from 'ws';
import { startServer } from '../server/index.js';
import { legalMoves, applyMove, checkWinner, OPP } from '../server/backgammon.js';

export async function withServer() {
  const handle = await startServer(0);
  const url = `ws://127.0.0.1:${handle.port}`;
  return { url, port: handle.port, close: handle.close };
}

export function mkClient(url) {
  const ws = new WebSocket(url);
  const c = { ws, last: {}, states: [], _waiters: [] };
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    c.last[m.type] = m;
    if (m.type === 'state') c.states.push(m);
    c._waiters = c._waiters.filter((w) => {
      if (w.pred(m)) { w.resolve(m); return false; }
      return true;
    });
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.close = () => ws.close();
  c.open = () => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  c.waitFor = (pred, ms = 10000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('waitFor timeout')), ms);
    c._waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
  c.waitForState = (spred, ms) => {
    if (c.last.state && spred(c.last.state)) return Promise.resolve(c.last.state);
    return c.waitFor((m) => m.type === 'state' && spred(m), ms);
  };
  c.waitForType = (type, ms) => {
    if (c.last[type]) return Promise.resolve(c.last[type]);
    return c.waitFor((m) => m.type === type, ms);
  };
  return c;
}

export async function connect(url) {
  const c = mkClient(url);
  await c.open();
  return c;
}

// Count a color's checkers across points + bar + off (conservation invariant).
export function countCheckers(board, color) {
  let n = board.bar[color] + board.off[color];
  for (let p = 1; p <= 24; p++) {
    const cell = board.points[p];
    if (cell && cell.color === color) n += cell.count;
  }
  return n;
}

// Assert a board is internally consistent: 15 checkers per side, non-negative.
export function assertConserved(assert, board, note = '') {
  assert.equal(countCheckers(board, 'white'), 15, `white checkers conserved ${note}`);
  assert.equal(countCheckers(board, 'black'), 15, `black checkers conserved ${note}`);
}

// Drive a seated client through one full turn when it is their move: roll if
// needed, then play legal moves until the turn ends. Uses only server-provided
// legal moves (so any illegal choice would be a server bug). Returns when it is
// no longer this client's turn or the game is finished.
export async function playOneTurn(c, color) {
  // Ensure we have an up-to-date state.
  let s = c.last.state;
  if (!s) s = await c.waitForType('state');

  // Wait until it's our move (or the game ends / a decision is needed).
  s = await c.waitForState((st) =>
    st.status !== 'playing' ||
    (st.current === color) ||
    (st.pendingDouble && st.pendingDouble.by !== color));
  if (s.status !== 'playing') return s;

  // Respond to an incoming double by taking (keeps games going).
  if (s.pendingDouble && s.pendingDouble.by !== color) {
    c.send({ type: 'respondDouble', accept: true });
    return c.waitForState((st) => st.status !== 'playing' || !st.pendingDouble);
  }
  if (s.current !== color) return s;

  if (!s.turn) {
    c.send({ type: 'roll' });
    s = await c.waitForState((st) => st.status !== 'playing' || st.current !== color || !!st.turn);
    if (s.status !== 'playing' || s.current !== color) return s; // auto-passed / ended
  }

  // Play legal moves until the turn passes to the opponent or the game ends.
  let guard = 0;
  while (s.status === 'playing' && s.current === color && s.turn && guard++ < 12) {
    const legal = s.legal || [];
    if (legal.length === 0) break;
    const mv = legal[0];
    c.send({ type: 'move', from: mv.from, to: mv.to });
    // Wait for the *next* broadcast (the result of this move), not the stale one.
    s = await c.waitFor((m) => m.type === 'state');
  }
  return c.last.state;
}

// Play a two-human game to completion by alternating turn drivers. `white` is
// used as the clock; after each turn we wait for it to catch up so the next
// mover is chosen from a fresh state (clients can lag one broadcast apart).
export async function playHumanGame(white, black, timeoutMs = 60000) {
  const started = Date.now();
  while ((white.last.state?.status ?? 'playing') === 'playing' && Date.now() - started < timeoutMs) {
    const color = white.last.state.current;
    const mover = color === 'white' ? white : black;
    await playOneTurn(mover, color);
    // Ensure the clock reflects that `color`'s turn is over before re-selecting.
    await white.waitForState((st) => st.status !== 'playing' || st.current !== color);
  }
  return white.last.state;
}

// Reference: compute the full set of legal (from,to) pairs a client should be
// offered, straight from the engine — used to cross-check server `legal`.
export function engineLegal(board, player, turn) {
  if (!turn) return [];
  return legalMoves(board, player, turn.remaining, turn.dice)
    .map((m) => `${m.from}->${m.to}`)
    .sort();
}

export { legalMoves, applyMove, checkWinner, OPP };
