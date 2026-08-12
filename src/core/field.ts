import { HEIGHT } from '../gameConfig';

// The Dodger field's tuning: how big an enemy is and how fast it falls.
//
// These live in core rather than in the scene so the tests that guard them can
// import the same values the game runs on. `GameScene` is not importable from a
// test — it pulls in Phaser — so a test that re-declared these numbers would go
// on passing after someone changed the real ones, which is exactly the drift
// the population invariant below exists to catch.

/** Shard art is 30x50; enemies draw it scaled, so art size == hitbox size. */
export const SHARD_WIDTH = 30;
export const SHARD_HEIGHT = 50;

/** ~50px-wide targets, the size a 3-5 year old can actually hit. */
export const ENEMY_SCALE = 5 / 3;
export const ENEMY_WIDTH = SHARD_WIDTH * ENEMY_SCALE;
export const ENEMY_HEIGHT = SHARD_HEIGHT * ENEMY_SCALE;

export const ENEMY_FALL_SPEED = 90;

/**
 * How long an enemy is on screen: it spawns one body-height above the top edge
 * and despawns one below the bottom.
 */
export function enemyLifetimeMs(fallSpeed: number = ENEMY_FALL_SPEED): number {
  return ((HEIGHT + 2 * ENEMY_HEIGHT) / fallSpeed) * 1000;
}

/**
 * Enemies alive at once once spawning and despawning balance out — the number
 * that decides whether a spawn rate reads as "harder" or as an impassable wall.
 */
export function enemiesOnScreen(
  meanSpawnIntervalMs: number,
  fallSpeed: number = ENEMY_FALL_SPEED
): number {
  return enemyLifetimeMs(fallSpeed) / meanSpawnIntervalMs;
}
