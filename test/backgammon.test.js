// Unit tests for the pure rules engine. Run with `npm test`.
// Uses Node's built-in test runner — no extra dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initBoard, singleMoves, applyMove, maxMoves, legalMoves,
  canBearOff, checkWinner, OPP,
} from '../server/backgammon.js';

// ---- helpers ---------------------------------------------------------------

// Build a sparse board from a compact spec for readable test setups.
//   points: { [pointNumber]: [color, count] }
function makeBoard(points = {}, bar = {}, off = {}) {
  const b = { points: Array.from({ length: 26 }, () => null),
              bar: { white: 0, black: 0, ...bar },
              off: { white: 0, black: 0, ...off } };
  for (const [p, [color, count]] of Object.entries(points)) {
    b.points[Number(p)] = { color, count };
  }
  return b;
}

// Count all checkers of a color across points + bar + off (conservation check).
function countCheckers(board, color) {
  let n = board.bar[color] + board.off[color];
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === color) n += c.count;
  }
  return n;
}

// ---- initial position ------------------------------------------------------

test('initBoard has 15 checkers per side in standard position', () => {
  const b = initBoard();
  assert.equal(countCheckers(b, 'white'), 15);
  assert.equal(countCheckers(b, 'black'), 15);
  assert.equal(b.points[24].count, 2);
  assert.equal(b.points[13].count, 5);
  assert.equal(b.points[8].count, 3);
  assert.equal(b.points[6].count, 5);
  assert.deepEqual(b.bar, { white: 0, black: 0 });
  assert.deepEqual(b.off, { white: 0, black: 0 });
});

test('OPP maps colors to opponents', () => {
  assert.equal(OPP.white, 'black');
  assert.equal(OPP.black, 'white');
});

// ---- direction & basic movement -------------------------------------------

test('white moves from high points toward 1', () => {
  const b = makeBoard({ 13: ['white', 1] });
  const moves = singleMoves(b, 'white', 3);
  assert.ok(moves.some((m) => m.from === 13 && m.to === 10));
});

test('black moves from low points toward 24', () => {
  const b = makeBoard({ 5: ['black', 1] });
  const moves = singleMoves(b, 'black', 4);
  assert.ok(moves.some((m) => m.from === 5 && m.to === 9));
});

test('a point with 2+ opponent checkers is blocked', () => {
  const b = makeBoard({ 13: ['white', 1], 10: ['black', 2] });
  const moves = singleMoves(b, 'white', 3);
  assert.ok(!moves.some((m) => m.to === 10));
});

test('a point with a single opponent checker is a hittable blot', () => {
  const b = makeBoard({ 13: ['white', 1], 10: ['black', 1] });
  const moves = singleMoves(b, 'white', 3);
  const mv = moves.find((m) => m.from === 13 && m.to === 10);
  assert.ok(mv);
  assert.equal(mv.hit, true);
});

// ---- hitting ---------------------------------------------------------------

test('applyMove sends a hit checker to the bar', () => {
  const b = makeBoard({ 13: ['white', 1], 10: ['black', 1] });
  const mv = singleMoves(b, 'white', 3).find((m) => m.to === 10);
  const after = applyMove(b, mv, 'white');
  assert.equal(after.bar.black, 1);
  assert.equal(after.points[10].color, 'white');
  assert.equal(after.points[10].count, 1);
  assert.equal(after.points[13], null);
  // conservation still holds
  assert.equal(countCheckers(after, 'white'), 1);
  assert.equal(countCheckers(after, 'black'), 1);
});

test('applyMove does not mutate the input board', () => {
  const b = makeBoard({ 13: ['white', 2] });
  const snapshot = JSON.stringify(b);
  const mv = singleMoves(b, 'white', 3).find((m) => m.from === 13);
  applyMove(b, mv, 'white');
  assert.equal(JSON.stringify(b), snapshot);
});

// ---- bar re-entry ----------------------------------------------------------

test('a checker on the bar must re-enter before anything else moves', () => {
  const b = makeBoard({ 13: ['white', 1] }, { white: 1 });
  const moves = singleMoves(b, 'white', 3);
  // Only the bar re-entry (to 25-3 = 22) should be offered.
  assert.ok(moves.every((m) => m.fromBar));
  assert.ok(moves.some((m) => m.to === 22));
});

test('white re-enters from point 25, black from point 0', () => {
  const w = makeBoard({}, { white: 1 });
  assert.ok(singleMoves(w, 'white', 6).some((m) => m.from === 25 && m.to === 19));
  const bl = makeBoard({}, { black: 1 });
  assert.ok(singleMoves(bl, 'black', 6).some((m) => m.from === 0 && m.to === 6));
});

test('bar re-entry is blocked by a made opponent point', () => {
  const b = makeBoard({ 22: ['black', 2] }, { white: 1 });
  // die 3 would enter on 22 which is blocked; die 4 enters on 21 which is open.
  assert.equal(singleMoves(b, 'white', 3).length, 0);
  assert.ok(singleMoves(b, 'white', 4).some((m) => m.to === 21));
});

test('applyMove decrements the bar on re-entry', () => {
  const b = makeBoard({}, { white: 2 });
  const mv = singleMoves(b, 'white', 6).find((m) => m.fromBar);
  const after = applyMove(b, mv, 'white');
  assert.equal(after.bar.white, 1);
  assert.equal(after.points[19].count, 1);
});

// ---- bearing off -----------------------------------------------------------

test('canBearOff is false while any checker is outside the home board', () => {
  assert.equal(canBearOff(makeBoard({ 6: ['white', 1], 8: ['white', 1] }), 'white'), false);
  assert.equal(canBearOff(makeBoard({ 6: ['white', 1] }), 'white'), true);
});

test('canBearOff is false with a checker on the bar', () => {
  assert.equal(canBearOff(makeBoard({ 6: ['white', 1] }, { white: 1 }), 'white'), false);
});

test('exact bear-off is offered', () => {
  const b = makeBoard({ 3: ['white', 1] });
  const mv = singleMoves(b, 'white', 3).find((m) => m.bearOff);
  assert.ok(mv);
  assert.equal(mv.to, 0);
});

test('overflow bear-off only from the highest occupied point', () => {
  // White on 4 and 2. A 6 can bear off from 4 (highest), not from 2.
  const b = makeBoard({ 4: ['white', 1], 2: ['white', 1] });
  const moves = singleMoves(b, 'white', 6);
  assert.ok(moves.some((m) => m.from === 4 && m.bearOff));
  assert.ok(!moves.some((m) => m.from === 2 && m.bearOff));
});

test('overflow bear-off refused from a lower point when a higher one exists', () => {
  // White on 6 and 3. A 5 cannot bear off the 3 (it must move 3->? no; 5 from 3
  // overflows but 6 is higher and occupied), and cannot overflow-bear the 6
  // either (5 < 6 distance, so 6 just would need exact). Only in-board move: none from 3.
  const b = makeBoard({ 6: ['white', 2], 3: ['white', 1] });
  const moves = singleMoves(b, 'white', 5);
  assert.ok(!moves.some((m) => m.bearOff));
});

test('applyMove bears a checker off', () => {
  const b = makeBoard({ 3: ['white', 1] });
  const mv = singleMoves(b, 'white', 3).find((m) => m.bearOff);
  const after = applyMove(b, mv, 'white');
  assert.equal(after.off.white, 1);
  assert.equal(after.points[3], null);
});

test('black bears off past 25', () => {
  const b = makeBoard({ 22: ['black', 1] });
  const mv = singleMoves(b, 'black', 3).find((m) => m.bearOff);
  assert.ok(mv);
  assert.equal(mv.to, 25);
});

// ---- max dice usage & forced moves ----------------------------------------

test('maxMoves counts how many dice can be used', () => {
  const b = makeBoard({ 13: ['white', 2] });
  assert.equal(maxMoves(b, 'white', [3, 4]), 2);
});

test('doubles give up to four moves', () => {
  const b = makeBoard({ 13: ['white', 4] });
  assert.equal(maxMoves(b, 'white', [2, 2, 2, 2]), 4);
});

test('must use both dice when a sequence exists', () => {
  // White on 24 only. dice 6 then 5: 24->18->13 uses both. A lone 6 that
  // strands the 5 must not be offered as a complete option.
  const b = makeBoard({ 24: ['white', 1] });
  assert.equal(maxMoves(b, 'white', [6, 5]), 2);
  const legal = legalMoves(b, 'white', [6, 5], [6, 5]);
  // every offered first move must belong to a 2-move sequence
  for (const mv of legal) {
    const rest = mv.die === 6 ? [5] : [6];
    assert.equal(maxMoves(applyMove(b, mv, 'white'), 'white', rest), 1);
  }
});

test('must play the larger die when only one of two is playable', () => {
  // White single checker on 13. Die 1 -> 12 is blocked by a black point;
  // die 4 -> 9 is open. Only one die is usable, so the rule forces the larger.
  const b = makeBoard({ 13: ['white', 1], 12: ['black', 2] });
  const legal = legalMoves(b, 'white', [1, 4], [1, 4]);
  assert.ok(legal.length > 0);
  assert.ok(legal.every((m) => m.die === 4));
});

// ---- winner ----------------------------------------------------------------

test('checkWinner detects 15 borne off', () => {
  assert.equal(checkWinner(makeBoard({}, {}, { white: 15 })), 'white');
  assert.equal(checkWinner(makeBoard({}, {}, { black: 15 })), 'black');
  assert.equal(checkWinner(initBoard()), null);
});

// ---- integration: a full random game terminates and conserves checkers -----

test('a full self-played game bears someone off with checkers conserved', () => {
  // Deterministic PRNG so the test is reproducible.
  let seed = 123456789;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const die = () => 1 + Math.floor(rand() * 6);

  let board = initBoard();
  let player = rand() < 0.5 ? 'white' : 'black';
  let guard = 0;

  while (!checkWinner(board) && guard++ < 100000) {
    const d1 = die(), d2 = die();
    const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    let remaining = [...dice];

    while (remaining.length) {
      const legal = legalMoves(board, player, remaining, dice);
      if (legal.length === 0) break;
      const mv = legal[Math.floor(rand() * legal.length)];
      board = applyMove(board, mv, player);
      const idx = remaining.indexOf(mv.die);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    player = OPP[player];

    // Invariant: checkers are always conserved.
    assert.equal(countCheckers(board, 'white'), 15);
    assert.equal(countCheckers(board, 'black'), 15);
  }

  assert.ok(checkWinner(board), 'game should reach a winner');
});
