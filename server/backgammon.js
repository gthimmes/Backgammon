// Backgammon rules engine (authoritative, server-side).
//
// Board model:
//   points[1..24]  -> null | { color: 'white'|'black', count: number }
//   bar[color]     -> checkers hit and waiting to re-enter
//   off[color]     -> checkers borne off
//
// Movement conventions (chosen so the two colors are perfect mirrors):
//   white moves from high-numbered points toward 1 and bears off past 0.
//   black moves from low-numbered points toward 24 and bears off past 25.
//   white home board = points 1..6, black home board = points 19..24.
//   A checker on the bar re-enters from point 25 (white) / point 0 (black).

export const OPP = { white: 'black', black: 'white' };
const DIR = { white: -1, black: 1 };
const BAR_FROM = { white: 25, black: 0 };
const OFF_TO = { white: 0, black: 25 };

export function initBoard() {
  const points = Array.from({ length: 26 }, () => null);
  const set = (i, color, count) => { points[i] = { color, count }; };
  // White checkers (move toward point 1).
  set(24, 'white', 2);
  set(13, 'white', 5);
  set(8, 'white', 3);
  set(6, 'white', 5);
  // Black checkers, mirror image (move toward point 24).
  set(1, 'black', 2);
  set(12, 'black', 5);
  set(17, 'black', 3);
  set(19, 'black', 5);
  return { points, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } };
}

function inHome(player, p) {
  return player === 'white' ? p >= 1 && p <= 6 : p >= 19 && p <= 24;
}

function isBlocked(board, to, player) {
  const dest = board.points[to];
  return !!dest && dest.color === OPP[player] && dest.count >= 2;
}

export function canBearOff(board, player) {
  if (board.bar[player] > 0) return false;
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (c && c.color === player && !inHome(player, p)) return false;
  }
  return true;
}

// All single-checker moves available for one die value.
export function singleMoves(board, player, d) {
  const moves = [];

  // Bar checkers must re-enter before anything else can move.
  if (board.bar[player] > 0) {
    const to = BAR_FROM[player] + DIR[player] * d; // white 25-d, black 0+d
    if (to >= 1 && to <= 24 && !isBlocked(board, to, player)) {
      const dest = board.points[to];
      moves.push({
        from: BAR_FROM[player],
        to,
        die: d,
        hit: !!dest && dest.color === OPP[player] && dest.count === 1,
        fromBar: true,
      });
    }
    return moves;
  }

  const bearing = canBearOff(board, player);
  for (let p = 1; p <= 24; p++) {
    const c = board.points[p];
    if (!c || c.color !== player) continue;
    const to = p + DIR[player] * d;

    if (to >= 1 && to <= 24) {
      if (!isBlocked(board, to, player)) {
        const dest = board.points[to];
        moves.push({
          from: p, to, die: d,
          hit: !!dest && dest.color === OPP[player] && dest.count === 1,
        });
      }
      continue;
    }

    // Off the board edge -> potential bear-off.
    if (!bearing) continue;
    const exact = to === OFF_TO[player];
    if (exact) {
      moves.push({ from: p, to: OFF_TO[player], die: d, bearOff: true });
    } else {
      // Overflow (die larger than distance): only legal from the highest
      // occupied point in the home board.
      let higher = false;
      if (player === 'white') {
        for (let q = p + 1; q <= 6; q++) if (board.points[q]?.color === 'white') { higher = true; break; }
      } else {
        for (let q = p - 1; q >= 19; q--) if (board.points[q]?.color === 'black') { higher = true; break; }
      }
      if (!higher) moves.push({ from: p, to: OFF_TO[player], die: d, bearOff: true });
    }
  }
  return moves;
}

export function applyMove(board, mv, player) {
  const b = structuredClone(board);
  const opp = OPP[player];

  if (mv.fromBar) b.bar[player]--;
  else {
    b.points[mv.from].count--;
    if (b.points[mv.from].count === 0) b.points[mv.from] = null;
  }

  if (mv.bearOff) { b.off[player]++; return b; }

  const dest = b.points[mv.to];
  if (dest && dest.color === opp) {
    // Hit a blot.
    b.bar[opp]++;
    b.points[mv.to] = { color: player, count: 1 };
  } else if (dest) {
    dest.count++;
  } else {
    b.points[mv.to] = { color: player, count: 1 };
  }
  return b;
}

// Maximum number of dice a player can legally use from this position.
export function maxMoves(board, player, dice) {
  if (dice.length === 0) return 0;
  let best = 0;
  const tried = new Set();
  for (let i = 0; i < dice.length; i++) {
    const d = dice[i];
    if (tried.has(d)) continue;
    tried.add(d);
    const rest = dice.slice(0, i).concat(dice.slice(i + 1));
    for (const mv of singleMoves(board, player, d)) {
      const val = 1 + maxMoves(applyMove(board, mv, player), player, rest);
      if (val > best) best = val;
      if (best === dice.length) return best;
    }
  }
  return best;
}

// Legal moves for the current decision point, filtered so the player is
// forced to use the maximum number of dice possible (standard rule), and to
// use the larger die when only one of two can be played.
export function legalMoves(board, player, remaining, originalDice) {
  const maxLen = maxMoves(board, player, remaining);
  if (maxLen === 0) return [];

  const result = [];
  const tried = new Set();
  for (let i = 0; i < remaining.length; i++) {
    const d = remaining[i];
    if (tried.has(d)) continue;
    tried.add(d);
    const rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
    for (const mv of singleMoves(board, player, d)) {
      if (1 + maxMoves(applyMove(board, mv, player), player, rest) === maxLen) {
        result.push(mv);
      }
    }
  }

  // "Must play the larger die" when exactly one of two distinct dice is playable.
  if (
    maxLen === 1 &&
    originalDice.length === 2 &&
    originalDice[0] !== originalDice[1] &&
    remaining.length === 2
  ) {
    const larger = Math.max(...remaining);
    const largerMoves = result.filter((m) => m.die === larger);
    if (largerMoves.length > 0) return largerMoves;
  }

  return result;
}

export function checkWinner(board) {
  if (board.off.white === 15) return 'white';
  if (board.off.black === 15) return 'black';
  return null;
}
