/** A rectangle to place in an atlas, in pixels. */
export interface PackInput {
  name: string;
  width: number;
  height: number;
}

/** Where one rectangle landed. `x`/`y` are the top-left of its content (inside padding). */
export interface PackPlacement extends PackInput {
  x: number;
  y: number;
}

/** Result of {@link packAtlas}. */
export interface PackedAtlas {
  width: number;
  height: number;
  placements: PackPlacement[];
}

/** Options for {@link packAtlas}. */
export interface PackOptions {
  /**
   * Empty pixels around every rectangle. The art build fills them with copies of the edge
   * pixels so linear filtering never samples a neighbouring frame (no seams between tiles).
   */
  padding: number;
  /** Largest atlas edge allowed. 4096 is safe on every WebGL device the spec targets. */
  maxSize?: number;
}

/**
 * Packs rectangles into one atlas with shelf packing (tallest first). Every power-of-two
 * width up to `maxSize` is tried and the smallest area wins, preferring squarer atlases on
 * ties. Deterministic for the same input, so rebuilt atlases do not churn.
 */
export function packAtlas(inputs: readonly PackInput[], options: PackOptions): PackedAtlas {
  const maxSize = options.maxSize ?? 4096;
  const padding = options.padding;
  const names = new Set<string>();
  for (const input of inputs) {
    if (names.has(input.name)) throw new Error(`Duplicate atlas frame "${input.name}"`);
    names.add(input.name);
    if (input.width <= 0 || input.height <= 0) {
      throw new Error(`Atlas frame "${input.name}" has no size`);
    }
  }
  if (inputs.length === 0) return { width: 1, height: 1, placements: [] };

  const sorted = [...inputs].sort(
    (a, b) => b.height - a.height || b.width - a.width || a.name.localeCompare(b.name),
  );
  const widest = Math.max(...sorted.map((input) => input.width + padding * 2));

  let best: PackedAtlas | undefined;
  for (let width = 16; width <= maxSize; width *= 2) {
    if (width < widest) continue;
    const packed = shelfPack(sorted, width, padding);
    if (packed.height > maxSize) continue;
    if (!best || isBetter(packed, best)) best = packed;
  }
  if (!best) throw new Error(`Sprites do not fit in a ${maxSize}px atlas`);

  const order = new Map(inputs.map((input, index) => [input.name, index]));
  best.placements.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  return best;
}

function shelfPack(sorted: readonly PackInput[], width: number, padding: number): PackedAtlas {
  const placements: PackPlacement[] = [];
  let shelfY = 0;
  let shelfHeight = 0;
  let cursorX = 0;
  for (const input of sorted) {
    const paddedWidth = input.width + padding * 2;
    const paddedHeight = input.height + padding * 2;
    if (cursorX + paddedWidth > width) {
      shelfY += shelfHeight;
      shelfHeight = 0;
      cursorX = 0;
    }
    placements.push({ ...input, x: cursorX + padding, y: shelfY + padding });
    cursorX += paddedWidth;
    shelfHeight = Math.max(shelfHeight, paddedHeight);
  }
  const height = Math.ceil((shelfY + shelfHeight) / 4) * 4;
  return { width, height, placements };
}

function isBetter(candidate: PackedAtlas, current: PackedAtlas): boolean {
  const candidateArea = candidate.width * candidate.height;
  const currentArea = current.width * current.height;
  if (candidateArea !== currentArea) return candidateArea < currentArea;
  const squareness = (atlas: PackedAtlas): number => Math.abs(Math.log(atlas.width / atlas.height));
  return squareness(candidate) < squareness(current);
}
