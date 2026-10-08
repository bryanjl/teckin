import { CollisionGrid } from '../collision-grid';

/**
 * Builds a grid from rows of text for tests: `#` solid, `=` one-way, anything else empty.
 * All rows must be the same length.
 */
export function gridFromAscii(rows: readonly string[], tileSize = 32): CollisionGrid {
  const columns = rows[0]?.length ?? 0;
  const grid = new CollisionGrid(columns, rows.length, tileSize);
  rows.forEach((line, row) => {
    if (line.length !== columns) throw new Error(`Row ${row} has the wrong length`);
    [...line].forEach((character, column) => {
      if (character === '#') grid.set(column, row, 'solid');
      if (character === '=') grid.set(column, row, 'oneWay');
    });
  });
  return grid;
}
