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

/**
 * ~42px-wide targets. Down from 5/3 (50px): at that size the field read as
 * crowded — the bodies, not the gaps, were what a child saw — while still
 * being comfortably wide enough to shoot at 3-5 years old.
 */
export const ENEMY_SCALE = 1.4;
export const ENEMY_WIDTH = SHARD_WIDTH * ENEMY_SCALE;
export const ENEMY_HEIGHT = SHARD_HEIGHT * ENEMY_SCALE;

export const ENEMY_FALL_SPEED = 90;

/**
 * Shared speed for every enemy bullet — ordinary shards, tanks, and the
 * boss alike — so the player only ever has to learn to read one bullet
 * speed. Lives here rather than duplicated per-shooter so the three no
 * longer risk drifting apart.
 */
export const ENEMY_BULLET_SPEED = 150;

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
