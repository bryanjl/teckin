# Realtime load test

Phase 3 acceptance: one room of 60 bot players with server tick time under 20 ms, and 10
concurrent rooms of 30 bots on a single server process, with CPU and memory recorded.

## How to run it

```sh
pnpm --filter realtime load-test                          # both scenarios, about 4 minutes
pnpm --filter realtime load-test -- --scenario one-room   # 1 room × 60 bots
pnpm --filter realtime load-test -- --scenario many-rooms # 10 rooms × 30 bots
pnpm --filter realtime load-test -- --rooms 20 --bots 30  # any size
```

The script (`apps/realtime/scripts/load-test.ts`) starts its own realtime process (in-memory
presence, `REALTIME_LOAD_METRICS=1`), creates the games through `POST /dev/games`, joins a
host screen and the bots over real WebSockets, starts every game, waits 15 s, then measures
for 60 s. Bots run in the script's process, so the server's numbers are its own.

Each bot is the `NetworkBot` the room tests use (`games/climber/scripts/network-bot.ts`): a
real `ClimberRun` stepped by the course bot at 60 Hz, reporting its position through
`ClimberLink` ten times a second, paying for jumps and steps through `NetworkSession`, and
answering questions on the server when its energy runs low. Bots start within 4 s of each
other and answer instantly, so they climb faster and more bunched than a class would: every
patch carries nearly every player's movement. That is a harsher load than real play.

**What is measured** (`GET /metrics/load` on the server, `apps/realtime/src/load-metrics.ts`):

- **Room tick time**: for each room, the work done between two state patches (handling its
  clients' messages, its 4 Hz game tick, and encoding and sending the patch). Colyseus patches
  every 50 ms, so this is the per-room "tick". Measured by `RoomWorkStats` in room-core.
- **Event-loop lag**: how late a 10 ms timer fires. Shows whether all rooms together keep the
  process responsive.
- **CPU** (process CPU time over wall time, as a percentage of one core) and **memory**
  (resident set size and V8 heap).
- **Download per player**: bytes each bot's socket received per second (state patches and
  messages), i.e. what a phone downloads.
- **Corrections**: positions the movement referee snapped back. Honest bots should get none.

## Results

Run on 2026-10-09 in the build sandbox: 2 vCPU Intel Xeon @ 2.10 GHz, 7 GB RAM, Node 22.22.0,
Colyseus 0.18.18. The server ran under `tsx` (TypeScript loaded at start; the container runs
the esbuild bundle instead, which uses a little less memory).

| Scenario    | Rooms × bots | Room tick p50 / p95 / p99 / max (ms) | Event-loop lag p99 (ms) | Server CPU (% of one core) | Server RSS (MB) | Download per player (KB/s) | Reports per bot per s | Corrections |
| ----------- | ------------ | ------------------------------------ | ----------------------- | -------------------------- | --------------- | -------------------------- | --------------------- | ----------- |
| one-room    | 1 × 60       | 1.59 / 2.48 / 3.17 / 6.54            | 1.14                    | 6.4                        | 157             | 8.0                        | 10.1                  | 0           |
| many-rooms  | 10 × 30      | 0.60 / 0.98 / 1.29 / 9.24            | 1.69                    | 21.3                       | 164             | 4.1                        | 10.0                  | 0           |
| (headroom)  | 20 × 30      | 0.53 / 0.82 / 1.11 / 11.52           | 2.93                    | 36.6                       | 172             | 4.5                        | 9.7                   | 0           |

V8 heap in use: 36 MB (one room), 55 MB (10 rooms). The 20 × 30 run measured 45 s; at 600
bots the bot process was close to one full core (reports dropped to 9.7 a second), so it is a
lower bound on the server's load rather than an exact figure.

**Verdict.** Both acceptance criteria pass with a wide margin: the worst room tick in the
60-player room was 6.5 ms (p99 3.2 ms) against the 20 ms limit, and one process held 10 rooms
of 30 at about a fifth of one core and 164 MB.

## Decisions taken from these numbers

- **Positions stay in Colyseus state** (DECISIONS.md, M3.5). A phone in a 60-player room
  downloads about 8 KB/s, and the patch for 60 movers costs the server under 3 ms. Moving
  positions to messages would save little and lose the free late-join/reconnect snapshot.
- **Sizing a realtime process.** Server CPU grows roughly with players: 0.06–0.1% of one core
  per climbing player here. A 0.5 vCPU process (dev) holds about 10 rooms of 30 at under half
  its CPU; a 1 vCPU process (prod) about 20 rooms of 30. Azure vCPUs are not this sandbox's
  cores, so check `cpuPercentOfOneCore` against Container Apps metrics after the first real
  games and adjust `shardCount`.
- **Memory is not the limit**: about 160 MB for the process plus well under 1 MB per player.

## Known limits of this test

- Bots and server shared a 2-vCPU machine. The server had a core to itself in practice, but
  the bot process, not the server, was the limit at 600 bots.
- Loopback networking: no latency, loss or slow phones. Interpolation and reconnects under a
  poor network are covered by the E2E and room tests, not here.
- Bots never sit in the question sheet for long, never reconnect and never use checkpoints,
  so the mix of messages is mostly position reports and spends.
- One process only. The multi-process layout (shared Redis, one public address per process)
  is checked for correctness by `apps/realtime/src/multi-process.test.ts`, not for load.
