// Integration tests: exercise the real WebSocket server end to end (in-process,
// on an OS-assigned port) covering matchmaking, turn flow, move validation, the
// doubling cube, reconnect, and single-player AI wiring.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  withServer, connect, assertConserved, playOneTurn, engineLegal,
} from '../test-support/ws.mjs';

let url, closeServer;
before(async () => { const s = await withServer(); url = s.url; closeServer = s.close; });
after(async () => { await closeServer(); });

// Track clients per test so we can close them even on failure.
let open = [];
beforeEach(() => { for (const c of open) try { c.close(); } catch {} open = []; });
async function client() { const c = await connect(url); open.push(c); return c; }

// Create a started 2-player room; returns { a, b, code, first, white, black }.
async function startedRoom() {
  const a = await client();
  a.send({ type: 'create' });
  const j = await a.waitForType('joined');
  const b = await client();
  b.send({ type: 'join', code: j.code });
  await b.waitForType('joined');
  const s = await a.waitForState((st) => st.status === 'playing');
  return { a, b, code: j.code, first: s.current, white: a, black: b };
}

// Get a room to a clean pre-roll decision point for the *second* player (a
// legal moment to double), by playing out the opening player's turn.
async function roomReadyToDouble() {
  const r = await startedRoom();
  const openerColor = r.first;
  const opener = openerColor === 'white' ? r.white : r.black;
  await playOneTurn(opener, openerColor);
  const s = r.a.last.state;
  const doubler = s.current;
  return { ...r, doubler, doublerC: doubler === 'white' ? r.white : r.black,
    responderC: doubler === 'white' ? r.black : r.white };
}

// ---- matchmaking -----------------------------------------------------------

test('create assigns white with a token and a waiting room', async () => {
  const a = await client();
  a.send({ type: 'create' });
  const j = await a.waitForType('joined');
  assert.equal(j.color, 'white');
  assert.ok(j.code && j.code.length === 4);
  assert.ok(j.token);
  const s = await a.waitForType('state');
  assert.equal(s.status, 'waiting');
  assert.equal(s.players.white, true);
  assert.equal(s.players.black, false);
});

test('join fills black and starts the game with an opening roll', async () => {
  const { a } = await startedRoom();
  const s = a.last.state;
  assert.equal(s.status, 'playing');
  assert.ok(s.current === 'white' || s.current === 'black');
  assert.ok(s.turn && s.turn.dice.length === 2);
  assert.notEqual(s.turn.dice[0], s.turn.dice[1], 'opening roll is never doubles');
  assert.equal(s.players.white && s.players.black, true);
  assertConserved(assert, s.board, 'at game start');
});

test('joining a full room makes a spectator', async () => {
  const { code } = await startedRoom();
  const spec = await client();
  spec.send({ type: 'join', code });
  const j = await spec.waitForType('joined');
  assert.equal(j.color, null); // spectating
});

test('joining an unknown code returns a no-room error', async () => {
  const a = await client();
  a.send({ type: 'join', code: 'ZZZZ' });
  const e = await a.waitForType('error');
  assert.equal(e.code, 'no-room');
});

test('the server offers exactly the engine-legal moves', async () => {
  const { a } = await startedRoom();
  const s = a.last.state;
  const offered = (s.legal || []).map((m) => `${m.from}->${m.to}`).sort();
  const expected = engineLegal(s.board, s.current, s.turn);
  assert.deepEqual(offered, expected);
});

// ---- move validation & turn flow ------------------------------------------

test('a legal move applies, consumes its die, and syncs both clients', async () => {
  const { a, b, first } = await startedRoom();
  const mover = first === 'white' ? a : b;
  const other = first === 'white' ? b : a;
  const s = mover.last.state;
  const mv = s.legal[0];
  const before = s.board.points[mv.from].count;
  mover.send({ type: 'move', from: mv.from, to: mv.to });

  const s2 = await mover.waitForState((st) => st.board.points[mv.from]?.count !== before || st.current !== first);
  // Source lost a checker (or emptied).
  assert.ok((s2.board.points[mv.from]?.count ?? 0) === before - 1);
  assertConserved(assert, s2.board, 'after one move');
  // Opponent sees the same board.
  const so = await other.waitForState((st) => JSON.stringify(st.board) === JSON.stringify(s2.board));
  assert.deepEqual(so.board, s2.board);
});

test('an illegal move is rejected with an error and no state change', async () => {
  const { a, b, first } = await startedRoom();
  const mover = first === 'white' ? a : b;
  const boardBefore = JSON.stringify(mover.last.state.board);
  // Point 15 is empty in the opening position, so no move can originate there —
  // illegal regardless of which color is on roll or what was rolled.
  mover.send({ type: 'move', from: 15, to: 14 });
  const e = await mover.waitForType('error');
  assert.match(e.message, /illegal/i);
  assert.equal(JSON.stringify(mover.last.state.board), boardBefore);
});

test('a move from the player not on roll is ignored', async () => {
  const { a, b, first } = await startedRoom();
  const idle = first === 'white' ? b : a; // not on roll
  const boardBefore = JSON.stringify(idle.last.state.board);
  idle.send({ type: 'move', from: 24, to: 23 });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(JSON.stringify(idle.last.state.board), boardBefore);
});

test('rolling when it is not your turn is ignored', async () => {
  const { a, b, first } = await startedRoom();
  const idle = first === 'white' ? b : a;
  const turnBefore = JSON.stringify(idle.last.state.turn);
  idle.send({ type: 'roll' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(JSON.stringify(idle.last.state.turn), turnBefore);
});

// ---- doubling cube ---------------------------------------------------------

test('cube starts centered at 1 and the score at 0-0', async () => {
  const { a } = await startedRoom();
  const s = a.last.state;
  assert.deepEqual(s.cube, { value: 1, owner: null });
  assert.deepEqual(s.score, { white: 0, black: 0 });
});

test('double cannot be offered mid-roll (dice already assigned)', async () => {
  const { a, b, first } = await startedRoom();
  const opener = first === 'white' ? a : b; // already holds the opening dice
  opener.send({ type: 'double' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(opener.last.state.cube.value, 1);
  assert.equal(opener.last.state.pendingDouble, null);
});

test('double then take doubles the cube and passes ownership', async () => {
  const { doubler, doublerC, responderC } = await roomReadyToDouble();
  doublerC.send({ type: 'double' });
  await responderC.waitForState((st) => st.pendingDouble && st.pendingDouble.by === doubler);

  // The doubler cannot answer their own offer.
  doublerC.send({ type: 'respondDouble', accept: true });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(doublerC.last.state.cube.value, 1);

  responderC.send({ type: 'respondDouble', accept: true });
  const taker = doubler === 'white' ? 'black' : 'white';
  const s = await doublerC.waitForState((st) => st.cube.value === 2);
  assert.equal(s.cube.owner, taker);
  assert.equal(s.pendingDouble, null);
  assert.equal(s.current, doubler); // turn returns to the doubler
});

test('double then drop ends the game and awards the pre-double stake', async () => {
  const { doubler, doublerC, responderC } = await roomReadyToDouble();
  doublerC.send({ type: 'double' });
  await responderC.waitForState((st) => st.pendingDouble);
  responderC.send({ type: 'respondDouble', accept: false });
  const s = await doublerC.waitForState((st) => st.status === 'finished');
  assert.equal(s.winner, doubler);
  assert.equal(s.score[doubler], 1);
});

test('reset clears the board but preserves the match score', async () => {
  const { doubler, doublerC, responderC } = await roomReadyToDouble();
  doublerC.send({ type: 'double' });
  await responderC.waitForState((st) => st.pendingDouble);
  responderC.send({ type: 'respondDouble', accept: false });
  await doublerC.waitForState((st) => st.status === 'finished');

  doublerC.send({ type: 'reset' });
  const s = await doublerC.waitForState((st) => st.status === 'playing');
  assert.equal(s.score[doubler], 1, 'score preserved across reset');
  assert.deepEqual(s.cube, { value: 1, owner: null }, 'cube recentered');
  assertConserved(assert, s.board, 'after reset');
});

// ---- reconnect -------------------------------------------------------------

test('a disconnected seat is held and can be reclaimed with its token', async () => {
  const a = await client();
  a.send({ type: 'create' });
  const j = await a.waitForType('joined');
  const b = await client();
  b.send({ type: 'join', code: j.code });
  await b.waitForType('joined');
  await a.waitForState((st) => st.status === 'playing');
  const boardBefore = JSON.stringify(a.last.state.board);

  a.close();
  await b.waitForState((st) => st.connected.white === false && st.players.white === true);

  const a2 = await client();
  a2.send({ type: 'rejoin', code: j.code, token: j.token });
  const rj = await a2.waitForType('joined');
  assert.equal(rj.color, 'white');
  const s = await a2.waitForState((st) => st.you === 'white');
  assert.equal(JSON.stringify(s.board), boardBefore, 'board preserved across reconnect');
  await b.waitForState((st) => st.connected.white === true);
});

test('rejoin with a bad token is rejected', async () => {
  const { code } = await startedRoom();
  const c = await client();
  c.send({ type: 'rejoin', code, token: 'not-a-real-token' });
  const e = await c.waitForType('error');
  assert.equal(e.code, 'bad-token');
});

// ---- single-player AI ------------------------------------------------------

test('creating a vs-computer game seats the AI and starts immediately', async () => {
  const a = await client();
  a.send({ type: 'create', vsAI: true });
  await a.waitForType('joined');
  const s = await a.waitForState((st) => st.status === 'playing');
  assert.equal(s.ai, 'black');
  assert.equal(s.players.black, true);
  assert.equal(s.connected.black, true, 'AI seat reports as connected');
});

test('the computer takes its turn without any client action', async () => {
  const a = await client();
  a.send({ type: 'create', vsAI: true });
  await a.waitForType('joined');
  let s = await a.waitForState((st) => st.status === 'playing');

  if (s.current === 'black') {
    // AI is on roll first — it should play and hand the turn back on its own.
    s = await a.waitForState((st) => st.current === 'white', 15000);
    assert.equal(s.current, 'white');
  } else {
    // Human first: play our turn, then the AI must respond by itself.
    await playOneTurn(a, 'white');
    s = await a.waitForState((st) => st.current === 'black' || st.status !== 'playing');
    // After the AI acts it returns the turn to us (or the game moves on).
    s = await a.waitForState((st) => st.current === 'white' || st.status !== 'playing', 15000);
  }
  assertConserved(assert, a.last.state.board, 'during AI game');
});
