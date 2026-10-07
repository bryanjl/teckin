# Decisions

Newest last. Each entry: date, decision, options considered, reason.

- **2026-10-08 — Build runs autonomously, local only.** Decided by Bryan. Claude makes all build decisions, commits to `main`, and writes deploy scripts without running them.
- **2026-10-08 — Theme: Cogspire.** Chosen from the three concepts in the spec because the energy mechanic is visible on the character.
- **2026-10-08 — Ranking at time-out: current height; zero energy: slow free crawl.** Spec defaults, adopted so the build does not wait on them.
