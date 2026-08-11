# Gentle Shooter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the portrait Dodger into a gentle shooter for 3–5 year olds: wobbling enemies that drift down and shoot slow bullets, player auto-fire while touching, 3 hearts, +10 per kill.

**Architecture:** Pure game logic lives in `src/core/` as small tested modules (spawner, collision, wobble, lives, score); `src/scenes/GameScene.ts` owns Phaser objects, arrays of enemies/bullets, per-frame movement, and collision wiring. Spec: `docs/superpowers/specs/2026-08-11-gentle-shooter-design.md`.

**Tech Stack:** TypeScript, Phaser 3, Vitest, pnpm, Vite.

## Global Constraints

- Package manager is pnpm: tests run with `pnpm test` (vitest run), type-check/build with `pnpm build`.
- Screen is portrait 430×932 (`WIDTH`/`HEIGHT` from `src/gameConfig.ts`).
- Core modules are pure functions with immutable state records — no Phaser imports in `src/core/`.
- TDD (red/green) for every core module change; scene wiring is verified by `pnpm build` + playing the game.
- Tuning values (from spec): enemy 50px, fall 60px/s, wobble amplitude 60px / period 2000ms, enemy spawn 1500–2500ms, enemy fire 2000–4000ms, enemy bullet 150px/s; player fire every 400ms, player bullet 500px/s; 3 hearts, 1500ms invincibility, +10 per kill.
- Each task ends with all tests passing and a commit ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Wobble module

**Files:**
- Create: `src/core/wobble.ts`
- Test: `src/core/__tests__/wobble.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `wobbleX(baseX: number, elapsedMs: number, amplitude: number, periodMs: number): number` — sine wobble around `baseX`; at `elapsedMs = 0` returns `baseX`, peaks at `baseX + amplitude` a quarter period in. Task 4's GameScene calls this every frame per enemy.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/wobble.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { wobbleX } from '../wobble';

describe('wobbleX', () => {
  it('returns baseX at time zero', () => {
    expect(wobbleX(100, 0, 60, 2000)).toBe(100);
  });

  it('peaks at baseX + amplitude a quarter period in', () => {
    expect(wobbleX(100, 500, 60, 2000)).toBeCloseTo(160, 5);
  });

  it('returns to baseX at half period', () => {
    expect(wobbleX(100, 1000, 60, 2000)).toBeCloseTo(100, 5);
  });

  it('dips to baseX - amplitude at three quarter period', () => {
    expect(wobbleX(100, 1500, 60, 2000)).toBeCloseTo(40, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/wobble.test.ts`
Expected: FAIL — cannot resolve `../wobble`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/wobble.ts`:

```typescript
export function wobbleX(
  baseX: number,
  elapsedMs: number,
  amplitude: number,
  periodMs: number
): number {
  return baseX + amplitude * Math.sin((2 * Math.PI * elapsedMs) / periodMs);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/wobble.ts src/core/__tests__/wobble.test.ts
git commit -m "feat: add wobbleX core helper for enemy horizontal motion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Lives module

**Files:**
- Create: `src/core/lives.ts`
- Test: `src/core/__tests__/lives.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 7's GameScene):
  - `interface LivesState { lives: number; invincibleMs: number }`
  - `createLives(count: number): LivesState`
  - `hit(state: LivesState, invincibilityMs: number): { state: LivesState; tookHit: boolean; dead: boolean }` — no-op (`tookHit: false`) while invincible; otherwise decrements lives, starts the invincibility timer, and reports `dead` when lives reach 0.
  - `tickLives(state: LivesState, dt: number): LivesState` — counts the invincibility timer down, clamped at 0.
  - `isInvincible(state: LivesState): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/lives.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createLives, hit, tickLives, isInvincible } from '../lives';

describe('lives', () => {
  it('starts with the given count and not invincible', () => {
    const state = createLives(3);
    expect(state.lives).toBe(3);
    expect(isInvincible(state)).toBe(false);
  });

  it('a hit removes one life and starts invincibility', () => {
    const result = hit(createLives(3), 1500);
    expect(result.tookHit).toBe(true);
    expect(result.dead).toBe(false);
    expect(result.state.lives).toBe(2);
    expect(isInvincible(result.state)).toBe(true);
  });

  it('ignores hits while invincible', () => {
    const first = hit(createLives(3), 1500);
    const second = hit(first.state, 1500);
    expect(second.tookHit).toBe(false);
    expect(second.state.lives).toBe(2);
  });

  it('invincibility expires after ticking down', () => {
    const first = hit(createLives(3), 1500);
    const ticked = tickLives(first.state, 1500);
    expect(isInvincible(ticked)).toBe(false);
    expect(hit(ticked, 1500).state.lives).toBe(1);
  });

  it('reports dead when the last life is lost', () => {
    const result = hit(createLives(1), 1500);
    expect(result.dead).toBe(true);
    expect(result.state.lives).toBe(0);
  });

  it('tick never drops the timer below zero', () => {
    const ticked = tickLives(createLives(3), 500);
    expect(ticked.invincibleMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/lives.test.ts`
Expected: FAIL — cannot resolve `../lives`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/lives.ts`:

```typescript
export interface LivesState {
  lives: number;
  invincibleMs: number;
}

export function createLives(count: number): LivesState {
  return { lives: count, invincibleMs: 0 };
}

export function isInvincible(state: LivesState): boolean {
  return state.invincibleMs > 0;
}

export function hit(
  state: LivesState,
  invincibilityMs: number
): { state: LivesState; tookHit: boolean; dead: boolean } {
  if (isInvincible(state)) {
    return { state, tookHit: false, dead: false };
  }
  const lives = state.lives - 1;
  return {
    state: { lives, invincibleMs: invincibilityMs },
    tookHit: true,
    dead: lives <= 0,
  };
}

export function tickLives(state: LivesState, dt: number): LivesState {
  return { ...state, invincibleMs: Math.max(0, state.invincibleMs - dt) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/lives.ts src/core/__tests__/lives.test.ts
git commit -m "feat: add lives core module with invincibility window

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Score rework — kill points instead of survival time

**Files:**
- Modify: `src/core/score.ts` (full rewrite, 15 lines)
- Modify: `src/core/__tests__/score.test.ts` (full rewrite)
- Modify: `src/scenes/GameScene.ts` (stop ticking time-based score)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3 and 5 in GameScene):
  - `interface ScoreState { points: number }`
  - `createScore(): ScoreState`
  - `addPoints(state: ScoreState, points: number): ScoreState`
  - `getScoreValue(state: ScoreState): number`
  - `tickScore` is DELETED. After this task the scene no longer changes score during `update()` — score stays 0 until Task 5 awards kills. That interim behavior is expected.

- [ ] **Step 1: Rewrite the score test (red)**

Replace the whole contents of `src/core/__tests__/score.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createScore, addPoints, getScoreValue } from '../score';

describe('score', () => {
  it('starts at zero', () => {
    expect(getScoreValue(createScore())).toBe(0);
  });

  it('adds points per kill', () => {
    let state = createScore();
    state = addPoints(state, 10);
    expect(getScoreValue(state)).toBe(10);
  });

  it('accumulates points across kills', () => {
    let state = createScore();
    state = addPoints(state, 10);
    state = addPoints(state, 10);
    expect(getScoreValue(state)).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/score.test.ts`
Expected: FAIL — `addPoints` is not exported.

- [ ] **Step 3: Rewrite the implementation**

Replace the whole contents of `src/core/score.ts`:

```typescript
export interface ScoreState {
  points: number;
}

export function createScore(): ScoreState {
  return { points: 0 };
}

export function addPoints(state: ScoreState, points: number): ScoreState {
  return { points: state.points + points };
}

export function getScoreValue(state: ScoreState): number {
  return state.points;
}
```

- [ ] **Step 4: Update GameScene to compile against the new API**

In `src/scenes/GameScene.ts`:

1. Change the score import (line 2) to:

```typescript
import { createScore, getScoreValue } from '../core/score';
```

2. In `update()`, delete the two score-ticking lines:

```typescript
    this.scoreState = tickScore(this.scoreState, safeDelta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);
```

(`scoreText` is still reset by `resetState()` and read by `triggerGameOver()`; Task 5 will update it on kills.)

- [ ] **Step 5: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/score.ts src/core/__tests__/score.test.ts src/scenes/GameScene.ts
git commit -m "feat: rework score from survival time to kill points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: GameScene — obstacles become wobbling enemies

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `wobbleX(baseX, elapsedMs, amplitude, periodMs)` from Task 1; existing `createSpawner`/`tickSpawner`, `intersects`, `Rect`.
- Produces: scene-internal `Enemy` type `{ sprite: Phaser.GameObjects.Rectangle; baseX: number; elapsedMs: number; fireState: SpawnerState }` and `private enemies: Enemy[]` — Tasks 5 and 6 iterate this array. Touching an enemy still means instant game over in this task (hearts arrive in Task 7).

- [ ] **Step 1: Replace obstacle constants with enemy constants**

In `src/scenes/GameScene.ts`, delete the obstacle constants (lines 13–17: `OBSTACLE_WIDTH`, `OBSTACLE_HEIGHT`, `OBSTACLE_SPEED`, `MIN_SPAWN_INTERVAL_MS`, `MAX_SPAWN_INTERVAL_MS`) and add:

```typescript
const ENEMY_SIZE = 50;
const ENEMY_FALL_SPEED = 60;
const ENEMY_WOBBLE_AMPLITUDE = 60;
const ENEMY_WOBBLE_PERIOD_MS = 2000;
const ENEMY_MIN_SPAWN_INTERVAL_MS = 1500;
const ENEMY_MAX_SPAWN_INTERVAL_MS = 2500;
const ENEMY_MIN_FIRE_INTERVAL_MS = 2000;
const ENEMY_MAX_FIRE_INTERVAL_MS = 4000;
```

Replace the long `MAX_DELTA_MS` comment block (lines 18–26) with:

```typescript
// Caps how much sim time a single frame advances timers and movement by, so
// a stalled frame (e.g. a backgrounded tab) can't teleport objects. At the
// cap the fastest object (a 500px/s player bullet) moves 50px in one step,
// less than ENEMY_SIZE, so nothing can tunnel through a collision target.
```

Add the wobble import after the collision import:

```typescript
import { wobbleX } from '../core/wobble';
```

- [ ] **Step 2: Replace the obstacles array with enemies**

Replace the field `private obstacles: Phaser.GameObjects.Rectangle[] = [];` with:

```typescript
private enemies: Enemy[] = [];
```

and add above the class (after the `GameState` type):

```typescript
interface Enemy {
  sprite: Phaser.GameObjects.Rectangle;
  baseX: number;
  elapsedMs: number;
  fireState: SpawnerState;
}
```

(`SpawnerState` is already imported.)

- [ ] **Step 3: Update resetState, spawning, and update()**

1. In `resetState()`: `createSpawner(ENEMY_MIN_SPAWN_INTERVAL_MS, ENEMY_MAX_SPAWN_INTERVAL_MS)`, and replace the obstacle cleanup loop with:

```typescript
    for (const enemy of this.enemies) {
      enemy.sprite.destroy();
    }
    this.enemies = [];
```

2. Replace `spawnObstacle()` with:

```typescript
  private spawnEnemy(): void {
    const half = ENEMY_SIZE / 2;
    const margin = half + ENEMY_WOBBLE_AMPLITUDE;
    const baseX = Phaser.Math.Between(margin, WIDTH - margin);
    const sprite = this.add.rectangle(baseX, -ENEMY_SIZE, ENEMY_SIZE, ENEMY_SIZE, 0xff0000);
    this.enemies.push({
      sprite,
      baseX,
      elapsedMs: 0,
      fireState: createSpawner(ENEMY_MIN_FIRE_INTERVAL_MS, ENEMY_MAX_FIRE_INTERVAL_MS),
    });
  }
```

(Spawning `baseX` inside `margin` keeps the whole wobble arc on screen, so no clamping is needed.)

3. In `update()`, replace everything from `const fallDistance = ...` through the obstacle filter at the end with:

```typescript
    const fallDistance = ENEMY_FALL_SPEED * (safeDelta / 1000);

    // Player movement happened via pointer events before update(), while
    // enemies were still at their pre-move positions — sweep the player's
    // path against where enemies WERE.
    const playerSweptRect = this.playerSweptRect();
    let collided = this.enemies.some((enemy) => intersects(playerSweptRect, this.toRect(enemy.sprite)));

    for (const enemy of this.enemies) {
      enemy.elapsedMs += safeDelta;
      enemy.sprite.y += fallDistance;
      enemy.sprite.x = wobbleX(enemy.baseX, enemy.elapsedMs, ENEMY_WOBBLE_AMPLITUDE, ENEMY_WOBBLE_PERIOD_MS);
    }

    // Enemy speeds are low (≤ ~20px per capped frame, well under
    // ENEMY_SIZE), so a plain overlap check after the move can't miss a
    // pass-through; no enemy-side sweep needed.
    if (!collided) {
      const playerRect = this.toRect(this.player);
      collided = this.enemies.some((enemy) => intersects(playerRect, this.toRect(enemy.sprite)));
    }

    if (collided) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + ENEMY_SIZE) {
        enemy.sprite.destroy();
        return false;
      }
      return true;
    });
```

4. Change `this.spawnObstacle()` in `update()` to `this.spawnEnemy()`.

5. Delete the now-unused `obstacleSweptRect()` method and trim its stale reference from the `playerSweptRect()` comment (the sweep rationale for the player still holds).

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, tsc clean.

- [ ] **Step 5: Verify in the browser**

Run: `pnpm dev`, open the game, start Dodger. Expected: red 50px squares drift down slowly while swaying side to side; touching one ends the game; enemies vanish off the bottom harmlessly; score stays 0.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: replace falling obstacles with drifting, wobbling enemies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Player auto-fire and destroying enemies

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `enemies: Enemy[]` from Task 4; `addPoints`/`getScoreValue` from Task 3; `createSpawner`/`tickSpawner`.
- Produces: `private playerBullets: Phaser.GameObjects.Rectangle[]` and `private firePlayerBullet(): void` (Task 6 mirrors the bullet pattern for enemies).

- [ ] **Step 1: Add constants and fields**

Constants:

```typescript
const PLAYER_FIRE_INTERVAL_MS = 400;
const PLAYER_BULLET_SPEED = 500;
const PLAYER_BULLET_WIDTH = 8;
const PLAYER_BULLET_HEIGHT = 16;
const KILL_POINTS = 10;
```

Fields:

```typescript
private playerBullets: Phaser.GameObjects.Rectangle[] = [];
private fireState!: SpawnerState;
```

Update the score import to include `addPoints`:

```typescript
import { createScore, addPoints, getScoreValue } from '../core/score';
```

- [ ] **Step 2: Fire immediately on touch, then every 400ms while held**

1. In `handlePointerDown()`, after `this.movePlayerTo(pointer.x)` add:

```typescript
      this.firePlayerBullet();
      this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
```

2. Add the method:

```typescript
  private firePlayerBullet(): void {
    const bullet = this.add.rectangle(
      this.player.x,
      this.player.y - PLAYER_SIZE / 2 - PLAYER_BULLET_HEIGHT / 2,
      PLAYER_BULLET_WIDTH,
      PLAYER_BULLET_HEIGHT,
      0x0088ff
    );
    this.playerBullets.push(bullet);
  }
```

3. In `resetState()` add:

```typescript
    this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    for (const bullet of this.playerBullets) {
      bullet.destroy();
    }
    this.playerBullets = [];
```

4. In `update()`, right after the spawner block, add:

```typescript
    if (this.dragging && this.input.activePointer.isDown) {
      const fireResult = tickSpawner(this.fireState, safeDelta);
      this.fireState = fireResult.state;
      if (fireResult.shouldSpawn) {
        this.firePlayerBullet();
      }
    }
```

- [ ] **Step 3: Move bullets, kill enemies, score**

In `update()`, after the enemy movement loop (before the player-overlap check), add:

```typescript
    for (const bullet of this.playerBullets) {
      bullet.y -= PLAYER_BULLET_SPEED * (safeDelta / 1000);
    }

    this.playerBullets = this.playerBullets.filter((bullet) => {
      if (bullet.y < -PLAYER_BULLET_HEIGHT) {
        bullet.destroy();
        return false;
      }
      const bulletRect = this.toRect(bullet);
      const target = this.enemies.find((enemy) => intersects(bulletRect, this.toRect(enemy.sprite)));
      if (target) {
        target.sprite.destroy();
        this.enemies = this.enemies.filter((enemy) => enemy !== target);
        this.scoreState = addPoints(this.scoreState, KILL_POINTS);
        this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);
        bullet.destroy();
        return false;
      }
      return true;
    });
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, tsc clean.

- [ ] **Step 5: Verify in the browser**

Run: `pnpm dev`. Expected: holding a finger/mouse down fires blue bullets upward from the ship (~2.5/s); a bullet hitting an enemy removes both and score climbs by 10; bullets vanish off the top.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add player auto-fire while touching, kills score 10 points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Enemy bullets

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `Enemy.fireState` (created per-enemy in Task 4), `tickSpawner`, bullet pattern from Task 5.
- Produces: `private enemyBullets: Phaser.GameObjects.Rectangle[]` — Task 7 changes what a hit does; in this task an enemy bullet touching the player is instant game over.

- [ ] **Step 1: Add constants and field**

Constants:

```typescript
const ENEMY_BULLET_SPEED = 150;
const ENEMY_BULLET_SIZE = 10;
```

Field:

```typescript
private enemyBullets: Phaser.GameObjects.Rectangle[] = [];
```

In `resetState()` add:

```typescript
    for (const bullet of this.enemyBullets) {
      bullet.destroy();
    }
    this.enemyBullets = [];
```

- [ ] **Step 2: Enemies fire on their own timers**

In `update()`, inside the enemy movement loop (after the wobble line), add:

```typescript
      const enemyFire = tickSpawner(enemy.fireState, safeDelta);
      enemy.fireState = enemyFire.state;
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const bullet = this.add.rectangle(
          enemy.sprite.x,
          enemy.sprite.y + ENEMY_SIZE / 2 + ENEMY_BULLET_SIZE / 2,
          ENEMY_BULLET_SIZE,
          ENEMY_BULLET_SIZE,
          0xff8800
        );
        this.enemyBullets.push(bullet);
      }
```

(The `y > 0` guard stops enemies from firing before they are visible.)

- [ ] **Step 3: Move enemy bullets and hit the player**

In `update()`, after the player-bullet filter block, add:

```typescript
    const playerHitRect = this.toRect(this.player);
    let shotByEnemy = false;
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      bullet.y += ENEMY_BULLET_SPEED * (safeDelta / 1000);
      if (bullet.y > HEIGHT + ENEMY_BULLET_SIZE) {
        bullet.destroy();
        return false;
      }
      if (intersects(this.toRect(bullet), playerHitRect)) {
        bullet.destroy();
        shotByEnemy = true;
        return false;
      }
      return true;
    });
```

and change the game-over condition from `if (collided) {` to:

```typescript
    if (collided || shotByEnemy) {
      this.triggerGameOver();
    }
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, tsc clean.

- [ ] **Step 5: Verify in the browser**

Run: `pnpm dev`. Expected: on-screen enemies occasionally drop small orange bullets that fall slowly; getting touched by one ends the game; bullets vanish off the bottom.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: enemies fire slow bullets on independent timers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Hearts, invincibility flash, and forgiving game over

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `createLives`, `hit`, `tickLives`, `isInvincible`, `LivesState` from Task 2; `collided`/`shotByEnemy` from Tasks 4/6.
- Produces: final behavior — hits cost a heart instead of ending the game; Game Over only at 0 hearts.

- [ ] **Step 1: Add constants, field, and hearts display**

Constants:

```typescript
const STARTING_LIVES = 3;
const INVINCIBILITY_MS = 1500;
```

Import:

```typescript
import { createLives, hit, tickLives, isInvincible } from '../core/lives';
import type { LivesState } from '../core/lives';
```

Fields:

```typescript
private livesState!: LivesState;
private livesText!: Phaser.GameObjects.Text;
```

In `create()`, after the `scoreText` block, add:

```typescript
    this.livesText = this.add.text(WIDTH - 16, 16, '', {
      fontSize: '24px',
      color: '#ff0000',
    });
    this.livesText.setOrigin(1, 0);
```

and include `this.livesText.setDepth(10);` alongside the other `setDepth(10)` calls.

Add a helper:

```typescript
  private updateLivesText(): void {
    this.livesText.setText('♥'.repeat(Math.max(0, this.livesState.lives)));
  }
```

In `resetState()` add:

```typescript
    this.livesState = createLives(STARTING_LIVES);
    this.updateLivesText();
    this.player.setAlpha(1);
```

- [ ] **Step 2: Route hits through the lives module**

In `update()`, replace:

```typescript
    if (collided || shotByEnemy) {
      this.triggerGameOver();
    }
```

with:

```typescript
    this.livesState = tickLives(this.livesState, safeDelta);
    if (collided || shotByEnemy) {
      const result = hit(this.livesState, INVINCIBILITY_MS);
      this.livesState = result.state;
      if (result.tookHit) {
        this.updateLivesText();
      }
      if (result.dead) {
        this.triggerGameOver();
      }
    }

    // Blink while invincible so kids can see the shield; solid otherwise.
    this.player.setAlpha(isInvincible(this.livesState) && Math.floor(_time / 100) % 2 === 0 ? 0.3 : 1);
```

Also rename `update(_time: number, ...)`'s first parameter usage accordingly (it is already named `_time`; keep the name and use it as shown — TypeScript allows reading an underscore-prefixed parameter).

- [ ] **Step 3: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, tsc clean.

- [ ] **Step 4: Verify in the browser**

Run: `pnpm dev`. Expected: three red hearts top-right; getting hit removes one heart and the ship blinks for ~1.5s, during which further hits do nothing; the third hit shows Game Over with working Restart / Back to Menu; restarting brings back 3 hearts, full alpha, and a clean field.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add 3 hearts with invincibility flash, game over at zero

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
