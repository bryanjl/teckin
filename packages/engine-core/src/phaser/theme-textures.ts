import type * as Phaser from 'phaser';
import { pickTextureScale } from '../scaling';
import { themeAtlasUrls, type LoadedTheme, type ThemeTextureScale } from '../theme/theme-manifest';

/**
 * A theme's atlas inside one Phaser scene. Frames are drawn at their world size whatever
 * texture scale was loaded, so game code works in world pixels only.
 */
export class ThemeTextures {
  /** Phaser texture key of the loaded atlas. */
  readonly textureKey: string;

  constructor(
    readonly theme: LoadedTheme,
    /** Texture resolution loaded: 1, 2 or 3 texture pixels per world pixel. */
    readonly textureScale: ThemeTextureScale,
  ) {
    this.textureKey = `theme:${theme.manifest.id}@${textureScale}x`;
  }

  /** Queues the atlas on a scene's loader. Call from `preload`. */
  queue(loader: Phaser.Loader.LoaderPlugin): void {
    const urls = themeAtlasUrls(this.theme, this.textureScale);
    loader.atlas(this.textureKey, urls.image, urls.data);
  }

  /** True when the atlas has a frame with this name. */
  hasFrame(frame: string): boolean {
    return frame in this.theme.manifest.frames;
  }

  /** Adds an image of `frame` centred on (`x`, `y`) in world pixels, at its world size. */
  image(scene: Phaser.Scene, x: number, y: number, frame: string): Phaser.GameObjects.Image {
    this.assertFrame(frame);
    return scene.add.image(x, y, this.textureKey, frame).setScale(1 / this.textureScale);
  }

  /**
   * Adds a repeating fill of `frame` covering `width` × `height` world pixels, with its
   * top-left corner at (`x`, `y`). Used for backgrounds and long platforms.
   */
  tiled(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    frame: string,
  ): Phaser.GameObjects.TileSprite {
    this.assertFrame(frame);
    return scene.add
      .tileSprite(x, y, width, height, this.textureKey, frame)
      .setOrigin(0, 0)
      .setTileScale(1 / this.textureScale, 1 / this.textureScale);
  }

  private assertFrame(frame: string): void {
    if (!this.hasFrame(frame)) {
      throw new Error(`Theme "${this.theme.manifest.id}" has no sprite "${frame}"`);
    }
  }
}

/**
 * Picks the atlas resolution for a canvas rendering at `renderResolution` canvas pixels per
 * CSS pixel with a camera showing `cssPixelsPerWorldPixel` CSS pixels per world pixel.
 */
export function chooseThemeTextureScale(
  renderResolution: number,
  cssPixelsPerWorldPixel: number,
): ThemeTextureScale {
  return pickTextureScale(renderResolution, cssPixelsPerWorldPixel);
}
