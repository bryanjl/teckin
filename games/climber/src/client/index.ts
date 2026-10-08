import {
  PauseController,
  attachDebugOverlay,
  attachKeyboardSource,
  attachTouchControls,
  createPlatformerActionState,
  guardPlaySurface,
  holdScreenWakeLock,
  loadThemeManifest,
  pauseWhenHidden,
  platformerKeyBindings,
  platformerTouchButtons,
  type LoadedTheme,
} from '@teckin/engine-core';
import { bindPauseToGame, bootPhaserGame } from '@teckin/engine-core/phaser';
import type { ClientGameModule, ClientGameMountOptions } from '@teckin/game-contracts';
import { climberThemeRequirements, defaultClimberThemeId, resolveClimberThemeId } from '../theme';
import { defaultClimberTunables } from '../tunables';
import { bundledCourseMap, createClimberCourse } from '../course/course';
import {
  CourseScene,
  type CourseHudState,
  type PlayerSnapshot,
  type ThemeSnapshot,
} from './course-scene';
import { attachCourseHud } from './hud';
import { attachPauseButton } from './pause-button';

/** Lifecycle status written to the mount element's `data-game-status`. */
export type ClimberGameStatus = 'loading' | 'running' | 'paused' | 'complete';

/** Read-only hooks exposed on `window.__teckinGame` with `?debug=1`, for tests and tuning. */
export interface ClimberDebugHooks {
  player: () => PlayerSnapshot;
  theme: () => ThemeSnapshot;
  course: () => CourseHudState;
  heldActions: () => string[];
  status: () => ClimberGameStatus;
  fps: () => number;
  /** Turns the autopilot on or off. */
  setAutopilot: (enabled: boolean) => void;
  /** Sends the player back to the start, keeping summits and time, as after a long fall. */
  dropToStart: () => void;
}

declare global {
  interface Window {
    __teckinGame?: ClimberDebugHooks;
  }
}

/**
 * Mounts the Climber game into `target` and returns a function that tears it all down:
 * Phaser, input sources, page guards, wake lock and overlays.
 */
async function mount(
  target: Parameters<ClientGameModule['mount']>[0],
  options: ClientGameMountOptions,
): Promise<() => void> {
  const parent = target as HTMLElement;
  const document = parent.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('The Climber game needs a browser window');
  const debug = options.flags.debug === '1';
  const tunables = defaultClimberTunables;
  const course = createClimberCourse(bundledCourseMap, tunables);

  const setStatus = (status: ClimberGameStatus): void => {
    parent.dataset.gameStatus = status;
  };
  setStatus('loading');
  // Overlays are positioned against the mount element, so it must be a containing block.
  if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.style.overflow = 'hidden';

  const theme = await loadClimberTheme(options);
  const { colours, fontFamily } = theme.manifest.tokens;
  const ui = theme.manifest.ui;
  const colour = (name: string): string => colours[name] ?? '#000000';

  const cleanups: (() => void)[] = [];
  const actions = createPlatformerActionState();
  const pauseController = new PauseController();
  let ready = false;

  cleanups.push(guardPlaySurface(document));
  cleanups.push(holdScreenWakeLock(document));
  cleanups.push(attachKeyboardSource(window, actions, platformerKeyBindings));

  let complete = false;
  const runningStatus = (): ClimberGameStatus =>
    complete ? 'complete' : pauseController.isPaused ? 'paused' : 'running';

  const hud = attachCourseHud(
    parent,
    {
      accent: colour('accent'),
      text: colour('text'),
      textMuted: colour('text-muted'),
      panel: colour('panel'),
      fontFamily,
      summitNames: theme.manifest.names.summitNames,
    },
    {
      onRespawn: () => scene.respawnAtCheckpoint(),
      onPlayAgain: () => {
        complete = false;
        hud.hideComplete();
        actions.releaseAll();
        scene.restartCourse();
        setStatus(runningStatus());
      },
    },
  );
  cleanups.push(hud.remove);

  const scene = new CourseScene({
    actions,
    tunables,
    course,
    theme,
    playerFrame: 'player-amber',
    checkpointsEnabled: options.flags.checkpoints === '1',
    autopilot: debug && options.flags.autopilot === '1',
    onReady: () => {
      ready = true;
      setStatus(runningStatus());
    },
    onFrame: (state) => hud.update(state),
    onComplete: (elapsedSeconds) => {
      complete = true;
      actions.releaseAll();
      hud.showComplete(elapsedSeconds);
      setStatus(runningStatus());
    },
  });
  const booted = bootPhaserGame({
    parent,
    scenes: [scene],
    backgroundColor: colour('background'),
  });
  cleanups.push(booted.destroy);

  cleanups.push(
    attachTouchControls(parent, actions, {
      buttons: platformerTouchButtons.map((button) => ({
        ...button,
        iconSvg: ui[touchIconByAction[button.action]] ?? button.iconSvg,
      })),
      visibility: options.flags.touch === '1' ? 'always' : 'auto',
    }),
  );
  cleanups.push(
    attachPauseButton(parent, pauseController, {
      iconSvg: ui.pause ?? '',
      accent: colour('accent'),
      text: colour('text'),
      panel: colour('panel'),
      fontFamily,
    }),
  );

  cleanups.push(bindPauseToGame(booted.game, pauseController));
  cleanups.push(
    pauseController.onChange(() => {
      // A finger lifted while paused never reaches the button, so start clean on resume.
      actions.releaseAll();
      if (ready) setStatus(runningStatus());
    }),
  );
  cleanups.push(pauseWhenHidden(document, pauseController));

  if (debug) {
    const hooks: ClimberDebugHooks = {
      player: () => scene.snapshot(),
      theme: () => scene.themeSnapshot(),
      course: () => scene.hudState(),
      heldActions: () => actions.heldActions(),
      status: () => (parent.dataset.gameStatus as ClimberGameStatus | undefined) ?? 'loading',
      fps: () => Math.round(booted.game.loop.actualFps),
      setAutopilot: (enabled) => scene.setAutopilot(enabled),
      dropToStart: () => scene.dropToStart(),
    };
    window.__teckinGame = hooks;
    cleanups.push(() => {
      delete window.__teckinGame;
    });
    cleanups.push(
      attachDebugOverlay(parent, () => {
        const player = hooks.player();
        return [
          `fps ${hooks.fps()}`,
          `x ${player.x} y ${player.y}`,
          `vx ${player.velocityX} vy ${player.velocityY}`,
          `ground ${player.onGround ? 'yes' : 'no'} jumps ${player.jumpsUsed}`,
          `input ${hooks.heldActions().join(' ') || '-'}`,
          `res ${booted.renderResolution}x art ${hooks.theme().textureScale}x ${hooks.theme().id}`,
          `summits ${hooks.course().summitsReached} time ${hooks.course().elapsedSeconds.toFixed(1)}`,
        ];
      }),
    );
  }

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
    delete parent.dataset.gameStatus;
  };
}

/**
 * Loads the chosen theme, falling back to the default one when the chosen theme is
 * missing or incomplete, so a bad link or setting still gives a playable game.
 */
async function loadClimberTheme(options: ClientGameMountOptions): Promise<LoadedTheme> {
  const themeUrl = (id: string): string => `${options.assetBaseUrl}themes/${id}/`;
  const themeId = resolveClimberThemeId(options.flags.theme, options.themeId);
  try {
    return await loadThemeManifest(themeUrl(themeId), climberThemeRequirements);
  } catch (error) {
    if (themeId === defaultClimberThemeId) throw error;
    console.warn(`Theme "${themeId}" could not be loaded; using the default theme`, error);
    return loadThemeManifest(themeUrl(defaultClimberThemeId), climberThemeRequirements);
  }
}

/** Theme UI icon drawn on each touch button. */
const touchIconByAction = {
  moveLeft: 'move-left',
  moveRight: 'move-right',
  jump: 'jump',
} as const;

/** The Climber game's lazily loaded client module. */
const climberClient: ClientGameModule = { mount };

export default climberClient;
export { mount };
