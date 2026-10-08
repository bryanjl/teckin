import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath } from './qr';

/** Draws the matrix as an RGBA image, `scale` pixels per module, for a QR reader. */
function rasterise(text: string, scale = 4) {
  const matrix = qrMatrix(text);
  const width = matrix.size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = matrix.dark[Math.floor(y / scale)]![Math.floor(x / scale)];
      const offset = (y * width + x) * 4;
      pixels.fill(dark ? 0 : 255, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  return { pixels, width, matrix };
}

describe('qrMatrix', () => {
  it('encodes a join link that a QR reader reads back exactly', () => {
    const url = 'http://192.168.1.20:3000/join?code=482913';
    const { pixels, width } = rasterise(url);
    expect(jsQR(pixels, width, width)?.data).toBe(url);
  });

  it('keeps a light quiet zone of four modules', () => {
    const { matrix } = rasterise('https://example.org/join?code=123456');
    for (const row of [0, 3, matrix.size - 1]) {
      expect(matrix.dark[row]!.some(Boolean)).toBe(false);
    }
    expect(matrix.dark[4]![4]).toBe(true);
  });
});

describe('qrPath', () => {
  it('merges runs of dark modules into one rectangle each', () => {
    expect(
      qrPath({
        size: 3,
        dark: [
          [true, true, false],
          [false, false, false],
          [true, false, true],
        ],
      }),
    ).toBe('M0 0h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z');
  });
});
