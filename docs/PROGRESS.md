# Build progress

Each run takes the first unchecked milestone, finishes it, and ticks it. See `CLAUDE.md` for the run protocol. Milestones may be split if they turn out bigger than one run.

## Phase 1: The game works on a phone

- [x] **M1.1 Monorepo foundation.** pnpm + Turborepo workspace, all packages from the spec scaffolded (stubs where unused), shared tsconfig/ESLint/Prettier, Vitest and Playwright wired, `.gitignore`, README with run instructions, GitHub Actions CI (lint, typecheck, test).
  - Done 2026-10-07. Next run starts with M1.2: add Phaser 4 to `packages/engine-core` (verify the v4 API first), mount it from `apps/web/src/app/play/solo/page.tsx` via a client-only dynamic import, and replace the placeholder there. The `ClientGameModule` contract is in `packages/game-contracts`. Run E2E locally with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` after `pnpm build`.
- [ ] **M1.2 Engine core.** Phaser 4 boot inside Next.js `/play/solo` (client-only, lazy-loaded), scaling for portrait and landscape, input abstraction (keyboard + touch → actions), on-screen touch controls with multi-touch, safe areas, zoom/scroll/selection blocking, pause on tab hidden, wake lock.
- [ ] **M1.3 Art and themes.** SVG → atlas build script (1x/2x/3x), theme pack format and loader, neutral placeholder theme (player, tiles, background, UI icons).
- [ ] **M1.4 Platformer kit and summits 1–2.** Player controller (coyote time, jump buffer, variable jump, double jump), Tiled JSON loader, camera follow, falling, checkpoints, summits 1 and 2, HUD, debug overlay, course-complete screen.
- [ ] **M1.5 Phase 1 wrap-up.** All Phase 1 acceptance tests, deploy scripts for the web app (Bicep + manual-only workflow), `docs/demos/phase-1.md`, self-review and fixes.

## Phase 2: Questions power the climb

- [ ] **M2.1 Questions package.** Question model, deck with retry rule, grading, answer events, full unit tests. Sample sets (maths, spelling, general knowledge; 30+ each).
- [ ] **M2.2 Session and energy.** `GameSession` interface and `LocalSession`; energy meter, costs, zero-energy crawl, "Get energy" button; tunables in one config.
- [ ] **M2.3 Question sheet and results UI.** Shared bottom sheet, feedback animations, results screen with missed questions, reduced motion, sound with mute.
- [ ] **M2.4 Cogspire theme.** Full SVG theme pack (robot with colour variants, tiles, hazards, backgrounds per summit), made the default.
- [ ] **M2.5 Summits 3–6.** Maps and hazards (moving platforms, crumbling ledges, vents, timed barriers).
- [ ] **M2.6 Balance and wrap-up.** Tuning panel, scripted bot playtests recorded in `docs/playtests.md`, all Phase 2 acceptance tests, `docs/demos/phase-2.md`, self-review and fixes.

## Phase 3: Multiplayer

- [ ] **M3.1 Realtime server and room-core.** Colyseus app, base room with join codes (Redis), lobby, lifecycle, timer, late join, reconnect, kick/rename/lock, room cap, `SessionRecorder` (in-memory). `docker-compose.yml` for Redis and Postgres.
- [ ] **M3.2 Climber room.** Server-authoritative questions and energy, movement validation, summit and win logic, `NetworkSession` on the client.
- [ ] **M3.3 Join flow and player view.** `/join`, nickname filter and generator, other players rendered with interpolation (nearest 15), rank readout, `/dev/new-game`.
- [ ] **M3.4 Host live screen.** Code, QR, lobby list, tower view, live leaderboard, timer controls, end-of-game results.
- [ ] **M3.5 Load, scaling and wrap-up.** Bot load tests recorded in `docs/load-test.md`, scaling decision, Bicep for realtime/Redis/Key Vault, all Phase 3 acceptance tests, `docs/demos/phase-3.md`, self-review and fixes.

## Phase 4: Hosts and game creation

- [ ] **M4.1 Database and accounts.** Prisma schema and migrations, Auth.js (magic link logged locally; Google/Microsoft via env), organisations and memberships, org-scoped data access layer.
- [ ] **M4.2 Question set editor.** Dashboard, editor, CSV import/template, validation.
- [ ] **M4.3 Game registry and launch.** Registry, schema-driven settings form, launch tied to the signed-in host, remove `/dev/new-game`.
- [ ] **M4.4 Persistence and reports.** Database recorder, reports, CSV export, past games, retention job, account deletion, `PlanLimits` seam, rate limiting.
- [ ] **M4.5 Deploy package and final wrap-up.** Bicep for every component, manual-only deploy workflows, `docs/DEPLOY.md`, landing/privacy/terms placeholders, end-to-end test, `docs/demos/phase-4.md`, final self-review, `docs/BUILD_COMPLETE.md`.

## For Bryan to check

Manual checks the build cannot do (real phones, real-world performance). Runs add items here.

- Phase 1: play on a real iPhone and Android over the local network; check fps with `?debug=1`.

## Needs Bryan

Blockers with no workaround. Empty is good.

## Run log

One line per run: date (UTC), milestone, outcome.

- 2026-10-07 — M1.1 Monorepo foundation — done (pnpm + Turborepo, all packages scaffolded, Next.js web app, realtime health stub, Vitest + Playwright, CI).
