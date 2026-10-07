/** Inputs for {@link computeWorldViewport}. */
export interface WorldViewportInput {
  /** Visible game area in CSS pixels. */
  screenWidth: number;
  screenHeight: number;
  /** Fixed world width in world pixels (tiles × tile size). */
  worldWidth: number;
  /**
   * The least world height the player must always see, in world pixels. In landscape,
   * fitting the world width alone would show only a thin strip of the climb, so the zoom
   * is capped to keep at least this much visible.
   */
  minimumVisibleWorldHeight: number;
}

/** Result of {@link computeWorldViewport}. */
export interface WorldViewport {
  /** Camera zoom: CSS pixels per world pixel. */
  zoom: number;
  /** Visible world area at that zoom, in world pixels. */
  visibleWorldWidth: number;
  visibleWorldHeight: number;
  /** True when the whole world width fits on screen (always the case in portrait). */
  fitsWorldWidth: boolean;
}

/**
 * Decides the camera zoom for a vertical course with a fixed width. In portrait the world
 * width fills the screen width. In landscape the zoom is reduced so at least
 * `minimumVisibleWorldHeight` stays visible, which leaves side margins instead of
 * hiding what is above and below the player.
 */
export function computeWorldViewport(input: WorldViewportInput): WorldViewport {
  const { screenWidth, screenHeight, worldWidth, minimumVisibleWorldHeight } = input;
  if (screenWidth <= 0 || screenHeight <= 0 || worldWidth <= 0) {
    throw new Error('Viewport and world sizes must be positive');
  }
  const widthFitZoom = screenWidth / worldWidth;
  const heightCapZoom = screenHeight / Math.max(minimumVisibleWorldHeight, 1);
  const zoom = Math.min(widthFitZoom, heightCapZoom);
  return {
    zoom,
    visibleWorldWidth: screenWidth / zoom,
    visibleWorldHeight: screenHeight / zoom,
    fitsWorldWidth: zoom <= widthFitZoom + 1e-9,
  };
}

/**
 * Picks the texture resolution (1, 2 or 3) for a device pixel ratio multiplied by the camera
 * zoom, so sprites stay sharp without loading 3x art on low-density screens.
 */
export function pickTextureScale(devicePixelRatio: number, zoom = 1): 1 | 2 | 3 {
  const effective = devicePixelRatio * zoom;
  if (effective > 2.2) return 3;
  if (effective > 1.2) return 2;
  return 1;
}
