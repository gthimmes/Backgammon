// Tests for the built-in AI: legal turn enumeration, tactical judgement, and a
// sanity check that it beats a random player convincingly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initBoard, applyMove, legalMoves, checkWinner, OPP } from '../server/backgammon.js';
import {
  generateTurns, evaluate, chooseTurn, pipCount, shouldTake, shouldDouble, _internal,
} from '../server/ai.js';

function makeBoard(points = {}, bar = {}, off = {}) {
  const b = { points: Array.from({ length: 26 }, () => null),
              bar: { white: 0, black: 0, ...bar },
              off: { white: 0, black: 0, ...off } };
  for (const [p, [color, count]] of Object.entries(points)) b.points[Number(p)] = { color, count };
  return b;
}
function countCheckers(board, color) {
  let n = board.bar[color] + board.off[color];
  for (let p = 1; p <= 24; p++) { const c = board.points[p]; if (c && c.color === color) n += c.count; }
  return n;
}
// Apply a whole chosen sequence to a board.
function applySeq(board, moves, player) {
  let b = board;
  for (const m of moves) b = applyMove(b, m, player);
  return b;
}

// ---- turn enumeration ------------------------------------------------------

test('generateTurns yields only maximal legal sequences', () => {
  const b = initBoard();
  const turns = generateTurns(b, 'white', [3, 1]);
  assert.ok(turns.length > 0);
  for (const t of turns) {
    // Both dice are playable from the opening position, so every turn uses two.
    assert.equal(t.moves.length, 2);
    assert.equal(countCheckers(t.board, 'white'), 15);
    assert.equal(countCheckers(t.board, 'black'), 15);
  }
});

test('generateTurns respects "must use both dice"', () => {
  // Single white checker on 24: 6 then 5 -> 24->18->13. Every enumerated turn
  // must play both dice (no one-die-only sequence).
  const b = makeBoard({ 24: ['white', 1] });
  const turns = generateTurns(b, 'white', [6, 5]);
  assert.ok(turns.length > 0);
  for (const t of turns) assert.equal(t.moves.length, 2);
});

test('generateTurns handles doubles (up to four moves)', () => {
  const b = makeBoard({ 13: ['white', 4] });
  const turns = generateTurns(b, 'white', [2, 2, 2, 2]);
  assert.ok(turns.length > 0);
  for (const t of turns) assert.equal(t.moves.length, 4);
});

// ---- tactical judgement ----------------------------------------------------

test('AI hits an exposed blot when it can', () => {
  // White on 8, black blot on 5. Dice 3-1. White 8->5 hits.
  const b = makeBoard({ 8: ['white', 2], 5: ['black', 1], 24: ['white', 1] });
  const { moves } = chooseTurn(b, 'white', [3, 1]);
  const after = applySeq(b, moves, 'white');
  assert.equal(after.bar.black, 1, 'black blot should be sent to the bar');
  assert.equal(after.points[5].color, 'white');
});

test('AI prefers a play that leaves no hittable blot when one is available', () => {
  // White has made points on 2 and 4 and a stack on 13; black sits on the
  // 1-point. With double 2s, moving four spares 13->11 keeps every point made
  // (13->7, 11->4-stack) and exposes nothing, whereas running a single checker
  // 13->11->9->7->5 would strand a blot. A sound AI takes the blot-free line.
  const b = makeBoard({ 2: ['white', 2], 4: ['white', 2], 13: ['white', 11], 1: ['black', 2] });
  const { moves } = chooseTurn(b, 'white', [2, 2, 2, 2]);
  const after = applySeq(b, moves, 'white');
  let hittableBlots = 0;
  for (let p = 1; p <= 24; p++) {
    const c = after.points[p];
    if (c && c.color === 'white' && c.count === 1 && _internal.hitProbability(after, p, 'white') > 0) hittableBlots++;
  }
  assert.equal(hittableBlots, 0, 'AI should leave no hittable blot when a safe line exists');
});

test('AI bears off when it can', () => {
  const b = makeBoard({ 6: ['white', 2], 5: ['white', 2], 4: ['white', 2] }, {}, { white: 9 });
  const { moves } = chooseTurn(b, 'white', [6, 5]);
  const after = applySeq(b, moves, 'white');
  assert.ok(after.off.white > 9, 'AI should bear off at least one checker');
});

// ---- evaluation sanity -----------------------------------------------------

test('evaluate favours being further along in the race', () => {
  const ahead = makeBoard({ 2: ['white', 2] }, {}, { white: 13, black: 0 });
  const behind = makeBoard({ 20: ['white', 2] }, {}, { white: 13, black: 0 });
  assert.ok(evaluate(ahead, 'white') > evaluate(behind, 'white'));
});

test('evaluate penalizes a hittable blot', () => {
  // Black moves low->high, so a black checker on 7 threatens white points above
  // it. Both boards have the same white pip (20) and checker counts; the only
  // difference is that `blot` exposes a white checker on 14 to black's 7.
  const safe = makeBoard({ 10: ['white', 2], 7: ['black', 2] });
  const blot = makeBoard({ 14: ['white', 1], 6: ['white', 1], 7: ['black', 2] });
  assert.ok(_internal.hitProbability(blot, 14, 'white') > 0);
  assert.ok(evaluate(safe, 'white') > evaluate(blot, 'white'));
});

test('shot counting finds a direct 3 plus combinations', () => {
  // Black checker on 13 hits a white blot on 16 (black moves 13->16). Direct
  // threes = 11/36; plus the 1+2 combination (2 rolls) through the open 14/15,
  // plus the 1-1-1 triple from double ones = 14/36 total.
  const b = makeBoard({ 16: ['white', 1], 13: ['black', 1] });
  const p = _internal.hitProbability(b, 16, 'white');
  assert.ok(Math.abs(p - 14 / 36) < 1e-9, `expected 14/36, got ${p}`);
});

// ---- cube heuristics -------------------------------------------------------

test('AI takes when close and drops when hopeless', () => {
  const close = { board: makeBoard({ 6: ['white', 2], 19: ['black', 2] }), cube: { value: 1, owner: null } };
  const hopeless = { board: makeBoard({ 24: ['white', 15] }, {}, { black: 12 }), cube: { value: 1, owner: null } };
  assert.equal(shouldTake(close, 'white'), true);
  assert.equal(shouldTake(hopeless, 'white'), false);
});

// ---- AI vs random: it should win convincingly ------------------------------

test('AI beats a random player in a strong majority of games', () => {
  let seed = 20260712;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const die = () => 1 + Math.floor(rand() * 6);

  function playGame(aiColor) {
    let board = initBoard();
    let player = rand() < 0.5 ? 'white' : 'black';
    let guard = 0;
    while (!checkWinner(board) && guard++ < 20000) {
      const d1 = die(), d2 = die();
      const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      if (player === aiColor) {
        const { moves } = chooseTurn(board, player, dice);
        board = applySeq(board, moves, player);
      } else {
        let remaining = [...dice];
        while (remaining.length) {
          const legal = legalMoves(board, player, remaining, dice);
          if (legal.length === 0) break;
          const mv = legal[Math.floor(rand() * legal.length)];
          board = applyMove(board, mv, player);
          const idx = remaining.indexOf(mv.die); if (idx >= 0) remaining.splice(idx, 1);
        }
      }
      player = OPP[player];
    }
    return checkWinner(board);
  }

  let aiWins = 0;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const aiColor = i % 2 === 0 ? 'white' : 'black';
    if (playGame(aiColor) === aiColor) aiWins++;
  }
  // A competent evaluator should crush a random mover; require a clear majority.
  assert.ok(aiWins >= 15, `AI won only ${aiWins}/${N} against random`);
});
