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
- The pause button is top-right. The game also pauses by itself when you switch apps or lock
  the phone, and carries on when you come back.

URL flags:

| Flag       | What it does                                                                         |
| ---------- | ------------------------------------------------------------------------------------ |
| `?debug=1` | Shows fps, player position and held inputs, and draws physics bodies                 |
| `?touch=1` | Shows the touch buttons on a laptop too (they appear by themselves on touch screens) |

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
`transpilePackages`, and Vitest and `tsx` run them as-is.

Shared packages never import from a game. Games import from shared packages.
