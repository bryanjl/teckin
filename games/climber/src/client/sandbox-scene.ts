import * as Phaser from 'phaser';
import {
  computeWorldViewport,
  type ActionState,
  type LoadedTheme,
  type PlatformerAction,
} from '@teckin/engine-core';
import { ThemeTextures, chooseThemeTextureScale } from '@teckin/engine-core/phaser';
import type { ClimberPhysicsTunables } from '../tunables';

/** Which theme atlas the scene loaded, for the debug overlay and tests. */
export interface ThemeSnapshot {
  id: string;
  textureScale: number;
  /** True once the atlas texture is in Phaser's texture manager. */
  loaded: boolean;
}

/** Read-only snapshot of the player, for the debug overlay and automated tests. */
export interface PlayerSnapshot {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
  jumpsUsed: number;
}

/** What the sandbox scene needs from the page. */
export interface SandboxSceneOptions {
  actions: ActionState<PlatformerAction>;
  physics: ClimberPhysicsTunables;
  /** Built theme pack whose atlas supplies every sprite. */
  theme: LoadedTheme;
  /** Atlas frame drawn for the player, e.g. `player-amber`. */
  playerFrame: string;
  /** Called once the scene has created its world and is running. */
  onReady: () => void;
}

/** Platforms in tile units: column, row from the top, width in tiles. Placeholder layout. */
const sandboxPlatforms: readonly [number, number, number][] = [
  [0, 39, 12],
  [7, 36, 4],
  [1, 33, 4],
  [6, 30, 3],
  [2, 27, 4],
  [8, 24, 3],
  [3, 21, 4],
  [0, 18, 3],
  [5, 15, 5],
];
const sandboxHeightTiles = 40;

/**
 * Engine proof scene: a short staircase of platforms and a player that runs, jumps and
 * double jumps, drawn entirely from the active theme's atlas. It proves boot, scaling,
 * input, pause, camera and theme loading on a phone; M1.4 replaces it with the
 * platformer-kit controller and Tiled maps. Physics bodies are plain invisible rectangles
 * and the art follows them, so swapping art never changes collision.
 */
export class SandboxScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private playerArt!: Phaser.GameObjects.Image;
  private themeTextures?: ThemeTextures;
  private jumpsUsed = 0;

  constructor(private readonly options: SandboxSceneOptions) {
    super({ key: 'climber-sandbox' });
  }

  /** Current player state. */
  snapshot(): PlayerSnapshot {
    if (!this.playerBody) {
      return { x: 0, y: 0, velocityX: 0, velocityY: 0, onGround: false, jumpsUsed: 0 };
    }
    return {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      velocityX: Math.round(this.playerBody.velocity.x),
      velocityY: Math.round(this.playerBody.velocity.y),
      onGround: this.playerBody.blocked.down,
      jumpsUsed: this.jumpsUsed,
    };
  }

  /** The loaded theme atlas, or nothing before `preload` has run. */
  themeSnapshot(): ThemeSnapshot {
    const textures = this.themeTextures;
    return {
      id: this.options.theme.manifest.id,
      textureScale: textures?.textureScale ?? 0,
      loaded: textures ? this.textures.exists(textures.textureKey) : false,
    };
  }

  preload(): void {
    const renderResolution = 1 / this.scale.zoom;
    const textures = new ThemeTextures(
      this.options.theme,
      chooseThemeTextureScale(renderResolution, this.currentViewport().zoom),
    );
    textures.queue(this.load);
    this.themeTextures = textures;
  }

  create(): void {
    const textures = this.themeTextures;
    if (!textures) throw new Error('The theme atlas was not queued');
    const { tileSize, worldWidthTiles } = this.options.physics;
    const worldWidth = worldWidthTiles * tileSize;
    const worldHeight = sandboxHeightTiles * tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    textures.tiled(this, 0, 0, worldWidth, worldHeight, 'background');

    const groundRow = Math.max(...sandboxPlatforms.map(([, row]) => row));
    const platforms = sandboxPlatforms.map(([column, row, width]) => {
      textures.tiled(
        this,
        column * tileSize,
        row * tileSize,
        width * tileSize,
        tileSize,
        row === groundRow ? 'tile-ground' : 'tile-platform',
      );
      const platform = this.add.rectangle(
        (column + width / 2) * tileSize,
        (row + 0.5) * tileSize,
        width * tileSize,
        tileSize,
      );
      platform.setVisible(false);
      this.physics.add.existing(platform, true);
      return platform;
    });
    const [topColumn, topRow, topWidth] = sandboxPlatforms.reduce((highest, platform) =>
      platform[1] < highest[1] ? platform : highest,
    );
    textures.image(
      this,
      (topColumn + topWidth / 2) * tileSize,
      (topRow - 0.5) * tileSize,
      'summit-marker',
    );

    this.player = this.add.rectangle(tileSize * 2, worldHeight - tileSize * 2, 22, 30);
    this.player.setVisible(false);
    this.playerArt = textures.image(this, this.player.x, this.player.y, this.options.playerFrame);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, platforms);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.startFollow(this.player, false, 1, this.options.physics.cameraLerpY);
    camera.setFollowOffset(0, this.options.physics.cameraLookAhead);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    // Arcade physics syncs bodies on POST_UPDATE and registered first, so the art follows
    // the body's final position for this frame.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncPlayerArt, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncPlayerArt, this);
    });

    this.options.onReady();
  }

  override update(): void {
    const { actions, physics } = this.options;
    actions.beginFrame();
    const body = this.playerBody;
    if (body.blocked.down) this.jumpsUsed = 0;

    const direction = Number(actions.isDown('moveRight')) - Number(actions.isDown('moveLeft'));
    body.setVelocityX(direction * physics.runSpeed);
    if (direction !== 0) this.playerArt.setFlipX(direction < 0);

    if (actions.justPressed('jump') && this.jumpsUsed < 2) {
      body.setVelocityY(-physics.jumpVelocity);
      this.jumpsUsed += 1;
    }
  }

  private syncPlayerArt(): void {
    this.playerArt.setPosition(this.player.x, this.player.y);
  }

  private currentViewport(): ReturnType<typeof computeWorldViewport> {
    const { tileSize, worldWidthTiles, minimumVisibleHeightTiles } = this.options.physics;
    const renderResolution = 1 / this.scale.zoom;
    return computeWorldViewport({
      screenWidth: this.scale.width / renderResolution,
      screenHeight: this.scale.height / renderResolution,
      worldWidth: worldWidthTiles * tileSize,
      minimumVisibleWorldHeight: minimumVisibleHeightTiles * tileSize,
    });
  }

  private fitCamera(): void {
    const renderResolution = 1 / this.scale.zoom;
    const camera = this.cameras.main;
    camera.setSize(this.scale.width, this.scale.height);
    camera.setZoom(this.currentViewport().zoom * renderResolution);
  }
}
