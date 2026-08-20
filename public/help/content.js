// In-app help corpus for Backgammon 3D, rendered by the help-navigator widget
// (see help.js). Plain script — exposes a single global. Everything documented
// here reflects what the server's rules engine actually implements.
globalThis.BG_HELP_CONTENT = {
  categories: [
    {
      id: 'getting-started',
      title: 'Getting started',
      icon: '🎲',
      description: 'Starting a game — vs the computer or online — and reading the screen.',
    },
    {
      id: 'controls',
      title: 'Camera & controls',
      icon: '🎥',
      description: 'Orbiting the 3D board and moving checkers with the mouse.',
    },
    {
      id: 'rules',
      title: 'Rules of play',
      icon: '📜',
      description: 'Dice, hitting, the bar, bearing off, and how games are won.',
    },
    {
      id: 'doubling',
      title: 'Doubling cube & score',
      icon: '🎯',
      description: 'Raising the stakes with the cube, and how the match score works.',
    },
    {
      id: 'multiplayer',
      title: 'Multiplayer & troubleshooting',
      icon: '🔌',
      description: 'Room codes, reconnecting after a drop, and fixing connection issues.',
    },
  ],
  articles: [
    // ---------- Getting started ----------
    {
      id: 'play-vs-computer',
      title: 'Playing against the computer',
      category: 'getting-started',
      featured: true,
      tags: ['computer', 'ai', 'solo', 'single player'],
      body: `Click **Play vs Computer** in the lobby and the game starts immediately — you play white, the computer plays black. No account, no setup.

The opponent runs entirely on the game server (no external service). Each turn it enumerates every legal way to play its roll and picks the strongest position, weighing the pip race, exposed blots, board structure, and bearing off. It also **uses the doubling cube** — it will offer doubles, and take or drop yours — so expect a real game.

Its moves are deliberately paced so you can watch each checker slide. "Computer is thinking…" in the turn chip means it's on move.

When a game ends, click **New game** to play again — the match score carries over.`,
      related: ['create-join-online', 'moving-checkers', 'doubling-cube'],
    },
    {
      id: 'create-join-online',
      title: 'Starting an online game',
      category: 'getting-started',
      featured: true,
      tags: ['online', 'multiplayer', 'room', 'code', 'join', 'invite'],
      body: `Online games are private rooms identified by a **4-letter code**.

## Hosting

Click **Create online game**. You're seated as white and the room code appears in the top-left HUD chip. Send that code to your opponent — the game begins automatically with the opening roll the moment they join.

## Joining

Open the same URL, type the code into the lobby box, and click **Join** (or press Enter). You take the black seat.

A few things worth knowing:

- Codes never contain the easily-confused characters **I, O, 0, or 1**.
- You can open a second browser tab and join your own room to play both sides.
- Anyone joining after both seats are taken becomes a spectator — see *Spectating a game* below.
- An empty room is cleaned up after about two minutes, so join reasonably promptly.`,
      related: ['spectating', 'opening-and-turns', 'reconnecting'],
    },
    {
      id: 'spectating',
      title: 'Spectating a game',
      category: 'getting-started',
      tags: ['spectator', 'watch', 'observer'],
      body: `If you join a room whose two seats are already taken, you become a **spectator**: the HUD's "You" chip reads *Spectating* and you see the live board, dice, cube, and score exactly as the players do — you just can't move, roll, or double.

Spectators are read-only and unlimited; share the room code with as many people as you like. The camera is still fully yours to orbit, pan, and zoom.`,
      related: ['create-join-online', 'camera-controls'],
    },
    {
      id: 'hud-tour',
      title: 'Reading the HUD',
      category: 'getting-started',
      tags: ['hud', 'chips', 'score', 'pips', 'dice', 'interface'],
      body: `The overlay around the board tells you everything about the game state:

- **Room** — your 4-letter room code (share it to invite an opponent or spectators)
- **You** — the color you're playing, or *Spectating*
- **Turn chip** — whose turn it is; highlighted when it's yours, "Computer is thinking…" in solo games
- **Score** — the running match score, white – black
- **Cube ×N** — the doubling cube's current value and owner (*center*, *yours*, or the opponent)
- **Pips** — both players' pip counts: the total distance each side's checkers still have to travel to bear off. Lower is better; compare them to see who's ahead in the race.

Below the chips are the **dice** — a die goes dim once you've used it — and along the bottom, the action buttons (**Roll dice**, **Double**, **Take**/**Drop**, **New game**) appear only when that action is actually available to you.`,
      related: ['rolling-the-dice', 'doubling-cube', 'match-score'],
    },

    // ---------- Camera & controls ----------
    {
      id: 'camera-controls',
      title: 'Camera: orbit, pan, zoom',
      category: 'controls',
      featured: true,
      tags: ['camera', 'orbit', 'pan', 'zoom', 'mouse', '3d', 'view'],
      body: `The board is a free 3D scene — move the camera however you like, any time, even during the opponent's turn:

- **Drag** (left button) — orbit around the board
- **Right-drag** — pan sideways
- **Scroll wheel** — zoom in and out

The camera won't zoom through the table or dip below the board's horizon, so you can't get lost. Zoom limits keep the whole board reachable.

Dragging never moves a checker by accident: a press only counts as a **click** if the mouse moves just a few pixels between press and release. Anything longer is treated as a camera drag.`,
      related: ['moving-checkers', 'hud-tour'],
    },
    {
      id: 'moving-checkers',
      title: 'Moving your checkers',
      category: 'controls',
      featured: true,
      tags: ['move', 'click', 'select', 'highlight', 'checker', 'legal moves'],
      body: `Moving is a two-click affair, guided by highlight rings on the board:

1. When it's your turn (after rolling), **green rings** mark every checker that can legally move.
2. **Click a checker** — its ring turns **yellow**, and green rings now mark every legal destination for your remaining dice.
3. **Click a destination** to move. The checker slides over and the die you used goes dim.

Also good to know:

- Clicking another of your movable checkers switches the selection; clicking anywhere else clears it.
- To **bear off**, click the tray on the right edge of the board when it's highlighted.
- If you have checkers on the **bar**, they re-enter from the bar — the bar itself is the selectable source.
- Only legal destinations are ever shown. The server validates every move, so there is no way to make an illegal one.
- Your turn ends automatically once your dice are used up (or no legal move remains) — there's no "end turn" button.`,
      related: ['rolling-the-dice', 'hitting-and-the-bar', 'bearing-off'],
    },

    // ---------- Rules of play ----------
    {
      id: 'opening-and-turns',
      title: 'The opening roll and turn order',
      category: 'rules',
      tags: ['opening', 'first move', 'turn order', 'start'],
      body: `When both players are seated, each side rolls one die (ties are re-rolled). **The higher roll goes first** — and plays *both* of those opening dice as their first turn.

After that, turns alternate. On your turn:

1. Optionally **double** (if you may — see the doubling cube article)
2. Click **Roll dice**
3. Move your checkers
4. Your turn ends by itself when your dice are spent

White moves from higher-numbered points toward its home board (bottom-right); black moves the opposite way. Each die is a separate move of exactly that many points, and one checker may use both dice in two hops.`,
      related: ['rolling-the-dice', 'doubling-cube', 'moving-checkers'],
    },
    {
      id: 'rolling-the-dice',
      title: 'Dice: doubles and forced plays',
      category: 'rules',
      tags: ['dice', 'roll', 'doubles', 'larger die', 'forced move', 'pass'],
      body: `Click **Roll dice** to start your move. The rules the server enforces:

- **Doubles play four times.** Roll 5-5 and you have four 5s to move — the HUD shows four dice.
- **You must use both dice if any legal sequence does.** You can't voluntarily waste a die: if some ordering of moves plays both, a play that strands one is simply never offered.
- **If only one die can be played, it must be the larger one** (when either could be played alone, but not both).
- **No legal moves? The turn passes automatically** — you'll see "No legal moves — turn passes." There's nothing to click; the opponent is already up.

Because the server computes the legal moves, the green highlights always reflect these rules exactly — if a move you hoped for isn't lit up, it isn't legal with your remaining dice.`,
      related: ['moving-checkers', 'hitting-and-the-bar', 'opening-and-turns'],
    },
    {
      id: 'hitting-and-the-bar',
      title: 'Hitting blots and the bar',
      category: 'rules',
      tags: ['hit', 'blot', 'bar', 're-entry', 'capture'],
      body: `A point with a **single** checker on it is a *blot*. Land on an opponent's blot and it's **hit**: their checker is sent to the **bar**, the raised divider in the middle of the board.

A point holding **two or more** of the opponent's checkers is *made* — you can never land there.

## Re-entering from the bar

While you have any checkers on the bar, **you may make no other move** until they've all re-entered. Checkers re-enter in the opponent's home board, on the point matching a die you roll — and only if that point isn't made against you. If neither die lets you enter, your turn passes automatically.

The bar is the selectable source when re-entering: click your checker on the bar, then a highlighted entry point.`,
      related: ['moving-checkers', 'rolling-the-dice', 'bearing-off'],
    },
    {
      id: 'bearing-off',
      title: 'Bearing off',
      category: 'rules',
      tags: ['bear off', 'home board', 'overflow', 'endgame', 'tray'],
      body: `Once **all fifteen** of your checkers are in your home board (your last six points), you may start bearing them off — removing them from the board. The first player to bear off all fifteen wins.

- A die bears off a checker from the point of exactly that number.
- **Overflow rule:** if you roll a number higher than your highest occupied point, you may bear off from that highest point. (Roll a 6 with nothing above the 4-point → a checker on the 4-point comes off.)
- You may always use a die to move *within* your home board instead, when that's legal.
- If a checker gets **hit** during bear-off, it goes to the bar — and you can't bear off again until it has re-entered and travelled all the way back home.

To bear off, select a checker and click the highlighted **tray on the right edge** of the board. Borne-off checkers stack there so you can see both players' progress.`,
      related: ['hitting-and-the-bar', 'winning-and-scoring', 'moving-checkers'],
    },
    {
      id: 'winning-and-scoring',
      title: 'Winning: gammons and backgammons',
      category: 'rules',
      tags: ['win', 'gammon', 'backgammon', 'points', 'scoring'],
      body: `The first player to bear off all fifteen checkers wins — the server detects it instantly and shows the win banner. How *much* the win is worth depends on how far the loser got:

| Result | Condition | Points |
| --- | --- | --- |
| **Single** | Loser has borne off at least one checker | 1 × cube |
| **Gammon** | Loser has borne off none | 2 × cube |
| **Backgammon** | Loser has borne off none *and* still has a checker on the bar or in the winner's home board | 3 × cube |

The multiplier is applied to the doubling cube's value — a gammon with the cube on 4 scores 8 points. Points are added to the running match score in the HUD.

A game can also end mid-play when a player **drops a double** — the doubler wins the pre-double stake.

Click **New game** to play again; the board resets but the match score carries on.`,
      related: ['doubling-cube', 'match-score', 'bearing-off'],
    },

    // ---------- Doubling cube & score ----------
    {
      id: 'doubling-cube',
      title: 'The doubling cube',
      category: 'doubling',
      featured: true,
      tags: ['double', 'cube', 'take', 'drop', 'stakes'],
      body: `The doubling cube raises the stakes mid-game. It starts **centered at 1** — visible as the 3D cube on the board's left rail.

## Offering a double

You may double **at the start of your turn, before rolling**, if the cube is centered or you own it. When that's the case, a **Double to N** button appears next to Roll. Click it and your opponent must respond before play continues:

- **Take** — the game continues for doubled stakes. The cube doubles (2, 4, 8, …) and **the taker now owns it**: only they may make the next double. The 3D cube slides to their side of the rail.
- **Drop** — the game ends immediately and you win the *current* (pre-double) stake.

Ownership is what makes the cube strategic: once you double, you can't double again unless the opponent redoubles you first.

In solo games the computer plays the cube too — it doubles when clearly ahead and takes or drops your doubles on its own judgment.

The cube's value multiplies the final score, including gammons and backgammons — see *Winning: gammons and backgammons* in Rules of play.`,
      related: ['match-score', 'winning-and-scoring', 'hud-tour'],
    },
    {
      id: 'match-score',
      title: 'The match score',
      category: 'doubling',
      tags: ['score', 'match', 'points', 'series', 'new game'],
      body: `The **Score chip** in the HUD tracks a running total across every game played in the room — white's points on the left, black's on the right.

Each finished game adds its value to the winner's total:

- the **cube value** (1 unless doubled), times
- the **result multiplier** — 1 for a single win, 2 for a gammon, 3 for a backgammon
- a **dropped double** scores the pre-double cube value

Clicking **New game** starts a fresh game — new board, cube back to centered ×1 — but the score keeps accumulating. It's an open-ended series rather than a fixed-length match: play to whatever total you've agreed on. The score lasts as long as the room does (it resets if the room empties out and expires).`,
      related: ['doubling-cube', 'winning-and-scoring', 'reconnecting'],
    },

    // ---------- Multiplayer & troubleshooting ----------
    {
      id: 'reconnecting',
      title: 'Refreshes, drops, and reconnecting',
      category: 'multiplayer',
      tags: ['reconnect', 'refresh', 'disconnect', 'session', 'seat'],
      body: `Your seat survives a refresh or a brief connection drop. When you sit down in a game, the browser stores a private session token; on reconnect, the client uses it to **reclaim your exact seat** — same color, same board, same score.

What each side sees:

- **You** briefly see "Connection lost — reconnecting…" while the client retries automatically (up to 10 attempts, backing off to every 5 seconds). A plain refresh of the page rejoins instantly.
- **Your opponent** sees "Opponent disconnected — waiting for them to reconnect…" and the game simply waits. Nothing is forfeited.

A room with nobody connected is kept alive for about **two minutes** before it's deleted. Come back within that window and the game is exactly as you left it; after that, the room — and its match score — is gone and you'll be returned to the lobby.`,
      related: ['connection-troubleshooting', 'create-join-online', 'match-score'],
    },
    {
      id: 'connection-troubleshooting',
      title: 'Troubleshooting connection problems',
      category: 'multiplayer',
      tags: ['error', 'no game', 'code', 'websocket', 'port', 'help'],
      body: `The common failure cases and what they mean:

## "No game with that code."

The room doesn't exist — either the code was mistyped or the room expired (empty rooms are deleted after ~2 minutes). Double-check with the host, and remember codes never contain **I, O, 0, or 1**. If it expired, just create a fresh game.

## "That game no longer exists." / "Could not rejoin that seat."

Your saved session pointed at a room that has since expired. The client clears the stale session and returns you to the lobby — create or join a new game.

## "Disconnected. Refresh to reconnect."

Automatic reconnection gave up (or you weren't in a game). Reload the page; if you were seated recently, your seat is reclaimed automatically.

## Both players must use the same server

The game is real-time over a WebSocket to the server that served the page — your opponent needs the **same address**. If you're hosting locally, \`localhost\` only works on your own machine; share your LAN address or a deployed URL instead.

## Nothing loads at all

If you're running the server yourself: it listens on port **3000** by default (\`PORT=3100 npm start\` to change it), and it prints \`Backgammon server running on port …\` when up. The 3D scene needs WebGL, which every current browser has enabled by default.`,
      related: ['reconnecting', 'create-join-online'],
    },
  ],
};
