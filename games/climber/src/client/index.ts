import {
  PauseController,
  attachDebugOverlay,
  attachKeyboardSource,
  attachTouchControls,
  createPlatformerActionState,
  guardPlaySurface,
  holdScreenWakeLock,
  pauseWhenHidden,
  platformerKeyBindings,
  platformerTouchButtons,
} from '@teckin/engine-core';
import { bindPauseToGame, bootPhaserGame } from '@teckin/engine-core/phaser';
import type { ClientGameModule, ClientGameMountOptions } from '@teckin/game-contracts';
import { defaultClimberTunables } from '../tunables';
import { SandboxScene, type PlayerSnapshot } from './sandbox-scene';
import { attachPauseButton } from './pause-button';

/** Lifecycle status written to the mount element's `data-game-status`. */
export type ClimberGameStatus = 'loading' | 'running' | 'paused';

/** Read-only hooks exposed on `window.__teckinGame` with `?debug=1`, for tests and tuning. */
export interface ClimberDebugHooks {
  player: () => PlayerSnapshot;
  heldActions: () => string[];
  status: () => ClimberGameStatus;
  fps: () => number;
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
  const physics = defaultClimberTunables.physics;

  const setStatus = (status: ClimberGameStatus): void => {
    parent.dataset.gameStatus = status;
  };
  setStatus('loading');
  // Overlays are positioned against the mount element, so it must be a containing block.
  if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.style.overflow = 'hidden';

  const cleanups: (() => void)[] = [];
  const actions = createPlatformerActionState();
  const pauseController = new PauseController();
  let ready = false;

  cleanups.push(guardPlaySurface(document));
  cleanups.push(holdScreenWakeLock(document));
  cleanups.push(attachKeyboardSource(window, actions, platformerKeyBindings));

  const scene = new SandboxScene({
    actions,
    physics,
    onReady: () => {
      ready = true;
      setStatus(pauseController.isPaused ? 'paused' : 'running');
    },
  });
  const booted = bootPhaserGame({
    parent,
    scenes: [scene],
    backgroundColor: '#0f172a',
    gravityY: physics.gravity,
    debugPhysics: debug,
  });
  cleanups.push(booted.destroy);

  cleanups.push(
    attachTouchControls(parent, actions, {
      buttons: platformerTouchButtons,
      visibility: options.flags.touch === '1' ? 'always' : 'auto',
    }),
  );
  cleanups.push(attachPauseButton(parent, pauseController));

  cleanups.push(bindPauseToGame(booted.game, pauseController));
  cleanups.push(
    pauseController.onChange((paused) => {
      // A finger lifted while paused never reaches the button, so start clean on resume.
      actions.releaseAll();
      if (ready) setStatus(paused ? 'paused' : 'running');
    }),
  );
  cleanups.push(pauseWhenHidden(document, pauseController));

  if (debug) {
    const hooks: ClimberDebugHooks = {
      player: () => scene.snapshot(),
      heldActions: () => actions.heldActions(),
      status: () => (parent.dataset.gameStatus as ClimberGameStatus | undefined) ?? 'loading',
      fps: () => Math.round(booted.game.loop.actualFps),
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
          `res ${booted.renderResolution}x`,
        ];
      }),
    );
  }

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
    delete parent.dataset.gameStatus;
  };
}

/** The Climber game's lazily loaded client module. */
const climberClient: ClientGameModule = { mount };

export default climberClient;
export { mount };
