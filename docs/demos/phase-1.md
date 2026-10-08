# Phase 1 demo: the game works on a phone

A two-summit climb with touch controls, playable on a phone over the local network.

## How to run it

```sh
corepack enable
pnpm install
pnpm dev
```

Then open `http://<your computer's IP>:3000/play/solo` on a phone on the same Wi-Fi (the README
says how to find the IP and what to do if the firewall blocks it). On a laptop, use
`http://localhost:3000/play/solo` with the arrow keys and space.

## What to look at on a phone

1. **Start.** The course fills the width in portrait. Touch buttons sit bottom-left (left,
   right) and bottom-right (jump), clear of the notch and home bar. The HUD shows `0 m` and
   "Summit 1".
2. **Feel.** Hold right and tap jump with the other thumb. Tap jump briefly for a short hop and
   hold it for a full jump. Tap again in mid-air for the double jump. Run off a ledge and jump
   just after leaving it (coyote time), or press jump just before landing (jump buffer).
3. **Falling.** Miss a jump high up: you drop until you land on a lower ledge. Floating ledges
   are one-way, so you can jump up through them from below.
4. **Summits.** Stand on the summit ledge to complete it. The HUD switches to "Summit 2" and
   reaching the top of summit 2 shows "Course complete" with your time and "Play again".
5. **Checkpoints.** Open `/play/solo?checkpoints=1`, reach summit 1, then fall well below it:
   "Back to checkpoint" appears under the HUD.
6. **Interruptions.** Lock the phone or switch apps mid-jump, then come back. The game shows
   "Paused" and continues from the same spot when you tap resume.
7. **Nothing moves the page.** Pinch, double-tap, long-press and pull-down should do nothing.
8. **Performance.** Add `?debug=1` to see fps (target 60, never below 30), the render and art
   resolution, and the player's position.
9. **Landscape.** Turn the phone: the course stays playable with at least 11 tiles of climb
   visible and margins at the sides.

## What was decided

The full record is in `docs/DECISIONS.md`. The main Phase 1 calls:

- **Movement is the platformer kit's own pure, fixed-step simulation, not Arcade physics.**
  It runs the same at any frame rate, a bot proves the course climbable in unit tests, and the
  Phase 3 server can reuse it to validate movement.
- **Input and controls live in the DOM.** Real buttons, `env(safe-area-inset-*)` in CSS, and
  one tracked pointer per finger.
- **Theme packs are folders.** A build turns SVGs into atlases at 1x, 2x and 3x. An automated
  test builds a recoloured, renamed copy of the placeholder theme and checks that the game
  shows the new art and names with no code change.
- **Floating ledges are one-way and the ground is solid.** This is kinder on touch controls.
- **Deployment is written, not run.** `infra/web/main.bicep` describes App Service, Blob
  Storage and Azure Front Door on one host name, plus Application Insights.
  `.github/workflows/deploy-web.yml` runs only when started by hand, from `main`, after
  `pnpm check`.

## Acceptance criteria and their tests

| Criterion | Covered by |
| --- | --- |
| Playable to the top of summit 2 in iPhone and Android emulation, portrait and landscape | E2E "the course can be climbed…" (autopilot, all four profiles) |
| No scroll, zoom, selection or pull-to-refresh | E2E "the play surface blocks…", unit `guardPlaySurface` tests |
| Hold a direction and tap jump together | E2E multi-touch test (two CDP touch points), unit touch-controls tests |
| Controls respect safe-area insets | E2E safe-area test (CDP inset emulation) |
| Hiding and showing the tab resumes cleanly | E2E hide-mid-jump test, unit `pauseWhenHidden` tests |
| Swapping the theme folder changes art and names | E2E "swapping the theme folder…", unit theme build and requirement tests |
| Unit tests for input, Tiled loader and jump rules | `engine-core` input tests, `platformer-kit` `tiled.test.ts` and `controller.test.ts` |
| `/play/solo` starts in a mobile viewport | E2E "the game starts in a mobile viewport…" |
| Checkpoints with `?checkpoints=1` | E2E "with checkpoints on…", unit `course-progress` tests |
| CI is green | GitHub Actions `CI` (plus offline Bicep validation) |
| Real iPhone and Android, 60/30 fps | Manual, for Bryan (see PROGRESS.md) |

## Self-review

An outside-style review of the phase found 12 issues. These were fixed in M1.5:

- A tap on Pause, Resume or Play again within 350 ms of another touch was swallowed by the
  double-tap-zoom guard. The guard now never cancels a touch that ends on a button.
- Pausing while the scene was still loading its art left the game running behind the pause
  panel. The pause now also catches scenes that start later.
- A key pressed while paused fired a jump on the first frame after resuming. `releaseAll`
  now clears pending presses.
- If mounting failed after the page guards were attached (for example no WebGL), the page
  stayed locked and held the wake lock. Mount now undoes what it did before rethrowing.
- The jump-buffer test only proved a buffer of one step. It now presses 80 ms before landing.
- Deploy workflow: it now runs only from `main`, runs `pnpm check` first, requires every
  variable it uses, and retries the asset upload while a new role assignment takes effect. A
  theme setting in Bicep that did nothing (Next.js bakes `NEXT_PUBLIC_*` values in at build
  time) was removed.

## Known to be weak

- **The full-course E2E climb uses the autopilot.** It presses the same actions through the
  same input state as a player, but not through the on-screen buttons. Touch buttons are
  covered separately by the multi-touch test.
- **The zoom guard test checks styles and a swipe, not a real pinch or double-tap.** Chromium
  emulation does not reproduce browser zoom gestures faithfully. The real-phone check covers
  this.
- **The safe-area test skips its inset assertions if CDP inset emulation is unavailable.** It
  records an annotation when that happens. It does not check the pause button's right inset.
- **Landscape on an iPhone SE is tight.** With side margins, the touch buttons can cover the
  player near the walls, and the camera look-ahead puts the player level with the top of the
  buttons. Revisit when Bryan has tried it on a phone. Portrait is the primary mode.
- **The tab-hide test cannot tell Phaser's own hidden-tab pause apart from ours.** The pause
  button test checks the status but not that the player is frozen.
- **Theme UI icons are inserted as SVG markup.** The build rejects scripts with a simple
  pattern check, which is fine for first-party themes. It needs a proper allow-list sanitiser
  before hosts can upload themes.
- **The course layout repeats the world width and tile size** instead of reading the tunables.
  A runtime check catches any mismatch.
- **No strict Content Security Policy yet.** The spec asks for one on player pages when
  deployed. It is planned for Phase 3, when `/play/[code]` and the WebSocket origin exist.
- **The bot always double jumps,** even on steps a single jump clears. This matters for
  Phase 2 energy playtests, where it will overspend.
