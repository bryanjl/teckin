import { describe, expect, it } from 'vitest';
import { computeWorldViewport, pickTextureScale } from './scaling';

describe('computeWorldViewport', () => {
  const world = { worldWidth: 384, minimumVisibleWorldHeight: 360 };

  it('fills the screen width in portrait', () => {
    const viewport = computeWorldViewport({ screenWidth: 375, screenHeight: 667, ...world });
    expect(viewport.zoom).toBeCloseTo(375 / 384);
    expect(viewport.visibleWorldWidth).toBeCloseTo(384);
    expect(viewport.visibleWorldHeight).toBeGreaterThan(600);
    expect(viewport.fitsWorldWidth).toBe(true);
  });

  it('keeps enough height visible in landscape, leaving side margins', () => {
    const viewport = computeWorldViewport({ screenWidth: 667, screenHeight: 375, ...world });
    expect(viewport.visibleWorldHeight).toBeCloseTo(360);
    expect(viewport.visibleWorldWidth).toBeGreaterThan(384);
  });

  it('rejects empty sizes', () => {
    expect(() => computeWorldViewport({ screenWidth: 0, screenHeight: 10, ...world })).toThrow();
  });
});

describe('pickTextureScale', () => {
  it('chooses 1x, 2x or 3x art from the effective pixel density', () => {
    expect(pickTextureScale(1)).toBe(1);
    expect(pickTextureScale(2)).toBe(2);
    expect(pickTextureScale(3)).toBe(3);
    expect(pickTextureScale(2, 0.5)).toBe(1);
  });
});
