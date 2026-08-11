# Gentle Shooter Design (Dodger update)

**Date:** 2026-08-11
**Status:** Approved

## Overview

The Dodger game evolves into a gentle shooter for 3–5 year old children. The
falling red obstacles are replaced by enemy ships that drift down from the top
while wobbling side to side and occasionally dropping a slow bullet. The player
auto-fires upward the whole time a finger is on the screen — the same touch
that drags the ship, so shooting requires no extra skill. Destroying an enemy
scores +10. The player has 3 hearts; a hit removes one with a brief
invincibility flash, and Game Over happens at 0 hearts.

## Gameplay

### Player
- Same green square (40px), drags left/right while touching, clamped to screen.
- While the finger is down, fires a small bullet straight up every 400ms
  (auto-fire; no separate button). Bullets travel fast (~500px/s) and are
  removed off-screen.

### Enemies
- Replace the old obstacles entirely.
- ~50px squares (easy targets), spawn at the top at a random x every
  1.5–2.5s.
- Drift downward slowly (~60px/s) while wobbling horizontally with a sine
  motion (amplitude ~60px, period ~2s), clamped to the screen.
- An enemy that reaches the bottom despawns with no penalty.
- A player bullet hitting an enemy destroys both: enemy disappears, +10
  points.

### Enemy bullets
- Each enemy fires straight down at a random interval of 2–4s.
- Bullets are small and slow (~150px/s), removed off-screen.

### Hearts / damage
- Player starts with 3 hearts, drawn top-right.
- A hit (enemy bullet touches player, or enemy body touches player) removes
  one heart, flashes the player, and grants ~1.5s of invincibility during
  which further hits are ignored.
- At 0 hearts: Game Over, with the existing Restart / Back to Menu buttons.

### Scoring
- +10 per enemy destroyed. Replaces the time-based survival score.
- Score shown top-left as today; final score shown on Game Over.

## Architecture

Follows the existing pattern: pure logic in `src/core/` with unit tests,
Phaser rendering and wiring in `GameScene`.

- `core/spawner.ts` — reused unchanged for: enemy spawn timing, each enemy's
  fire timing (per-enemy spawner instance, min 2000 / max 4000), and player
  auto-fire (min = max = 400 gives a fixed interval).
- `core/wobble.ts` (new) — pure function
  `wobbleX(baseX, elapsedMs, amplitude, periodMs)` returning the enemy's
  x position; clamping to screen bounds happens at the call site with the
  enemy's half-width.
- `core/lives.ts` (new) — hearts state: `createLives(count)`,
  `hit(state)` → new state plus whether the player is now dead; ignores hits
  while invincible; `tickLives(state, dt)` counts down the invincibility
  timer.
- `core/score.ts` — reworked from time-based to kill-points
  (`addPoints(state, points)`), keeping `createScore`/`getScoreValue`.
- `core/collision.ts` — reused (`intersects`) for player-bullet↔enemy,
  enemy↔player, and enemy-bullet↔player checks.
- `GameScene` — owns arrays for enemies, player bullets, and enemy bullets;
  per-frame movement, collision checks, and off-screen cleanup. The existing
  swept-collision helpers remain for enemy↔player contact. The existing
  MAX_DELTA_MS frame clamp remains.

## Error handling

No new failure modes: all state is in-scene, reset by the existing
`resetState()` on scene entry and restart. Off-screen objects (bullets,
enemies) are destroyed and removed from their arrays each frame.

## Testing

- TDD (red/green) for the new/changed core modules: `wobble`, `lives`, and
  the reworked `score`. `spawner` and `collision` already have tests and are
  reused unchanged.
- Scene wiring (rendering, input, object lifecycle) is verified by playing
  the game in the browser.
