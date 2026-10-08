/**
 * Building blocks for any platformer, free of Phaser and the DOM so they run in tests, on
 * the client and on the server alike: tile collision, the player controller, the Tiled map
 * loader, course progress (goals, checkpoints, height) and a climbing bot.
 */
export * from './collision-grid';
export * from './controller';
export * from './tiled';
export * from './course-progress';
export * from './course-bot';
