import * as Phaser from 'phaser';
import {
  computeWorldViewport,
  type ActionState,
  type LoadedTheme,
  type PlatformerAction,
} from '@teckin/engine-core';
import { ThemeTextures, chooseThemeTextureScale } from '@teckin/engine-core/phaser';
import { FixedStepper, footOf, type CourseBot, type HazardEvent } from '@teckin/platformer-kit';
import type { ClimberCourse } from '../course/course';
import { climberOptionalFrames } from '../theme';
import { createClimberBot } from '../run/climber-bot';
import { ClimberRun, type EnergyAccount } from '../run/climber-run';
import { HazardArt } from './hazard-art';
import { OtherClimbersArt, type OtherClimbersArtStyle } from './other-climbers-art';
import type { OtherClimberPose } from '../live/other-climbers';
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
  /** True at zero energy, when the player crawls. */
  crawling: boolean;
}

/** What the course scene needs from the page. */
export interface CourseSceneOptions {
  actions: ActionState<PlatformerAction>;
  tunables: ClimberTunables;
  course: ClimberCourse;
  /** Energy source; jumps and walking spend from it. */
  energy: EnergyAccount;
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
  onPlayerEvent?: (event: HazardEvent) => void;
  /** Called when a summit is reached (0-based index). */
  onSummit?: (summitIndex: number, elapsedSeconds: number) => void;
  /** Called once when the last summit is reached. */
  onComplete: (elapsedSeconds: number) => void;
  /** Called once the run exists, for attaching it to a multiplayer room. */
  onRunCreated?: (run: ClimberRun) => void;
  /** Called after every simulation step with the step length in seconds. */
  onStepped?: (stepSeconds: number) => void;
  /**
   * When autopilot is on, called each frame before it moves; return true to hold still
   * (for example while it tops up energy).
   */
  autopilotShouldWait?: () => boolean;
  /** Other players to draw in a multiplayer game: where each is at a time, nearest first. */
  otherClimbers?: {
    source: { poses(nowMs: number, near: { x: number; y: number }): OtherClimberPose[] };
    style: OtherClimbersArtStyle;
  };
}

/** Draw order: other climbers behind this player, this player on top. */
const depths = { otherClimbers: 10, energyGlow: 19, player: 20, energyKey: 21 } as const;

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
  private energyKeyArt?: Phaser.GameObjects.Image;
  private energyGlowArt?: Phaser.GameObjects.Image;
  private keyAngle = 0;
  private hazardArt?: HazardArt;
  private otherClimbersArt?: OtherClimbersArt;
  private reducedMotion = false;
  private run!: ClimberRun;
  private stepper!: FixedStepper;
  private bot?: CourseBot;
  private pendingJumpPress = false;
  /** While frozen (question sheet open), nothing moves and no time passes. */
  private frozen = false;

  constructor(private readonly options: CourseSceneOptions) {
    super({ key: 'climber-course' });
  }

  /** Current player state. */
  snapshot(): PlayerSnapshot {
    const run = this.run;
    if (!run) return { x: 0, y: 0, velocityX: 0, velocityY: 0, onGround: false, jumpsUsed: 0 };
    const { bodyWidth, bodyHeight } = this.options.tunables.physics;
    const body = run.body;
    return {
      x: Math.round(body.x + bodyWidth / 2),
      y: Math.round(body.y + bodyHeight / 2),
      velocityX: Math.round(body.velocityX),
      velocityY: Math.round(body.velocityY),
      onGround: body.onGround,
      jumpsUsed: run.jumpsUsed,
    };
  }

  /** Other climbers drawn this frame (multiplayer only). */
  visibleOtherClimbers(): number {
    return this.otherClimbersArt?.visibleCount ?? 0;
  }

  /** HUD state right now. */
  hudState(): CourseHudState {
    const { course, tunables } = this.options;
    const run = this.run;
    if (!run) {
      return {
        heightMetres: 0,
        summitIndex: 0,
        summitsReached: 0,
        canRespawn: false,
        elapsedSeconds: 0,
        finished: false,
        crawling: false,
      };
    }
    const progress = run.progress;
    return {
      heightMetres: Math.floor(run.heightMetres),
      summitIndex: Math.min(progress.goalsReached, course.summits.length - 1),
      summitsReached: progress.goalsReached,
      canRespawn:
        !run.completed &&
        progress.isBelowCheckpoint(
          run.foot.y,
          tunables.respawnOfferDropTiles * tunables.physics.tileSize,
        ),
      elapsedSeconds: run.elapsedSeconds,
      finished: run.completed,
      crawling: run.crawling,
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
    this.run.restart();
    this.afterTeleport();
    this.checkpointArt?.setVisible(false);
    this.cameras.main.centerOn(this.playerArt.x, this.playerArt.y);
  }

  /**
   * Puts the player back at the spawn point without resetting summits or the clock, as if
   * they had fallen all the way down. Debug and test use only.
   */
  dropToStart(): void {
    this.run.dropToStart();
    this.afterTeleport();
  }

  /** Turns the autopilot on or off mid-run. Debug and test use only. */
  setAutopilot(enabled: boolean): void {
    if (enabled) {
      this.bot ??= createClimberBot(this.run);
      return;
    }
    this.bot = undefined;
    this.options.actions.releaseSource(autopilotSource);
  }

  /** Moves the player to the saved checkpoint, if there is one. Returns whether it did. */
  respawnAtCheckpoint(): boolean {
    const moved = this.run.respawnAtCheckpoint();
    if (moved) this.afterTeleport();
    return moved;
  }

  /** Redraws the player after something outside the scene moved them (a server correction). */
  syncAfterMove(): void {
    if (this.run && this.stepper) this.afterTeleport();
  }

  /**
   * Freezes or unfreezes the climb. While frozen the player stands still and cannot fall,
   * the clock stops, and on unfreezing the run continues exactly where it was.
   */
  setFrozen(frozen: boolean): void {
    if (this.frozen === frozen) return;
    this.frozen = frozen;
    this.pendingJumpPress = false;
    this.stepper?.reset();
    this.options.actions.releaseSource(autopilotSource);
  }

  /** True while frozen. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  private afterTeleport(): void {
    this.stepper.reset();
    this.pendingJumpPress = false;
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

    this.drawBackgrounds(textures, worldWidth, worldHeight);
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
    this.run = new ClimberRun(course, tunables, this.options.energy, checkpointsEnabled);
    if (this.options.autopilot) this.bot = createClimberBot(this.run);
    this.options.onRunCreated?.(this.run);
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    this.hazardArt = new HazardArt(this, textures, this.run, this.reducedMotion);
    if (textures.hasFrame(climberOptionalFrames.energyGlow)) {
      this.energyGlowArt = textures
        .image(this, 0, 0, climberOptionalFrames.energyGlow)
        .setOrigin(0.5, 0.5)
        .setDepth(depths.energyGlow);
    }
    if (this.options.otherClimbers) {
      this.otherClimbersArt = new OtherClimbersArt(
        this,
        textures,
        this.options.otherClimbers.style,
        depths.otherClimbers,
      );
    }
    const playerFrame = textures.hasFrame(this.options.playerFrame)
      ? this.options.playerFrame
      : 'player';
    this.playerArt = textures
      .image(this, 0, 0, playerFrame)
      .setOrigin(0.5, 1)
      .setDepth(depths.player);
    if (textures.hasFrame(climberOptionalFrames.energyKey)) {
      this.energyKeyArt = textures
        .image(this, 0, 0, climberOptionalFrames.energyKey)
        .setOrigin(0.5, 0.85)
        .setDepth(depths.energyKey);
    }
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
    const run = this.run;
    if (this.bot && !run.completed && !this.frozen) this.driveAutopilot();
    actions.beginFrame();
    if (actions.justPressed('jump') && !this.frozen) this.pendingJumpPress = true;

    if (!run.completed && !this.frozen) {
      const alpha = this.stepper.advance(deltaMs / 1000, () => this.step());
      this.syncPlayerArt(alpha);
    } else if (this.frozen) {
      // Phaser does not update a paused scene, so hidden-tab time is never counted here.
      run.addAnsweringTime(Math.min(deltaMs / 1000, 0.25));
    }
    this.animateEnergy(deltaMs / 1000);
    this.hazardArt?.update();
    if (this.otherClimbersArt && this.options.otherClimbers) {
      this.otherClimbersArt.setLabelResolution(this.cameras.main.zoom);
      this.otherClimbersArt.update(
        this.options.otherClimbers.source.poses(performance.now(), this.run.foot),
      );
    }
    this.options.onFrame(this.hudState());
  }

  private step(): void {
    const { actions, tunables } = this.options;
    const run = this.run;
    const result = run.step({
      left: actions.isDown('moveLeft'),
      right: actions.isDown('moveRight'),
      jumpHeld: actions.isDown('jump'),
      jumpPressed: this.pendingJumpPress,
    });
    this.pendingJumpPress = false;
    this.options.onStepped?.(tunables.physics.fixedStep);
    for (const event of result.events) this.options.onPlayerEvent?.(event);

    if (result.reachedSummit !== undefined) {
      const checkpoint = run.progress.checkpoint;
      if (checkpoint && this.checkpointArt) {
        this.checkpointArt
          .setPosition(checkpoint.respawnX - tunables.physics.tileSize, checkpoint.respawnY)
          .setVisible(true);
      }
      this.options.onSummit?.(result.reachedSummit, run.elapsedSeconds);
    }
    if (result.finished) {
      this.options.actions.releaseSource(autopilotSource);
      this.options.onComplete(run.elapsedSeconds);
    }
  }

  private driveAutopilot(): void {
    const { actions } = this.options;
    const apply = (action: PlatformerAction, down: boolean): void => {
      if (down) actions.press(action, autopilotSource);
      else actions.release(action, autopilotSource);
    };
    if (this.options.autopilotShouldWait?.()) {
      apply('moveLeft', false);
      apply('moveRight', false);
      apply('jump', false);
      return;
    }
    const buttons = this.bot?.decide(this.run.body);
    if (!buttons) return;
    apply('moveLeft', buttons.left);
    apply('moveRight', buttons.right);
    apply('jump', buttons.jump);
  }

  /**
   * Behind each summit's stretch of the course, the theme's `background-<n>` if it has one,
   * otherwise the shared `background`.
   */
  private drawBackgrounds(textures: ThemeTextures, worldWidth: number, worldHeight: number): void {
    const { course } = this.options;
    let bottom = worldHeight;
    course.summits.forEach((summit, index) => {
      const frame = climberOptionalFrames.summitBackground(summit.number);
      const isLast = index === course.summits.length - 1;
      // Each band reaches a few tiles above its summit ledge, and the last one to the top.
      const top = isLast
        ? 0
        : Math.max(0, summit.respawnY - 3 * this.options.tunables.physics.tileSize);
      textures.tiled(
        this,
        0,
        top,
        worldWidth,
        bottom - top,
        textures.hasFrame(frame) ? frame : 'background',
      );
      bottom = top;
    });
    if (bottom > 0) textures.tiled(this, 0, 0, worldWidth, bottom, 'background');
  }

  /**
   * The wind-up key spins faster and the glow brightens as energy fills, so energy can be
   * read from the character without reading the meter. Both slow and dim when low.
   */
  private animateEnergy(seconds: number): void {
    if (!this.energyKeyArt && !this.energyGlowArt) return;
    const { tunables, energy } = this.options;
    const level = Math.min(1, energy.energy / tunables.energyMeterFull);
    const facing = this.run.body.facing;
    const x = this.playerArt.x;
    const y = this.playerArt.y;
    if (this.energyKeyArt) {
      if (!this.frozen && !this.reducedMotion) this.keyAngle += seconds * (0.4 + level * 6);
      // Squashing the key horizontally reads as it turning on the robot's back.
      const base = this.energyKeyArt.scaleY;
      this.energyKeyArt
        .setPosition(x - facing * 11, y - 18)
        .setScale(base * (Math.abs(Math.cos(this.keyAngle)) * 0.8 + 0.2), base)
        .setAlpha(0.6 + level * 0.4);
    }
    this.energyGlowArt?.setPosition(x, y - 15).setAlpha(level * 0.9);
  }

  /** Draws map tiles, merging runs of the same frame on a row into one repeating sprite. */
  private drawTiles(textures: ThemeTextures): void {
    const { tileSize } = this.options.tunables.physics;
    // Hazard tiles (crumbling ledges) are drawn by HazardArt so they can shake and vanish.
    const sorted = this.options.course.map.tiles
      .filter((tile) => !tile.hazard)
      .sort((a, b) => a.row - b.row || a.column - b.column);
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
    const from = footOf(this.run.previousBody, physics);
    const to = footOf(this.run.body, physics);
    this.playerArt.setPosition(from.x + (to.x - from.x) * alpha, from.y + (to.y - from.y) * alpha);
    this.playerArt.setFlipX(this.run.body.facing < 0);
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
