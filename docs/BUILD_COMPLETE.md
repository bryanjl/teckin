# Build complete

Teckin, the mobile-first platform for live, question-powered classroom games, is built to the
end of Phase 4 of `docs/SPEC.md`. Every milestone in `docs/PROGRESS.md` is ticked and
`docs/PAUSE` exists, so scheduled build runs now stop without changing anything. Delete
`docs/PAUSE` (and add milestones) to resume autonomous runs.

Nothing has been deployed, no accounts were created and no paid service was called.

## What was built

**The game (Phases 1 and 2).** *Cogspire*, a vertical climbing race played in portrait on a
phone: Phaser 4 inside Next.js, touch and keyboard controls with multi-touch, safe areas,
zoom/scroll blocking, wake lock and pause when hidden; a fixed-step platformer kit with six
summits; an energy economy where right answers wind up the robot's key and every jump costs
energy; a question sheet with sound and a results screen listing missed questions; theme packs
(original SVG art built into atlases, synthesised sounds) swappable with no code change. Solo
play at `/play/solo` with sample question sets.

**Multiplayer (Phase 3).** A Colyseus realtime server with a reusable room core (lobby, join
codes, nicknames with a profanity filter and generator, reconnects, lock, rename, kick,
countdown, server timer, late join), a server-authoritative Climber room (questions and energy
on the server, a movement referee), interpolated other climbers on phones, and a laptop-first
host screen (code, QR, tower view, live leaderboard, timer, end). Load-tested with bots: one
room of 60 at a p99 tick of 3.2 ms; ten rooms of 30 on one process at 21% of a core. Several
processes share Redis, one Container App each.

**Hosts (Phase 4).** Accounts with Auth.js (email magic link; Google and Microsoft when
configured), a personal organisation per host, PostgreSQL through Prisma with every query
scoped to the organisation; a mobile dashboard and question set editor with CSV import and
template; a game registry and a New game form generated from each game's settings schema;
launches signed between the web app and the realtime server with host control tied to the
signed-in organisation; a database recorder; reports (ranking, per-player and per-question
accuracy, CSV export) and Past games; automatic deletion of players' answers after 12 months;
account deletion; a `PlanLimits` seam; rate limits on join codes and sign-in; a public landing
page with privacy and terms placeholders; a strict Content Security Policy on player pages.

**Shared by every future game:** `engine-core`, `platformer-kit`, `game-contracts`
(`GameDefinition`, settings form fields), `room-core`, `session`, `questions` (authoring rules,
CSV), `nicknames`, `ui`, `db`. Shared packages never import from a game (enforced by lint and a
test).

**Deploy package.** Bicep for every component in the spec's Hosting table (`infra/platform`,
`infra/realtime`, `infra/web`), manual-only GitHub workflows (Deploy platform with migrations,
Deploy realtime, Deploy web, Deploy all), and `docs/DEPLOY.md`.

**Quality.** TypeScript strict; lint, typecheck, unit tests (Vitest) and Playwright E2E on
four phone profiles run in CI with Postgres and Redis; CI also builds and smoke-tests the
realtime image, compiles the Bicep, scans for secrets and audits dependencies. Each phase has a
demo note in `docs/demos/` with its acceptance criteria mapped to tests.

## How to run it locally

Requirements: Node.js 22, pnpm 10 (`corepack enable`), PostgreSQL 16+ (Docker Compose provides
it), optionally Redis.

```sh
corepack enable
pnpm install
docker compose up -d                              # Postgres :5432, Redis :6379
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env            # set AUTH_SECRET and REALTIME_SHARED_SECRET
cp apps/realtime/.env.example apps/realtime/.env  # same REALTIME_SHARED_SECRET, DATABASE_URL
pnpm --filter @teckin/db db:migrate
pnpm dev:all                                      # web http://localhost:3000, realtime :2567
```

Make both secrets with `openssl rand -base64 33` (the shared one must match in both files).
Sign-in links appear in the web server's log; no email is sent locally. `pnpm check` runs
format, lint, typecheck and tests; `pnpm build && pnpm test:e2e` runs the Playwright suite
(with `DATABASE_URL` set, or the host tests skip).

**On a phone:** put the phone on the same Wi-Fi as the laptop, find the laptop's address
(e.g. `192.168.1.20`), and open `http://192.168.1.20:3000`. Sign in there as a host, or open
`/join` to play a game launched from the laptop, or `/play/solo` for a solo climb. The phone
finds the realtime server on the same address at port 2567, so allow ports 3000 and 2567
through the laptop's firewall. Open the host screen on the laptop at its network address too
(not `localhost`), so the QR code and join link work for phones. Add `?debug=1` to a play
page for the fps overlay.

## How to deploy it

Follow [`docs/DEPLOY.md`](DEPLOY.md): create a resource group and a federated deploy identity,
set the GitHub environment variables and secrets (`POSTGRES_ADMIN_PASSWORD`,
`REALTIME_SHARED_SECRET`, `AUTH_SECRET`, later `EMAIL_SERVER`), run **Deploy platform**, set up
the SMTP sender for sign-in emails, then **Deploy realtime** and **Deploy web** (or **Deploy
all**). The document lists every environment variable each app needs, sizes and costs per
environment, operations and hardening steps.

## For Bryan to check

Manual checks the build could not do (real phones, real networks, a real Azure deployment),
collected from every milestone:

- Phase 1: play on a real iPhone and Android over the local network; check fps with `?debug=1`.
- M1.2: on a real phone, check that pinch, double-tap and pull-to-refresh do nothing on `/play/solo`, that the touch buttons clear the notch and home bar, and that locking the phone mid-jump and unlocking resumes cleanly. Note the fps shown by `?debug=1` (render resolution is capped at 2x).
- M1.4: climb both summits on a real phone; check that the jump feels fair (coyote time and jump buffer at 100 ms, short hop when jump is tapped), that falling feels readable, and try `?checkpoints=1`: fall well below summit 1 after reaching it and use "Back to checkpoint".
- M1.5: on an iPhone SE-size phone held sideways, check whether the touch buttons hide the player near the walls (the demo notes flag landscape as tight).
- M1.5: when ready to deploy, follow `infra/README.md` (resource group, OIDC identity, GitHub environment variables), then run "Deploy web" by hand.
- Phase 2: play a full solo game on your phone with `?set=maths`, answer some wrong on purpose, and check the missed questions on the results screen. Judge the balance (an average player needs about 18 minutes; try `?tune=1`), whether "Get energy" at the top left is easy enough to reach, and whether the Cogspire robot reads clearly at phone size.
- Phase 2: check sound on an iPhone (it unlocks on the first tap) and that the mute choice survives a reload.
- Phase 2: review the sample questions (`packages/questions/sample-sets/*.json`) before showing them to a class.
- M3.1: if you have Docker, run `docker compose up -d` and start the realtime server with `REDIS_URL=redis://localhost:6379` to confirm it connects (the build environment tested against a local `redis-server`, not the compose file).
- M3.3: start `pnpm --filter realtime dev` and `pnpm dev` (with the same `REALTIME_SHARED_SECRET` in `apps/realtime/.env` and `apps/web/.env`), sign in at `http://<laptop-ip>:3000` on the laptop and launch a game from New game (this replaced `/dev/new-game` in M4.3), join from two phones at `/join`, and check: the number keypad appears for the code, "Random name" names, the lobby, the countdown, other climbers gliding smoothly (not jumping) with readable name labels, the rank line, and that locking a phone for a minute brings it back where it was. Try a few rude nicknames your class might try and tell me any that get through.
- M3.4: launch a game from New game on the laptop at its network address (not localhost), project the host screen, and check from the back of the room that the code and QR read (scan the QR with a phone camera), that dots glide up the tower and match the climbers' colours on the phones, and try rename, remove, lock, +1 min and End. Open the host screen on a second laptop signed in to the same account.
- M3.5: run a real game with your phone plus two other devices on your network (the Phase 3 manual criterion; steps in `docs/demos/phase-3.md`).
- M3.5: optional, on your own machine: `pnpm --filter realtime load-test` and compare with `docs/load-test.md` (the sandbox has 2 vCPUs).
- M3.5: when ready to deploy, run "Deploy realtime" first (see `infra/README.md`), save the printed entry URL as the environment variable `REALTIME_URL`, then run "Deploy web". Set the `REALTIME_SHARED_SECRET` environment secret first (see `infra/README.md`). Check Azure Managed Redis `Balanced_B0` pricing in your region before the first deploy; it is the largest fixed cost of the realtime stack.
- M4.1: with Postgres running (README "Database and host sign-in"), sign in at `http://localhost:3000/sign-in` with the link from the server log, check the dashboard shows your organisation, sign out, and check that an old link no longer works. When you have Google or Microsoft app registrations, set their variables and check the buttons appear and sign in to the same account when the email matches. Read the sign-in email wording in `apps/web/src/auth/magic-link.ts` before it goes to real hosts.
- M4.1: if you have Docker, run `pnpm --filter @teckin/db db:migrate` against the compose Postgres once to confirm Prisma Migrate applies the migration on your machine (the build sandbox could not download Prisma's schema engine; CI does this on every push).
- M4.2: on your phone, sign in, write a set of 5+ questions in the editor (try reorder, duplicate, delete, switching type), then import a CSV saved from Excel or Google Sheets (download the template from the editor first). If your Excel saves with semicolons, check that imports too. Read the editor's wording and the CSV error messages as a teacher would.
- M4.3: sign in on your phone, open New game, launch a Climber game with your set (try checkpoints on), and open the host screen on the laptop by signing in there with the same email. Check that the settings read well to a teacher (labels and help come from the game's schema) and that the Launch button stays reachable. Locally both apps need the same `REALTIME_SHARED_SECRET` in `apps/web/.env` and `apps/realtime/.env`.
- M4.4: run a real game from New game with two phones (both apps need `DATABASE_URL` and the same `REALTIME_SHARED_SECRET`), end it, then open Past games → the report on your phone. Check the figures look right, the "Answers chosen" breakdown is useful, and open both CSV downloads in Excel or Google Sheets. Then try Account → Delete account on a throwaway sign-in.
- M4.5: read `docs/DEPLOY.md`, then deploy `dev` with Deploy all (secrets first; the SMTP step after the first platform run). On the deployed site: sign up from the landing page on your phone, save a set (if saving fails with "Invalid Server Actions request", see `docs/demos/phase-4.md`), run a game with two phones and read the report. Check that the sign-in email arrives (and not in junk) and that the realtime processes' `/health` pages answer.
- M4.5: replace the PLACEHOLDER text on `/privacy` and `/terms` with reviewed wording (operator, contact, region, legal basis, school controller/processor roles) before real schools use it. Read the landing page as a teacher would.
- M4.5: on a phone, open the browser's developer console on `/play/solo` and a live game (or watch for broken behaviour) to confirm the Content Security Policy blocks nothing on real Safari and Chrome.
- M1.3: on a real phone, check the placeholder art looks sharp (debug overlay shows `art 2x` on most phones) and there are no visible seams between platform tiles.

## Known weak spots

The details are in each phase's demo note (`docs/demos/phase-1.md` to `phase-4.md`, "Known to
be weak"). The ones that matter most:

- **Never deployed.** The Bicep compiles and the workflows lint cleanly, but the first real
  deployment may need small fixes (role assignment delays, regional SKUs, provider
  registration). Server actions behind Front Door depend on `X-Forwarded-Host`; the fix if
  they fail is in `docs/demos/phase-4.md`.
- **Real-device performance is unmeasured.** Fps, touch feel and sound were tested in emulated
  phone profiles only; the baseline Android and iPhone SE checks are in the list above.
- **Load was tested on loopback with 2 vCPUs.** Real latency and Azure CPUs differ; watch
  Container Apps CPU after the first real games. Each realtime deploy ends running games.
- **Monitoring is thin.** Application Insights is provisioned but no SDK sends app telemetry;
  logs are plain console output with the session id as correlation.
- **Database and secrets use public endpoints** (TLS plus credentials or identities), and the
  apps use the database admin login. Hardening steps are in `docs/DEPLOY.md`.
- **Sign-in email** uses an Azure-managed sender domain until a custom domain is added.
- **Legal pages and sample questions** are placeholders to review before real classes.
- **One E2E test (multiplayer) is occasionally slow under load** and passes on retry.
