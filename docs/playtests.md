# Playtests

Scripted balance playtests for the Climber game. They play the whole six-summit course
headlessly: the course bot climbs through the real `ClimberRun` (same physics, hazards and
energy rules as the game), and a scripted player answers questions through a real
`LocalSession` whenever energy runs low.

Regenerate the table with `pnpm --filter @teckin/climber playtest`. A unit test
(`games/climber/src/run/playtest.test.ts`) fails if a skilled player stops finishing in 8 to 12
simulated minutes at default settings.

## Player profiles

The bot climbs perfectly and reacts instantly, so each profile adds human habits on top:

| Profile | Accuracy | Seconds per answer | Tops up below | Refills to | Pause after landing | Fumbled jumps |
| --- | --- | --- | --- | --- | --- | --- |
| skilled | 90% | 8 | 50 | 250 | 0.5 s | 6% |
| average | 75% | 10 | 40 | 200 | 0.8 s | 12% |
| struggling | 55% | 14 | 30 | 150 | 1.0 s | 18% |

A wrong answer adds the 2-second reveal, and each visit to the sheet adds 2 seconds to open
and close it. A fumbled jump lets go of the button at once (a short hop) and misses the double
jump, which on the upper summits usually means a fall. A player pauses less on a shaking ledge
or in a steam blast, as a person would.

Six seeds per profile and set; seeds vary the deck order, the wrong answers and the fumbles.
The sets play the same because the scripted player's accuracy, not the questions, decides
the outcome.

## Results at default settings (2026-10-08)

Energy per correct answer 100, starting energy 50, jump 20, double jump 26, walking 2 per tile.

| Profile | Set | Finished | Total (min) | Climbing (min) | Answering (min) | Questions | Accuracy | Sheet visits | Jumps + double jumps | Knock-downs | Crumbles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| skilled | maths | 6/6 | 8.8 | 2.6 | 6.3 | 43 | 89% | 13 | 98 + 41 | 0.0 | 9.8 |
| skilled | spelling | 6/6 | 8.8 | 2.6 | 6.3 | 43 | 89% | 13 | 98 + 41 | 0.0 | 9.8 |
| skilled | general-knowledge | 6/6 | 8.8 | 2.6 | 6.3 | 43 | 89% | 13 | 98 + 41 | 0.0 | 9.8 |
| average | maths | 6/6 | 17.8 | 4.3 | 13.5 | 72 | 77% | 27 | 143 + 58 | 6.2 | 13.7 |
| average | spelling | 6/6 | 17.8 | 4.3 | 13.5 | 72 | 77% | 27 | 143 + 58 | 6.2 | 13.7 |
| average | general-knowledge | 6/6 | 17.8 | 4.3 | 13.5 | 72 | 77% | 27 | 143 + 58 | 6.2 | 13.7 |
| struggling | maths | 3/6 | 39.8 | 6.4 | 33.4 | 130 | 56% | 36 | 205 + 66 | 8.7 | 23.2 |
| struggling | spelling | 3/6 | 39.8 | 6.4 | 33.4 | 130 | 56% | 36 | 205 + 66 | 8.7 | 23.2 |
| struggling | general-knowledge | 3/6 | 39.8 | 6.4 | 33.4 | 130 | 56% | 36 | 205 + 66 | 8.7 | 23.2 |

Averages: skilled 8.8 min, average 17.8 min, struggling 39.8 min (half of the struggling runs
did not finish within 45 minutes).

## What changed and why

With the spec's starting costs (jump 10, double jump 15, walking 1 per tile) the same
profiles took 5.9 min (skilled), 9.9 min (average) and 22.6 min (struggling). A skilled
player finished in well under the 8-minute floor and answered only about 20 questions in a
whole game, which is too few for a question-powered game.

Raising the movement costs to jump 20, double jump 26 and walking 2 per tile brings the
skilled player to about 9 minutes and roughly 43 questions. Energy per correct answer stays
at the spec's 100, because it is the host's setting and the number a teacher sees. The "Get
energy" pulse stays below 20, which is now exactly when a jump is no longer possible.

Things to watch in real playtests:

- An average player takes about 18 minutes, longer than the default 15-minute game, so in a
  timed class game most players will be ranked by height rather than finish. That fits a race,
  but if it feels harsh, lower the jump cost or raise the host's energy per answer.
- The struggling profile falls a lot on summits 5 and 6, where a fumbled double jump drops
  a long way. Checkpoints (`?checkpoints=1`, a host setting) help these players most.
- Use `?tune=1` on a phone to try other values live.
