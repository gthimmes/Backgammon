import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  initBoard, singleMoves, applyMove, legalMoves, checkWinner, scoreMultiplier, OPP,
} from './backgammon.js';
import { chooseTurn, shouldDouble, shouldTake } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// How long a room is kept alive after its last client disconnects, so a
// player who refreshes or briefly drops can reclaim their seat.
const CLEANUP_MS = 2 * 60 * 1000;
// Pacing for the computer opponent so moves are watchable, not instant.
const AI_THINK_MS = 650;
const AI_MOVE_MS = 700;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function rollDie() { return 1 + Math.floor(Math.random() * 6); }

function newGame() {
  return {
    board: initBoard(),
    current: null,        // whose turn it is
    turn: null,           // { dice:[...], remaining:[...] } once rolled
    status: 'waiting',    // waiting | playing | finished
    winner: null,
    message: '',
    cube: { value: 1, owner: null }, // owner null = centered (either may double)
    pendingDouble: null,  // { by } while a double offer awaits a response
  };
}

// A player may double at the start of their turn (before rolling) if the cube
// is centered or they own it, and no offer is already pending.
function canDouble(game, color) {
  return game.status === 'playing' && game.current === color && !game.turn
    && !game.pendingDouble && (game.cube.owner === null || game.cube.owner === color);
}

// Award points for a finished game and update the running match score.
function finishGame(room, winner, points, message) {
  const g = room.game;
  g.status = 'finished';
  g.winner = winner;
  g.turn = null;
  g.pendingDouble = null;
  room.score[winner] += points;
  g.message = message;
}

// If the board is won, finish the game with cube-scaled gammon/backgammon
// scoring. Returns true if the game ended.
function finishIfWon(room) {
  const g = room.game;
  const winner = checkWinner(g.board);
  if (!winner) return false;
  const mult = scoreMultiplier(g.board, winner);
  const points = mult * g.cube.value;
  const kind = mult === 3 ? 'a backgammon' : mult === 2 ? 'a gammon' : 'the game';
  const who = room.ai === winner ? 'Computer' : winner;
  finishGame(room, winner, points, `${who} wins ${kind} — ${points} point${points === 1 ? '' : 's'}!`);
  return true;
}

/** Opening roll: each side rolls one die, higher goes first and plays both. */
function openingRoll(game) {
  let a, b;
  do { a = rollDie(); b = rollDie(); } while (a === b);
  game.current = a > b ? 'white' : 'black';
  game.turn = { dice: [a, b], remaining: [a, b] };
  game.status = 'playing';
  game.message = `Opening roll ${a}-${b}: ${game.current} plays first.`;
}

function startTurnRoll(game) {
  const d1 = rollDie(), d2 = rollDie();
  const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  game.turn = { dice, remaining: [...dice] };
  game.message = `${game.current} rolled ${d1}-${d2}${d1 === d2 ? ' (doubles!)' : ''}.`;
  // If there are no legal moves at all, the turn is forfeited automatically.
  if (legalMoves(game.board, game.current, game.turn.remaining, dice).length === 0) {
    game.message += ' No legal moves — turn passes.';
    endTurn(game);
  }
}

function endTurn(game) {
  game.current = OPP[game.current];
  game.turn = null; // opponent must roll
}

function currentLegalMoves(game) {
  if (game.status !== 'playing' || !game.turn) return [];
  return legalMoves(game.board, game.current, game.turn.remaining, game.turn.dice);
}

function serializeState(room) {
  const g = room.game;
  return {
    type: 'state',
    board: g.board,
    current: g.current,
    turn: g.turn,
    status: g.status,
    winner: g.winner,
    message: g.message,
    legal: currentLegalMoves(g),
    cube: g.cube,
    pendingDouble: g.pendingDouble,
    score: room.score,
    ai: room.ai || null,       // which seat, if any, the computer plays
    players: {
      white: !!room.players.white,
      black: !!room.players.black,
    },
    // Which seats currently have a live socket (the AI seat counts as present).
    connected: {
      white: !!(room.players.white && room.players.white.ws) || room.ai === 'white',
      black: !!(room.players.black && room.players.black.ws) || room.ai === 'black',
    },
    code: room.code,
  };
}

function scheduleCleanup(room) {
  clearCleanup(room);
  room.cleanupTimer = setTimeout(() => rooms.delete(room.code), CLEANUP_MS);
  room.cleanupTimer.unref?.();
}

function clearCleanup(room) {
  if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }
}

function broadcast(room) {
  const base = serializeState(room);
  for (const client of room.clients) {
    if (client.readyState !== 1) continue;
    client.send(JSON.stringify({ ...base, you: client.color || null }));
  }
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Computer opponent driver
// ---------------------------------------------------------------------------

const alive = (room) => rooms.get(room.code) === room;

// Advance the game whenever it is the computer's move (or the computer owes a
// response to the human's double). Scheduled via timers so sub-moves are
// watchable and there is no deep recursion.
function maybeDriveAI(room) {
  if (!room.ai || !alive(room)) return;
  const g = room.game;
  if (g.status !== 'playing') return;

  // Respond to a double the human offered the computer.
  if (g.pendingDouble && OPP[g.pendingDouble.by] === room.ai) {
    setTimeout(() => aiRespondDouble(room), AI_THINK_MS);
    return;
  }
  if (g.current !== room.ai) return;   // human's move
  if (g.pendingDouble) return;         // computer already doubled; awaiting human

  setTimeout(() => {
    if (!alive(room) || g.status !== 'playing' || g.current !== room.ai || g.pendingDouble) return;
    if (g.turn) {
      // Dice already assigned (opening roll) — just play them.
      aiPlayTurn(room, false);
      return;
    }
    // Start of turn: consider doubling, otherwise roll and play.
    if (shouldDouble(g, room.ai)) {
      g.pendingDouble = { by: room.ai };
      g.message = `Computer offers to double to ${g.cube.value * 2}.`;
      broadcast(room);
      return; // wait for the human's take/drop
    }
    aiPlayTurn(room, true);
  }, AI_THINK_MS);
}

function aiRespondDouble(room) {
  if (!alive(room)) return;
  const g = room.game;
  if (g.status !== 'playing' || !g.pendingDouble || OPP[g.pendingDouble.by] !== room.ai) return;
  const by = g.pendingDouble.by;
  if (shouldTake(g, room.ai)) {
    g.cube.value *= 2;
    g.cube.owner = room.ai;
    g.pendingDouble = null;
    g.message = `Computer takes. Cube is now ${g.cube.value}.`;
    broadcast(room);
    maybeDriveAI(room);
  } else {
    finishGame(room, by, g.cube.value,
      `Computer drops. ${by} wins ${g.cube.value} point${g.cube.value === 1 ? '' : 's'}.`);
    broadcast(room);
  }
}

function aiPlayTurn(room, doRoll) {
  const g = room.game;
  if (doRoll) {
    startTurnRoll(g);
    broadcast(room);
    if (!g.turn) { // rolled but no legal move — turn already passed
      setTimeout(() => maybeDriveAI(room), AI_THINK_MS);
      return;
    }
  }

  const { moves } = chooseTurn(g.board, g.current, g.turn.dice);
  let i = 0;
  const applyNext = () => {
    if (!alive(room) || g.status !== 'playing') return;
    if (i >= moves.length || !g.turn) {
      if (g.turn) { g.message = `Computer completed its turn.`; endTurn(g); }
      broadcast(room);
      setTimeout(() => maybeDriveAI(room), AI_THINK_MS);
      return;
    }
    const want = moves[i++];
    const legal = currentLegalMoves(g);
    const mv = legal.find((m) => m.from === want.from && m.to === want.to && m.die === want.die)
      || legal.find((m) => m.from === want.from && m.to === want.to)
      || legal[0];
    if (!mv) { // nothing legal left
      g.message = `Computer completed its turn.`;
      endTurn(g);
      broadcast(room);
      setTimeout(() => maybeDriveAI(room), AI_THINK_MS);
      return;
    }
    g.board = applyMove(g.board, mv, g.current);
    const di = g.turn.remaining.indexOf(mv.die);
    if (di >= 0) g.turn.remaining.splice(di, 1);

    if (finishIfWon(room)) { broadcast(room); return; }
    if (g.turn.remaining.length === 0 || currentLegalMoves(g).length === 0) {
      g.message = `Computer completed its turn.`;
      endTurn(g);
      broadcast(room);
      setTimeout(() => maybeDriveAI(room), AI_THINK_MS);
      return;
    }
    broadcast(room);
    setTimeout(applyNext, AI_MOVE_MS);
  };
  setTimeout(applyNext, AI_MOVE_MS);
}

wss.on('connection', (ws) => {
  ws.color = null;
  ws.room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handle(ws, msg);
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.clients.delete(ws);
    // Keep the seat (and its token) reserved so the player can reconnect;
    // just mark the socket as gone.
    const seat = ws.color ? room.players[ws.color] : null;
    if (seat && seat.ws === ws) seat.ws = null;
    if (room.clients.size === 0) scheduleCleanup(room);
    else broadcast(room);
  });
});

function handle(ws, msg) {
  switch (msg.type) {
    case 'create': {
      const code = makeCode();
      const token = randomUUID();
      const room = {
        code, game: newGame(), cleanupTimer: null,
        score: { white: 0, black: 0 },
        players: { white: { token, ws }, black: null },
        clients: new Set([ws]),
      };
      // Single-player: seat the computer as black and start immediately.
      if (msg.vsAI) {
        room.ai = 'black';
        room.players.black = { token: 'AI', ws: null, ai: true };
        openingRoll(room.game);
      }
      rooms.set(code, room);
      ws.room = room;
      ws.color = 'white';
      send(ws, { type: 'joined', code, color: 'white', token });
      broadcast(room);
      if (room.ai) maybeDriveAI(room);
      break;
    }
    case 'join': {
      const room = rooms.get((msg.code || '').toUpperCase());
      if (!room) return send(ws, { type: 'error', code: 'no-room', message: 'No game with that code.' });
      clearCleanup(room);
      room.clients.add(ws);
      ws.room = room;
      // Assign to an open seat (occupied-but-disconnected seats stay reserved
      // for their original player), otherwise spectate.
      let token = null;
      if (!room.players.white) { token = randomUUID(); room.players.white = { token, ws }; ws.color = 'white'; }
      else if (!room.players.black) { token = randomUUID(); room.players.black = { token, ws }; ws.color = 'black'; }
      else ws.color = null;
      send(ws, { type: 'joined', code: room.code, color: ws.color, token });
      // Start the match once both seats are filled and it hasn't started.
      if (room.players.white && room.players.black && room.game.status === 'waiting') {
        openingRoll(room.game);
      }
      broadcast(room);
      break;
    }
    case 'rejoin': {
      const room = rooms.get((msg.code || '').toUpperCase());
      if (!room) return send(ws, { type: 'error', code: 'no-room', message: 'That game no longer exists.' });
      let color = null;
      for (const c of ['white', 'black']) {
        if (room.players[c] && room.players[c].token === msg.token) { color = c; break; }
      }
      if (!color) return send(ws, { type: 'error', code: 'bad-token', message: 'Could not rejoin that seat.' });
      clearCleanup(room);
      room.players[color].ws = ws;
      room.clients.add(ws);
      ws.room = room;
      ws.color = color;
      send(ws, { type: 'joined', code: room.code, color, token: msg.token });
      broadcast(room);
      break;
    }
    case 'roll': {
      const room = ws.room; if (!room) return;
      const g = room.game;
      if (g.status !== 'playing' || ws.color !== g.current || g.turn || g.pendingDouble) return;
      startTurnRoll(g);
      broadcast(room);
      break;
    }
    case 'double': {
      const room = ws.room; if (!room) return;
      const g = room.game;
      if (!canDouble(g, ws.color)) return;
      g.pendingDouble = { by: ws.color };
      g.message = `${ws.color} offers to double to ${g.cube.value * 2}.`;
      broadcast(room);
      maybeDriveAI(room);
      break;
    }
    case 'respondDouble': {
      const room = ws.room; if (!room) return;
      const g = room.game;
      // Only the player being doubled may respond.
      if (!g.pendingDouble || ws.color !== OPP[g.pendingDouble.by]) return;
      const doubler = g.pendingDouble.by;
      if (msg.accept) {
        g.cube.value *= 2;
        g.cube.owner = ws.color; // taker now owns the cube
        g.pendingDouble = null;
        g.message = `${ws.color} takes. Cube is now ${g.cube.value}.`;
      } else {
        // Drop: the doubler wins the current (pre-double) stake.
        const who = room.ai === doubler ? 'Computer' : doubler;
        finishGame(room, doubler, g.cube.value,
          `${ws.color} drops. ${who} wins ${g.cube.value} point${g.cube.value === 1 ? '' : 's'}.`);
      }
      broadcast(room);
      maybeDriveAI(room);
      break;
    }
    case 'move': {
      const room = ws.room; if (!room) return;
      const g = room.game;
      if (g.status !== 'playing' || ws.color !== g.current || !g.turn) return;
      const legal = currentLegalMoves(g);
      const mv = legal.find((m) => m.from === msg.from && m.to === msg.to);
      if (!mv) return send(ws, { type: 'error', message: 'Illegal move.' });

      g.board = applyMove(g.board, mv, g.current);
      // Consume one instance of the die used.
      const idx = g.turn.remaining.indexOf(mv.die);
      if (idx >= 0) g.turn.remaining.splice(idx, 1);

      if (!finishIfWon(room)) {
        if (g.turn.remaining.length === 0 || currentLegalMoves(g).length === 0) {
          g.message = `${g.current} completed their turn.`;
          endTurn(g);
        }
      }
      broadcast(room);
      maybeDriveAI(room);
      break;
    }
    case 'reset': {
      const room = ws.room; if (!room) return;
      room.game = newGame();
      if (room.players.white && room.players.black) openingRoll(room.game);
      broadcast(room);
      maybeDriveAI(room);
      break;
    }
    default:
      break;
  }
}

// Bind on all interfaces so cloud hosts (Render/Fly/Railway/etc.) can route to it.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backgammon server running on port ${PORT}`);
});
