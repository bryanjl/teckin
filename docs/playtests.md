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

Energy per correct answer 100, starting energy 50, jump 24, double jump 30, walking 2 per tile
(walking is charged only for steps taken on a ledge; drifting while falling is free).

| Profile | Set | Finished | Total (min) | Climbing (min) | Answering (min) | Questions | Accuracy | Sheet visits | Jumps + double jumps | Knock-downs | Crumbles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| skilled | maths | 6/6 | 9.5 | 2.7 | 6.8 | 47 | 90% | 14 | 105 + 43 | 0.0 | 11.3 |
| skilled | spelling | 6/6 | 9.5 | 2.7 | 6.8 | 47 | 90% | 14 | 105 + 43 | 0.0 | 11.3 |
| skilled | general-knowledge | 6/6 | 9.5 | 2.7 | 6.8 | 47 | 90% | 14 | 105 + 43 | 0.0 | 11.3 |
| average | maths | 6/6 | 18.1 | 4.4 | 13.7 | 73 | 77% | 28 | 149 + 52 | 6.0 | 16.5 |
| average | spelling | 6/6 | 18.1 | 4.4 | 13.7 | 73 | 77% | 28 | 149 + 52 | 6.0 | 16.5 |
| average | general-knowledge | 6/6 | 18.1 | 4.4 | 13.7 | 73 | 77% | 28 | 149 + 52 | 6.0 | 16.5 |
| struggling | maths | 2/6 | 43.3 | 6.9 | 36.4 | 141 | 56% | 39 | 208 + 78 | 15.2 | 18.2 |
| struggling | spelling | 2/6 | 43.3 | 6.9 | 36.4 | 141 | 56% | 39 | 208 + 78 | 15.2 | 18.2 |
| struggling | general-knowledge | 2/6 | 43.3 | 6.9 | 36.4 | 141 | 56% | 39 | 208 + 78 | 15.2 | 18.2 |

Averages: skilled 9.5 min, average 18.1 min, struggling 43.3 min (only two of six struggling
runs finished within 45 minutes).

## What changed and why

With the spec's starting costs (jump 10, double jump 15, walking 1 per tile) the same
profiles took 5.9 min (skilled), 9.9 min (average) and 22.6 min (struggling). A skilled
player finished in well under the 8-minute floor and answered only about 20 questions in a
whole game, which is too few for a question-powered game.

Raising the movement costs to jump 24, double jump 30 and walking 2 per tile brings the
skilled player to about 9.5 minutes and roughly 47 questions, comfortably inside the 8 to 12
minute target. Energy per correct answer stays
at the spec's 100, because it is the host's setting and the number a teacher sees. The "Get
energy" pulse stays below 20 as the spec says; a jump now needs 24, so players see the pulse a
little after their last jump becomes impossible. Worth checking on a phone.

Things to watch in real playtests:

- An average player takes about 18 minutes, longer than the default 15-minute game, so in a
  timed class game most players will be ranked by height rather than finish. That fits a race,
  but if it feels harsh, lower the jump cost or raise the host's energy per answer.
- The struggling profile falls a lot on summits 5 and 6, where a fumbled double jump drops
  a long way. Checkpoints (`?checkpoints=1`, a host setting) help these players most.
- Use `?tune=1` on a phone to try other values live.
