import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initBoard, singleMoves, applyMove, legalMoves, checkWinner, OPP,
} from './backgammon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

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
  };
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
    players: {
      white: !!room.players.white,
      black: !!room.players.black,
    },
    code: room.code,
  };
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
    if (ws.color && room.players[ws.color] === ws) room.players[ws.color] = null;
    if (room.clients.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcast(room);
    }
  });
});

function handle(ws, msg) {
  switch (msg.type) {
    case 'create': {
      const code = makeCode();
      const room = { code, game: newGame(), players: { white: ws, black: null }, clients: new Set([ws]) };
      rooms.set(code, room);
      ws.room = room;
      ws.color = 'white';
      send(ws, { type: 'joined', code, color: 'white' });
      broadcast(room);
      break;
    }
    case 'join': {
      const room = rooms.get((msg.code || '').toUpperCase());
      if (!room) return send(ws, { type: 'error', message: 'No game with that code.' });
      room.clients.add(ws);
      ws.room = room;
      // Assign to an open seat, otherwise spectate.
      if (!room.players.white) { room.players.white = ws; ws.color = 'white'; }
      else if (!room.players.black) { room.players.black = ws; ws.color = 'black'; }
      else ws.color = null;
      send(ws, { type: 'joined', code: room.code, color: ws.color });
      // Start the match once both seats are filled and it hasn't started.
      if (room.players.white && room.players.black && room.game.status === 'waiting') {
        openingRoll(room.game);
      }
      broadcast(room);
      break;
    }
    case 'roll': {
      const room = ws.room; if (!room) return;
      const g = room.game;
      if (g.status !== 'playing' || ws.color !== g.current || g.turn) return;
      startTurnRoll(g);
      broadcast(room);
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

      const winner = checkWinner(g.board);
      if (winner) {
        g.status = 'finished';
        g.winner = winner;
        g.message = `${winner} wins the game!`;
        g.turn = null;
      } else if (g.turn.remaining.length === 0 || currentLegalMoves(g).length === 0) {
        g.message = `${g.current} completed their turn.`;
        endTurn(g);
      }
      broadcast(room);
      break;
    }
    case 'reset': {
      const room = ws.room; if (!room) return;
      room.game = newGame();
      if (room.players.white && room.players.black) openingRoll(room.game);
      broadcast(room);
      break;
    }
    default:
      break;
  }
}

server.listen(PORT, () => {
  console.log(`Backgammon server running: http://localhost:${PORT}`);
});
