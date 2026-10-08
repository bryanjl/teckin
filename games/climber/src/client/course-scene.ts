import * as Phaser from 'phaser';
import {
  computeWorldViewport,
  type ActionState,
  type LoadedTheme,
  type PlatformerAction,
} from '@teckin/engine-core';
import { ThemeTextures, chooseThemeTextureScale } from '@teckin/engine-core/phaser';
import {
  CourseBot,
  CourseProgress,
  FixedStepper,
  createPlatformerBody,
  footOf,
  stepPlatformer,
  type PlatformerBody,
  type PlatformerEvent,
} from '@teckin/platformer-kit';
import type { ClimberCourse } from '../course/course';
import type { ClimberTunables } from '../tunables';

/** Which theme atlas the scene loaded, for the debug overlay and tests. */
export interface ThemeSnapshot {
  id: string;
  textureScale: number;
  /** True once the atlas texture is in Phaser's texture manager. */
  loaded: boolean;
}

/** Read-only snapshot of the player, for the debug overlay and automated tests. */
export interface PlayerSnapshot {
  /** Centre of the collision box, world pixels. */
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
  /** 0 on the ground, 1 after a jump, 2 after the double jump. */
  jumpsUsed: number;
}

/** What the HUD shows, recomputed every frame. */
export interface CourseHudState {
  /** Whole metres climbed. */
  heightMetres: number;
  /** Index into the theme's summit names of the summit being climbed. */
  summitIndex: number;
  summitsReached: number;
  /** True when a checkpoint is saved and the player has fallen well below it. */
  canRespawn: boolean;
  /** Seconds of play so far (paused time excluded). */
  elapsedSeconds: number;
  finished: boolean;
}

/** What the course scene needs from the page. */
export interface CourseSceneOptions {
  actions: ActionState<PlatformerAction>;
  tunables: ClimberTunables;
  course: ClimberCourse;
  /** Built theme pack whose atlas supplies every sprite. */
  theme: LoadedTheme;
  /** Atlas frame drawn for the player, e.g. `player-amber`. */
  playerFrame: string;
  checkpointsEnabled: boolean;
  /** When true, a bot presses the buttons (tests and playtests only). */
  autopilot: boolean;
  /** Called once the scene has created its world and is running. */
  onReady: () => void;
  /** Called after every frame with the HUD state. */
  onFrame: (state: CourseHudState) => void;
  /** Called when a ground or air jump happens, for haptics and sound. */
  onPlayerEvent?: (event: PlatformerEvent) => void;
  /** Called once when the last summit is reached. */
  onComplete: (elapsedSeconds: number) => void;
}

const autopilotSource = 'autopilot';

/**
 * The climbing course: tiles and markers from the Tiled map, art from the theme atlas, and
 * the player moved by the platformer kit's controller at a fixed step. Phaser only draws
 * and runs the frame loop; all movement and collision is the kit's pure code, so what the
 * tests and (later) the server simulate is exactly what the player sees.
 */
export class CourseScene extends Phaser.Scene {
  private themeTextures?: ThemeTextures;
  private playerArt!: Phaser.GameObjects.Image;
  private checkpointArt?: Phaser.GameObjects.Image;
  private body!: PlatformerBody;
  private previousBody!: PlatformerBody;
  private progress!: CourseProgress;
  private stepper!: FixedStepper;
  private bot?: CourseBot;
  private pendingJumpPress = false;
  private elapsedSeconds = 0;
  private completed = false;
  private jumpsUsed = 0;

  constructor(private readonly options: CourseSceneOptions) {
    super({ key: 'climber-course' });
  }

  /** Current player state. */
  snapshot(): PlayerSnapshot {
    const body = this.body;
    if (!body) return { x: 0, y: 0, velocityX: 0, velocityY: 0, onGround: false, jumpsUsed: 0 };
    const { bodyWidth, bodyHeight } = this.options.tunables.physics;
    const jumpsUsed = this.jumpsUsed;
    return {
      x: Math.round(body.x + bodyWidth / 2),
      y: Math.round(body.y + bodyHeight / 2),
      velocityX: Math.round(body.velocityX),
      velocityY: Math.round(body.velocityY),
      onGround: body.onGround,
      jumpsUsed,
    };
  }

  /** HUD state right now. */
  hudState(): CourseHudState {
    const { course, tunables } = this.options;
    const progress = this.progress;
    if (!progress || !this.body) {
      return {
        heightMetres: 0,
        summitIndex: 0,
        summitsReached: 0,
        canRespawn: false,
        elapsedSeconds: 0,
        finished: false,
      };
    }
    const foot = footOf(this.body, tunables.physics);
    return {
      heightMetres: Math.max(0, Math.floor(course.heightAt(foot.y))),
      summitIndex: Math.min(progress.goalsReached, course.summits.length - 1),
      summitsReached: progress.goalsReached,
      canRespawn:
        !this.completed &&
        progress.isBelowCheckpoint(
          foot.y,
          tunables.respawnOfferDropTiles * tunables.physics.tileSize,
        ),
      elapsedSeconds: this.elapsedSeconds,
      finished: this.completed,
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

  /** Puts the player back at the start with the clock and summits reset. */
  restartCourse(): void {
    const { course, tunables } = this.options;
    this.body = createPlatformerBody(course.spawn.x, course.spawn.y, tunables.physics);
    this.previousBody = this.body;
    this.progress.reset();
    this.stepper.reset();
    this.elapsedSeconds = 0;
    this.completed = false;
    this.pendingJumpPress = false;
    this.jumpsUsed = 0;
    this.checkpointArt?.setVisible(false);
    this.syncPlayerArt(1);
    this.cameras.main.centerOn(this.playerArt.x, this.playerArt.y);
  }

  /**
   * Puts the player back at the spawn point without resetting summits or the clock, as if
   * they had fallen all the way down. Debug and test use only.
   */
  dropToStart(): void {
    const { course, tunables } = this.options;
    this.body = createPlatformerBody(course.spawn.x, course.spawn.y, tunables.physics);
    this.previousBody = this.body;
    this.stepper.reset();
    this.syncPlayerArt(1);
  }

  /** Turns the autopilot on or off mid-run. Debug and test use only. */
  setAutopilot(enabled: boolean): void {
    if (enabled) {
      this.bot ??= new CourseBot(this.options.course.map.grid, this.options.tunables.physics);
      return;
    }
    this.bot = undefined;
    this.options.actions.releaseSource(autopilotSource);
  }

  /** Moves the player to the saved checkpoint, if there is one. */
  respawnAtCheckpoint(): void {
    const checkpoint = this.progress.checkpoint;
    if (!checkpoint) return;
    this.body = createPlatformerBody(
      checkpoint.respawnX,
      checkpoint.respawnY,
      this.options.tunables.physics,
    );
    this.previousBody = this.body;
    this.stepper.reset();
    this.syncPlayerArt(1);
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
    const { course, tunables, checkpointsEnabled } = this.options;
    const { map } = course;
    const { tileSize } = tunables.physics;
    const worldWidth = map.columns * tileSize;
    const worldHeight = map.rows * tileSize;

    textures.tiled(this, 0, 0, worldWidth, worldHeight, 'background');
    this.drawTiles(textures);
    for (const summit of course.summits) {
      textures.image(this, summit.respawnX, summit.respawnY, 'summit-marker').setOrigin(0.5, 1);
    }
    if (checkpointsEnabled) {
      this.checkpointArt = textures
        .image(this, 0, 0, 'checkpoint')
        .setOrigin(0.5, 1)
        .setVisible(false);
    }

    this.stepper = new FixedStepper(tunables.physics.fixedStep);
    this.progress = new CourseProgress(course.summits, checkpointsEnabled);
    if (this.options.autopilot) this.bot = new CourseBot(map.grid, tunables.physics);
    this.body = createPlatformerBody(course.spawn.x, course.spawn.y, tunables.physics);
    this.previousBody = this.body;
    this.playerArt = textures.image(this, 0, 0, this.options.playerFrame).setOrigin(0.5, 1);
    this.syncPlayerArt(1);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.startFollow(this.playerArt, false, 1, tunables.physics.cameraLerpY);
    camera.setFollowOffset(0, tunables.physics.cameraLookAhead);
    this.fitCamera();
    camera.centerOn(this.playerArt.x, this.playerArt.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.options.actions.releaseSource(autopilotSource);
    });

    this.options.onReady();
  }

  override update(_time: number, deltaMs: number): void {
    const { actions } = this.options;
    if (this.bot && !this.completed) this.driveAutopilot();
    actions.beginFrame();
    if (actions.justPressed('jump')) this.pendingJumpPress = true;

    if (!this.completed) {
      const alpha = this.stepper.advance(deltaMs / 1000, () => this.step());
      this.syncPlayerArt(alpha);
    }
    this.options.onFrame(this.hudState());
  }

  private step(): void {
    const { actions, tunables, course } = this.options;
    const physics = tunables.physics;
    const input = {
      left: actions.isDown('moveLeft'),
      right: actions.isDown('moveRight'),
      jumpHeld: actions.isDown('jump'),
      jumpPressed: this.pendingJumpPress,
    };
    this.pendingJumpPress = false;
    this.previousBody = this.body;
    const result = stepPlatformer(this.body, input, course.map.grid, physics, physics.fixedStep);
    this.body = result.body;
    this.elapsedSeconds += physics.fixedStep;
    for (const event of result.events) {
      if (event === 'jump') this.jumpsUsed = 1;
      if (event === 'airJump') this.jumpsUsed += 1;
      if (event === 'land') this.jumpsUsed = 0;
      this.options.onPlayerEvent?.(event);
    }

    const update = this.progress.update(
      { x: this.body.x, y: this.body.y, width: physics.bodyWidth, height: physics.bodyHeight },
      this.body.onGround,
    );
    if (update.reachedGoal !== undefined) {
      const checkpoint = this.progress.checkpoint;
      if (checkpoint && this.checkpointArt) {
        this.checkpointArt
          .setPosition(checkpoint.respawnX - physics.tileSize, checkpoint.respawnY)
          .setVisible(true);
      }
    }
    if (update.finished && !this.completed) {
      this.completed = true;
      this.options.actions.releaseSource(autopilotSource);
      this.options.onComplete(this.elapsedSeconds);
    }
  }

  private driveAutopilot(): void {
    const { actions } = this.options;
    const buttons = this.bot?.decide(this.body);
    if (!buttons) return;
    const apply = (action: PlatformerAction, down: boolean): void => {
      if (down) actions.press(action, autopilotSource);
      else actions.release(action, autopilotSource);
    };
    apply('moveLeft', buttons.left);
    apply('moveRight', buttons.right);
    apply('jump', buttons.jump);
  }

  /** Draws map tiles, merging runs of the same frame on a row into one repeating sprite. */
  private drawTiles(textures: ThemeTextures): void {
    const { tileSize } = this.options.tunables.physics;
    const sorted = [...this.options.course.map.tiles].sort(
      (a, b) => a.row - b.row || a.column - b.column,
    );
    let index = 0;
    while (index < sorted.length) {
      const first = sorted[index];
      if (!first) break;
      let length = 1;
      while (true) {
        const next = sorted[index + length];
        if (
          !next ||
          next.row !== first.row ||
          next.frame !== first.frame ||
          next.layer !== first.layer ||
          next.column !== first.column + length
        ) {
          break;
        }
        length += 1;
      }
      textures.tiled(
        this,
        first.column * tileSize,
        first.row * tileSize,
        length * tileSize,
        tileSize,
        first.frame,
      );
      index += length;
    }
  }

  /** Places the player art between the last two simulated states, `alpha` of the way. */
  private syncPlayerArt(alpha: number): void {
    const physics = this.options.tunables.physics;
    const from = footOf(this.previousBody, physics);
    const to = footOf(this.body, physics);
    this.playerArt.setPosition(from.x + (to.x - from.x) * alpha, from.y + (to.y - from.y) * alpha);
    this.playerArt.setFlipX(this.body.facing < 0);
  }

  private currentViewport(): ReturnType<typeof computeWorldViewport> {
    const { tileSize, worldWidthTiles, minimumVisibleHeightTiles } = this.options.tunables.physics;
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
