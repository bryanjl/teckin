import * as Phaser from 'phaser';
import type { PauseController } from '../page/pause-controller';

/** Options for {@link bootPhaserGame}. */
export interface PhaserBootOptions {
  /** Element the canvas fills. Its size decides the game size. */
  parent: HTMLElement;
  scenes: Phaser.Types.Scenes.SceneType[];
  backgroundColor: string;
  /** Arcade physics gravity in world pixels per second squared. */
  gravityY: number;
  /**
   * Highest device pixel ratio the canvas renders at. Rendering at the full ratio of a 3x
   * phone costs fill rate the baseline Android may not have; see docs/DECISIONS.md.
   */
  maxRenderResolution?: number;
  /** Draws Arcade physics bodies, for `?debug=1`. */
  debugPhysics?: boolean;
}

/** A running Phaser game plus what scenes need to size themselves. */
export interface BootedPhaserGame {
  game: Phaser.Game;
  /** Canvas pixels per CSS pixel. Scenes multiply their camera zoom by this. */
  renderResolution: number;
  /** Visible size in CSS pixels, updated on resize. */
  cssSize: () => { width: number; height: number };
  /** Stops the game and removes the canvas. */
  destroy: () => void;
}

/**
 * Starts a Phaser game that fills `parent` and stays sharp on high-density screens.
 *
 * The canvas is sized in device pixels and shown at CSS size (`Scale.NONE` with zoom
 * `1 / resolution`), and a `ResizeObserver` follows the parent through rotation, browser
 * chrome showing and hiding, and split-screen. Input goes through engine-core's own
 * action sources, so Phaser's keyboard plugin is off.
 */
export function bootPhaserGame(options: PhaserBootOptions): BootedPhaserGame {
  const { parent } = options;
  const window = parent.ownerDocument.defaultView;
  const renderResolution = Math.min(
    window?.devicePixelRatio ?? 1,
    options.maxRenderResolution ?? 2,
  );
  const measure = (): { width: number; height: number } => ({
    width: Math.max(1, Math.round(parent.clientWidth)),
    height: Math.max(1, Math.round(parent.clientHeight)),
  });
  let cssSize = measure();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: options.backgroundColor,
    banner: false,
    autoFocus: true,
    disableContextMenu: true,
    input: { keyboard: false, mouse: true, touch: true, gamepad: false },
    scale: {
      mode: Phaser.Scale.NONE,
      width: cssSize.width * renderResolution,
      height: cssSize.height * renderResolution,
      zoom: 1 / renderResolution,
      autoRound: true,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: options.gravityY },
        debug: options.debugPhysics ?? false,
      },
    },
    render: { antialias: true, roundPixels: false },
    scene: options.scenes,
  });
  game.canvas.style.display = 'block';
  game.canvas.style.touchAction = 'none';

  const resizeObserver = new ResizeObserver(() => {
    const next = measure();
    if (next.width === cssSize.width && next.height === cssSize.height) return;
    cssSize = next;
    game.scale.resize(next.width * renderResolution, next.height * renderResolution);
  });
  resizeObserver.observe(parent);

  return {
    game,
    renderResolution,
    cssSize: () => cssSize,
    destroy: () => {
      resizeObserver.disconnect();
      game.destroy(true);
    },
  };
}

/**
 * Pauses every running scene while `controller` is paused and resumes them afterwards.
 * Paused scenes skip their update and physics step, so nothing moves or falls while the
 * phone is locked, and the first frame back does not receive one huge time step.
 * Returns a function that stops the binding.
 */
export function bindPauseToGame(game: Phaser.Game, controller: PauseController): () => void {
  let pausedScenes: Phaser.Scene[] = [];
  const apply = (paused: boolean): void => {
    if (paused) {
      const running = game.scene.getScenes(true);
      for (const scene of running) scene.scene.pause();
      pausedScenes = [...pausedScenes, ...running];
    } else {
      for (const scene of pausedScenes) scene.scene.resume();
      pausedScenes = [];
    }
  };
  const unsubscribe = controller.onChange((paused) => apply(paused));
  if (controller.isPaused) apply(true);
  return unsubscribe;
}
