# Build progress

Each run takes the first unchecked milestone, finishes it, and ticks it. See `CLAUDE.md` for the run protocol. Milestones may be split if they turn out bigger than one run.

## Phase 1: The game works on a phone

- [x] **M1.1 Monorepo foundation.** pnpm + Turborepo workspace, all packages from the spec scaffolded (stubs where unused), shared tsconfig/ESLint/Prettier, Vitest and Playwright wired, `.gitignore`, README with run instructions, GitHub Actions CI (lint, typecheck, test).
  - Done 2026-10-07. Next run starts with M1.2: add Phaser 4 to `packages/engine-core` (verify the v4 API first), mount it from `apps/web/src/app/play/solo/page.tsx` via a client-only dynamic import, and replace the placeholder there. The `ClientGameModule` contract is in `packages/game-contracts`. Run E2E locally with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` after `pnpm build`.
- [x] **M1.2 Engine core.** Phaser 4 boot inside Next.js `/play/solo` (client-only, lazy-loaded), scaling for portrait and landscape, input abstraction (keyboard + touch → actions), on-screen touch controls with multi-touch, safe areas, zoom/scroll/selection blocking, pause on tab hidden, wake lock.
  - Done 2026-10-07. `/play/solo` boots a sandbox scene (rectangles) with touch + keyboard input, pause button, auto-pause on hidden, debug overlay (`?debug=1`). 36 E2E tests pass across the four device profiles. First check CI on GitHub: the M1.2 push's run had lint/typecheck/test/build green but sat for 20+ minutes in "Install Playwright Chromium" (the identical step took under 3 minutes for M1.1, so likely a runner hang); if it keeps hanging, add a step timeout and cache `~/.cache/ms-playwright`. Then M1.3: SVG → atlas build script and theme pack loader in `engine-core` (a Phaser-free manifest/loader core plus a `/phaser` texture loader), placeholder theme in `games/climber/themes/placeholder`, then swap the sandbox rectangles for theme sprites. Use `pickTextureScale(renderResolution * zoom)` to choose 1x/2x/3x. Verify the rasteriser library's licence (e.g. `@resvg/resvg-js`, MPL-2.0) before adding it.
- [x] **M1.3 Art and themes.** SVG → atlas build script (1x/2x/3x), theme pack format and loader, neutral placeholder theme (player, tiles, background, UI icons).
  - Done 2026-10-08. `@teckin/engine-core/art` builds theme folders into atlases + `theme.manifest.json`; `games/climber` runs it as its `build` and the web app copies the output to `public/game-assets/` before `dev`/`build`. The sandbox scene, touch buttons and pause button now draw from the placeholder theme (8 player colours, ground/platform tiles, background, checkpoint, summit marker, 4 UI icons). `?theme=<id>` switches packs; unknown packs fall back to the default. 44 E2E tests pass. Next run starts with M1.4: build `platformer-kit` (pure, unit-tested controller with coyote time, jump buffer, variable jump, double jump; Tiled JSON loader), then replace `SandboxScene` with a course scene that draws tiles via `ThemeTextures` from the Tiled map. Seen in a screenshot: at spawn the player stands behind the left touch button, because the camera is clamped to the world bottom; give the map a few tiles of floor below the spawn or a bottom camera offset so the player sits above the controls. Summit names for the HUD come from `theme.manifest.names.summitNames`.
- [x] **M1.4 Platformer kit and summits 1–2.** Player controller (coyote time, jump buffer, variable jump, double jump), Tiled JSON loader, camera follow, falling, checkpoints, summits 1 and 2, HUD, debug overlay, course-complete screen.
  - Done 2026-10-08. `@teckin/platformer-kit` holds the pure simulation (tile collision with one-way ledges, controller, fixed stepper), the Tiled loader, `CourseProgress` (summits in order, checkpoints, best height), `createHeightScale` and `CourseBot`. `CourseScene` in `games/climber/src/client` draws the Tiled course (`games/climber/maps/course.json`, generated from `src/course/course-layout.ts`) and moves the player with the kit; HUD shows metres and summit name; course-complete panel shows the time and "Play again". 52 E2E tests pass, including an autopilot climb to the finish in all four profiles. Next run starts with M1.5 (CI with the autopilot climbs was green in about 5 minutes): the Phase 1 acceptance review against the spec list, deploy scripts for the web app (Bicep + manual-only workflow, never run), `docs/demos/phase-1.md`, and a fresh-eyes self-review. Known gaps to weigh there: no E2E for the checkpoint respawn button (logic is unit-tested), the debug overlay overlaps the HUD at top-left/centre on narrow phones, and the bot always double jumps even on 3-tile steps.
- [x] **M1.5 Phase 1 wrap-up.** All Phase 1 acceptance tests, deploy scripts for the web app (Bicep + manual-only workflow), `docs/demos/phase-1.md`, self-review and fixes.
  - Done 2026-10-08. New E2E tests for checkpoint respawn and theme swapping (a generated theme served by Playwright routing); every Phase 1 criterion now maps to a test (table in `docs/demos/phase-1.md`). `infra/web/main.bicep` (App Service + Blob + Front Door + App Insights) and `.github/workflows/deploy-web.yml` (manual, `main` only); CI validates Bicep offline. Self-review fixes: button taps swallowed by the double-tap guard, pause during loading, presses leaking through resume, cleanup when mount fails. Next run starts with M2.1: the `questions` package (pure TypeScript, no Phaser). Remaining weak spots are listed under "Known to be weak" in the phase demo; the one that matters for Phase 2 is that `CourseBot` always double jumps, which will overspend energy in scripted playtests (M2.6).

## Phase 2: Questions power the climb

- [x] **M2.1 Questions package.** Question model, deck with retry rule, grading, answer events, full unit tests. Sample sets (maths, spelling, general knowledge; 30+ each).
  - Done 2026-10-08. `@teckin/questions`: Zod question/set schemas, `PresentedQuestion` (no answers), seeded `QuestionDeck` (shuffled cycles, retry after 3 others), `gradeAnswer`, `AnswerLog` summary, `QuestionQuiz` tying them together; sample sets in `packages/questions/sample-sets/*.json` (39 maths, 34 spelling, 32 general knowledge).
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
- M1.2: on a real phone, check that pinch, double-tap and pull-to-refresh do nothing on `/play/solo`, that the touch buttons clear the notch and home bar, and that locking the phone mid-jump and unlocking resumes cleanly. Note the fps shown by `?debug=1` (render resolution is capped at 2x).
- M1.4: climb both summits on a real phone; check that the jump feels fair (coyote time and jump buffer at 100 ms, short hop when jump is tapped), that falling feels readable, and try `?checkpoints=1`: fall well below summit 1 after reaching it and use "Back to checkpoint".
- M1.5: on an iPhone SE-size phone held sideways, check whether the touch buttons hide the player near the walls (the demo notes flag landscape as tight).
- M1.5: when ready to deploy, follow `infra/README.md` (resource group, OIDC identity, GitHub environment variables), then run "Deploy web" by hand.
- M1.3: on a real phone, check the placeholder art looks sharp (debug overlay shows `art 2x` on most phones) and there are no visible seams between platform tiles.

## Needs Bryan

Blockers with no workaround. Empty is good.

## Run log

One line per run: date (UTC), milestone, outcome.

- 2026-10-07 — M1.1 Monorepo foundation — done (pnpm + Turborepo, all packages scaffolded, Next.js web app, realtime health stub, Vitest + Playwright, CI).
- 2026-10-07 — M1.2 Engine core — done (Phaser 4.2.1 lazy boot, DOM input abstraction + multi-touch controls, safe areas, page guards, pause/wake lock, sandbox scene, unit + E2E tests).
- 2026-10-08 — M1.3 Art and themes — done (resvg atlas build at 1x/2x/3x with edge extrusion, theme manifest + loader with requirement checks, placeholder theme, scene and controls themed, CI browser-install timeout).
- 2026-10-08 — M1.4 Platformer kit and summits 1–2 — done (pure fixed-step platformer simulation with one-way ledges, Tiled loader, summits 1–2 course, HUD, checkpoints, course-complete screen, bot-verified course in unit and E2E tests).
- 2026-10-08 — M1.5 Phase 1 wrap-up — done (checkpoint and theme-swap E2E, web Bicep + manual deploy workflow + standalone package, phase-1 demo, self-review with 6 fixes).
- 2026-10-08 — Bryan asked for all of Phase 2 in one session, overriding the one-milestone rule for this run.
- 2026-10-08 — M2.1 Questions package — done.
