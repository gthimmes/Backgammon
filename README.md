# Backgammon 3D

A fully playable, real-time **multiplayer 3D backgammon** game.
Node + Express + WebSocket server (authoritative rules engine) with a
Three.js client. Orbit, pan, and zoom the board freely.

## Run

```bash
npm install
npm start           # serves on http://localhost:3000
```

If port 3000 is busy, pick another: `PORT=3100 npm start`.

## Play

1. Open the URL in a browser and click **Create new game** — you get a 4-letter room code.
2. Your opponent opens the same URL and enters that code (or open a second
   browser tab to play both sides yourself).
3. The higher opening roll goes first. Click a checker to select it; legal
   destinations light up green — click one to move.

## Controls

- **Drag** — orbit the camera around the board
- **Right-drag** — pan
- **Scroll** — zoom in / out
- **Click** a checker → click a highlighted destination to move

## Rules implemented

- Standard starting position, dice + doubles (four moves)
- Hitting blots → bar, and forced bar re-entry
- Bearing off (with the highest-point overflow rule)
- "Must use both dice / must play the larger die" enforcement
- Automatic turn-pass when no legal move exists, and win detection
- **Doubling cube** — offer a double at the start of your turn (before rolling)
  if you own the cube or it's centered; opponent takes (cube doubles, ownership
  passes) or drops (you win the current stake). Gammons score 2× and
  backgammons 3× the cube value, tracked in a running match score.

The server validates every move, so the two clients can never desync and
illegal moves are rejected.

## Reconnect

Each seated player is issued a private session token (kept in `localStorage`).
If you refresh or briefly lose connection, the client automatically rejoins and
reclaims your seat — the board is preserved and your opponent sees an "opponent
disconnected" notice until you're back. A vacated room is kept alive for two
minutes to allow reconnection before it's cleaned up.

## Tests

```bash
npm test
```

Runs the rules-engine unit suite (`test/backgammon.test.js`) with Node's
built-in test runner — no extra dependencies. Covers movement direction,
blocking/hitting, bar re-entry, bearing off (including the overflow rule),
forced maximal dice usage, the "must play the larger die" rule, win detection,
and a full deterministic self-played game that checks checker conservation.

## Layout

- `server/backgammon.js` — pure rules engine (move generation, legality, bearing off)
- `server/index.js` — HTTP + WebSocket server, rooms, turn flow, reconnect
- `public/` — Three.js client (`main.js`), UI (`index.html`, `style.css`)
- `test/backgammon.test.js` — rules-engine unit tests
