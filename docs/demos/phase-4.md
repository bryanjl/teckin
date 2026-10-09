# Phase 4 demo: hosts and game creation

Someone who has never seen Teckin opens the landing page, signs up with an email link, writes
a question set on their phone, launches a Climber game with their own settings, runs it with
players, and reads a report afterwards. Everything a host makes belongs to their organisation;
players still never give anything but a nickname.

## How to run it

Postgres is needed for hosts (the play pages work without it). Redis is optional.

```sh
corepack enable
pnpm install
docker compose up -d                       # Postgres on 5432 and Redis on 6379
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env      # set AUTH_SECRET and REALTIME_SHARED_SECRET
cp apps/realtime/.env.example apps/realtime/.env   # same REALTIME_SHARED_SECRET and DATABASE_URL
pnpm --filter @teckin/db db:migrate
pnpm dev:all                               # web on :3000, realtime on :2567
```

Generate the two secrets with `openssl rand -base64 33`; `REALTIME_SHARED_SECRET` must be the
same in both apps. Without Docker, any local Postgres 16+ and `redis-server` work.

Open the site at the laptop's network address (`http://<laptop IP>:3000`), not `localhost`,
so phones on the same Wi-Fi can reach it. Sign-in links are printed in the web server's log
(no email is sent locally).

## What to look at

**On a phone (the host)**

1. **Landing page** (`/`): what Teckin is, "Sign up free", "Join a game", "Try a solo climb",
   how it works, the privacy promises, and Privacy / Terms in the footer. Both legal pages
   carry a yellow PLACEHOLDER banner and marked gaps.
2. **Sign up:** "Create your host account", enter an email, open the link from the log. The
   dashboard greets you with your own organisation.
3. **Write a set:** "+ New set", add multiple choice and true/false questions, mark the right
   answers, reorder, duplicate, delete. Problems show inline; Save stays at the bottom of the
   screen. Or "Import from CSV" with the template (Excel and Google Sheets files both work).
   A set needs 5 questions before it can be played.
4. **New game:** pick Climber, pick the set, change the settings (the form is drawn from the
   game's settings schema: checkpoints, length, players), Launch. The host screen opens.

**On the laptop (projected)**

5. **Host screen:** the code, QR and join link; players appear as they join. Start, watch the
   tower and leaderboard, End. Only hosts in your organisation can open this screen.

**On the players' phones**

6. `/join`, the code, a nickname (or "Random name"), and climb. The play pages now carry a
   strict Content Security Policy (scripts only with a per-request nonce).

**After the game**

7. **Dashboard → Past games → the game:** players, answers, overall accuracy; the final
   ranking with each player's accuracy, answers and best height; questions hardest first
   with the answers chosen; two CSV downloads.
8. **Account → Delete account** (type DELETE) removes the organisation and everything in it.

## Acceptance criteria and their tests

| Criterion | Covered by |
| --- | --- |
| A Playwright end-to-end test goes from sign-up to a finished game with 3 simulated players to a report | E2E `full-journey.spec.ts`: landing page → sign-up by magic link → 5 questions written in the editor → New game with checkpoints → three `NetworkBot` players join by code (real join-code lookup and seat reservation) and climb and answer (one always right, two with known mistakes) → End → Past games → the report's totals and each player's "X of Y correct" and accuracy equal what the players answered, questions ordered hardest first |
| Report figures match the recorded answers exactly (automated test) | Unit `packages/db/src/reports.test.ts` "match the recorded answers exactly" (generated answers, figures recomputed independently); E2E `reports.spec.ts` (known game, exact figures and CSV rows) and `full-journey.spec.ts` (live game) |
| Importing a 50-question CSV works; a malformed CSV shows which rows failed and why | Unit `question-csv.test.ts` "imports a 50-question CSV" and the row-problem tests; E2E `question-sets.spec.ts` "a 50-question CSV imports, and a malformed one shows which rows failed and why" |
| Adding a field to the climber settings schema shows it on the New game form with no form code changes | Unit `new-game-form.test.tsx` "shows a field added to the climber settings schema with no form code changes"; `game-definition.test.ts` (settings fields from any schema) |
| A host cannot see or control another organisation's games, sets or reports (automated test) | Unit `organisation-data.test.ts` (list, read, change, delete, attach across organisations), `reports.test.ts` "are invisible to another organisation", realtime host-pass tests (other room or organisation refused); E2E `host.spec.ts` (host screen 404 and no recent games for an outsider), `question-sets.spec.ts` (another host gets 404), `reports.spec.ts` (report, export and list) |
| Deleting an account removes its data from the database | Unit `platform.test.ts` "deleting an account removes its organisation's data and nobody else's" (no row with the organisation's id remains); E2E `reports.spec.ts` "deleting an account removes its data and signs the host out" |
| Join codes and sign-in are rate-limited | Realtime `server.test.ts` "rate-limits lookups per address" and "of one code however many addresses ask" (Redis-shared across processes); web `platform.test.ts` sign-in limits per address and per email, and the address behind Front Door and App Service |
| `az bicep build` passes on every Bicep file | CI job "Validate Bicep" (every `infra/*/main.bicep` and `.bicepparam`); in the build sandbox, Bicep CLI 0.48.1 built all four templates and six parameter files with no warnings |

Other Phase 4 scope and where it is tested:

| Scope item | Covered by |
| --- | --- |
| Auth.js magic link, Google/Microsoft only with env vars, personal organisation at sign-up | `auth-environment.test.ts`, `auth-adapter.test.ts`, `accounts.test.ts`, E2E `sign-in.spec.ts` |
| Game registry and New game | `game-definition.test.ts`, registry tests, E2E `new-game.spec.ts` |
| Launch tied to the signed-in host | `realtime-trust` tests, `game-launch.test.ts`, E2E `host.spec.ts` |
| Database `SessionRecorder` | `database-recorder.test.ts` (direct and through a launched room) |
| Past games, CSV export | `reports.test.ts`, `report-export.test.ts`, E2E `reports.spec.ts` |
| `PlanLimits` seam | `platform.test.ts` (unlimited plan, checks at create, copy and launch) |
| Data retention (12 months by default) | `platform.test.ts` retention tests; `retention-schedule.test.ts` |
| `/dev/new-game` removed | Route gone; host and multiplayer E2E launch from New game |
| Landing, privacy and terms placeholders | E2E `smoke.spec.ts` (sign-up link, footer links, PLACEHOLDER banner, no sideways scroll) |
| Strict CSP on player pages; baseline security headers | Unit `content-security-policy.test.ts`; E2E `smoke.spec.ts` (nonce policy on `/join` and `/play/solo`, a new nonce per response, a solo climb with no CSP violations, headers on every page); every player E2E runs under the policy |
| Deploy package | `infra/platform`, `infra/realtime`, `infra/web`, four manual workflows, `docs/DEPLOY.md`; CI compiles the Bicep and lints nothing else in Azure. The standalone web package was assembled and run against Postgres in the sandbox |
| Dependency and secret scanning in CI | CI job "Secret scan and dependency audit" (gitleaks over all history with `.gitleaks.toml`; `pnpm audit` report), `.github/dependabot.yml` |

## What was decided

See `docs/DECISIONS.md` (2026-10-09 entries) for the reasoning. In short:

- A third template, `infra/platform`, owns Key Vault, PostgreSQL and Communication Services
  Email; "Deploy platform" also applies migrations through a temporary firewall rule. "Deploy
  all" runs platform → realtime → web.
- The web app reads its secrets through Key Vault references with its own identity; its
  settings are applied after Front Door exists, because `AUTH_URL` needs Front Door's address.
- The retention job stays inside the realtime processes.
- The SMTP sign-in for Communication Services is a documented manual step (an Entra app).
- Rate limits find the caller behind Front Door and App Service (`TRUSTED_PROXY_COUNT=2`).
- The end-to-end journey uses `NetworkBot` players rather than three more browsers.

## Self-review

A final pass over the whole product as an outside reviewer, looking for what would hurt in a
first real deployment or a first real class. Fixed:

- **Sign-in rate limits would have been shared by everyone behind one Front Door edge.** The
  web app trusted the last `X-Forwarded-For` entry, which behind Front Door plus App Service's
  front end is a Front Door address. It now skips a configurable number of trusted proxies
  (2 when deployed) and drops the port App Service adds.
- **No Content Security Policy on the player pages** (deferred since Phase 3). Added, nonce
  based, with the realtime processes' domain allowed for WebSockets; checked by every player
  E2E test.
- **No clickjacking or sniffing protection on host pages.** Every response now sends
  `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy and HSTS.
- **No dependency or secret scanning in CI**, which the spec's security list asks for. Added.
- **The deploy package was incomplete:** no database, email, web secrets or migrations; the web
  app had no `DATABASE_URL`, `AUTH_SECRET` or shared secret when deployed. All wired through
  Key Vault now, with Google/Microsoft sign-in optional.
- **The privacy text claimed a single cookie;** Auth.js sets a few sign-in cookies. Reworded.
- **The network bot gave up after a wrong answer** (the room refuses answers during the
  1.5-second reveal). It now waits, as a phone does.

## Known to be weak

- **Nothing has been deployed.** The Bicep compiles and the workflows pass `actionlint`, but no
  Azure deployment has run them. Expect a first-deploy fix or two (role assignment timing,
  regional SKU availability, resource provider registration).
- **Server actions behind Front Door rely on `X-Forwarded-Host`.** Next.js compares the
  `Origin` of a server action with `X-Forwarded-Host` (Front Door sets it) or `Host` (the
  `azurewebsites.net` name). If saving a set fails after deploying with "Invalid Server
  Actions request", add the public host to `experimental.serverActions.allowedOrigins` in
  `apps/web/next.config.ts`.
- **Application Insights receives no app telemetry.** The connection string is set on both
  apps, but neither loads an Application Insights SDK; logs reach Log Analytics through
  Container Apps and App Service only. Adding the OpenTelemetry distro is a small follow-up.
- **Logs are not JSON lines.** Room logs carry the session id as a correlation id, but Node
  prints them as inspected objects.
- **Database security is basic:** public endpoint with "Allow Azure services", the apps use the
  admin login. `docs/DEPLOY.md` lists the hardening steps.
- **Sign-in email from the Azure-managed domain** has low sending limits and may land in junk
  folders; a custom domain with SPF/DKIM/DMARC is needed before real schools.
- **`pnpm audit` reports advisories in development tooling** (for example `braces` through the
  Next.js ESLint plugin) with no fixed version yet; the audit step reports without failing.
- **The legal pages are placeholders** and must be replaced with reviewed text.
- **The multiplayer E2E is occasionally slow under load** (a 5-second movement check); it
  passes alone and on CI's retry.
