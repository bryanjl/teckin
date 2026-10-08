# Infrastructure

Azure infrastructure as code (Bicep). Written during the build and **never run by it**. Deploys
happen only when someone starts a workflow by hand in GitHub Actions.

| Folder     | What it deploys                                                                                                            | Workflow                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `web/`     | Web app (App Service, Linux, Node 22), game assets (Blob Storage), Azure Front Door in front of both, Application Insights | `.github/workflows/deploy-web.yml` |
| `modules/` | Building blocks shared by the templates above                                                                              |                                    |

Later phases add the realtime server, Redis and Key Vault (Phase 3) and PostgreSQL and email
(Phase 4). See `docs/SPEC.md` (Hosting) for the target layout.

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
4. Run **Actions → Deploy web → Run workflow** and pick the environment. The last step prints
   the Front Door URL once `/api/health` answers.

Sizes and counts per environment live in `web/main.dev.bicepparam` and
`web/main.prod.bicepparam` (`B1` × 1 for dev, `P0v3` × 2 for prod).

## Checking templates locally

```sh
az bicep build --file infra/web/main.bicep --stdout > /dev/null
az bicep build-params --file infra/web/main.dev.bicepparam --stdout > /dev/null
```

CI runs the same checks on every push; neither signs in to Azure.
