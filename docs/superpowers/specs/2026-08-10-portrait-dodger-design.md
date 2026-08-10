# Portrait Dodger — Design Spec

## Summary

Pivots the game from a landscape side-scrolling jump-dodger to a portrait, iPhone-focused vertical dodger: obstacles fall from the top, the player drags left/right along the bottom to avoid them. This supersedes the landscape-only scoping in [2026-08-03-dodger-game-design.md](./2026-08-03-dodger-game-design.md) and obsoletes the rotate-device guard from [2026-08-08-landscape-orientation-design.md](./2026-08-08-landscape-orientation-design.md) (already removed from the codebase in a prior change — the game now simply renders at whatever size/orientation the viewport is, via `Scale.FIT`).

## Mobile Support

- **Target device**: iPhone, portrait orientation.
- **Internal canvas**: `430×932` (ratio ≈ 0.461 — matches iPhone 14/15 Pro Max logical points closely, and is close enough to other iPhone models that `FIT`-mode letterboxing stays minimal).
- **Scaling**: unchanged — Phaser `Scale.FIT` + `autoCenter: CENTER_BOTH`. No orientation lock or rotate-prompt: viewed in landscape, the portrait canvas is simply pillarboxed (black bars left/right) rather than blocked.

## Approach: Player Movement

Two options were considered:

- **Physics-based easing toward the touch point** (rejected) — the player object accelerates/decelerates toward the pointer's x position. Adds acceleration/max-speed tuning constants and a less deterministic, harder-to-manually-test feel, for little benefit in a simple dodger.
- **Direct position-follow** (chosen) — the player's `x` snaps to the pointer's `x` on `pointerdown` and continues tracking `pointermove` while the pointer is down, clamped to stay fully on-screen. Precise, deterministic, and simple to reason about and test.

A consequence of dropping jump/gravity entirely (movement is now purely horizontal and position-driven) is that **Arcade Physics is no longer needed**. `GameScene.ts` advances every `x`/`y` by hand each frame — the same pattern `score.ts`/`spawner.ts` already use — instead of relying on physics bodies for player or obstacles.

## Game Architecture

Single Phaser `GameScene`, same `"playing"` / `"gameOver"` state machine as before.

- **Player**: rectangle GameObject, fixed `y` near the bottom of the canvas, `x` driven by drag input and clamped to `[PLAYER_SIZE / 2, WIDTH - PLAYER_SIZE / 2]`.
- **Obstacles**: rectangle GameObjects spawned at a random `x` just above the top edge, falling straight down at a constant speed. Same scope as the original game: one obstacle at a time, constant fall speed, no difficulty ramp. Destroyed once fully past the bottom edge.
- **Score**: unchanged — ticks by survival time (`score.ts`), displayed top-left.
- **Collision**: plain AABB `intersects()` check (from `collision.ts`) between the player's bounds and each obstacle's bounds, every frame. The previous `sweptRect()` anti-tunneling logic is removed — it existed only because Arcade Physics moved obstacles independently of the scene's own `update()` step; now that all movement is delta-driven inside `update()`, there's nothing to tunnel past.
- **Game over / restart**: unchanged — colliding freezes obstacles/player and shows "Game Over", the final score, and "Tap to Restart"; tapping resets score/obstacles/player position and returns to `"playing"`.

## Core Logic (unchanged, reused as-is)

`src/core/score.ts`, `src/core/spawner.ts`, and `src/core/collision.ts` are all axis-agnostic pure functions with no Phaser dependency. No changes needed; their existing Vitest coverage stays valid without modification.

## Phaser Glue (rewritten, not unit-tested)

`src/scenes/GameScene.ts`:

- `create()`: creates the player rectangle (no physics body, no ground object), wires `pointerdown`/`pointermove` to drive drag-follow while `"playing"` and restart while `"gameOver"`.
- `update(time, delta)`: if `"playing"`, ticks score/spawner exactly as before, spawns/advances/culls obstacles by hand using `delta`, and checks collision — transitioning to `"gameOver"` on any hit. If `"gameOver"`, movement/spawn ticking is skipped, same as before.

`src/main.ts`: drop the `physics: { arcade: ... }` block from the `Phaser.Game` config — no longer used. No other changes (orientation gating was already removed in a prior change).

`src/gameConfig.ts`: `WIDTH = 430`, `HEIGHT = 932`.

## File Structure Changes

```
mouse2/
  src/
    gameConfig.ts          # WIDTH/HEIGHT -> portrait (430x932)
    main.ts                 # - physics config block
    scenes/
      GameScene.ts           # rewritten: drag movement, falling obstacles, no Arcade Physics
```

No changes to `src/core/*` or their tests.

## Testing Strategy

- **Unit tests**: `core/` suite is unchanged and stays green as-is (Vitest, red/green TDD already satisfied by the existing tests).
- **Manual verification**: `GameScene.ts` stays glue code, verified manually via `pnpm dev` — dragging to dodge, collision triggering game over, tap-to-restart, and obstacle spawn timing/cleanup. Includes a real portrait-viewport check via browser tooling, the same approach used to verify the previous orientation-gate removal.

## Out of Scope

- Difficulty ramp (fall speed or spawn frequency increasing over time)
- Multiple simultaneous obstacles
- Lane-based (discrete) obstacle positions — obstacles spawn at freeform random `x`
- Keyboard/arrow-key movement input (touch/mouse-drag only, consistent with the iPhone focus)
- Sound, sprite/image assets, high-score persistence (still out of scope, per the original spec)
