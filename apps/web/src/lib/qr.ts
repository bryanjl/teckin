import { encode } from 'uqr';

/** A QR code as a square grid of modules, quiet zone included. */
export interface QrMatrix {
  /** Modules per side. */
  size: number;
  /** `true` for a dark module, by row then column. */
  dark: boolean[][];
}

/**
 * Encodes `text` as a QR code with medium error correction (a projected code survives
 * glare and a camera at an angle) and the 4-module quiet zone the standard asks for.
 */
export function qrMatrix(text: string): QrMatrix {
  const result = encode(text, { ecc: 'M', border: 4 });
  return { size: result.size, dark: result.data };
}

/**
 * One SVG path drawing every dark module, one unit per module, with runs of dark modules in
 * a row merged into single rectangles to keep the path short. Use with
 * `viewBox="0 0 size size"` and `shape-rendering="crispEdges"`.
 */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  matrix.dark.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join('');
}
