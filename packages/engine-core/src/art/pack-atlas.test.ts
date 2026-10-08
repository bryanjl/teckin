import { describe, expect, it } from 'vitest';
import { packAtlas, type PackInput } from './pack-atlas';

const sprites: PackInput[] = [
  { name: 'player', width: 24, height: 32 },
  { name: 'tile', width: 32, height: 32 },
  { name: 'background', width: 64, height: 64 },
  { name: 'flag', width: 24, height: 32 },
  { name: 'wide', width: 96, height: 8 },
];

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
  padding: number,
): boolean {
  return (
    a.x - padding < b.x + b.width + padding &&
    b.x - padding < a.x + a.width + padding &&
    a.y - padding < b.y + b.height + padding &&
    b.y - padding < a.y + a.height + padding
  );
}

describe('packAtlas', () => {
  it('places every rectangle inside the atlas without padded overlaps', () => {
    const padding = 2;
    const packed = packAtlas(sprites, { padding });
    expect(packed.placements.map((placement) => placement.name)).toEqual(
      sprites.map((sprite) => sprite.name),
    );
    for (const placement of packed.placements) {
      expect(placement.x - padding).toBeGreaterThanOrEqual(0);
      expect(placement.y - padding).toBeGreaterThanOrEqual(0);
      expect(placement.x + placement.width + padding).toBeLessThanOrEqual(packed.width);
      expect(placement.y + placement.height + padding).toBeLessThanOrEqual(packed.height);
    }
    for (const [index, a] of packed.placements.entries()) {
      for (const b of packed.placements.slice(index + 1)) {
        expect(overlaps(a, b, padding / 2), `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
  });

  it('uses a power-of-two width and is deterministic', () => {
    const first = packAtlas(sprites, { padding: 2 });
    const second = packAtlas([...sprites].reverse(), { padding: 2 });
    expect(Math.log2(first.width) % 1).toBe(0);
    expect(second.width).toBe(first.width);
    expect(second.height).toBe(first.height);
    const byName = (atlas: typeof first) =>
      Object.fromEntries(atlas.placements.map((p) => [p.name, [p.x, p.y]]));
    expect(byName(second)).toEqual(byName(first));
  });

  it('rejects duplicate names, empty sizes and art too big for the atlas', () => {
    expect(() => packAtlas([sprites[0]!, { ...sprites[0]! }], { padding: 0 })).toThrow(/Duplicate/);
    expect(() => packAtlas([{ name: 'empty', width: 0, height: 4 }], { padding: 0 })).toThrow(
      /no size/,
    );
    expect(() =>
      packAtlas([{ name: 'huge', width: 300, height: 10 }], { padding: 0, maxSize: 256 }),
    ).toThrow(/do not fit/);
  });
});
