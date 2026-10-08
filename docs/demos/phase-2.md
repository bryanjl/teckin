# Phase 2 demo: questions power the climb

Play a solo game on a phone with a sample question set. Answer questions to fill the energy
meter, spend it climbing all six summits of Cogspire, and finish on a results screen that
shows your time, accuracy and the questions you missed.

## How to run it

```sh
corepack enable
pnpm install
pnpm dev
```

On a phone on the same Wi-Fi, open `http://<your computer's IP>:3000/play/solo`. The README
explains how to find the IP. Useful URL flags:

| Flag | What it does |
| --- | --- |
| `?set=maths` (default), `?set=spelling`, `?set=general-knowledge` | Picks the sample question set |
| `?checkpoints=1` | Each summit becomes a checkpoint (recommended for younger players) |
| `?tune=1` | Shows a "Tune" button with live sliders for energy per answer, jump costs, walking cost and gravity |
| `?debug=1` | fps, position, energy and a debug overlay |
| `?debug=1&autopilot=1` | A bot climbs and answers through the real sheet |
| `?theme=placeholder` | The neutral Phase 1 art instead of Cogspire |

## What to look at on a phone

1. **Cogspire.** The wind-up robot climbs a clock tower. Each summit has its own backdrop:
   Boiler Room, Gear Gallery, Pendulum Hall, Chime Loft, Clock Face and The Bell. The key
   on the robot's back turns faster, and the robot glows brighter, as energy fills.
2. **Energy.** The meter is at the top left and doubles as the "Get energy" button. Starting
   energy is 50. A jump costs 24, a double jump 30, and walking 2 per tile. The button pulses
   below 20. At zero the robot crawls slowly for free but cannot jump.
3. **The question sheet.** Tap "Get energy". The sheet covers the lower 60% with big answer
   buttons in thumb reach.
   - A correct answer shows "+100" flying up toward the meter.
   - A wrong answer highlights the right one for 2 seconds.
   - The robot stays frozen until "Back to climbing" and then carries on exactly where it
     was, even mid-jump. The game clock keeps running while you answer.
4. **Hazards from summit 3.**
   - Pendulum Hall: moving ledges you have to ride.
   - Chime Loft: crumbling ledges and steam vents that push sideways.
   - Clock Face: spark barriers that flicker before they switch on and knock you down.
   - The Bell: all of them, with narrow ledges and long double jumps.
5. **Results.** Shows time, summits, questions answered, accuracy and every missed question
   with its answer. "Play again" starts a fresh game.
6. **Sound.** Synthesised jump, land, correct, wrong, summit and finish sounds. The mute
   button sits under pause and is remembered.
7. **Reduced motion.** Turn on the system setting. The sheet stops sliding, the "+100" fades
   instead of flying, crumbling ledges do not shake, the key stops spinning, and the "Get
   energy" button is outlined instead of pulsing.

## Acceptance criteria and their tests

| Criterion | Covered by |
| --- | --- |
| A full solo run with each sample set completes in an automated test | Unit `full-run.test.ts` (headless, scripted answers, one per set); E2E "a full solo run reaches the results screen" (browser, iPhone portrait) |
| Energy only rises on correct answers and only falls on moves | Unit `local-session.test.ts`, `climber-run.test.ts` (jump, double jump, walking, free falling and drift, free crawl), `hazards.test.ts` (carry and vents reported as pushed), the energy balance check in `full-run.test.ts`; E2E correct and wrong answers |
| A skilled bot finishes in 8 to 12 simulated minutes | Unit `playtest.test.ts`; numbers in `docs/playtests.md` |
| The sheet works one-handed on a 375 px screen | E2E "the question sheet works one-handed" (iPhone SE and Pixel portrait) |
| The game cannot move while the sheet is open and resumes exactly | E2E "the game cannot move while the sheet is open…" (exact body comparison), unit `addAnsweringTime` |
| Unit tests for deck order, retry rule, grading and energy accounting | `deck.test.ts`, `grading.test.ts`, `quiz.test.ts`, `local-session.test.ts`, `climber-run.test.ts` |
| The climber imports questions only through `GameSession` | ESLint `no-restricted-imports` in `games/climber/eslint.config.js` (only tests and playtest scripts are exempt) |
| Manual: a real playtest on Bryan's phone | See PROGRESS.md, "For Bryan to check" |

## What was decided

The full record is in `docs/DECISIONS.md`. The main Phase 2 decisions:

- **`ClientGameShell`.** The app gives the game a session, the shared React question sheet
  and results screen, and sound. Phase 3 swaps `LocalSession` for `NetworkSession` without
  touching the game.
- **Movement costs were raised after the playtests** to jump 24, double jump 30 and walking
  2 per tile. Energy per answer stays at the host default of 100. See `docs/playtests.md`.
- **Hazards are a pure `HazardField` in `platformer-kit`,** driven by the run's clock. A
  course bot that rides moving ledges and waits for barriers proves all six summits
  climbable in a unit test.
- **The game clock counts time spent answering, but the player and their hazards stay
  frozen,** so the climb resumes exactly where it was.

## Self-review

A fresh-eyes review found 13 issues. These were fixed in M2.6:

- **Time spent answering was not on the clock.** A wrong answer cost no time, unlike the
  spec. It is now counted.
- **Sideways drift while falling cost walking energy.** Walking is now charged only for
  steps on a ledge.
- **The freeze E2E test used loose tolerances and could flake.** It now compares the body
  exactly.
- **The sheet could lock up if a session call failed.** It now shows "Try again", which
  matters for the Phase 3 network session.
- **Space and the arrow keys were swallowed inside dialogs and sliders.** Keyboard users
  can now press answer buttons, and the tuning sliders work.
- **Audio on iPhone could stay locked.** The first tap or key press now unlocks it.
- **Answer timing counted time with the sheet closed.** The timer now restarts each time
  the question is shown.
- **A two-question set could repeat a question while a retry waited.**
- **The sheet's focus handling was wrong.** Focus now returns to "Get energy" on close, and
  the misused `aria-pressed` is gone.
- **The energy key kept spinning under reduced motion.**
- **Crumbling ledges always came back one-way.** They now keep their original collision.

## Known to be weak

- **"Get energy" is at the top left,** out of easy thumb reach. The bottom of a portrait
  phone is taken by the movement controls. Try it on a phone; a second trigger between the
  controls, or a swipe-up gesture, are the obvious alternatives.
- **Each player's hazards follow their own clock,** which pauses while their sheet is open.
  In Phase 3 the server must check movement against that same per-player hazard clock, or
  hazards must move to the room clock (which would break "resumes exactly").
- **There is no focus trap in the sheet.** Tab can reach the HUD behind it.
- **Moving ledges are drawn at the latest simulated position** while the player is drawn
  between steps, so a rider can jitter by about a pixel.
- **A player standing inside a live barrier is knocked down every step.** No current map can
  cause this.
- **The full-course E2E test runs in real time** (about 4 minutes in the sandbox). If CI
  becomes slow, add a faster simulation speed under `?debug=1`.
- **The balance comes from scripted profiles, not children.** An average player needs about
  18 minutes, longer than the default 15-minute game, so most class games will end on height.
  Bryan's real playtest should decide whether that is right. `?tune=1` makes it easy to try
  other numbers.
- **Sample questions are written for ages 8 to 10 and English only.** Review them before
  showing them to a class.
