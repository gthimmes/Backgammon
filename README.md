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

The server validates every move, so the two clients can never desync and
illegal moves are rejected.

## Layout

- `server/backgammon.js` — pure rules engine (move generation, legality, bearing off)
- `server/index.js` — HTTP + WebSocket server, rooms, turn flow
- `public/` — Three.js client (`main.js`), UI (`index.html`, `style.css`)
