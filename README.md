# Teckin

A mobile-first web platform for live, question-powered classroom games. The first game is
**Cogspire**, a vertical climbing race where correct answers wind up your robot's key.

The product spec is [`docs/SPEC.md`](docs/SPEC.md); build progress is in
[`docs/PROGRESS.md`](docs/PROGRESS.md) and design decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Requirements

- Node.js 22.12 or newer (`.nvmrc` pins 22)
- pnpm 10 (`corepack enable` picks up the version from `package.json`)

## Getting started

```sh
corepack enable
pnpm install
pnpm dev            # web app on http://localhost:3000
```

`pnpm dev:all` also starts the realtime server (port 2567, health check at `/health`).

### Realtime server and local services (Phase 3)

The realtime server (`apps/realtime`, Colyseus) runs on its own with in-memory presence, so
nothing else is needed for one machine. To try it the way production runs, with Redis:

```sh
docker compose up -d                     # Redis on 6379, Postgres on 5432
cp apps/realtime/.env.example apps/realtime/.env
# then set REDIS_URL=redis://localhost:6379 and a REALTIME_SHARED_SECRET of your own in that file
pnpm --filter realtime dev
```

Without Docker, any local Redis works (`redis-server`), or leave `REDIS_URL` empty.
Routes: `GET /health`, `GET /join-codes/<6 digits>` (rate-limited) and `POST /games` (game
launches from the web app, signed with `REALTIME_SHARED_SECRET`; `apps/web/.env` needs the same
value). Games are launched by signed-in hosts from the dashboard's "New game"; only hosts in the
launching host's organisation can open a game's host screen.

### Database and host sign-in (Phase 4)

Hosts sign in; players never do. The web app needs Postgres for sign-in and the dashboard
(the play pages work without it).

```sh
docker compose up -d postgres            # or any local Postgres 16+ with the same user and database
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local
# in apps/web/.env.local set AUTH_SECRET (run `npx auth secret` or `openssl rand -base64 33`)
pnpm --filter @teckin/db db:migrate      # applies packages/db/prisma/migrations
pnpm dev
```

Open `http://localhost:3000/sign-in`, enter any email address, and copy the sign-in link the
web server prints in its log (no email is sent locally). Signing in the first time creates the
account and a personal organisation. Google and Microsoft buttons appear only when their
`AUTH_GOOGLE_*` / `AUTH_MICROSOFT_ENTRA_ID_*` variables are set; deployed sign-in emails go
through `EMAIL_SERVER` (SMTP). After changing `packages/db/prisma/schema.prisma`, run
`pnpm --filter @teckin/db db:migrate:dev --name <change>` to write a migration.

Database tests (`pnpm test`) use `DATABASE_URL`, each in a throwaway schema; without it they are
skipped locally (CI always runs them).

Games are recorded by the realtime server, so give `apps/realtime/.env` the same `DATABASE_URL`
(and the same `REALTIME_SHARED_SECRET` as the web app). Finished games then appear under
"Past games" on the dashboard with a report (ranking, accuracy per player and per question,
CSV downloads). The realtime server also runs the data retention job every 6 hours: players'
answers are deleted `PLAYER_DATA_RETENTION_MONTHS` (default 12) after a game. To run it once by
hand: `pnpm --filter @teckin/db retention`. Hosts delete their account (and their organisation's
data) under Account on the dashboard.

## Playing on a phone over your local network

The dev server listens on every network interface (`0.0.0.0`), so phones on the same Wi-Fi can open it.

1. Run `pnpm dev` on your computer.
2. Find your computer's local IP address:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig`, look for "IPv4 Address"
   - Linux: `hostname -I`
3. On the phone, open `http://<that-ip>:3000` (for example `http://192.168.1.20:3000`).
4. If it does not load, allow Node.js through your computer's firewall for private networks.

Some phone features (screen wake lock, fullscreen) only work over HTTPS or on `localhost`; the
game still plays without them over plain HTTP.

## Playing the solo climb

Open `/play/solo`. Controls:

- **Phone or tablet:** on-screen buttons. Left and right sit bottom-left, jump bottom-right.
  Hold a direction with one thumb and tap jump with the other. Tap jump again in mid-air to
  double jump.
- **Keyboard:** arrow keys or WASD to move; space, up arrow or W to jump.
- Climb all six summits. Moving costs energy: tap the energy meter (top left, "Get energy")
  to answer questions; each correct answer adds energy. The top of the screen shows your
  height and the summit you are climbing; the last summit shows your results and "Play again".
- The pause button is top-right. The game also pauses by itself when you switch apps or lock
  the phone, and carries on when you come back.

URL flags:

| Flag                   | What it does                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `?debug=1`             | Shows fps, player position, held inputs, summits and time                                        |
| `?checkpoints=1`       | Each summit reached becomes a checkpoint; a "Back to checkpoint" button appears after a big fall |
| `?debug=1&autopilot=1` | A bot climbs the course (used by the automated tests)                                            |
| `?touch=1`             | Shows the touch buttons on a laptop too (they appear by themselves on touch screens)             |
| `?theme=<id>`          | Loads another theme pack (a folder name in `games/climber/themes`)                               |
| `?set=<id>`            | Question set: `maths` (default), `spelling` or `general-knowledge`                               |
| `?tune=1`              | Live balance sliders: energy per answer, jump costs, walking cost, gravity                       |

## Art and theme packs

All art is SVG. A theme pack is a folder in `games/climber/themes/<id>/`:

- `theme.json`: display name, names shown to players (game title, energy word, summit
  names), colour tokens, font stack, and colour variants of sprites (hue swaps of one SVG,
  e.g. the eight player colours).
- `sprites/*.svg`: in-world art (player, tiles, background, markers), sized in world pixels
  (one tile is 32).
- `ui/*.svg`: interface icons drawn with `currentColor`.

`pnpm build` (and `pnpm dev`) rasterise every pack into texture atlases at 1x, 2x and 3x plus a
`theme.manifest.json` in `games/climber/dist/themes/`, then copy them into
`apps/web/public/game-assets/`. The game picks the atlas resolution that matches the screen.
To rebuild art alone: `pnpm --filter @teckin/climber build`. The default theme is set with
`NEXT_PUBLIC_CLIMBER_THEME` (see `apps/web/.env.example`). A theme missing anything the game
needs fails the unit tests, and at runtime falls back to the default theme.

## Balance playtests

`pnpm --filter @teckin/climber playtest` plays the whole course headlessly for several player
profiles and prints the table recorded in `docs/playtests.md`.

## Realtime load test

`pnpm --filter realtime load-test` starts a realtime process, fills one room with 60 bot
climbers and then ten rooms with 30, and prints room tick time, CPU, memory and download per
player. Results and how to read them are in `docs/load-test.md`.

## Levels

Levels are [Tiled](https://www.mapeditor.org/) maps saved as JSON (`games/climber/maps/course.json`).
Tileset tiles carry two custom properties: `frame` (the theme sprite to draw) and `collision`
(`solid`, or `oneWay` for ledges you can jump up through). Object layers hold one `spawn` point
and `summit` zones with a whole-number `summit` property. The current course is generated from
`games/climber/src/course/course-layout.ts` with `pnpm --filter @teckin/climber generate:course`;
a unit test checks the map file matches the layout and that a bot can climb it.

## Commands

| Command          | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `pnpm dev`       | Start the web app in development mode                        |
| `pnpm dev:all`   | Start every app (web and realtime)                           |
| `pnpm build`     | Production build of every app                                |
| `pnpm lint`      | ESLint across the workspace                                  |
| `pnpm typecheck` | TypeScript (strict) across the workspace                     |
| `pnpm test`      | Unit tests (Vitest) across the workspace                     |
| `pnpm test:e2e`  | Playwright tests in phone emulation (run `pnpm build` first) |
| `pnpm format`    | Format with Prettier                                         |
| `pnpm check`     | Format check, lint, typecheck and unit tests in one go       |

The first Playwright run needs a browser: `pnpm --filter web exec playwright install chromium`.
If a Chromium is already installed elsewhere, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it instead.

## Layout

```text
apps/
  web/              Next.js: site, host dashboard, /join, /play/solo, /host/[sessionId]
  realtime/         Realtime server (Colyseus from Phase 3)
packages/
  game-contracts/   Shared types: GameDefinition, settings schemas
  room-core/        Base realtime room (Phase 3)
  questions/        Question engine (Phase 2)
  ui/               Shared React components and tokens
  engine-core/      Phaser helpers: boot, scaling, input, touch controls, themes
  platformer-kit/   Player controller, Tiled loader, camera, checkpoints
  db/               Prisma schema and data access (Phase 4)
  config/           Shared tsconfig, ESLint and Tailwind presets
games/
  climber/          Cogspire: rules, settings, tunables, scenes, theme packs
infra/              Azure infrastructure as code (written, never run during the build)
docs/               Spec, progress, decisions, demos
```

Workspace packages ship TypeScript source directly (no build step); Next.js compiles them via
`transpilePackages`, and Vitest and `tsx` run them as-is. The one build step is the Climber
art build described above.

Shared packages never import from a game. Games import from shared packages.

## Deploying

Nothing deploys automatically. `infra/` holds the Azure Bicep templates and four workflows
deploy when started by hand from the Actions tab: **Deploy platform** (Key Vault, PostgreSQL
and migrations, Communication Services Email), **Deploy realtime** (Container Apps, Redis,
registry), **Deploy web** (App Service, Blob Storage, Front Door) and **Deploy all** (the three
in order). **[`docs/DEPLOY.md`](docs/DEPLOY.md)** has the one-time Azure setup, the
step-by-step first deployment and every environment variable and secret each app needs;
[`infra/README.md`](infra/README.md) explains how the pieces fit together.

The realtime server's container image builds from the repository root:
`docker build -f apps/realtime/Dockerfile -t teckin-realtime .`

To try the production package locally:

```sh
pnpm install --config.node-linker=hoisted   # plain node_modules for the standalone server
NEXT_OUTPUT=standalone pnpm build
pnpm --filter web assemble:deploy
PORT=3000 node apps/web/.deploy/apps/web/server.js
pnpm install                                # back to the normal layout afterwards
```
