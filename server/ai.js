// Built-in Backgammon AI (fully local — no external services).
//
// Strategy: enumerate every legal *full-turn* move sequence for the rolled
// dice, apply each, and score the resulting position with a hand-crafted
// evaluation function. The evaluation blends the pip race with genuine
// tactical terms — blot exposure weighted by the opponent's real shot count,
// home-board and prime structure, defensive anchors, and bearing off — so the
// bot plays a strong positional game rather than just racing.

import { legalMoves, applyMove, checkWinner } from './backgammon.js';

const OPP = { white: 'black', black: 'white' };
const DIR = { white: -1, black: 1 };        // direction of travel toward home
const BAR_FROM = { white: 25, black: 0 };    // point a barred checker enters from

// ---------------------------------------------------------------------------
// Move-sequence enumeration
// ---------------------------------------------------------------------------

function boardSig(b) {
  let s = '';
  for (let p = 1; p <= 24; p++) {
    const c = b.points[p];
    s += c ? (c.color === 'white' ? 'w' : 'b') + c.count : '.';
    s += '|';
  }
  return s + `W${b.bar.white}B${b.bar.black}w${b.off.white}b${b.off.black}`;
}

// All maximal legal turn sequences: { moves: [...], board } (deduped by result).
export function generateTurns(board, player, dice) {
  const results = [];
  const seen = new Set();

  function recurse(b, remaining, moves) {
    const legal = legalMoves(b, player, remaining, dice);
    if (legal.length === 0) {
      const sig = boardSig(b);
      if (!seen.has(sig)) { seen.add(sig); results.push({ moves: moves.slice(), board: b }); }
      return;
    }
    for (const mv of legal) {
      const nb = applyMove(b, mv, player);
      const nr = remaining.slice();
      nr.splice(nr.indexOf(mv.die), 1);
      recurse(nb, nr, moves.concat(mv));
    }
  }

  recurse(board, dice.slice(), []);
  return results;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function pipCount(board, color) {
  let s = board.bar[color] * 25;
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === color) s += (color === 'white' ? p : 25 - p) * c.count;
  }
  return s;
}

// Can `attacker` land on point p? Blocked only by 2+ of the victim's checkers.
function landable(board, p, attacker) {
  if (p < 1 || p > 24) return false;
  const c = board.points[p];
  return !(c && c.color === OPP[attacker] && c.count >= 2);
}

// Fraction of the 36 dice rolls with which `attacker` can hit a blot at
// `target`, accounting for direct shots, two-die combinations through an open
// intermediate point, and doubles reaching further. Bar checkers must enter
// first (approximated: only the bar checker hits while on the bar).
function hitProbability(board, target, victim) {
  const attacker = OPP[victim];
  const dir = DIR[attacker];

  let sources;
  if (board.bar[attacker] > 0) {
    sources = [BAR_FROM[attacker]];
  } else {
    sources = [];
    for (let p = 1; p <= 24; p++) {
      const c = board.points[p];
      if (c && c.color === attacker) sources.push(p);
    }
  }
  // Distances (in the attacker's travel direction) from each source to target.
  const dists = [];
  for (const s of sources) {
    const d = dir * (target - s);
    if (d > 0) dists.push({ s, d });
  }
  if (dists.length === 0) return 0;

  let hits = 0;
  for (let i = 1; i <= 6; i++) {
    for (let j = 1; j <= 6; j++) {
      let hit = false;
      for (const { s, d } of dists) {
        if (i === d || j === d) { hit = true; break; }         // direct shot
        if (i + j === d) {                                      // combination
          if (landable(board, s + dir * i, attacker) || landable(board, s + dir * j, attacker)) { hit = true; break; }
        }
        if (i === j) {                                          // doubles reach further
          if (d === 3 * i && landable(board, s + dir * i, attacker) && landable(board, s + dir * 2 * i, attacker)) { hit = true; break; }
          if (d === 4 * i && landable(board, s + dir * i, attacker) && landable(board, s + dir * 2 * i, attacker) && landable(board, s + dir * 3 * i, attacker)) { hit = true; break; }
        }
      }
      if (hit) hits++;
    }
  }
  return hits / 36;
}

function inHome(color, p) {
  return color === 'white' ? (p >= 1 && p <= 6) : (p >= 19 && p <= 24);
}

// Longest run of consecutive points made (2+ checkers) by `color` — a prime.
function longestPrime(board, color) {
  let best = 0, run = 0;
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === color && c.count >= 2) { run++; best = Math.max(best, run); }
    else run = 0;
  }
  return best;
}

// Position score from `me`'s perspective (higher is better).
export function evaluate(board, me) {
  const opp = OPP[me];
  const win = checkWinner(board);
  if (win === me) return 1e6;
  if (win === opp) return -1e6;

  const pipMe = pipCount(board, me);
  const pipOpp = pipCount(board, opp);

  let score = 0;
  score += (pipOpp - pipMe) * 1.0;                       // the race
  score += (board.off[me] - board.off[opp]) * 18;        // borne off is decisive
  score += (board.bar[opp] - board.bar[me]) * 9;         // stuck on the bar

  // Blot exposure: penalize each of my blots by how likely it is to be hit and
  // how many pips that would cost.
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (!c || c.color !== me || c.count !== 1) continue;
    const prob = hitProbability(board, p, me);
    if (prob === 0) continue;
    const pipLoss = me === 'white' ? 25 - p : p;         // extra pips if sent to the bar
    score -= prob * (pipLoss * 0.55 + 4.5);
  }

  // Home-board points and primes make it hard for the opponent to move/enter.
  let homePoints = 0;
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (!c || c.color !== me || c.count < 2) continue;
    if (inHome(me, p)) homePoints += 1;
  }
  score += homePoints * 3.5;
  score += longestPrime(board, me) * 1.6;

  // Defensive anchor in the opponent's home board.
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === me && c.count >= 2 && inHome(opp, p)) score += 4;
  }

  // Mild penalty for burying too many checkers on a single point (>3).
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === me && c.count > 3) score -= (c.count - 3) * 0.6;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Turn choice
// ---------------------------------------------------------------------------

// Pick the best full-turn sequence for the rolled dice. Returns { moves }.
export function chooseTurn(board, player, dice) {
  const turns = generateTurns(board, player, dice);
  if (turns.length === 0) return { moves: [] };
  let best = turns[0], bestScore = -Infinity;
  for (const t of turns) {
    const s = evaluate(t.board, player);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return { moves: best.moves };
}

// ---------------------------------------------------------------------------
// Doubling cube decisions (rough race-based equity — conservative on purpose)
// ---------------------------------------------------------------------------

function winProbability(board, me) {
  const pm = pipCount(board, me);
  const po = pipCount(board, OPP[me]);
  if (board.off[me] === 15) return 1;
  if (board.off[OPP[me]] === 15) return 0;
  const diff = po - pm;                     // positive = I'm ahead in the race
  const scale = Math.max(6, (pm + po) * 0.09);
  const p = 1 / (1 + Math.exp(-diff / scale));
  return Math.min(0.97, Math.max(0.03, p));
}

// Offer a double only from a clear-but-not-overwhelming lead (a real doubling
// window), and only if we may (centered cube or we own it).
export function shouldDouble(game, me) {
  const cube = game.cube;
  if (cube.owner !== null && cube.owner !== me) return false;
  const wp = winProbability(game.board, me);
  return wp >= 0.70 && wp <= 0.85;
}

// Take unless the position is worse than the ~25% take point.
export function shouldTake(game, me) {
  return winProbability(game.board, me) >= 0.24;
}

export const _internal = { hitProbability, winProbability, landable, longestPrime };
