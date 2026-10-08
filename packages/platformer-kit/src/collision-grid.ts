/**
 * How a map tile collides.
 * - `empty`: nothing.
 * - `solid`: blocks from every side.
 * - `oneWay`: a ledge you can jump up through and land on from above.
 */
export type TileCollision = 'empty' | 'solid' | 'oneWay';

const collisionCodes: Record<TileCollision, number> = { empty: 0, solid: 1, oneWay: 2 };
const collisionByCode: readonly TileCollision[] = ['empty', 'solid', 'oneWay'];

/** Axis-aligned box in world pixels; (`x`, `y`) is the top-left corner. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Result of moving a box through the grid. */
export interface GridMoveResult {
  x: number;
  y: number;
  hitLeft: boolean;
  hitRight: boolean;
  hitCeiling: boolean;
  /** True when the box came to rest on top of a solid or one-way tile. */
  landed: boolean;
}

// Tolerance, in tiles, for edges that touch exactly; absorbs floating-point error.
const edgeTolerance = 1e-6;
// Tolerance, in pixels, for "feet exactly on a tile top".
const standingTolerance = 0.01;

/**
 * Collision tiles of a map on a fixed grid. Outside the map counts as solid on the left and
 * right (walls) and empty above and below, so a course is open at the top.
 */
export class CollisionGrid {
  private readonly cells: Uint8Array;

  /** Creates an empty grid of `columns` × `rows` tiles, each `tileSize` world pixels. */
  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly tileSize: number,
  ) {
    this.cells = new Uint8Array(columns * rows);
  }

  /** World width in pixels. */
  get width(): number {
    return this.columns * this.tileSize;
  }

  /** World height in pixels. */
  get height(): number {
    return this.rows * this.tileSize;
  }

  /** Sets the collision of one tile. Out-of-range cells are ignored. */
  set(column: number, row: number, collision: TileCollision): void {
    if (!this.inside(column, row)) return;
    this.cells[row * this.columns + column] = collisionCodes[collision];
  }

  /** Collision of one tile; walls left and right of the map, open above and below. */
  at(column: number, row: number): TileCollision {
    if (column < 0 || column >= this.columns) return 'solid';
    if (row < 0 || row >= this.rows) return 'empty';
    return collisionByCode[this.cells[row * this.columns + column] ?? 0] ?? 'empty';
  }

  /**
   * Moves `box` by (`dx`, `dy`): horizontally first, then vertically, stopping at the first
   * blocking tile on each axis. One-way tiles only stop a box that is falling onto them from
   * above. Steps longer than a tile are safe because every crossed row and column is checked.
   */
  move(box: Box, dx: number, dy: number): GridMoveResult {
    const result: GridMoveResult = {
      x: box.x,
      y: box.y,
      hitLeft: false,
      hitRight: false,
      hitCeiling: false,
      landed: false,
    };
    const size = this.tileSize;

    if (dx !== 0) {
      const rowTop = Math.floor(box.y / size + edgeTolerance);
      const rowBottom = Math.ceil((box.y + box.height) / size - edgeTolerance) - 1;
      if (dx > 0) {
        const from = Math.ceil((box.x + box.width) / size - edgeTolerance);
        const to = Math.floor((box.x + box.width + dx) / size - edgeTolerance);
        result.x = box.x + dx;
        for (let column = from; column <= to; column += 1) {
          if (this.rangeHas(column, column, rowTop, rowBottom, 'solid')) {
            result.x = column * size - box.width;
            result.hitRight = true;
            break;
          }
        }
      } else {
        const from = Math.floor(box.x / size + edgeTolerance) - 1;
        const to = Math.floor((box.x + dx) / size + edgeTolerance);
        result.x = box.x + dx;
        for (let column = from; column >= to; column -= 1) {
          if (this.rangeHas(column, column, rowTop, rowBottom, 'solid')) {
            result.x = (column + 1) * size;
            result.hitLeft = true;
            break;
          }
        }
      }
    }

    if (dy !== 0) {
      const columnLeft = Math.floor(result.x / size + edgeTolerance);
      const columnRight = Math.ceil((result.x + box.width) / size - edgeTolerance) - 1;
      if (dy > 0) {
        const bottom = box.y + box.height;
        const from = Math.ceil(bottom / size - edgeTolerance);
        const to = Math.floor((bottom + dy) / size);
        result.y = box.y + dy;
        for (let row = from; row <= to; row += 1) {
          if (
            this.rangeHas(columnLeft, columnRight, row, row, 'solid') ||
            this.rangeHas(columnLeft, columnRight, row, row, 'oneWay')
          ) {
            result.y = row * size - box.height;
            result.landed = true;
            break;
          }
        }
      } else {
        const from = Math.floor(box.y / size + edgeTolerance) - 1;
        const to = Math.floor((box.y + dy) / size);
        result.y = box.y + dy;
        for (let row = from; row >= to; row -= 1) {
          if (this.rangeHas(columnLeft, columnRight, row, row, 'solid')) {
            result.y = (row + 1) * size;
            result.hitCeiling = true;
            break;
          }
        }
      }
    }
    return result;
  }

  /** True when the box stands exactly on a solid or one-way tile. */
  isStandingOn(box: Box): boolean {
    const size = this.tileSize;
    const bottom = box.y + box.height;
    const row = Math.round(bottom / size);
    if (Math.abs(row * size - bottom) > standingTolerance) return false;
    const columnLeft = Math.floor(box.x / size + edgeTolerance);
    const columnRight = Math.ceil((box.x + box.width) / size - edgeTolerance) - 1;
    return (
      this.rangeHas(columnLeft, columnRight, row, row, 'solid') ||
      this.rangeHas(columnLeft, columnRight, row, row, 'oneWay')
    );
  }

  private rangeHas(
    columnFrom: number,
    columnTo: number,
    rowFrom: number,
    rowTo: number,
    collision: TileCollision,
  ): boolean {
    for (let row = rowFrom; row <= rowTo; row += 1) {
      for (let column = columnFrom; column <= columnTo; column += 1) {
        if (this.at(column, row) === collision) return true;
      }
    }
    return false;
  }

  private inside(column: number, row: number): boolean {
    return column >= 0 && column < this.columns && row >= 0 && row < this.rows;
  }
}
