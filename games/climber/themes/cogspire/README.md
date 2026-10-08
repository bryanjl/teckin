# Cogspire theme pack

The default Climber theme: a small wind-up robot climbing the inside of a giant clock tower.
All art is original SVG drawn for this project (no third-party assets).

- `sprites/player.svg`: the robot; eight colour variants are hue swaps declared in `theme.json`.
- `sprites/energy-key.svg` and `energy-glow.svg`: the key on the robot's back spins faster and
  the robot glows brighter as energy fills; both slow and dim when energy is low.
- `sprites/background-1..6.svg`: one seamless 64 × 64 backdrop per summit (Boiler Room, Gear
  Gallery, Pendulum Hall, Chime Loft, Clock Face, The Bell).
- `sprites/tile-*.svg` and `hazard-*.svg`: floor, brass ledges, moving and crumbling ledges,
  steam vents and spark barriers.
- `ui/*.svg`: interface icons drawn with `currentColor`.

The art script that produced the first version is not needed to edit it: open any SVG in a
vector editor, keep the size, and run `pnpm --filter @teckin/climber build`.
