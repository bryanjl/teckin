# Infrastructure

Azure infrastructure as code (Bicep). Written during the build and **never run by it**. Deploys
happen only when someone starts a workflow by hand in GitHub Actions.

| Folder      | What it deploys                                                                                                            | Workflow                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `platform/` | Key Vault with the apps' secrets, PostgreSQL Flexible Server, Communication Services Email; then database migrations       | `.github/workflows/deploy-platform.yml` |
| `realtime/` | Realtime server (one Container App per process), Azure Managed Redis, container registry                                   | `.github/workflows/deploy-realtime.yml` |
| `web/`      | Web app (App Service, Linux, Node 22), game assets (Blob Storage), Azure Front Door in front of both, Application Insights | `.github/workflows/deploy-web.yml`      |
| `modules/`  | Building blocks shared by the templates above                                                                              |                                         |

`.github/workflows/deploy-all.yml` runs the three in that order. **Step-by-step instructions,
every variable and secret, sizes and costs are in [`docs/DEPLOY.md`](../docs/DEPLOY.md).**

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
- Secrets: the Redis URL (with its access key), the database URL and the shared secret live
  only in Key Vault (created by the platform template); the processes read them through a
  user-assigned identity. The web app reads its secrets through Key Vault references with
  its own system-assigned identity. The registry has no admin
  user; the same identity pulls images.
- Redis is **Azure Managed Redis** (`Microsoft.Cache/redisEnterprise`), the successor of
  Azure Cache for Redis, which is being retired.
- The image is built from `apps/realtime/Dockerfile` (an esbuild bundle on
  `node:22-bookworm-slim`); CI builds and smoke-tests it on every push without pushing it.

## Checking templates locally

```sh
for template in infra/*/main.bicep; do az bicep build --file "$template" --stdout > /dev/null; done
for params in infra/*/*.bicepparam; do az bicep build-params --file "$params" --stdout > /dev/null; done
```

CI runs the same checks on every push; neither signs in to Azure.
