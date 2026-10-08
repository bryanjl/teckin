/**
 * Source layout for the Climber course, turned into a Tiled JSON map by
 * `scripts/generate-course.ts`. The map file is the data the game loads; this layout is
 * just a compact way to write it. The map can also be edited directly in Tiled, in which
 * case stop regenerating it (see docs/DECISIONS.md).
 */

/** A one-way platform: height of its top above the ground in tiles, first column, width. */
export type PlatformSpec = readonly [heightTiles: number, column: number, width: number];

/**
 * A moving ledge: height of its top in tiles, starting column, width in tiles, sideways
 * travel in tiles (negative goes left), seconds per there-and-back cycle, starting phase 0–1.
 */
export type MoverSpec = readonly [
  heightTiles: number,
  column: number,
  width: number,
  travelTiles: number,
  periodSeconds: number,
  phase: number,
];

/**
 * A steam vent on a wall: lowest and highest height (tiles) of its zone, the side it
 * blows from, how far its push reaches (tiles), push speed (px/s), seconds on and off,
 * and the offset into its cycle.
 */
export type VentLayoutSpec = readonly [
  fromHeight: number,
  toHeight: number,
  side: 'left' | 'right',
  reachTiles: number,
  pushSpeed: number,
  onSeconds: number,
  offSeconds: number,
  offsetSeconds: number,
];

/**
 * A spark barrier: the height (tiles) it crosses at, first column, width in tiles, seconds
 * on and off, and the offset into its cycle.
 */
export type BarrierLayoutSpec = readonly [
  heightTiles: number,
  column: number,
  width: number,
  onSeconds: number,
  offSeconds: number,
  offsetSeconds: number,
];

/** One summit: the platforms leading up to it and the summit ledge itself. */
export interface SummitSpec {
  platforms: readonly PlatformSpec[];
  /** Ledges that crumble a moment after being stood on and come back later. */
  crumbling?: readonly PlatformSpec[];
  movers?: readonly MoverSpec[];
  vents?: readonly VentLayoutSpec[];
  barriers?: readonly BarrierLayoutSpec[];
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
 * The six summits. Summit 1 teaches movement: wide ledges, 3-tile steps that a single jump
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
  {
    // Pendulum Hall: moving ledges. Each one swings under a ledge that is too high to reach
    // from below, so it has to be ridden.
    platforms: [
      [100, 6, 4],
      [103, 2, 4],
      [111, 5, 3],
      [114, 1, 4],
      [117, 5, 4],
      [120, 7, 3],
      [128, 2, 3],
      [131, 6, 4],
      [134, 2, 4],
      [137, 6, 4],
      [140, 3, 4],
    ],
    movers: [
      [107, 1, 3, 6, 5, 0],
      [124, 7, 3, -6, 6, 0.25],
    ],
    summit: [144, 2, 7],
  },
  {
    // Chime Loft: crumbling ledges and steam vents that push sideways.
    platforms: [
      [147, 6, 3],
      [153, 5, 4],
      [159, 4, 3],
      [162, 0, 3],
      [165, 4, 3],
      [171, 3, 3],
      [177, 3, 4],
      [183, 3, 3],
      [186, 6, 4],
      [189, 2, 4],
    ],
    crumbling: [
      [150, 2, 3],
      [156, 8, 3],
      [168, 7, 3],
      [174, 7, 3],
      [180, 7, 3],
    ],
    vents: [
      [158, 163, 'left', 5, 90, 2, 2, 0],
      [172, 178, 'right', 5, -90, 2.5, 1.5, 1],
    ],
    summit: [192, 3, 6],
  },
  {
    // Clock Face: spark barriers across the way up, and 4-tile steps that need the double
    // jump.
    platforms: [
      [196, 7, 3],
      [200, 3, 3],
      [204, 5, 3],
      [208, 9, 3],
      [212, 5, 3],
      [216, 1, 3],
      [220, 5, 3],
      [224, 9, 3],
      [228, 5, 2],
      [232, 1, 3],
      [236, 5, 3],
    ],
    barriers: [
      [202, 2, 5, 1.5, 2.5, 0],
      [214, 3, 6, 1.5, 2, 1],
      [230, 0, 6, 2, 2, 0.5],
    ],
    summit: [240, 3, 6],
  },
  {
    // The Bell: everything at once, with narrow ledges and 5-tile double jumps.
    platforms: [
      [245, 7, 3],
      [250, 2, 3],
      [258, 7, 2],
      [266, 7, 2],
      [270, 3, 2],
      [275, 7, 2],
      [283, 7, 3],
    ],
    crumbling: [
      [262, 3, 3],
      [279, 3, 3],
    ],
    movers: [[254, 1, 3, 6, 5, 0.5]],
    vents: [[263, 268, 'right', 5, -100, 2, 2, 0]],
    barriers: [[272, 0, 12, 1.5, 2.5, 0]],
    summit: [288, 3, 6],
  },
];

/** Tile ids inside the course tileset (Tiled adds `firstgid`, which is 1). */
const groundTile = 0;
const platformTile = 1;
const crumblingTile = 2;

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
  for (const { platforms, summit, crumbling = [] } of courseSummits) {
    for (const [height, column, width] of [...platforms, summit]) {
      for (let offset = 0; offset < width; offset += 1) {
        place(rowOf(height), column + offset, platformTile);
      }
    }
    for (const [height, column, width] of crumbling) {
      for (let offset = 0; offset < width; offset += 1) {
        place(rowOf(height), column + offset, crumblingTile);
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

  const nextId = (): number => objects.length + 1;
  for (const { movers = [], vents = [], barriers = [] } of courseSummits) {
    for (const [height, column, width, travel, period, phase] of movers) {
      objects.push({
        id: nextId(),
        name: `mover-${nextId()}`,
        type: 'movingPlatform',
        x: column * tileSize,
        y: rowOf(height) * tileSize,
        width: width * tileSize,
        height: tileSize,
        rotation: 0,
        visible: true,
        properties: [
          { name: 'travelTiles', type: 'float', value: travel },
          { name: 'periodSeconds', type: 'float', value: period },
          { name: 'phase', type: 'float', value: phase },
        ],
      });
    }
    for (const [fromHeight, toHeight, side, reach, push, on, off, offset] of vents) {
      const x = side === 'left' ? 0 : (courseWidthTiles - reach) * tileSize;
      objects.push({
        id: nextId(),
        name: `vent-${nextId()}`,
        type: 'vent',
        x,
        y: rowOf(toHeight) * tileSize,
        width: reach * tileSize,
        height: (toHeight - fromHeight) * tileSize,
        rotation: 0,
        visible: true,
        properties: [
          { name: 'pushSpeed', type: 'float', value: push },
          { name: 'onSeconds', type: 'float', value: on },
          { name: 'offSeconds', type: 'float', value: off },
          { name: 'offsetSeconds', type: 'float', value: offset },
        ],
      });
    }
    for (const [height, column, width, on, off, offset] of barriers) {
      objects.push({
        id: nextId(),
        name: `barrier-${nextId()}`,
        type: 'barrier',
        x: column * tileSize,
        // A thin beam centred on the line `height` tiles up.
        y: rowOf(height) * tileSize - 4,
        width: width * tileSize,
        height: 8,
        rotation: 0,
        visible: true,
        properties: [
          { name: 'onSeconds', type: 'float', value: on },
          { name: 'offSeconds', type: 'float', value: off },
          { name: 'offsetSeconds', type: 'float', value: offset },
        ],
      });
    }
  }

  const tileProperties = (collision: string, frame: string, hazard?: string) => [
    { name: 'collision', type: 'string', value: collision },
    { name: 'frame', type: 'string', value: frame },
    ...(hazard ? [{ name: 'hazard', type: 'string', value: hazard }] : []),
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
        tilecount: 3,
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
          {
            id: crumblingTile,
            image: '../themes/placeholder/sprites/tile-crumbling.svg',
            imageheight: tileSize,
            imagewidth: tileSize,
            properties: tileProperties('oneWay', 'tile-crumbling', 'crumbling'),
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
