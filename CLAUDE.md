# How this repo is built

This repository is built autonomously by Claude from `docs/SPEC.md`. Bryan does not guide the build. Each run is a fresh session with no memory of earlier runs; everything it needs to know is in this file, `docs/SPEC.md`, `docs/PROGRESS.md` and `docs/DECISIONS.md`.

## Run protocol (follow in order, every run)

Bryan has asked for the build to run continuously, phase after phase, until every milestone is done or he says stop. Runs start every hour; a lock stops two runs from working at once.

1. **Check for a pause.** If `docs/PAUSE` exists, stop immediately without changing anything.
2. **Check the lock.** Pull `main`. If `docs/RUN_LOCK` exists and the UTC time in it is less than 3 hours old, another run is working: stop immediately without changing anything. Otherwise write the current UTC time (`date -u +%Y-%m-%dT%H:%M:%SZ`) to `docs/RUN_LOCK`, commit "Take run lock" and push. If the push is rejected because `main` moved, pull and repeat this step from the start.
3. **Note the start time.** This run gets about **150 minutes** of work.
4. **Read** this file, then `docs/PROGRESS.md`, then the parts of `docs/SPEC.md` the next milestone needs, then the latest entries in `docs/DECISIONS.md`.
5. **Check the last run's state.** Install dependencies, run lint, typecheck and tests. If anything is broken, fixing it is this run's first job.
6. **Work through milestones in order.** Take the first unchecked milestone in `docs/PROGRESS.md` and finish it. When it is done and green, tick it, add its "Next run starts with" note, append its Run log line, commit and push, then refresh the lock time in `docs/RUN_LOCK` (commit and push) and start the next milestone. Keep going while time remains. Do not start a new milestone with less than 30 minutes left; end the run instead.
7. **Before stopping** (out of time or nothing left):
    - Leave `main` building and tests passing. If a change cannot be finished in time, commit it behind a disabled code path or revert it; never push a broken `main`.
    - Update `docs/PROGRESS.md` for any milestone in progress: a short "Next run starts with" note, and one Run log line.
    - Delete `docs/RUN_LOCK`, commit and push.

## Autonomy rules

- **Make every decision yourself.** Never stop to ask Bryan anything, never wait for approval, never leave a question in the repo instead of an answer.
- When the spec is unclear or wrong in practice, choose the option that best serves the spec's principles (mobile first, product scale, child privacy, reuse), and record it in `docs/DECISIONS.md`: date, decision, options considered, reason. Keep entries short.
- If something is truly blocked (a service is unreachable, a package cannot install), find a workaround, record it in DECISIONS.md, and move on. Add the blocker to "Needs Bryan" in PROGRESS.md only if no workaround exists.
- You may restructure, rename or rewrite your own earlier work when it makes the result better. Record significant changes in DECISIONS.md.
- You may add milestones to PROGRESS.md when work turns out bigger than planned. Do not remove spec scope.

## Hard limits

- **Nothing goes live.** Never create, modify or deploy cloud resources, never run deploy workflows, never call Azure or any paid API. Write infrastructure code and deploy scripts only.
- **No accounts, no credentials.** Never sign up for services, never ask for or store real secrets. Use `.env.example` files with placeholder values.
- **No payments or purchases** of any kind.
- **Original work only.** No Gimkit assets, text, maps or branding; no copyrighted art, fonts or audio. Generate SVG art and synthesise sounds yourself, and use only openly licensed libraries and fonts (record each font's licence in DECISIONS.md).
- **Child privacy** as described in the spec: no personal data from players, ever.
- Only work inside this repository.

## Git

- Commit and push directly to `main`. Small, frequent commits with clear messages.
- Never add AI attribution lines (no `Co-Authored-By` trailers, no "Generated with" footers) to commits.
- Never rewrite published history (no force push).
- `.gitignore` covers `node_modules`, build output, `.env` files, and local tooling folders such as `.claude/`, `.planning/` and `.superpowers/`. This file (`CLAUDE.md`) and `docs/` stay committed because each run needs them.

## Quality bar

- TypeScript strict mode. Lint, typecheck and tests must pass before every push.
- Every automatable acceptance criterion in the spec gets a test. Manual ones are listed in PROGRESS.md under "For Bryan to check".
- Verify library APIs against current documentation (Context7 if available, otherwise official docs) before using them, especially Phaser 4, Colyseus, Next.js and Auth.js.
- Full, readable names; comments only for a non-obvious "why"; JSDoc on exported functions and types.
- At the end of each phase, write `docs/demos/phase-N.md`: how to run it, what to look at on a phone, what was decided, and what is known to be weak.
- At the end of each phase, review your own phase work as a demanding outside reviewer would (a fresh subagent if available), fix what matters, and note the rest in the phase demo file.

## When everything is done

When every milestone in PROGRESS.md is ticked, write `docs/BUILD_COMPLETE.md` summarising what was built, how to run it, how to deploy it, and the "For Bryan to check" list. Then create `docs/PAUSE` so later scheduled runs stop immediately.
