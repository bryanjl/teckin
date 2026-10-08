/**
 * Engine helpers shared by every game. This entry point has no Phaser dependency, so it is
 * safe to import anywhere; Phaser-specific helpers live in `@teckin/engine-core/phaser`.
 */
export * from './input/action-state';
export * from './input/keyboard-source';
export * from './input/touch-controls';
export * from './page/debug-overlay';
export * from './page/pause-controller';
export * from './page/play-surface-guards';
export * from './page/wake-lock';
export * from './scaling';
export * from './theme';
