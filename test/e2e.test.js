// End-to-end tests: play complete games over the real WebSocket server and
// assert the whole flow holds together — legal-only moves, checker conservation
// on every broadcast board, a valid winner, and correct scoring.
//
// Set the AI pacing near zero so full computer games finish quickly. This must
// happen before the server module is imported, which is why it is at the very
// top (import side effects read these getters lazily at move time).
process.env.BG_AI_THINK_MS = '1';
process.env.BG_AI_MOVE_MS = '1';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  withServer, connect, countCheckers, assertConserved, playOneTurn, playHumanGame,
} from '../test-support/ws.mjs';

let url, closeServer;
before(async () => { const s = await withServer(); url = s.url; closeServer = s.close; });
after(async () => { await closeServer(); });

let open = [];
async function client() { const c = await connect(url); open.push(c); return c; }
after(() => { for (const c of open) try { c.close(); } catch {} });

// Every board the client ever saw must have 15 checkers per side and only
// non-negative counts.
function assertAllStatesValid(states) {
  for (const s of states) {
    assert.equal(countCheckers(s.board, 'white'), 15);
    assert.equal(countCheckers(s.board, 'black'), 15);
    assert.ok(s.board.bar.white >= 0 && s.board.bar.black >= 0);
    assert.ok(s.board.off.white >= 0 && s.board.off.black >= 0);
    assert.ok(s.board.off.white <= 15 && s.board.off.black <= 15);
  }
}

test('a full two-human game plays to a legal, conserved finish', async () => {
  const a = await client();
  a.send({ type: 'create' });
  const j = await a.waitForType('joined');
  const b = await client();
  b.send({ type: 'join', code: j.code });
  await b.waitForType('joined');
  await a.waitForState((st) => st.status === 'playing');

  const end = await playHumanGame(a, b, 90000);
  assert.equal(end.status, 'finished');
  assert.ok(end.winner === 'white' || end.winner === 'black');
  assert.equal(end.board.off[end.winner], 15, 'winner bore off all 15');
  assert.ok(end.score[end.winner] >= 1, 'winner scored points');
  assertConserved(assert, end.board, 'at finish');
  assertAllStatesValid(a.states);
  assertAllStatesValid(b.states);
});

test('a full game against the computer finishes with everything consistent', async () => {
  const a = await client();
  a.send({ type: 'create', vsAI: true });
  await a.waitForType('joined');
  await a.waitForState((st) => st.status === 'playing');

  const started = Date.now();
  while ((a.last.state?.status ?? 'playing') === 'playing' && Date.now() - started < 60000) {
    await playOneTurn(a, 'white');
  }
  const end = a.last.state;
  assert.equal(end.status, 'finished', 'AI game reached a finish');
  assert.ok(end.winner === 'white' || end.winner === 'black');
  assert.ok(end.score[end.winner] >= 1);
  assertConserved(assert, end.board, 'AI game finish');
  assertAllStatesValid(a.states);
});

test('the computer opponent wins most full games against a first-legal human', async () => {
  // The AI should comfortably beat a human that always plays the first legal
  // move. Play a few quick games and require it to win the majority.
  let aiWins = 0;
  const N = 3;
  for (let i = 0; i < N; i++) {
    const a = await client();
    a.send({ type: 'create', vsAI: true });
    await a.waitForType('joined');
    await a.waitForState((st) => st.status === 'playing');
    const started = Date.now();
    while ((a.last.state?.status ?? 'playing') === 'playing' && Date.now() - started < 60000) {
      await playOneTurn(a, 'white');
    }
    const end = a.last.state;
    assert.equal(end.status, 'finished');
    assertConserved(assert, end.board, `AI game ${i}`);
    if (end.winner === 'black') aiWins++; // black is the computer
    a.close();
  }
  assert.ok(aiWins >= 2, `computer won only ${aiWins}/${N} vs a first-legal human`);
});

test('reconnect mid-game preserves the position and lets play continue', async () => {
  const a = await client();
  a.send({ type: 'create' });
  const j = await a.waitForType('joined');
  const b = await client();
  b.send({ type: 'join', code: j.code });
  await b.waitForType('joined');
  await a.waitForState((st) => st.status === 'playing');

  // Play a handful of turns, then drop and reconnect white mid-game.
  for (let i = 0; i < 4; i++) {
    const s = a.last.state;
    if (s.status !== 'playing') break;
    await playOneTurn(s.current === 'white' ? a : b, s.current);
  }
  const boardBefore = JSON.stringify(a.last.state.board);
  a.close();
  await b.waitForState((st) => st.connected.white === false);

  const a2 = await connect(url); open.push(a2);
  a2.send({ type: 'rejoin', code: j.code, token: j.token });
  await a2.waitForType('joined');
  const s = await a2.waitForState((st) => st.you === 'white');
  assert.equal(JSON.stringify(s.board), boardBefore, 'position preserved across reconnect');

  // Finish the game to prove play continues after reconnect.
  const end = await playHumanGame(a2, b, 90000);
  assert.equal(end.status, 'finished');
  assertConserved(assert, end.board, 'after reconnect finish');
});
