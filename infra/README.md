# Infrastructure

Azure infrastructure as code (Bicep). Written during the build and **never run by it**. Deploys
happen only when someone starts a workflow by hand in GitHub Actions.

| Folder      | What it deploys                                                                                                            | Workflow                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `web/`      | Web app (App Service, Linux, Node 22), game assets (Blob Storage), Azure Front Door in front of both, Application Insights | `.github/workflows/deploy-web.yml`      |
| `realtime/` | Realtime server (one Container App per process), Azure Managed Redis, Key Vault, container registry                        | `.github/workflows/deploy-realtime.yml` |
| `modules/`  | Building blocks shared by the templates above                                                                              |                                         |

Phase 4 adds PostgreSQL and email. See `docs/SPEC.md` (Hosting) for the target layout.

## How the web deployment fits together

```text
browser ──HTTPS──▶ Front Door endpoint
                     ├─ /game-assets/*  ─▶ Blob Storage, container "game-assets" (cached 1 day)
                     ├─ /_next/static/* ─▶ App Service (cached; file names are hashed)
                     └─ /*              ─▶ App Service (not cached)
```

- Pages and game assets share one host name, so the game fetches its atlases same-origin with
  no CORS rules.
- The App Service accepts traffic only from this environment's Front Door profile (service tag
  plus the `X-Azure-FDID` header). Its SCM site stays open so zip deploys work.
- The web app runs the Next.js standalone server (`node apps/web/server.js`). The workflow
  builds it with `NEXT_OUTPUT=standalone` and a hoisted `node_modules`, then assembles
  `apps/web/.deploy/` with `pnpm --filter web assemble:deploy`.
- Application Insights keeps IP masking on, and logs are kept 30 days by default.

## How the realtime deployment fits together

```text
phone ──HTTPS──▶ teckin-<env>-rt-1  (entry: join-code lookup, seat reservation)
  │                     │
  │                     ├── Azure Managed Redis (presence, matchmaker, join codes)
  │                     │
  └──WSS──▶ teckin-<env>-rt-N  (the process holding this game's room)
```

- Colyseus keeps each room in one process. Each process is its own Container App with
  exactly one replica and its own host name, passed to Colyseus as `REALTIME_PUBLIC_ADDRESS`.
  Any process can resolve a join code and reserve a seat; the seat reservation tells the
  phone which process to open its WebSocket on. Container Apps replicas share one ingress
  that cannot target a replica, which is why this uses apps, not replicas
  (`docs/DECISIONS.md`, scaling decision).
- More concurrent games: raise `shardCount` in `realtime/main.<env>.bicepparam` and run the
  workflow again. Lower it only between lessons: removing an app ends the games on it.
- Each deploy replaces every process, which ends the games running on them. Deploy outside
  lesson time.
- Secrets: the Redis URL (with its access key) and the optional dev game secret live only in
  Key Vault; the apps read them through a user-assigned identity. The registry has no admin
  user; the same identity pulls images.
- Redis is **Azure Managed Redis** (`Microsoft.Cache/redisEnterprise`), the successor of
  Azure Cache for Redis, which is being retired.
- The image is built from `apps/realtime/Dockerfile` (an esbuild bundle on
  `node:22-bookworm-slim`); CI builds and smoke-tests it on every push without pushing it.

## First deployment (for Bryan)

1. Create a resource group in the region you want, e.g. `teckin-dev` in `uksouth`.
2. Create a Microsoft Entra app registration (or user-assigned managed identity) for GitHub
   Actions with a federated credential for this repository and the GitHub environment (`dev`
   or `prod`). Give it **Contributor** and **User Access Administrator** on the resource group
   (the second lets the template grant it blob upload rights).
3. In GitHub, create the environments `dev` and `prod` (add required reviewers on `prod`) and
   set these environment variables (variables, not secrets: none of them is secret):
   - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
   - `AZURE_RESOURCE_GROUP`
   - `AZURE_DEPLOY_PRINCIPAL_ID`: the object id of the service principal from step 2
   - `CLIMBER_THEME` (optional): theme pack id, default `cogspire`
4. Run **Actions → Deploy realtime → Run workflow** first. It deploys the registry, Key Vault,
   Redis and Container Apps environment, builds and pushes the server image, then deploys
   the realtime processes and checks each `/health`. The last step prints the realtime
   entry URL: save it as the environment variable `REALTIME_URL`.
   - First, a GitHub environment **secret** `REALTIME_SHARED_SECRET` (at least 32 random
     characters, e.g. `openssl rand -base64 33`; a different value per environment). The web
     app needs the same value; without it no game can be launched.
5. Run **Actions → Deploy web → Run workflow** and pick the environment. The last step prints
   the Front Door URL once `/api/health` answers.

Sizes and counts per environment live in the `.bicepparam` files: web `B1` × 1 for dev and
`P0v3` × 2 for prod; realtime one 0.5 vCPU process and `Balanced_B0` Redis for dev, three
1 vCPU processes and `Balanced_B1` Redis with high availability for prod.

## Checking templates locally

```sh
az bicep build --file infra/web/main.bicep --stdout > /dev/null
az bicep build --file infra/realtime/main.bicep --stdout > /dev/null
az bicep build-params --file infra/realtime/main.dev.bicepparam --stdout > /dev/null
```

CI runs the same checks on every push; neither signs in to Azure.
