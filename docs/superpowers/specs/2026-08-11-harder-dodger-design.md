# Harder Dodger Design

**Date:** 2026-08-11
**Status:** Approved

## Overview

The gentle shooter is too easy. Three changes raise the pressure: the ship
moves vertically as well as horizontally, enemies spawn increasingly often as
a run goes on, and a rare armoured enemy takes five shots to kill and fires a
five-way spread.

Everything else from the gentle-shooter design stands: touch drag steers and
auto-fires, +10 per ordinary kill, three hearts with brief invincibility,
Game Over at zero.

## Gameplay

### Vertical movement

The ship follows the pointer on both axes. Its position is clamped to
`x ∈ [half, WIDTH − half]` (as today) and `y ∈ [110, HEIGHT − half]`, where
`half` is `PLAYER_SIZE / 2`. The lower bound keeps the ship clear of the
score and hearts pills at the top of the screen.

The bank-into-turn lean is unchanged: it is driven by horizontal delta only.

### Fall speed and spawn ramp

Enemies fall at 90 px/s, up from 60. This is the change that makes the game
harder from the first second; a spawn ramp alone only bites late in a run,
which a small child rarely reaches. It also shortens each enemy's time on
screen to about 12.2 s, which is what keeps the spawn floor from piling up.

The enemy spawn interval interpolates linearly with time survived:

| Elapsed | Interval range | Enemies alive |
| --- | --- | --- |
| 0 s | 1100–1700 ms | ~8.7 |
| 60 s | 700–1000 ms | ~14.4 |
| beyond | held at 700–1000 ms | ~14.4 |

Both ends are chosen from the resulting population, not the interval alone:
population is roughly an enemy's on-screen lifetime over the spawn interval.
A 400–700 ms floor at the old fall speed meant ~33 enemies covering nearly
40% of the screen — a wall rather than a difficulty. `difficulty.test.ts`
asserts the floor's population stays under 15, so changing either the fall
speed or the floor without revisiting the other fails a test.

### Strong enemies

Each spawn has a 10% chance of being a tank, from the start of the run:

- Renders at about 1.6× an ordinary enemy, in its own colour, with a
  correspondingly larger halo. Its hitbox tracks the displayed size, as
  ordinary enemies' do.
- Takes five player-bullet hits. Each non-fatal hit tints the sprite white for
  about 120 ms; the bullet is consumed either way. It explodes and scores on
  the fifth.
- Fires a fixed five-way fan pointing downward, spanning −40° to +40° from
  vertical, at `ENEMY_BULLET_SPEED`, on a 2500–4000 ms interval. The fan does
  not aim at the player.
- Worth +150 — 30 points a bullet against an ordinary enemy's 10. At +50 the
  tank paid the same per bullet as a normal while having 2.6× the body to
  stand near, so the correct play was to never shoot one.
  Ordinary enemies stay at +10.
- Falls and wobbles exactly like an ordinary enemy, so it reads as "the big
  one", not "the fast one".

### Enemy bullets

Enemy bullets carry a velocity vector rather than falling straight down.
Ordinary enemies fire `(0, ENEMY_BULLET_SPEED)`, so their behaviour is
unchanged. Off-screen cleanup checks all four edges instead of the bottom
alone.

## Architecture

Pure logic in `src/core/` with unit tests, Phaser rendering and wiring in
`GameScene` — the existing split.

### New core modules

- `core/difficulty.ts` — `spawnRange(elapsedMs)` returns `{ min, max }`,
  interpolating between the endpoints in the table above and clamping outside
  the ramp. `GameScene` rebuilds its spawner from the current range each time
  one fires; the sub-frame timer carryover lost by rebuilding is immaterial.
- `core/spread.ts` — `fanVelocities(count, spreadRadians, speed)` returns
  `{ vx, vy }` for each bullet, fanned symmetrically about straight down.
- `core/sweptRect.ts` — `movingRectHitsRect(from, to, target)`, an exact swept
  test for the player. `sweepX`/`sweepY` give the axis-aligned union of a
  mover's endpoints, which is exact along one axis but on a diagonal also
  covers two corners the mover never touched. That was harmless while the
  ship was rail-bound; with two axes a tap teleport swept up everything in
  the box between the two positions. This grows the target by the mover's
  extents and clips the mover's centre path against it instead.

  The enemy-side sweeps keep using `sweepX`/`sweepY`: there the union's
  generosity errs toward awarding the child their kill, which is the
  direction this game wants.

### Deliberately not extracted

The vertical clamp is two lines inline in `movePlayerTo`, and tank health is
an `hp` field decremented in the scene. Neither earns a tested core module.

### GameScene

- `Enemy` gains `kind: 'normal' | 'tank'`, `hp`, and per-enemy `width` and
  `height`, so `enemyRect` serves both sizes.
- `enemyBullets` becomes `{ rect, vx, vy }[]` rather than bare rectangles.
- The `PLAYER_Y` constant gives way to `this.player.y`. `prevPlayerY` joins
  `prevPlayerX`, and the player's swept path becomes
  `sweepY(sweepX(rect, prevX − half), prevY − half)` so a fast diagonal drag
  cannot tunnel through an enemy.
- The player-bullet↔enemy pass decrements `hp`; it explodes the enemy and
  scores only when `hp` reaches zero.

`MAX_DELTA_MS` still holds. The fastest closing pair is unchanged — a
500 px/s player bullet against a 60 px/s falling enemy — and diagonal enemy
bullets close more slowly than vertical ones.

## Error handling

No new failure modes. All state lives in the scene and is cleared by the
existing `resetState()`, which must also reset the ramp's elapsed timer.
Off-screen bullets and enemies are destroyed and dropped from their arrays
each frame.

## Testing

Red/green TDD for `difficulty` and `spread`. The existing core tests stay
green unchanged. Scene behaviour — vertical steering, the ramp's feel, tank
health and spread — is verified by playing the game in a visible browser
window.
