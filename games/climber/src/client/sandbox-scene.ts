import * as Phaser from 'phaser';
import { computeWorldViewport, type ActionState, type PlatformerAction } from '@teckin/engine-core';
import type { ClimberPhysicsTunables } from '../tunables';

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
 * Engine proof scene for M1.2: rectangles instead of art, a short staircase of platforms
 * and a player that runs, jumps and double jumps. It exists to prove boot, scaling, input,
 * pause and camera on a phone; M1.4 replaces it with the platformer-kit controller and
 * Tiled maps.
 */
export class SandboxScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
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

  create(): void {
    const { tileSize, worldWidthTiles } = this.options.physics;
    const worldWidth = worldWidthTiles * tileSize;
    const worldHeight = sandboxHeightTiles * tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    this.add.rectangle(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, 0x1e293b);

    const platforms = sandboxPlatforms.map(([column, row, width]) => {
      const platform = this.add.rectangle(
        (column + width / 2) * tileSize,
        (row + 0.5) * tileSize,
        width * tileSize,
        tileSize,
        0x64748b,
      );
      this.physics.add.existing(platform, true);
      return platform;
    });

    this.player = this.add.rectangle(tileSize * 2, worldHeight - tileSize * 2, 22, 30, 0xf59e0b);
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
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

    if (actions.justPressed('jump') && this.jumpsUsed < 2) {
      body.setVelocityY(-physics.jumpVelocity);
      this.jumpsUsed += 1;
    }
  }

  private fitCamera(): void {
    const { tileSize, worldWidthTiles, minimumVisibleHeightTiles } = this.options.physics;
    const renderResolution = 1 / this.scale.zoom;
    const camera = this.cameras.main;
    camera.setSize(this.scale.width, this.scale.height);
    const viewport = computeWorldViewport({
      screenWidth: this.scale.width / renderResolution,
      screenHeight: this.scale.height / renderResolution,
      worldWidth: worldWidthTiles * tileSize,
      minimumVisibleWorldHeight: minimumVisibleHeightTiles * tileSize,
    });
    camera.setZoom(viewport.zoom * renderResolution);
  }
}
