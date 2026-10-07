# Decisions

Newest last. Each entry: date, decision, options considered, reason.

- **2026-10-08 — Build runs autonomously, local only.** Decided by Bryan. Claude makes all build decisions, commits to `main`, and writes deploy scripts without running them.
- **2026-10-08 — Theme: Cogspire.** Chosen from the three concepts in the spec because the energy mechanic is visible on the character.
- **2026-10-08 — Ranking at time-out: current height; zero energy: slow free crawl.** Spec defaults, adopted so the build does not wait on them.
- **2026-10-07 — Working names: platform "Teckin", game "Cogspire".** Options: invent a new platform name, or use the repository name. The repository name is neutral and already in use; package scope is `@teckin/*`. Easy to rename later.
- **2026-10-07 — Toolchain versions.** Node 22, pnpm 10.28, Turborepo 2.11, Next.js 16.4 (Turbopack), React 19.3, Tailwind 4.3, Zod 4, Vitest 5, Playwright 1.63, ESLint 10. TypeScript pinned to 6.0 rather than 7.0 because typescript-eslint supports only `<6.1`; revisit when it supports 7.
- **2026-10-07 — ESLint without `eslint-config-next`.** Flat config built from `typescript-eslint`, `@next/eslint-plugin-next` and `eslint-plugin-react-hooks` in `packages/config`. Avoids `eslint-plugin-react`, which lags new ESLint majors; `next lint` no longer exists in Next 16 anyway.
- **2026-10-07 — Workspace packages ship TypeScript source, no build step.** Options: compile each package with tsup, or consume source. Source keeps the loop fast; Next.js uses `transpilePackages`, Vitest and `tsx` run TS directly. The realtime server gets a bundling step when it is containerised (Phase 3).
- **2026-10-07 — "Shared packages never import a game" enforced by lint.** `sharedPackageConfig` in `packages/config` adds a `no-restricted-imports` rule for `@teckin/climber` to every shared package.
- **2026-10-07 — `game-contracts` stays DOM-free.** The client mount target is typed structurally (`ClientGameMountTarget`) so the server can import the contract without DOM types.
- **2026-10-07 — Climber package layout.** Code in `games/climber/src/{client,server}`, theme packs in `games/climber/themes/`, matching the spec's intent while giving one `src` root for tsconfig and lint.
- **2026-10-07 — Playwright uses Chromium for all four device profiles** (iPhone SE and Pixel 7, portrait and landscape). The iPhone profiles emulate viewport, DPR and touch, not WebKit; real Safari is covered by Bryan's manual phone check. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` lets a preinstalled Chromium be used instead of downloading. E2E runs against `next start` (production build) for stable timings.
- **2026-10-07 — Turborepo agent guidance disabled** (`agentGuidance: false`) so `turbo` does not write an `AGENTS.md` into the repo on each run.
- **2026-10-07 — Fonts: system font stack only.** No web fonts yet, so no font licences to record.
