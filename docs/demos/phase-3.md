# Phase 3 demo: multiplayer

A host screen on a laptop shows a game code and QR. Phones and other laptops on the same
network join with nicknames, appear in the lobby, race up Cogspire seeing each other live,
and everyone sees the same winner and leaderboard.

## How to run it

```sh
corepack enable
pnpm install
cp apps/realtime/.env.example apps/realtime/.env   # set DEV_GAME_SECRET to a long random string
pnpm dev:all                                       # web on :3000, realtime on :2567
```

1. On the laptop, open `http://<laptop IP>:3000/dev/new-game` (the network address, not
   `localhost`, so the QR and join link work for phones). Enter the dev secret, pick a
   question set and whether summits are checkpoints, and press Create.
2. The host screen opens at `/host/<session id>`: a large split code, the join link and a
   QR. Project it if you can.
3. On each phone, scan the QR or open `http://<laptop IP>:3000/join` and type the code.
   Choose a nickname or tap "Random name".
4. Press Start on the host screen. After 3-2-1 everyone climbs; the first to the top of The
   Bell wins, or the highest climber when time runs out or you press End (twice).

Redis is optional locally (`REDIS_URL` empty means one in-memory process). With Docker,
`docker compose up -d` starts Redis and Postgres; set `REDIS_URL=redis://localhost:6379`.

## What to look at

**On a phone**

1. **Join.** The code field brings up the number keypad. A rude nickname is refused before
   anything is sent; "Random name" gives names like "Plucky Otter". A name already taken in
   the room is refused with a clear message.
2. **Lobby.** Your nickname, how many others have joined, and "Waiting for the host".
   Reloading the page puts you back in the same game as the same player.
3. **Countdown, then the climb.** The HUD shows your rank, the number of players and the
   time left ("2nd of 5 · 4:32"). Other climbers are semi-transparent robots in their own
   colours with name labels, gliding rather than jumping (they are drawn 150 ms behind).
   Only the nearest 15 are drawn.
4. **Lock the phone for a minute,** then unlock it: "Reconnecting…", then the climb carries
   on with the same energy, height and summits.
5. **The end.** Everyone gets the same ranking, with your own row marked, and a "Join another
   game" button.

**On the host screen**

1. **Lobby.** Players appear as they join. Rename (the same nickname filter), Remove (press
   twice), Lock, and "Let removed players back". A removed player cannot rejoin from the same
   browser until you allow it.
2. **During play.** The tower view: one dot per player at their height and sideways position,
   in the same colour as their robot, with summit lines named from the theme and the top five
   labelled. Beside it the live leaderboard, the timer, +1 / +5 minutes, End (press twice),
   and a compact join strip while late joining is open.
3. **The end.** Winner banner and the full ranking. Reloading, or opening "Show this screen
   on another device" on a second laptop, shows the same.

## Acceptance criteria and their tests

| Criterion | Covered by |
| --- | --- |
| An automated test runs a host and 3 simulated clients through one full game; all see the same winner | Unit `climber-room.test.ts` "runs a host and three climbers through a full game…" (real Colyseus server, three `NetworkBot`s climbing to the top, winner and ranking compared on every client); E2E `multiplayer.spec.ts` and `host.spec.ts` (browser host + phones, same final ranking) |
| A client that disconnects for 60 seconds and reconnects resumes as the same player with the same energy and height | Unit `climber-room.test.ts` "resumes a player who was gone for 60 seconds…" (Colyseus reconnection token, then a fresh connection with the same device key; it now also keeps climbing afterwards); `base-game-room.test.ts` reconnect tests; E2E reload-rejoin in `multiplayer.spec.ts` |
| A kicked player cannot rejoin with the same device unless the host allows it | Unit `base-game-room.test.ts` "kicks a player, keeps their device out, and lets them back when the host allows it", `live-game.test.ts` "blocks a kicked device…"; E2E remove and "Let removed players back" in `host.spec.ts` |
| A client that sends impossible positions or forged answers gains nothing | Unit `climber-room.test.ts` "gives nothing for impossible positions, forged answers, unknown spends or unpaid jumps", `movement-referee.test.ts`, `question-sessions.test.ts` "refuses forged answers…" |
| One room of 60 bot players runs locally with server tick time under 20 ms; results in `docs/load-test.md` | `pnpm --filter realtime load-test` (results: p99 3.2 ms, max 6.5 ms); `scripts/load-test.test.ts` keeps the harness working on every test run (2 rooms × 6 bots, p99 under 20 ms) |
| 10 concurrent rooms of 30 bots run on a single server process; CPU and memory recorded | Same script, `many-rooms` scenario: 21% of one core, 164 MB RSS (`docs/load-test.md`) |
| Room-core has no imports from games/climber | Unit `boundaries.test.ts`; ESLint `no-restricted-imports` in the shared-package config (`packages/config/eslint/base.js`) |
| Manual: a real game with Bryan's phone plus two other devices on his network | PROGRESS.md, "For Bryan to check" |

Other Phase 3 scope and where it is tested:

| Scope item | Covered by |
| --- | --- |
| Join codes: 6 digits, unique among active games, in Redis, freed at the end | `join-codes.test.ts`, `base-game-room.test.ts` "claims a 6-digit join code…", `redis.test.ts` and `multi-process.test.ts` (Redis, two processes) |
| Nicknames: filter, unique in the room, generator | `nicknames.test.ts`, `live-game.test.ts`, `server.test.ts` "refuses nicknames the profanity filter catches", E2E `multiplayer.spec.ts` |
| Lobby, lock, rename, kick; lifecycle with countdown and server timer; late join setting; room cap | `base-game-room.test.ts`, `live-game.test.ts`, E2E `host.spec.ts` |
| `SessionRecorder` receives answers, progress and results | `climber-room.test.ts` full game (every answer, every summit and each player's result), `base-game-room.test.ts` (session and player events) |
| Other players interpolated, nearest 15, rank in the HUD | `live.test.ts`, E2E `multiplayer.spec.ts` |
| Host live screen: code, QR, tower view, leaderboard, timer, end | `tower-view.test.ts`, `host-view.test.ts`, `qr.test.ts` (decoded back with `jsqr`), E2E `host.spec.ts` |
| Several processes behind separate addresses sharing Redis (the Azure layout) | `multi-process.test.ts` (two real processes: games spread over both, codes resolve on either, sockets go to the room's own process) |
| Deploy scripts: Container Apps, Redis, Key Vault, manual workflow | `infra/realtime/main.bicep`, `.github/workflows/deploy-realtime.yml`; CI compiles the Bicep and builds and smoke-tests the realtime image |

## What was decided

The full record is in `docs/DECISIONS.md`. The main Phase 3 decisions:

- **Room logic is a framework-free `LiveGame` inside a thin Colyseus `BaseGameRoom`.** Games
  extend the room through hooks; questions and energy on the server are platform features
  (`enableQuestionSessions`), so a future game only sets prices.
- **Devices predict, the server decides.** `NetworkSession` spends energy at once and sends
  numbered spends; the server charges its own prices. A `MovementReferee` checks each
  position report against the course, a speed budget and the rise paid jumps allow, instead
  of running physics on the server.
- **A browser device key doubles as the reconnect token,** stored hashed. It survives the
  tab being discarded, and makes kicks stick to the device.
- **Positions stay in Colyseus state.** The load test showed 8 KB/s per phone and under
  3.2 ms per patch for 60 players, so moving them to messages would gain nothing.
- **Scaling on Azure: one single-replica Container App per realtime process, each with its
  own public address, all sharing Redis.** This follows the Colyseus scalability docs
  (rooms live in one process; seat reservations work from any process; clients connect to
  the room's process by its public address). Container Apps' shared ingress cannot target a
  replica, so replicas would not work. `shardCount` sets the number of processes.
- **Azure Managed Redis,** because Azure Cache for Redis is being retired.
- **The realtime image is an esbuild bundle** on a slim Node 22 image; CI builds it and
  checks `/health`, and never pushes it.

## Self-review

A fresh-eyes review of the Phase 3 work (realtime server, rooms, client, host screen and the
new deployment) was done at the end of M3.5. No subagent tool was available in this run, so
it was done in the same session, file by file, as an outside reviewer would. Fixed:

- **A reloaded phone stopped counting.** A new page numbers its position reports from 1, but
  the room ignored any report numbered at or below the last one it had seen, so after a
  reload or a discarded tab the room froze the player's height and summits until the new
  count passed the old one (minutes into a game). The room now forgets the count when a
  device resumes, and the 60-second reconnect test keeps climbing afterwards.
- **Join-code guessing could dodge the rate limit behind a proxy.** Lookups were keyed on
  the first `X-Forwarded-For` entry, which the caller controls. They now use the entry the
  ingress appended.
- **Games created on another process lost their join code.** `POST /dev/games` read the
  code from the local room only; with several processes the response had an empty code. It
  now reads the room's listing metadata (found by the new multi-process test).
- **Invalid client messages were dropped silently.** The spec asks to drop and log them;
  they are now logged once per type every 10 seconds per room, with ids only.
- **No test checked that answers and summits reach the session recorder.** The full-game
  test now counts them.
- **The multiplayer E2E left two phones running,** slowing every later test. Their browser
  contexts are now closed after the test, as the host E2E already did.

## Known to be weak

- **Every deploy ends the games running on the replaced processes,** and removing a process
  (lowering `shardCount`) ends its games. Deploy between lessons. Draining (stop new games on
  a process, wait for its games to end) would need a Phase 4 operations feature.
- **Process 1 is the only entry point** for code lookups and seat reservations. If it
  restarts, nobody can join for that minute, though games on other processes carry on.
  Putting Front Door or a second entry in front is an option once there are several
  processes.
- **Games created in a burst can land on the same process,** because Colyseus shares room
  counts at most once a second. Fine for classes starting a few seconds apart.
- **The second-screen host link gives full control of the game.** Phase 4 ties host control
  to signed-in hosts.
- **The tower view redraws whenever a patch arrives** (up to 20 times a second). Fine for 60
  dots on the build machine; untested on a slow projector laptop.
- **The movement referee does not replay hazards** (each player's hazard clock pauses while
  their sheet is open) and does not charge walking against distance. Rising, which is what
  wins, is enforced.
- **A removed player can come back from a private window** or a cleared browser (a new
  device key). There is no account to tie them to, by design; the host can remove them again
  and lock the game.
- **Load tested on loopback with 2 vCPUs.** No real network latency or loss, and Azure vCPUs
  differ from the sandbox's; check CPU in Container Apps metrics after the first real games.
- **No Content Security Policy yet on player pages.** The spec's security list asks for a
  strict one; it belongs with Phase 4's deploy package, once the realtime host names are
  known per environment.
- **Join codes are rate-limited per process and per address only;** per-code limiting with a
  shared Redis limiter is Phase 4's rate-limiting criterion.
- **The image was not built in the build sandbox** (no Docker daemon there); CI builds and
  smoke-tests it. The bundle itself was run and served `/health` and `POST /dev/games`.
