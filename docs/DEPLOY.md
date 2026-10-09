# Deploying Teckin to Azure

Everything here was written during the build and **has never been run**. Nothing is deployed
until you start a workflow by hand in GitHub Actions. Expect the first deployment to need
small fixes; the templates compile (`bicep build`) and are checked in CI, but no Azure
deployment has validated them.

## What gets deployed

| Component                  | Azure service                                                  | Template                           | Workflow                |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| Secrets                    | Key Vault (RBAC, soft delete, purge protection)                | `infra/platform/main.bicep`        | Deploy platform         |
| Database                   | Azure Database for PostgreSQL Flexible Server 17               | `infra/platform` + `modules/postgres.bicep` | Deploy platform |
| Sign-in emails             | Communication Services + Email (Azure-managed sender domain)   | `infra/platform` + `modules/communication-email.bicep` | Deploy platform |
| Realtime server (Colyseus) | Container Apps, one single-replica app per process             | `infra/realtime/main.bicep`        | Deploy realtime         |
| Redis                      | Azure Managed Redis (successor of Azure Cache for Redis)       | `infra/realtime` + `modules/managed-redis.bicep` | Deploy realtime |
| Container images           | Azure Container Registry (Basic, no admin user)                | `infra/realtime/main.bicep`        | Deploy realtime         |
| Web app (Next.js)          | App Service (Linux, Node 22), standalone server                | `infra/web/main.bicep`             | Deploy web              |
| Static game assets         | Blob Storage behind Azure Front Door (same host as the pages)  | `infra/web` + `modules/static-assets.bicep`, `front-door.bicep` | Deploy web |
| Logs, metrics, errors      | Log Analytics + Application Insights (IP masking on, 30 days)  | `modules/monitoring.bicep`         | realtime and web        |

**Deploy all** runs the three in order (platform → realtime → web) and passes the realtime
address on to the web build. Each one can also be run alone. See `infra/README.md` for how the
web and realtime pieces fit together (Front Door routes, one Container App per process).

```text
            ┌────────────── Key Vault ───────────────┐
            │ database-url, auth-secret,             │
            │ realtime-shared-secret, email-server,  │
            │ redis-url, (auth-google/microsoft)     │
            └───────▲───────────────────────▲────────┘
       Key Vault references          Container Apps secrets
                    │                       │
browser ─HTTPS─▶ Front Door ─▶ App Service (web) ──POST /games──▶ Container Apps (realtime ×N)
   │                 └─▶ Blob (game assets)  │                      │        │
   └──────────────WSS (phones)───────────────┼──────────────────────┘        │
                                             └──────▶ PostgreSQL ◀───────────┘  Redis ◀─┘
```

## One-time setup

1. **Resource group.** Create one per environment, e.g. `teckin-dev` in `uksouth`
   (`az group create --name teckin-dev --location uksouth`). Everything goes in it.
2. **Deploy identity.** Create a Microsoft Entra app registration (or a user-assigned managed
   identity) for GitHub Actions with a **federated credential** for this repository and the
   GitHub environment (`repo:bryanjl/teckin:environment:dev`, and another for `prod`). Give it
   **Contributor** and **Role Based Access Control Administrator** (or User Access
   Administrator) on the resource group: the templates grant roles to the apps' identities.
   Note its client id and its service principal's object id.
3. **GitHub environments.** In the repository settings create `dev` and `prod` (add required
   reviewers to `prod`). Each environment gets the variables and secrets below.
4. **Register resource providers** once per subscription if they are new to it:
   `Microsoft.App`, `Microsoft.Cache`, `Microsoft.Cdn`, `Microsoft.Communication`,
   `Microsoft.ContainerRegistry`, `Microsoft.DBforPostgreSQL`, `Microsoft.KeyVault`,
   `Microsoft.OperationalInsights`, `Microsoft.Insights`, `Microsoft.Storage`, `Microsoft.Web`
   (`az provider register --namespace <name>`).

### GitHub environment variables (not secret)

| Variable                         | Needed by          | Value                                                                                   |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`                | all                | Client id of the deploy identity                                                        |
| `AZURE_TENANT_ID`                | all                | Your Entra tenant id                                                                    |
| `AZURE_SUBSCRIPTION_ID`          | all                | Subscription id                                                                         |
| `AZURE_RESOURCE_GROUP`           | all                | e.g. `teckin-dev`                                                                       |
| `AZURE_DEPLOY_PRINCIPAL_ID`      | realtime, web      | Object id of the deploy identity's service principal (push images, upload assets)      |
| `REALTIME_URL`                   | web (alone)        | Printed by Deploy realtime. Deploy all passes it on itself                              |
| `CLIMBER_THEME`                  | web, optional      | Theme pack id, default `cogspire`                                                       |
| `PUBLIC_SITE_URL`                | web, optional      | `https://teckin.example.org` once a custom domain is on Front Door; empty uses the Front Door address |
| `EMAIL_FROM`                     | web, optional      | e.g. `Teckin <sign-in@teckin.example.org>`; empty uses `DoNotReply@<id>.azurecomm.net`  |
| `AUTH_GOOGLE_ID`                 | web, optional      | Google OAuth client id (set the secret first)                                           |
| `AUTH_MICROSOFT_ENTRA_ID_ID`     | web, optional      | Microsoft app (client) id (set the secret first)                                        |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | web, optional      | `https://login.microsoftonline.com/<tenant id>/v2.0` for one tenant; empty for any account |

### GitHub environment secrets

| Secret                           | Needed by          | Value                                                                                   |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `POSTGRES_ADMIN_PASSWORD`        | platform           | 16+ characters, e.g. `openssl rand -base64 24`                                          |
| `REALTIME_SHARED_SECRET`         | platform           | 32+ characters, `openssl rand -base64 33`. Web and realtime both read it from Key Vault |
| `AUTH_SECRET`                    | platform           | 32+ characters, `openssl rand -base64 33` (signs host session cookies)                  |
| `EMAIL_SERVER`                   | platform, web      | SMTP URL from "Sign-in email" below. Without it nobody can sign in by email             |
| `AUTH_GOOGLE_SECRET`             | platform, optional | Google OAuth client secret                                                              |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | platform, optional | Microsoft app client secret                                                             |

Use different values per environment. Changing a secret later: update it in GitHub, run
Deploy platform (it rewrites Key Vault), then restart the web app and run Deploy realtime so
both pick up the new value. Changing `POSTGRES_ADMIN_PASSWORD` also changes the server's
password.

## First deployment

1. **Run Actions → Deploy platform** (environment `dev`). It creates Key Vault, PostgreSQL and
   Communication Services, writes the secrets, opens the database to its own runner for a
   moment and applies the Prisma migrations (`prisma migrate deploy`), then closes it again.
   The log prints the Communication Services name and the sender address.
2. **Sign-in email (once).** Bicep cannot create the SMTP sign-in, so:
   1. Create an Entra app registration, e.g. `teckin-dev-smtp`, and a client secret for it.
   2. Give its service principal the role **Communication and Email Service Owner** on the
      Communication Services resource printed in step 1
      (`az role assignment create --assignee <app client id> --role "Communication and Email Service Owner" --scope <communicationServiceId>`).
      If your tenant does not offer that role, create a custom role with the actions
      `Microsoft.Communication/CommunicationServices/Read`,
      `Microsoft.Communication/CommunicationServices/Write` and
      `Microsoft.Communication/EmailServices/Write` and assign that.
   3. The SMTP user name is `<communication service name>.<app client id>.<tenant id>` and the
      password is the client secret. Save the secret `EMAIL_SERVER` as
      `smtp://<user name>:<url-encoded client secret>@smtp.azurecomm.net:587`
      (url-encode with `node -e "console.log(encodeURIComponent(process.argv[1]))" '<secret>'`).
   4. Run Deploy platform again so Key Vault gets it.
   The Azure-managed domain sends from `DoNotReply@<id>.azurecomm.net` with low sending limits;
   for real schools add a custom domain to the Email Communication Service (DNS records for
   SPF, DKIM and DMARC), link it, and set `EMAIL_FROM`.
3. **Run Actions → Deploy realtime.** Registry, Redis, Container Apps environment, the server
   image (built from `apps/realtime/Dockerfile`), then the processes, each checked at
   `/health`. The last step prints the realtime entry URL: save it as the environment variable
   `REALTIME_URL`. Check Azure Managed Redis `Balanced_B0` pricing in your region first; it is
   the largest fixed cost of the realtime stack.
4. **Run Actions → Deploy web.** Builds the Next.js standalone package with
   `NEXT_PUBLIC_REALTIME_URL`, deploys the web Bicep (App Service, Blob, Front Door, settings
   with Key Vault references), uploads game assets and the app, and waits for `/api/health`
   through Front Door. The log prints the site address.
5. **Check it:** open the address on your phone, sign up, write a set, launch a game, join from
   a second phone, end it and open the report. Then work through "For Bryan to check" in
   `docs/PROGRESS.md`.

After that, **Deploy all** does a whole release in one run. Each deploy replaces every
realtime process, which ends the games running on them: deploy outside lesson time.

## Environment variables per app

The deploy sets all of these; this is the reference for local runs and troubleshooting.
Local values go in `apps/web/.env`, `apps/realtime/.env` and `packages/db/.env` (copy the
`.env.example` files; never commit real values).

### Web app (`apps/web`)

| Variable                                  | Deployed from                                | Purpose                                                                           |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | Key Vault `database-url`                     | PostgreSQL connection string                                                     |
| `AUTH_SECRET`                             | Key Vault `auth-secret`                      | Signs session cookies (Auth.js)                                                  |
| `AUTH_URL`                                | Bicep (`PUBLIC_SITE_URL` or Front Door URL)  | The site's public address; sign-in links point here                              |
| `AUTH_TRUST_HOST`                         | Bicep: `true`                                | Auth.js runs behind Front Door                                                   |
| `EMAIL_SERVER`                            | Key Vault `email-server` (when set)          | SMTP URL for magic links. Unset locally: links are printed to the server log     |
| `EMAIL_FROM`                              | Bicep (`EMAIL_FROM` or the managed sender)   | Sender of sign-in emails                                                         |
| `REALTIME_SHARED_SECRET`                  | Key Vault `realtime-shared-secret`           | Signs game launches and host passes; must equal the realtime server's            |
| `REALTIME_INTERNAL_URL`                   | Bicep (`REALTIME_URL`)                       | Where the web server launches games; falls back to `NEXT_PUBLIC_REALTIME_URL`, then `http://127.0.0.1:2567` |
| `NEXT_PUBLIC_REALTIME_URL`                | Build time (`REALTIME_URL`)                  | Where phones find the realtime server; unset locally = page host, port 2567      |
| `NEXT_PUBLIC_CLIMBER_THEME`               | Build time (`CLIMBER_THEME`)                 | Theme pack, default `cogspire`                                                   |
| `TRUSTED_PROXY_COUNT`                     | Bicep: `2`                                   | Proxies appending to `X-Forwarded-For` (Front Door + App Service). Default 1     |
| `SIGN_IN_LIMIT_PER_ADDRESS`               | optional                                     | Sign-in attempts per 15 minutes per network address, default 30                  |
| `SIGN_IN_LIMIT_PER_EMAIL`                 | optional                                     | Per email address, default 5                                                     |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`   | variable / Key Vault `auth-google-secret`    | Google sign-in; the button appears only when both are set                        |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET`  | variable / Key Vault `auth-microsoft-secret` | Microsoft sign-in, likewise                                                      |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER`          | variable                                     | Restricts Microsoft sign-in to one tenant                                        |
| `REALTIME_CONNECT_SOURCES`                | optional                                     | Overrides the realtime hosts allowed by the player pages' Content Security Policy |
| `APPLICATIONINSIGHTS_CONNECTION_STRING`   | Bicep                                        | Monitoring connection (see weak spots: no SDK is wired yet)                      |
| `AUTH_LOG_MAGIC_LINKS`, `AUTH_DEV_MAILBOX_DIR` | local tests only                        | Never set when deployed                                                          |

Redirect URIs for the optional providers: `<site>/api/auth/callback/google` and
`<site>/api/auth/callback/microsoft-entra-id`.

### Realtime server (`apps/realtime`)

| Variable                        | Deployed from                       | Purpose                                                                      |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `REALTIME_SHARED_SECRET`        | Key Vault `realtime-shared-secret`  | Checks launches and host passes; empty means no game can be launched        |
| `DATABASE_URL`                  | Key Vault `database-url`            | Records games for reports and runs the retention job; unset = nothing stored |
| `REDIS_URL`                     | Key Vault `redis-url`               | Presence, join codes and rate limits across processes; unset = one process  |
| `REALTIME_PUBLIC_ADDRESS`       | Bicep (the app's own host name)     | Where phones reconnect to this process                                       |
| `REALTIME_PORT`, `REALTIME_HOST`| Bicep: `2567`, `0.0.0.0`            | Listening address                                                            |
| `PLAYER_DATA_RETENTION_MONTHS`  | Bicep `playerDataRetentionMonths`   | Months players' answers are kept (default 12); the job runs every 6 hours    |
| `REALTIME_LOAD_METRICS`         | never deployed                      | `1` serves `/metrics/load` for the load test                                 |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Bicep                       | Monitoring connection                                                        |

### Database package (`packages/db`)

`DATABASE_URL` only, for `pnpm --filter @teckin/db db:migrate` and the `retention` script.

## Sizes and cost

Per environment, in the `.bicepparam` files:

| Piece        | dev                               | prod                                                 |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| Web          | App Service `B1` × 1              | `P0v3` × 2                                           |
| Realtime     | 1 process, 0.5 vCPU / 1 GiB       | 3 processes, 1 vCPU / 2 GiB (about 60 rooms of 30)   |
| Redis        | Managed Redis `Balanced_B0`       | `Balanced_B1`, high availability                     |
| PostgreSQL   | Burstable `Standard_B1ms`, 32 GiB, 7-day backups | General Purpose `Standard_D2ds_v5`, 64 GiB, 35-day backups, zone-redundant standby |
| Front Door   | Standard                          | Standard                                             |

More concurrent games: raise `shardCount` in `infra/realtime/main.prod.bicepparam` and run
Deploy realtime (between lessons). Check the database's connection limit when adding web
instances or realtime processes (each opens up to 10 connections; `Standard_B1ms` allows
about 50).

## Operations

- **Health:** web `GET /api/health`, realtime `GET /health` on each process.
- **Logs:** Log Analytics workspace `<prefix>-logs` (Container Apps console logs) and App
  Service log stream. Logs are kept 30 days.
- **Migrations:** Deploy platform applies them; run it before the other two whenever a release
  adds a folder under `packages/db/prisma/migrations` (Deploy all does).
- **Data retention:** each realtime process deletes players' answers and results older than
  `PLAYER_DATA_RETENTION_MONTHS` every 6 hours (the deletes are idempotent, so several
  processes running it is harmless). `pnpm --filter @teckin/db retention` runs it once by hand.
- **Restore:** PostgreSQL point-in-time restore from the portal (7 or 35 days).

## Hardening for later

These were left out to keep the first deployment simple; none blocks a trial.

- **Private networking.** PostgreSQL, Key Vault and Redis accept public connections (TLS and
  credentials or Entra identities required). Put them behind private endpoints with a VNet for
  the Container Apps environment and App Service VNet integration; the migration step then
  needs a runner inside the VNet.
- **A least-privilege database role.** The apps use the admin login. Create a role with only
  data rights (`SELECT, INSERT, UPDATE, DELETE`) and put its URL in `database-url`, keeping the
  admin for migrations. Or switch to Entra authentication with managed identities.
- **Custom domains** on Front Door (site) and on the realtime apps, then set `PUBLIC_SITE_URL`.
- **Front Door WAF** policy with rate rules (needs the Premium tier for managed rules).
- **Alerts** on the health checks, 5xx rates and database CPU.
