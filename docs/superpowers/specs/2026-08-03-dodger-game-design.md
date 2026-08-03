# Dodger Game — Design Spec

## Summary

A simple single-button endless runner/dodger game built with TypeScript + Vite + Phaser 3. The player character auto-runs and jumps (Space/click) over obstacles that scroll in from the right. Colliding with an obstacle ends the run; the player can restart immediately.

## Tech Stack

- **Scaffold**: Vite `vanilla-ts` template
- **Game engine**: Phaser 3 (Arcade Physics)
- **Unit testing**: Vitest
- **Package manager**: pnpm
- **Visuals**: no image assets — player, ground, and obstacles are drawn as colored rectangles via Phaser Graphics/rectangle game objects

## Game Architecture

Single Phaser `GameScene` with an internal state: `"playing"` or `"gameOver"`.

- **Player**: rectangle sprite with arcade physics, rests on the ground. Space or click applies a fixed upward velocity (jump); gravity pulls it back down. No double-jump.
- **Ground**: a static rectangle/line the player rests on.
- **Obstacles**: rectangles spawned just off the right edge of the screen at randomized intervals, moving left at a constant speed, destroyed once they scroll off the left edge.
- **Score**: increments over survival time (elapsed time while `"playing"`), displayed top-left of the screen.
- **Collision**: Arcade Physics overlap check between the player and any active obstacle. On overlap, transition state to `"gameOver"`.
- **Game over**: obstacle and player movement freeze; scene displays "Game Over", the final score, and "Press Space to Restart". Pressing Space (or clicking) resets the scene back to `"playing"` with score reset to 0.

No difficulty ramp (constant obstacle speed) — kept out of scope for this first version.

## Core Logic (unit-tested, no Phaser dependency)

Lives under `src/core/`, pure TypeScript with no import of Phaser, so it can be tested in isolation with Vitest using red/green TDD.

- **`score.ts`**
  - `createScore(): ScoreState` — returns initial score state (0).
  - `tickScore(state: ScoreState, dt: number): ScoreState` — returns updated state with score incremented based on elapsed time `dt`.
- **`spawner.ts`**
  - `createSpawner(minInterval: number, maxInterval: number): SpawnerState` — sets up a spawner with a randomized first interval.
  - `tickSpawner(state: SpawnerState, dt: number): { state: SpawnerState; shouldSpawn: boolean }` — advances the internal timer by `dt`; when the timer exceeds the current interval, returns `shouldSpawn: true`, resets the timer, and picks a new randomized interval.
- **`collision.ts`**
  - `Rect = { x: number; y: number; width: number; height: number }`
  - `intersects(a: Rect, b: Rect): boolean` — AABB overlap check between two plain rectangles.

## Phaser Glue (not unit-tested)

`src/scenes/GameScene.ts` wires the above modules to actual Phaser GameObjects and input:

- Creates player/ground rectangles and physics bodies in `create()`.
- On `update(time, delta)`:
  - If `"playing"`: calls `tickScore`/`tickSpawner` with `delta`, updates the score text, spawns a new obstacle rectangle when `shouldSpawn` is true, moves existing obstacles left and destroys off-screen ones, and calls `intersects` between the player's bounds and each obstacle's bounds — transitioning to `"gameOver"` on any hit.
  - If `"gameOver"`: obstacles/player are frozen; listens for Space/click to reset scene state (score, obstacles cleared, player position reset) back to `"playing"`.
- Space/click input is read via Phaser's input system and dispatched to either "jump" (when playing) or "restart" (when game over).

This scene is verified manually (`pnpm dev` + playing the game) rather than via unit tests, since Phaser rendering/physics isn't practical to unit test.

## File Structure

```
mouse2/
  src/
    main.ts                    # Phaser.Game config, boots GameScene
    scenes/
      GameScene.ts
    core/
      score.ts
      spawner.ts
      collision.ts
      __tests__/
        score.test.ts
        spawner.test.ts
        collision.test.ts
  index.html
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  package.json
```

## Testing Strategy

- Red/green TDD for every function in `src/core/`: write a failing test first, then the minimal implementation to pass it, per the project's standard workflow.
- `GameScene.ts` is glue code, not covered by unit tests; verified manually by running the dev server and playing through: jumping, obstacle spawning/collision, game over screen, and restart.

## Out of Scope (for this version)

- Difficulty ramp / increasing obstacle speed
- Sound effects/music
- Mobile touch controls beyond generic click support
- High score persistence (localStorage, etc.)
- Sprite/image assets
