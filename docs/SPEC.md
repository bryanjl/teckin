# Climber Game Platform — Build Spec

Oct 7, 2026 · Bryan. Repository copy, adjusted Oct 8, 2026 for an autonomous, local-only build. Where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.

## Overview

We are building a mobile-first web platform for live, question-powered classroom games, starting with a vertical climbing race. The game is inspired by the mechanics of Gimkit's "Don't Look Down" (game mechanics are not ownable), but it uses original art, names, maps and code. Copy no Gimkit assets, text, level layouts or branding.

**Who uses it**

- **Hosts** (teachers, tutors, trainers) sign up on our site, build question sets, launch games and read reports.
- **Players** (often children) join on a phone, tablet or laptop with a game code and a nickname. Players have no accounts and give no personal data.

**The product is a platform, not one game.** Rooms, join codes, lobbies, players, timers, questions, scoring and reports are shared. Each game is a plug-in that supplies only its world and rules. More platformers, top-down games and quiz-show games will follow, so every phase builds shared pieces first.

**Phases at a glance.** Each phase ends with something Bryan can open on his phone and see working. Nothing is deployed during the build; everything runs locally, and Bryan opens the local dev server on his phone over his network.

| Phase | Visible goal | Proof |
| --- | --- | --- |
| 1. The game works | Climb a two-summit course on a phone with touch controls; fall, land, reach the summit | Local dev server played on an iPhone and an Android phone |
| 2. Questions power the climb | Answer questions to earn energy; jumping spends it; all 6 summits; finish screen | Solo run from start to top with a sample question set |
| 3. Multiplayer | 3+ devices join with a code, see each other climb live, first to the top wins | Host screen + 2 phones + 1 laptop in one local game |
| 4. Hosts and game creation | Sign up, write a question set, configure and launch a game, share code/QR, read the report | A stranger can go from sign-up to a finished game without help |

Billing, homework assignments and more games come after Phase 4 (see Open decisions).

## Theme concepts

Decision for the build: **Cogspire**, because its energy mechanic is visible on the character itself, which helps young players understand the core rule without reading. All three concepts are original and fit the same rules and map structure. The theming layer (see Architecture) makes switching concepts cheap, so Phase 1 ships with a neutral placeholder and Cogspire arrives in Phase 2.

| Concept | Setting | Player character | Energy is shown as | Falling | Six summits | Palette |
| --- | --- | --- | --- | --- | --- | --- |
| **Cogspire** (chosen) | Climbing the inside of a giant clock tower | Small wind-up robot with a key on its back | The key: it spins and the robot glows as energy fills; it slows and dims when low | Clatters down through gears and pendulums | Boiler Room, Gear Gallery, Pendulum Hall, Chime Loft, Clock Face, The Bell | Brass, copper, deep navy, warm lamp yellow |
| **Updraft** | Floating sky islands above the clouds | Little explorer with a long glider scarf | Wind gusts swirling around the scarf | Tumbles through cloud layers | Meadow Ledge, Windmill Cliffs, Cloud Bridges, Storm Shelf, Aurora Spire, The Crown | Sky blue, sunrise coral, cloud white |
| **Surface!** | Rising from the sea floor to the surface | Tiny diver in an oversized helmet | Air bubbles in a tank | Sinks back down through the water | Trench, Kelp Forest, Wreck, Coral Wall, Sunlit Shallows, The Surface | Deep teal, bioluminescent cyan, sand |

Art direction for any concept:

- All art is authored as **SVG**: characters, tiles, hazards, UI icons and backgrounds.
- Flat shapes, thick outlines and strong contrast. Sprites must read at 32 px tall on a small phone.
- The character set holds 6 to 8 colour variants so players in one room can tell each other apart. Variants are hue swaps of one SVG.
- No text baked into art, so the game can be translated later.

## Principles and constraints

These rules apply to every phase. When a task conflicts with one of them, pick the option that best keeps the principle, record the trade-off in `docs/DECISIONS.md`, and continue.

**Mobile first**

- Design and test on a phone first. Desktop is a wider layout of the same thing, not the primary target.
- The game is played in **portrait**; the climb is vertical, so portrait shows more of the course. Landscape must still work.
- Baseline devices: iPhone SE-size screen (375 × 667 CSS px) and a roughly three-year-old mid-range Android phone on Chrome.
- Performance: 60 fps target, never below 30 fps on the baseline Android. First playable load under 3 MB over the network.
- Touch targets at least 56 px. Respect safe-area insets (notches, home bar).
- Block pinch-zoom, double-tap zoom, text selection, long-press menus and pull-to-refresh on the play screen.
- Hold a screen wake lock during play where the browser supports it.
- Phones lock and switch apps mid-game. Every phase must survive the tab being hidden and shown again.

**Product, not a classroom project**

- Many hosts run many games at once. Nothing may assume a single room, a single host or a single server process.
- Configuration lives in settings and environment variables, never in code constants scattered across files.
- Every tunable game number (energy, jump costs, physics) lives in one config object per game.

**Players are often children**

- Players never create accounts and are never asked for a real name, email, age, photo or location.
- Nicknames pass a profanity filter. Hosts can rename or remove a player.
- An optional nickname generator gives safe random names.
- No ads, no third-party trackers on player pages, no chat between players.
- Player answer data belongs to the host's organisation and is deleted with it.

**Reuse by default**

- Before writing code for the climber game, ask whether another game would need it. If yes, it goes in a shared package.
- Shared packages never import from a game. Games import from shared packages.

## Architecture

The system is a TypeScript monorepo with two deployable apps (a Next.js web app and a Colyseus realtime server) and a set of shared packages. Each game is a plug-in package that implements one contract. Arrows below point from the importer to what it imports; shared packages never import a game.

```text
apps/web ──────┐                 ┌────── apps/realtime
               ▼                 ▼
   [ shared platform packages: game-contracts, room-core, questions, ui,
     engine-core, platformer-kit, db, config ]
               ▲
   [ game plug-ins: games/climber, (future) next platformer, top-down, quiz-show ]
```

**Stack.** Verify current versions and APIs before starting (Context7 if available, otherwise the official docs). Phaser 4 is a major rewrite of Phaser 3, so do not follow Phaser 3 tutorials blindly.

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, strict mode | Everywhere, including the server |
| Monorepo | pnpm workspaces + Turborepo | One install, cached builds |
| Web app | Next.js (App Router) + Tailwind | Marketing, host dashboard, join and play pages |
| Game rendering | Phaser 4 (current stable, 4.1 as of Apr 2026) | Arcade physics; loaded only on the play page, client-side only |
| Realtime | Colyseus (current stable) | Rooms, matchmaking, state sync, reconnection |
| Database | PostgreSQL + Prisma | Local Postgres in development; Azure Database for PostgreSQL Flexible Server when deployed |
| Cache / presence | Redis | Needed from Phase 3 for Colyseus presence and join-code lookup |
| Auth | Auth.js | Hosts only. Email magic link, Google, Microsoft |
| Validation | Zod | Shared schemas for settings, messages and API input |
| Levels | Tiled map editor (JSON export) | Maps are data, not code |
| Testing | Vitest, Playwright (mobile emulation), Colyseus test utilities | |

**Repository layout**

```text
apps/
  web/                Next.js: site, host dashboard, /join, /play/[code], /host/[sessionId]
  realtime/           Colyseus server: registers each game's room
packages/
  game-contracts/     Shared types: GameDefinition, room state base, messages, settings schemas
  room-core/          Base Colyseus room: lobby, join codes, players, timer, start/end, reconnect, kick
  questions/          Question engine: deck, shuffle, grading, retry queue, answer events
  engine-core/        Phaser helpers: boot, scaling, asset/theme loading, input abstraction, touch controls, HUD base
  platformer-kit/     Player controller, Tiled loader, hazards, checkpoints, camera follow (any platformer)
  ui/                 React components + design tokens: lobby, question sheet, leaderboard, results
  db/                 Prisma schema, migrations, data access
  config/             Shared tsconfig, ESLint, Tailwind presets
games/
  climber/            The climbing game: rules, energy, summits, maps, theme packs
    client/           Phaser scenes for this game
    server/           Room logic extending room-core
    themes/           cogspire/, placeholder/ (SVG + tokens + names)
infra/                Azure infrastructure as code (Bicep). Written, never run during the build
docs/                 SPEC, PROGRESS, DECISIONS, DEPLOY, playtest notes
```

**The game contract.** A new game is added by implementing this and registering it in both apps. Nothing else in the platform changes.

```ts
interface GameDefinition<Settings, State> {
  id: string;                         // "climber"
  displayName: string;
  settingsSchema: ZodSchema<Settings>;// drives the host's settings form
  defaultSettings: Settings;
  supportsAssignments: boolean;
  createServerRoom: RoomFactory<Settings, State>;  // extends room-core
  loadClientGame: () => Promise<ClientGameModule>; // lazy-loaded Phaser scenes
  rankPlayers: (state: State) => PlayerRanking[];  // used by shared leaderboard and report
  summarisePlayer: (state: State, playerId: string) => Record<string, number | string>;
}
```

**What the platform owns vs what a game owns**

| Platform (shared) | Game (per plug-in) |
| --- | --- |
| Host accounts, organisations, question sets | World, map, physics tuning |
| Game sessions, join codes, QR, lobby | Rules and win condition |
| Players, nicknames, reconnect, kick | How answers turn into power (energy, coins, moves) |
| Question delivery, grading, answer log | Game-specific HUD |
| Timer, start, end, pause | Theme packs |
| Leaderboard UI, results, reports | Game-specific report columns |

**Who is authoritative.** The server decides everything that affects fairness: which question is shown, whether an answer is correct, how much energy a player has, summit progress and the winner. Platformer physics runs on each client, because players do not collide and server-side physics for many players would cost a lot of CPU for little gain. The server validates movement: maximum speed, maximum jump height per energy spent, and summit order. It rejects impossible positions. This trade-off is deliberate; revisit it if cheating becomes a real problem.

**Networking.** Clients send position at about 10 Hz plus discrete events (jump, landed, summit reached, answer). Other players are drawn by interpolating between snapshots. Use Colyseus state for the roster and scores, and messages for high-frequency positions if state patches prove too heavy.

## Climber game rules

Players race up one tall course of 6 summits; correct answers earn energy, and moving and jumping spend it. The first player to the top wins. If time runs out, the highest player wins.

**Core loop**

1. The player runs and jumps up platforms. Every move spends energy.
2. When energy is low or empty, the player opens the question sheet and answers questions. Each correct answer adds energy.
3. A wrong answer adds nothing and shows the correct answer for 2 seconds before the next question. It costs time, not energy.
4. The player closes the sheet and keeps climbing. While the sheet is open, the character stands still and cannot fall.

**Movement.** Left, right, jump and double jump (jump again in mid-air). A running start jumps further. Hazards from summit 3 up: moving platforms, crumbling ledges, wind or steam vents that push sideways, and timed laser or spark barriers that knock the player down.

**Falling.** A missed jump drops the player until they land on a lower platform. Falling never costs energy. The higher the climb, the longer the possible fall; this is the tension the game is built on.

**Checkpoints.** A host setting, off by default. When on, reaching the top of a summit saves a checkpoint, and a player who falls below it can respawn there. Recommend turning checkpoints on for younger classes.

**Summits.** 6 summits of roughly equal climb height, reaching 1,000 m on the course's height scale. Difficulty rises: summits 1 and 2 teach movement with wide platforms; summits 5 and 6 need precise double jumps over long drops.

**Winning**

- The game ends when a player reaches the top, the timer ends, or the host ends it.
- If no one reached the top, rank by current height. Ties break by best height reached, then by who reached it first.
- Results show each player's rank, best height, summits reached, questions answered and accuracy.

**Tunables (starting values, to be adjusted in Phase 2 playtests)**

| Setting | Default | Range | Set by |
| --- | --- | --- | --- |
| Energy per correct answer | 100 | 20 to 500 | Host |
| Game duration | 15 min | 5 to 60 min | Host |
| Checkpoints | Off | On / Off | Host |
| Summit goal (assignments) | 6 | 1 to 6 | Host |
| Jump cost | 10 | Config | Game config |
| Double jump cost | 15 | Config | Game config |
| Walking cost | 1 per tile moved | Config | Game config |
| Starting energy | 50 | Config | Game config |

At zero energy the player cannot jump and walks at a slow crawl with no cost, so they can reach a safer spot before answering questions.

## Phase 1: The game works on a phone

**Goal you can see:** run the local dev server, open it on your phone over your network, climb two summits with on-screen controls, fall, land, and reach a "Course complete" screen with your time.

**Shared pieces this phase introduces:** monorepo, engine-core (boot, scaling, input, touch controls, theme loading), platformer-kit (player controller, Tiled loader, camera, checkpoints), the placeholder theme pack, CI.

**Scope**

- Scaffold the monorepo, apps/web and the packages listed in Architecture. Stub any package not used yet.
- Play page at `/play/solo`. Phaser loads only there, client-side only (dynamic import, no server rendering).
- **Input abstraction.** The game reads actions (`moveLeft`, `moveRight`, `jump`), never raw keys or touches. Keyboard (arrows, WASD, space) and touch both produce the same actions. Future games add gamepad or tap-to-move here.
- **Touch controls.** Left and right buttons bottom-left, jump bottom-right, semi-transparent, at least 72 px, multi-touch (hold right and tap jump together). Optional haptic tick on jump where supported.
- **Feel.** Arcade physics with coyote time (~100 ms after leaving a ledge), jump buffering (~100 ms before landing), variable jump height (release early for a short hop) and double jump. These make touch platforming fair and are not optional.
- **Scaling.** Fixed world width in tiles, scaled to fit the screen width in portrait. The camera follows the player vertically with a little look-ahead upward.
- **Levels from Tiled.** Summits 1 and 2 built as Tiled JSON with collision layers, a spawn point and summit markers. Hand-authored JSON or a generator script is fine; the format must stay Tiled-compatible.
- **SVG art pipeline.** Art is authored as SVG. A build script rasterises it into texture atlases at 1x, 2x and 3x; the game picks the atlas by device pixel ratio.
- **Theme packs.** A theme is a folder: SVG sprites, a tokens file (colours, fonts), and names (game title, summit names, energy word). Ship the neutral placeholder theme. Switching theme needs no code change.
- **HUD.** Height in metres, current summit name, a pause button. A debug overlay (fps, player position) turns on with `?debug=1`.
- Falling and landing. Checkpoints work and can be turned on with `?checkpoints=1`.
- Pause automatically when the tab is hidden; resume cleanly when it returns.
- Course-complete screen with time and a "Play again" button.
- The dev server listens on the local network (`0.0.0.0`) and the README says how to open it on a phone.
- GitHub Actions: lint, typecheck and test on every push. A deploy workflow exists but only runs when triggered by hand.

**Out of scope:** questions, energy, multiplayer, accounts, database, summits 3 to 6.

**Acceptance criteria**

- [ ] Playable from start to the top of summit 2 in Playwright's iPhone and Android device emulation, portrait and landscape
- [ ] No page scroll, zoom, text selection or pull-to-refresh while playing
- [ ] Holding a direction and tapping jump at the same time works (automated multi-touch test)
- [ ] Controls respect safe-area insets
- [ ] Hiding and showing the tab resumes the game without glitches (automated test)
- [ ] Swapping the theme folder changes all art and names with no code change
- [ ] Unit tests cover the input abstraction, the Tiled loader and the player controller's jump rules
- [ ] A Playwright test loads `/play/solo` in a mobile viewport and sees the game start
- [ ] CI is green
- [ ] Manual, for Bryan: play on a real iPhone and Android over the local network; check 60 fps / 30 fps with `?debug=1`

**Demo:** Bryan runs the dev server, opens it on his phone and on a laptop, climbs both summits on each, falls at least once, and reaches the finish screen.

## Phase 2: Questions power the climb

**Goal you can see:** play solo on your phone with a sample question set, answer questions to fill your energy, spend it climbing all 6 summits, and finish with a results screen showing time and accuracy.

**Shared pieces this phase introduces:** the questions package, the question sheet and results UI, and the session interface that Phase 3 swaps for a networked version.

**Scope**

- **Questions package (pure TypeScript, no browser or server dependencies).** It must run unchanged on the server in Phase 3.
  - Question types: multiple choice (2 to 4 options, one correct) and true/false. Typed answers come later.
  - Deck: shuffled, no repeats until every question has been seen, and a wrongly answered question comes back after 3 others.
  - Grading and an answer event: question id, chosen option, correct or not, time taken.
- **Session interface.** The game talks to a `GameSession` (get next question, submit answer, energy changes, progress events), never to the question engine directly. Phase 2 ships `LocalSession`; Phase 3 adds `NetworkSession` with the same interface.
- **Question sheet (HTML over the canvas, in packages/ui).** A bottom sheet covering about 60% of the screen in portrait, with answer buttons reachable by one thumb. Large text. Correct answers animate energy flying into the meter. Wrong answers highlight the right one for 2 seconds. Because it is HTML, screen readers and text scaling work.
- **Energy in the climber game.** An energy meter in the HUD. Costs follow the tunables table. A "Get energy" button pulses when energy is under 20. At zero, the player can crawl but not jump.
- **Cogspire theme pack** in SVG, replacing the placeholder as the default.
- **Summits 3 to 6** built as Tiled JSON, with the hazards listed in the rules.
- **Sample question sets** as seed JSON: grade 3/4 maths, spelling and general knowledge, 30+ questions each. Pick one with `?set=maths`.
- **Results screen** (shared, in packages/ui): time, summits reached, questions answered, accuracy, and a list of missed questions with correct answers.
- **Tuning panel** behind `?tune=1`: sliders for energy per answer, jump costs and gravity, so balance can be tested on a phone without restarting.
- **Sound.** Jump, land, correct, wrong and summit sounds (generated or synthesised; no licensed audio), with a mute toggle that is remembered.
- **Reduced motion.** Respect the system setting: no screen shake, simpler energy animation.

**Out of scope:** other players, a server, accounts, writing your own questions.

**Acceptance criteria**

- [ ] A full solo run from bottom to top completes in an automated test (scripted inputs and answers) with each sample set
- [ ] Energy only rises on correct answers and only falls on moves, matching the tunables table
- [ ] A scripted "skilled player" bot finishes in 8 to 12 simulated minutes at default settings; record the numbers in `docs/playtests.md`
- [ ] The question sheet works one-handed on a 375 px wide screen
- [ ] The game cannot move while the sheet is open, and resumes exactly where it was
- [ ] Unit tests cover the deck order, the retry rule, grading and energy accounting
- [ ] The climber game imports questions only through `GameSession`
- [ ] Manual, for Bryan: a real playtest on his phone to confirm balance

**Demo:** Bryan plays a full solo game on his phone with the maths set, deliberately answers some wrong, and reviews the missed questions on the results screen.

## Phase 3: Multiplayer

**Goal you can see:** a host screen on a laptop shows a game code and QR. Two phones and another laptop on the same network join with nicknames, appear in the lobby, race up the course seeing each other live, and everyone sees the same winner and leaderboard.

**Shared pieces this phase introduces:** the realtime server, room-core (the base room every future game extends), `NetworkSession`, the lobby, the host live screen and the shared leaderboard.

**Scope**

- **Temporary game creation.** A dev-only page `/dev/new-game`, protected by a secret in an environment variable, creates a game with default settings and a seed question set. Phase 4 replaces it.
- **Room-core (shared).**
  - Join codes: 6 digits, unique among active games, stored in Redis, expire when the game ends.
  - Join flow at `/join`: enter code, then nickname (or tap "Random name"). Nicknames pass the profanity filter and must be unique in the room.
  - Lobby: players appear live on the host screen. The host can kick or rename a player and lock the lobby.
  - Lifecycle: lobby, 3-2-1 countdown, playing, ended. Timer runs on the server.
  - Late join: allowed by default, as a host setting.
  - Reconnect: a player whose phone locks or loses signal rejoins as the same player within 3 minutes, keeping energy and progress.
  - Room cap: 60 players by default, configurable.
  - A `SessionRecorder` interface receives every answer, progress and result event. Phase 3 uses an in-memory recorder; Phase 4 writes to the database.
- **Server-authoritative climber room.** Runs the questions package and energy accounting on the server. Validates reported movement (speed, jump height for energy spent, summit order) and snaps back impossible positions.
- **Player view.** Other players appear as semi-transparent climbers with nickname labels, interpolated smoothly. Draw at most the 15 nearest to keep low-end phones fast. A compact rank and height readout sits in the HUD.
- **Host live screen** at `/host/[sessionId]`, built for a laptop or projector: large code, QR and join URL in the lobby; during play, a tower view with every player's dot at their height, a live leaderboard, the timer, and buttons to end the game or add time.
- **End of game.** Everyone sees the same ranking. Players see their own results screen; the host sees the full leaderboard.
- **Local services.** A `docker-compose.yml` for Redis and Postgres for Bryan's machine. If Docker is not available where the build runs, use whatever local substitute works and document it.
- **Deploy scripts only.** Bicep for Azure Container Apps (realtime) and Azure Cache for Redis, plus a manual-only deploy workflow. Do not run them.
- **Load test** with the Colyseus load-test tool or a scripted bot client checked into the repo.
- **Scaling decision.** Read the Colyseus scalability docs, pick a multi-process routing approach for Azure (see Hosting), record it in DECISIONS.md and reflect it in the Bicep.

**Out of scope:** host accounts, saved games, reports, writing question sets.

**Acceptance criteria**

- [ ] An automated test runs a host and 3 simulated clients through one full game; all see the same winner
- [ ] A client that disconnects for 60 seconds and reconnects resumes as the same player with the same energy and height (automated test)
- [ ] A kicked player cannot rejoin with the same device unless the host allows it
- [ ] A client that sends impossible positions or forged answers gains nothing (automated test)
- [ ] One room of 60 bot players runs locally with server tick time under 20 ms; record results in `docs/load-test.md`
- [ ] 10 concurrent rooms of 30 bots run on a single server process; record CPU and memory
- [ ] Room-core has no imports from games/climber
- [ ] Manual, for Bryan: a real game with his phone plus two other devices on his network

**Demo:** Bryan runs a game from his laptop, joins on his phone plus two other devices, and plays it through to a winner.

## Phase 4: Hosts and game creation

**Goal you can see:** someone who has never seen the product signs up, writes a question set, launches a Climber game with their own settings, runs it with players, and opens a report afterwards, all without help.

**Shared pieces this phase introduces:** accounts and organisations, the question set editor, the game registry and auto-generated settings form, persistent sessions, and reports. All of these serve every future game.

**Scope**

- **Accounts.** Auth.js with email magic link, Google and Microsoft sign-in. Sign-up creates a personal organisation. The schema supports owner and member roles; inviting members can wait. Locally, magic-link emails are printed to the server log (or a local mail catcher) so sign-in works with no external services; OAuth providers are configured by environment variables and simply hidden when unset.
- **Dashboard.** Question sets, recent games, "New game". Mobile-first like everything else. The host live screen stays laptop-first because it is usually projected.
- **Question set editor.** Create, edit, reorder, duplicate and delete questions; multiple choice and true/false; mark the correct answer. Import from CSV with a downloadable template. A set needs at least 5 questions to be used in a game.
- **Game registry.** The "New game" page lists every registered `GameDefinition`; Climber is the only one now.
- **Settings form generated from the game's Zod schema** (shared renderer). A new game's settings appear here with no new form code.
- **Launch** goes to the Phase 3 host screen, now tied to the signed-in host. Only the host who launched a game, or someone in their organisation, can control it.
- **Persistence.** A database `SessionRecorder` saves sessions, players, answers and results.
- **Reports** for each finished game: final ranking, per-player accuracy and questions answered, per-question accuracy (hardest questions first), and CSV export. A "Past games" list.
- **Plan limits seam.** A `PlanLimits` service answers "how many players, games, sets may this organisation have". It returns unlimited for now; billing plugs in later.
- **Data retention.** Player answer data is deleted automatically after a configurable period (default 12 months). Deleting an account deletes its organisation's data.
- **Remove** `/dev/new-game`.
- A simple public landing page with sign-up, plus privacy and terms pages with clearly marked placeholder text for Bryan to replace.
- **Deploy package complete.** Bicep for every Azure component in Hosting, manual-only deploy workflows, and `docs/DEPLOY.md` with step-by-step instructions and the environment variables each app needs. Do not run them.

**Out of scope:** billing, team invitations, homework assignments, sharing question sets publicly, more games, any live deployment.

**Acceptance criteria**

- [ ] A Playwright end-to-end test goes from sign-up to a finished game with 3 simulated players to a report
- [ ] Report figures match the recorded answers exactly (automated test)
- [ ] Importing a 50-question CSV works; a malformed CSV shows which rows failed and why
- [ ] Adding a field to the climber settings schema shows it on the New game form with no form code changes
- [ ] A host cannot see or control another organisation's games, sets or reports (automated test)
- [ ] Deleting an account removes its data from the database
- [ ] Join codes and sign-in are rate-limited
- [ ] `az bicep build` (or equivalent validation) passes on every Bicep file, if the tool is available; otherwise note it

**Demo:** Bryan runs it locally, a colleague signs up on his network, writes 10 questions, runs a game with Bryan and one other player, and reads the report.

## Data model

The database is introduced in Phase 4. Every table except auth tables carries `organisationId`, and every query filters by it. Game-specific data goes in JSON columns so new games need no migrations.

| Table | Key fields | Notes |
| --- | --- | --- |
| Organisation | id, name, planKey, createdAt | Tenant boundary; plan key feeds `PlanLimits` |
| User | id, email, name, image | Hosts only; managed by Auth.js tables |
| Membership | userId, organisationId, role (owner, member) | |
| QuestionSet | id, organisationId, title, description, createdById, updatedAt | |
| Question | id, questionSetId, position, type (multipleChoice, trueFalse), prompt, imageUrl? | |
| AnswerOption | id, questionId, position, text, isCorrect | |
| GameSession | id, organisationId, gameType, questionSetId, settings (JSON), questionSnapshot (JSON), joinCode, status, hostUserId, startedAt, endedAt | `settings` validated by the game's Zod schema; joinCode unique only while active |
| Participant | id, gameSessionId, nickname, reconnectToken (hashed), joinedAt, removedAt? | No personal data |
| AnswerEvent | id, gameSessionId, participantId, questionId, chosenOptionId, isCorrect, millisecondsTaken, createdAt | Feeds per-player and per-question reports |
| ParticipantResult | gameSessionId, participantId, rank, gameStats (JSON) | Climber stats: bestHeight, summitsReached, finishedAt |

The question set is copied into the session when a game launches, so editing a set later never changes past reports.

## Hosting, scaling and operations

**Nothing is deployed during the build.** The repo contains the infrastructure as code and deploy workflows (manual trigger only) so Bryan can deploy later. Target layout:

| Component | Azure service | Scripts from phase |
| --- | --- | --- |
| Web app (Next.js) | App Service (Linux, Node) | 1 |
| Realtime server (Colyseus) | Container Apps (WebSockets on) | 3 |
| Redis | Azure Cache for Redis | 3 |
| PostgreSQL | Database for PostgreSQL Flexible Server | 4 |
| Static game assets | Blob Storage + Front Door CDN | 1 |
| Secrets | Key Vault | 3 |
| Logs, metrics, errors | Application Insights | 1 |
| Sign-in emails | Azure Communication Services Email | 4 |

**Scaling risk.** One Colyseus room lives in one server process. With more than one process, Colyseus needs Redis for presence, and each player must connect to the process that holds their room. Colyseus supports this by giving each process its own public address. Azure Container Apps puts replicas behind one shared ingress, which does not route to a specific replica on its own. In Phase 3, choose between: (a) one public address per process (for example several small container apps, or VMs), (b) a routing proxy, or (c) Colyseus Cloud. Record the choice and why.

**Security**

- HTTPS and WSS only when deployed. Strict Content Security Policy on player pages.
- Rate-limit join attempts per IP and per code, so codes cannot be guessed.
- Validate every client message with Zod on the server; drop and log anything invalid.
- Reconnect tokens are random, stored hashed and expire with the game.
- Organisation scoping enforced in the data-access layer, not in each page.
- Dependency scanning and secret scanning in CI.
- Never commit secrets. Use `.env.example` files with placeholder values.

**Operations**

- Health endpoints on both apps.
- Structured logs with a correlation id per game session. Never log nicknames with IP addresses together.

## Conventions

See `CLAUDE.md` for how the build runs. In short:

- Work through `docs/PROGRESS.md` in order, one milestone per run.
- Decide; never wait for approval. Record significant choices in `docs/DECISIONS.md`.
- Commit and push to `main`. No AI attribution in commits.
- Use full, readable names; standard short forms like `id` and `url` are fine.
- Comments only for a non-obvious "why". JSDoc on exported functions and types.
- Every acceptance criterion that can be automated gets a test. Manual ones are listed in PROGRESS.md for Bryan.

## Open decisions and later phases

**Decided for the autonomous build (Bryan can override later)**

- Theme: Cogspire.
- Product name: use "Cogspire" as the working name for the game and a neutral working name for the platform; record both in DECISIONS.md.
- Ranking when time runs out: current height.
- Zero-energy behaviour: slow free crawl.

**Still Bryan's**

- Privacy policy and terms text, and which children's privacy laws apply in target markets (e.g. COPPA in the US, UK Children's Code); get advice before selling to schools.
- Domain and Azure subscription when deploying.

**Assumptions in this spec**

- Hosts are adults; players never sign in.
- 60 players per room is enough for one class or a small year group.
- Typed-answer questions and question images are not needed before launch.
- English only at launch, but no text is baked into art.

**Later phases (not specified yet)**

- Billing with plans, using the `PlanLimits` seam
- Homework assignments: play solo within a deadline, with a summit goal
- Team invitations within an organisation
- More games on the same platform: another platformer, a top-down game, a quiz-show game
- Public question set library and sharing between hosts
- Installable app (PWA) for home-screen launch and fullscreen on iPhone

**Sources**

- [Gimkit Help: Don't Look Down](https://help.gimkit.com/en/article/dont-look-down-1qptbif/) (mechanics reference only)
- [Phaser 4 releases](https://phaser.io/download/phaser4)
- [Colyseus scalability](https://docs.colyseus.io/scalability)
- [Colyseus presence](https://docs.colyseus.io/server/presence)
