/**
 * Source layout for the Climber course, turned into a Tiled JSON map by
 * `scripts/generate-course.ts`. The map file is the data the game loads; this layout is
 * just a compact way to write it. The map can also be edited directly in Tiled, in which
 * case stop regenerating it (see docs/DECISIONS.md).
 */

/** A one-way platform: height of its top above the ground in tiles, first column, width. */
export type PlatformSpec = readonly [heightTiles: number, column: number, width: number];

/** One summit: the platforms leading up to it and the summit ledge itself. */
export interface SummitSpec {
  platforms: readonly PlatformSpec[];
  /** The ledge at the top of the summit, where the summit is reached. */
  summit: PlatformSpec;
}

/** Course width in tiles; matches `physics.worldWidthTiles`. */
export const courseWidthTiles = 12;
/** Solid ground rows under the start, so the player starts above the touch controls. */
export const groundDepthTiles = 4;
/** Empty rows above the last summit, so the camera has sky to show. */
export const skyRowsTiles = 10;
/** Column the player starts in. */
export const spawnColumn = 2;

/**
 * Summits 1 and 2. Summit 1 teaches movement: wide ledges, 3-tile steps that a single jump
 * clears, each ledge overlapping the one below. Summit 2 adds 4-tile steps that need the
 * double jump and sideways gaps that need a running start.
 */
export const courseSummits: readonly SummitSpec[] = [
  {
    platforms: [
      [3, 5, 5],
      [6, 2, 5],
      [9, 5, 5],
      [12, 1, 5],
      [15, 4, 5],
      [18, 7, 5],
      [21, 3, 5],
      [24, 0, 5],
      [27, 3, 5],
      [30, 6, 5],
      [33, 2, 5],
      [36, 5, 5],
      [39, 1, 5],
      [42, 4, 5],
      [45, 7, 4],
    ],
    summit: [48, 2, 8],
  },
  {
    platforms: [
      [52, 7, 4],
      [55, 3, 4],
      [59, 0, 3],
      [62, 3, 4],
      [66, 7, 4],
      [69, 9, 3],
      [73, 5, 3],
      [76, 1, 4],
      [80, 4, 3],
      [83, 8, 3],
      [87, 4, 3],
      [90, 0, 4],
      [93, 4, 3],
    ],
    summit: [96, 3, 6],
  },
];

/** Tile ids inside the course tileset (Tiled adds `firstgid`, which is 1). */
const groundTile = 0;
const platformTile = 1;

/** Builds the course as a Tiled 1.11 JSON map. */
export function buildCourseTiledMap(): Record<string, unknown> {
  const topHeight = Math.max(...courseSummits.map((summit) => summit.summit[0]));
  const rows = skyRowsTiles + topHeight + groundDepthTiles;
  const groundRow = rows - groundDepthTiles;
  const rowOf = (heightTiles: number): number => groundRow - heightTiles;
  const tileSize = 32;

  const data = new Array<number>(courseWidthTiles * rows).fill(0);
  const place = (row: number, column: number, tile: number): void => {
    if (column < 0 || column >= courseWidthTiles) {
      throw new Error(`Column ${column} is outside the course`);
    }
    data[row * courseWidthTiles + column] = tile + 1;
  };
  for (let row = groundRow; row < rows; row += 1) {
    for (let column = 0; column < courseWidthTiles; column += 1) place(row, column, groundTile);
  }
  for (const { platforms, summit } of courseSummits) {
    for (const [height, column, width] of [...platforms, summit]) {
      for (let offset = 0; offset < width; offset += 1) {
        place(rowOf(height), column + offset, platformTile);
      }
    }
  }

  const objects: Record<string, unknown>[] = [
    {
      id: 1,
      name: 'start',
      type: 'spawn',
      x: (spawnColumn + 0.5) * tileSize,
      y: groundRow * tileSize,
      width: 0,
      height: 0,
      point: true,
      rotation: 0,
      visible: true,
    },
  ];
  courseSummits.forEach(({ summit: [height, column, width] }, index) => {
    // The zone covers the air just above the summit ledge: landing on it reaches the summit.
    objects.push({
      id: objects.length + 1,
      name: `summit-${index + 1}`,
      type: 'summit',
      x: column * tileSize,
      y: (rowOf(height) - 2) * tileSize,
      width: width * tileSize,
      height: 2 * tileSize,
      rotation: 0,
      visible: true,
      properties: [{ name: 'summit', type: 'int', value: index + 1 }],
    });
  });

  const tileProperties = (collision: string, frame: string) => [
    { name: 'collision', type: 'string', value: collision },
    { name: 'frame', type: 'string', value: frame },
  ];
  return {
    compressionlevel: -1,
    height: rows,
    infinite: false,
    layers: [
      {
        data,
        height: rows,
        id: 1,
        name: 'terrain',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: courseWidthTiles,
        x: 0,
        y: 0,
      },
      {
        draworder: 'topdown',
        id: 2,
        name: 'markers',
        objects,
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: objects.length + 1,
    orientation: 'orthogonal',
    properties: [{ name: 'summitCount', type: 'int', value: courseSummits.length }],
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    tileheight: tileSize,
    tilesets: [
      {
        columns: 0,
        firstgid: 1,
        grid: { height: 1, orientation: 'orthogonal', width: 1 },
        margin: 0,
        name: 'course',
        spacing: 0,
        tilecount: 2,
        tileheight: tileSize,
        tiles: [
          {
            id: groundTile,
            image: '../themes/placeholder/sprites/tile-ground.svg',
            imageheight: tileSize,
            imagewidth: tileSize,
            properties: tileProperties('solid', 'tile-ground'),
          },
          {
            id: platformTile,
            image: '../themes/placeholder/sprites/tile-platform.svg',
            imageheight: tileSize,
            imagewidth: tileSize,
            properties: tileProperties('oneWay', 'tile-platform'),
          },
        ],
        tilewidth: tileSize,
      },
    ],
    tilewidth: tileSize,
    type: 'map',
    version: '1.10',
    width: courseWidthTiles,
  };
}
