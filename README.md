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

- **Vs Computer** — click **Play vs Computer** to start a single-player game
  against the built-in AI (see below). No account, no API key, nothing to set up.
- **Online** — click **Create online game** for a 4-letter room code; your
  opponent opens the same URL and enters it (or open a second tab to play both
  sides). The higher opening roll goes first.

Click a checker to select it; legal destinations light up green — click one to move.

## Computer opponent

The AI runs entirely on the server — no external service, model, or API key.
For each roll it enumerates every legal full-turn sequence and scores the
resulting positions with a backgammon evaluation function that weighs the pip
race, blot exposure (using real opponent shot counts, including combination and
doubles shots), home-board and prime structure, defensive anchors, and bearing
off. It also uses the doubling cube — offering, taking, and dropping based on a
race-equity estimate. It beats a random player in ~19 of 20 games.

## Controls

- **Drag** — orbit the camera around the board
- **Right-drag** — pan
- **Scroll** — zoom in / out
- **Click** a checker → click a highlighted destination to move (checkers slide
  to their destination and land on the point)

The HUD shows the running match score, the current cube value/owner, and each
side's live **pip count**. A 3D doubling cube sits on the rail and moves to the
side of whoever owns it.

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

Runs the whole suite (60+ tests) with Node's built-in runner — no extra
dependencies. Three layers:

- **Unit** — the rules engine (`test/backgammon.test.js`: movement, hitting, bar
  re-entry, bearing off + overflow, forced maximal dice usage, the larger-die
  rule, gammon/backgammon scoring, a deterministic self-played game) and the AI
  (`test/ai.test.js`: turn enumeration, shot counting, tactical choices, cube
  take/drop, and a 20-game match the AI wins against a random player).
- **Integration** (`test/server.integration.test.js`) — drives the real
  WebSocket server in-process: matchmaking, spectators, move validation (the
  server offers exactly the engine-legal moves; illegal/out-of-turn moves are
  rejected), the doubling cube (offer/take/drop, score, reset), reconnect with
  tokens, and single-player AI wiring.
- **End-to-end** (`test/e2e.test.js`) — plays complete games over WebSocket
  (human-vs-human, human-vs-computer, and a mid-game disconnect/reconnect),
  asserting checker conservation on *every* board, a valid winner, and correct
  scoring. The AI pacing is configurable via `BG_AI_THINK_MS` / `BG_AI_MOVE_MS`
  so full computer games run quickly under test.

## Deploy

The server binds to `0.0.0.0` and honors the `PORT` environment variable, so it
runs on most Node hosts with no changes. A `Procfile` (`web: node
server/index.js`) is included.

- **Render** — New → Web Service → connect this repo. Build: `npm install`.
  Start: `npm start`. Render sets `PORT` automatically; WebSockets work on the
  default plan.
- **Railway / Fly.io / Heroku** — the `Procfile` and `start` script are picked
  up directly; just deploy from the repo.

Requires Node 18+ (see `engines` in `package.json`). The Three.js client loads
from a CDN via an import map, so there is no front-end build step.

## Layout

- `server/backgammon.js` — pure rules engine (move generation, legality, bearing off)
- `server/ai.js` — computer opponent (turn enumeration + position evaluation)
- `server/index.js` — HTTP + WebSocket server, rooms, turn flow, reconnect, AI driver
- `public/` — Three.js client (`main.js`), UI (`index.html`, `style.css`)
- `test/backgammon.test.js`, `test/ai.test.js` — unit tests
