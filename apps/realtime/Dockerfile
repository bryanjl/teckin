# Realtime server image. Build from the repository root:
#   docker build -f apps/realtime/Dockerfile -t teckin-realtime .
# The build stage bundles the server and its workspace packages into dist/main.mjs, so the
# runtime image holds only Node and that bundle.

FROM node:22.22.0-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "realtime..." \
  && pnpm --filter realtime build

FROM node:22.22.0-bookworm-slim
ENV NODE_ENV=production \
    REALTIME_HOST=0.0.0.0 \
    REALTIME_PORT=2567
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/realtime/dist ./dist
USER node
EXPOSE 2567
# Colyseus drains rooms on SIGTERM; Container Apps sends it before stopping a replica.
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
