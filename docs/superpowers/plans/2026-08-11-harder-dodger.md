# Harder Dodger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dodger game harder — the ship moves vertically, enemies spawn increasingly often as a run goes on, and a rare five-hit tank enemy fires a five-way spread.

**Architecture:** Two new pure modules under `src/core/` (`difficulty.ts` for the spawn-rate ramp, `spread.ts` for fan velocities), each unit-tested with vitest. Everything else is wiring inside `src/scenes/GameScene.ts`: the player gains a y axis, enemy bullets gain a velocity vector, and the `Enemy` record gains a kind, hit points, and its own size.

**Tech Stack:** TypeScript, Phaser 3, Vite, vitest, pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-harder-dodger-design.md`.
- Pure logic lives in `src/core/` with tests in `src/core/__tests__/`; Phaser rendering and input live in scenes. Never import Phaser into `src/core/`.
- Screen is portrait: `WIDTH = 430`, `HEIGHT = 932` (from `src/gameConfig.ts`).
- Run tests with `pnpm test` (vitest, single run). Run `pnpm build` to typecheck (`tsc --noEmit`) and build.
- Existing core tests must stay green and unmodified.
- Commit after each task.

---

## File Structure

- **Create** `src/core/difficulty.ts` — `spawnRange(elapsedMs)`: the spawn-interval ramp. Owns the ramp's constants.
- **Create** `src/core/__tests__/difficulty.test.ts`
- **Create** `src/core/spread.ts` — `fanVelocities(count, spreadRadians, speed)`: bullet velocities fanned about straight down.
- **Create** `src/core/__tests__/spread.test.ts`
- **Modify** `src/scenes/GameScene.ts` — all scene wiring (Tasks 3–6).

Tasks 1 and 2 are independent of each other. Task 6 depends on Tasks 2 and 5.

---

### Task 1: Spawn-rate ramp

**Files:**
- Create: `src/core/difficulty.ts`
- Test: `src/core/__tests__/difficulty.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `spawnRange(elapsedMs: number): { min: number; max: number }` — the enemy spawn interval range in milliseconds at a given elapsed run time. Interpolates linearly from `{ min: 1500, max: 2500 }` at 0 ms to `{ min: 400, max: 700 }` at 90000 ms, clamped outside that window. Task 4 calls it.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/difficulty.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spawnRange } from '../difficulty';

describe('spawnRange', () => {
  it('starts at the gentle opening rate', () => {
    expect(spawnRange(0)).toEqual({ min: 1500, max: 2500 });
  });

  it('reaches the floor at the end of the ramp', () => {
    expect(spawnRange(90_000)).toEqual({ min: 400, max: 700 });
  });

  it('interpolates linearly halfway through the ramp', () => {
    const range = spawnRange(45_000);
    expect(range.min).toBeCloseTo(950, 5);
    expect(range.max).toBeCloseTo(1600, 5);
  });

  it('holds at the floor beyond the ramp', () => {
    expect(spawnRange(600_000)).toEqual({ min: 400, max: 700 });
  });

  it('clamps negative elapsed time to the opening rate', () => {
    expect(spawnRange(-1000)).toEqual({ min: 1500, max: 2500 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/difficulty.test.ts`
Expected: FAIL — cannot resolve `../difficulty`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/difficulty.ts`:

```ts
// The spawn interval tightens as a run goes on: every run opens at a rate a
// small child can read, and earns its difficulty from time survived rather
// than from starting hard.

const START_MIN_MS = 1500;
const START_MAX_MS = 2500;
const FLOOR_MIN_MS = 400;
const FLOOR_MAX_MS = 700;
const RAMP_MS = 90_000;

export interface SpawnRange {
  min: number;
  max: number;
}

/** Enemy spawn interval range at `elapsedMs` into the run. */
export function spawnRange(elapsedMs: number): SpawnRange {
  const t = Math.min(1, Math.max(0, elapsedMs / RAMP_MS));
  return {
    min: START_MIN_MS + (FLOOR_MIN_MS - START_MIN_MS) * t,
    max: START_MAX_MS + (FLOOR_MAX_MS - START_MAX_MS) * t,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/__tests__/difficulty.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/difficulty.ts src/core/__tests__/difficulty.test.ts
git commit -m "feat: add spawn-rate ramp"
```

---

### Task 2: Fan velocities for spread fire

**Files:**
- Create: `src/core/spread.ts`
- Test: `src/core/__tests__/spread.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `fanVelocities(count: number, spreadRadians: number, speed: number): Velocity[]` where `interface Velocity { vx: number; vy: number }`. Angles are measured from straight down; `+vy` is downward on screen (Phaser's y grows downward) and `+vx` is rightward. `spreadRadians` is the *full* angular width of the fan. Task 6 calls it.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/spread.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fanVelocities } from '../spread';

describe('fanVelocities', () => {
  it('sends a single bullet straight down', () => {
    expect(fanVelocities(1, Math.PI / 2, 150)).toEqual([{ vx: 0, vy: 150 }]);
  });

  it('aims the middle bullet of an odd fan straight down', () => {
    const middle = fanVelocities(5, Math.PI * (80 / 180), 150)[2];
    expect(middle.vx).toBeCloseTo(0, 5);
    expect(middle.vy).toBeCloseTo(150, 5);
  });

  it('places the outer bullets at half the spread either side', () => {
    const fan = fanVelocities(5, Math.PI * (80 / 180), 150);
    expect(fan[0].vx).toBeCloseTo(-Math.sin(Math.PI * (40 / 180)) * 150, 5);
    expect(fan[4].vx).toBeCloseTo(Math.sin(Math.PI * (40 / 180)) * 150, 5);
  });

  it('mirrors the fan about straight down', () => {
    const fan = fanVelocities(4, Math.PI / 3, 200);
    expect(fan[0].vx).toBeCloseTo(-fan[3].vx, 5);
    expect(fan[1].vx).toBeCloseTo(-fan[2].vx, 5);
  });

  it('gives every bullet the same speed', () => {
    for (const { vx, vy } of fanVelocities(5, Math.PI * (80 / 180), 150)) {
      expect(Math.hypot(vx, vy)).toBeCloseTo(150, 5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/spread.test.ts`
Expected: FAIL — cannot resolve `../spread`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/spread.ts`:

```ts
export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Velocities for `count` bullets fanned symmetrically about straight down.
 * `spreadRadians` is the full width of the fan, so the outermost bullets sit
 * half of it either side of vertical. Screen y grows downward, so straight
 * down is `{ vx: 0, vy: speed }`.
 */
export function fanVelocities(count: number, spreadRadians: number, speed: number): Velocity[] {
  if (count <= 1) {
    return [{ vx: 0, vy: speed }];
  }
  const step = spreadRadians / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const angle = -spreadRadians / 2 + step * index;
    return { vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/__tests__/spread.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/spread.ts src/core/__tests__/spread.test.ts
git commit -m "feat: add fan velocities for spread fire"
```

---

### Task 3: Vertical ship movement

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `movePlayerTo(x: number, y: number)` — private, two arguments now. The `PLAYER_Y` module constant is gone; the player's live position is `this.player.y`.

This task is scene wiring, so it has no unit test. Verify by typechecking and by playing the game.

- [ ] **Step 1: Replace the fixed-Y constants**

In `src/scenes/GameScene.ts`, replace these lines:

```ts
const PLAYER_SIZE = SHIP_SIZE;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
```

with:

```ts
const PLAYER_SIZE = SHIP_SIZE;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_START_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
// The ship now flies the whole screen, but stops short of the score and
// hearts pills so it can never hide the HUD.
const PLAYER_MIN_Y = 110;
```

- [ ] **Step 2: Track the previous y**

Next to `private prevPlayerX!: number;` add:

```ts
  private prevPlayerY!: number;
```

- [ ] **Step 3: Steer on both axes**

Replace `movePlayerTo`:

```ts
  private movePlayerTo(x: number, y: number): void {
    const half = PLAYER_SIZE / 2;
    const next = Phaser.Math.Clamp(x, half, WIDTH - half);
    const nextY = Phaser.Math.Clamp(y, PLAYER_MIN_Y, HEIGHT - half);
    // Bank into the turn — the ship leans toward wherever the thumb pulls it.
    // Horizontal only: a climb or dive should not roll the ship.
    const lean = Phaser.Math.Clamp((next - this.player.x) * 0.03, -0.28, 0.28);
    this.player.x = next;
    this.player.y = nextY;
    this.player.setRotation(lean);
  }
```

Update both callers to pass the pointer's y — in `handlePointerDown` and in `handlePointerMove`:

```ts
    this.movePlayerTo(pointer.x, pointer.y);
```

- [ ] **Step 4: Point the remaining PLAYER_Y uses at the live position**

In `create()`, the player is spawned at the start position:

```ts
    this.player = this.add
      .image(WIDTH / 2, PLAYER_START_Y, ensureShipTexture(this))
      .setDepth(DEPTH.world);
```

In `resetState()`, replace the three-line block that starts `this.player.x = WIDTH / 2;` and ends with the `prevPlayerX` assignment with this five-line block:

```ts
    this.player.x = WIDTH / 2;
    this.player.y = PLAYER_START_Y;
    this.player.setVisible(true).setAlpha(1).setRotation(0);
    this.prevPlayerX = WIDTH / 2;
    this.prevPlayerY = PLAYER_START_Y;
```

In `firePlayerBullet()`, the muzzle follows the ship:

```ts
      this.player.y - PLAYER_SIZE / 2 - PLAYER_BULLET_HEIGHT / 2,
```

- [ ] **Step 5: Sweep the player's path on both axes**

In `update()`, replace the player rect and steer path:

```ts
    const playerRect = rectAt(this.player.x, this.player.y, PLAYER_SIZE, PLAYER_SIZE);
    const steerPath = sweepY(
      sweepX(playerRect, this.prevPlayerX - PLAYER_SIZE / 2),
      this.prevPlayerY - PLAYER_SIZE / 2
    );
```

Further down, where `this.prevPlayerX = this.player.x;` appears, add:

```ts
    this.prevPlayerX = this.player.x;
    this.prevPlayerY = this.player.y;
```

- [ ] **Step 6: Verify**

Run: `pnpm build`
Expected: PASS — no TypeScript errors. In particular there must be no remaining reference to `PLAYER_Y`.

Run: `pnpm test`
Expected: PASS — all existing core tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: let the ship move vertically"
```

---

### Task 4: Wire the spawn ramp

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `spawnRange(elapsedMs)` from Task 1.
- Produces: `this.elapsedMs` — milliseconds of clamped sim time since the run began, reset to 0 by `resetState()`.

- [ ] **Step 1: Import the ramp and drop the fixed spawn constants**

Add the import next to the other core imports:

```ts
import { spawnRange } from '../core/difficulty';
```

Delete these two constants — `difficulty.ts` owns those numbers now:

```ts
const ENEMY_MIN_SPAWN_INTERVAL_MS = 1500;
const ENEMY_MAX_SPAWN_INTERVAL_MS = 2500;
```

- [ ] **Step 2: Track elapsed run time**

Add the field next to the other state fields:

```ts
  private elapsedMs!: number;
```

In `resetState()`, replace:

```ts
    this.spawnerState = createSpawner(ENEMY_MIN_SPAWN_INTERVAL_MS, ENEMY_MAX_SPAWN_INTERVAL_MS);
```

with:

```ts
    this.elapsedMs = 0;
    const opening = spawnRange(0);
    this.spawnerState = createSpawner(opening.min, opening.max);
```

- [ ] **Step 3: Re-range the spawner after each spawn**

In `update()`, replace the spawn block:

```ts
    this.elapsedMs += safeDelta;

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnEnemy();
      // Redraw the next wait from the range the run has reached. Rebuilding
      // discards the spawner's sub-frame carryover, which is far smaller than
      // the interval it is folded into.
      const range = spawnRange(this.elapsedMs);
      this.spawnerState = createSpawner(range.min, range.max);
    }
```

Place `this.elapsedMs += safeDelta;` immediately after `const safeDelta = ...` so the ramp reflects the current frame.

- [ ] **Step 4: Verify**

Run: `pnpm build`
Expected: PASS — no TypeScript errors, no unused-constant complaints.

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: ramp the enemy spawn rate over a run"
```

---

### Task 5: Give enemy bullets a velocity vector

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface EnemyBullet { rect: Phaser.GameObjects.Rectangle; vx: number; vy: number }`, and `this.enemyBullets: EnemyBullet[]`. Task 6 pushes fanned bullets into it.

Behaviour must not change in this task: every bullet is still fired straight down. This is purely the plumbing that Task 6 needs.

- [ ] **Step 1: Declare the bullet type**

Above the `Enemy` interface, add:

```ts
/** Enemy bullets travel on an arbitrary heading so tanks can fire a fan. */
interface EnemyBullet {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
}
```

Change the field:

```ts
  private enemyBullets: EnemyBullet[] = [];
```

- [ ] **Step 2: Update the reset path**

In `resetState()`, the enemy-bullet loop becomes:

```ts
    for (const bullet of this.enemyBullets) {
      bullet.rect.destroy();
    }
    this.enemyBullets = [];
```

- [ ] **Step 3: Update the spawn site**

In `update()`, change the declaration:

```ts
    const firedThisFrame: EnemyBullet[] = [];
```

and the enemy's fire block:

```ts
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const rect = this.add.rectangle(
          enemy.sprite.x,
          enemy.sprite.y + ENEMY_HEIGHT / 2 + ENEMY_BULLET_SIZE / 2,
          ENEMY_BULLET_SIZE,
          ENEMY_BULLET_SIZE,
          PALETTE.amber
        );
        rect.setDepth(DEPTH.world);
        firedThisFrame.push({ rect, vx: 0, vy: ENEMY_BULLET_SPEED });
      }
```

- [ ] **Step 4: Move bullets along their heading and cull on all four edges**

Replace the enemy-bullet filter with:

```ts
    let shotByEnemy = false;
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      // The player's drag movement happened before update(), while this
      // bullet was still at its pre-move position — so, as with the enemy
      // checks, test the player's swept path against where the bullet WAS
      // before also checking final rects after the move.
      const sweptHit = intersects(
        steerPath,
        rectAt(bullet.rect.x, bullet.rect.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE)
      );
      bullet.rect.x += bullet.vx * (safeDelta / 1000);
      bullet.rect.y += bullet.vy * (safeDelta / 1000);
      if (
        bullet.rect.y > HEIGHT + ENEMY_BULLET_SIZE ||
        bullet.rect.y < -ENEMY_BULLET_SIZE ||
        bullet.rect.x < -ENEMY_BULLET_SIZE ||
        bullet.rect.x > WIDTH + ENEMY_BULLET_SIZE
      ) {
        bullet.rect.destroy();
        return false;
      }
      if (
        sweptHit ||
        intersects(rectAt(bullet.rect.x, bullet.rect.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE), playerRect)
      ) {
        bullet.rect.destroy();
        shotByEnemy = true;
        return false;
      }
      return true;
    });
```

- [ ] **Step 5: Verify**

Run: `pnpm build`
Expected: PASS.

Run: `pnpm test`
Expected: PASS.

Play the game (`pnpm dev`, open in a **visible** browser window — a hidden window throttles Phaser to about one frame a second): enemy bullets still fall straight down exactly as before.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "refactor: give enemy bullets a velocity vector"
```

---

### Task 6: Tank enemies

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `fanVelocities` from Task 2; `EnemyBullet` from Task 5.
- Produces: `Enemy` gains `kind: 'normal' | 'tank'`, `hp: number`, `width: number`, `height: number`.

- [ ] **Step 1: Add the import and the tank constants**

Add the import:

```ts
import { fanVelocities } from '../core/spread';
```

Replace the `HAZARD_COLORS` declaration so rose belongs to tanks alone:

```ts
/** Enemies come in three flavours purely so the field never looks uniform. */
const HAZARD_COLORS = [PALETTE.violet, PALETTE.amber, PALETTE.mint];
```

Add, next to the other enemy constants:

```ts
// The tank is the same shard at 1.6x, so it reads as "the big one" rather
// than a different creature. Rose is reserved for it: the only red thing in
// the hazard field is the one that takes five shots.
const TANK_SCALE = ENEMY_SCALE * 1.6;
const TANK_WIDTH = SHARD_WIDTH * TANK_SCALE;
const TANK_HEIGHT = SHARD_HEIGHT * TANK_SCALE;
const TANK_COLOR = PALETTE.rose;
const TANK_CHANCE = 0.1;
const TANK_HP = 5;
const TANK_KILL_POINTS = 50;
const TANK_FLASH_MS = 120;
const TANK_MIN_FIRE_INTERVAL_MS = 2500;
const TANK_MAX_FIRE_INTERVAL_MS = 4000;
const TANK_SPREAD_COUNT = 5;
const TANK_SPREAD_RADIANS = Phaser.Math.DegToRad(80);
```

- [ ] **Step 2: Widen the Enemy record**

Add to the `Enemy` interface:

```ts
  kind: 'normal' | 'tank';
  /** Player bullets still needed to destroy it. */
  hp: number;
  /** Displayed size, which is also the hitbox — see ENEMY_SCALE. */
  width: number;
  height: number;
```

Make `enemyRect` read the per-enemy size:

```ts
  private enemyRect(enemy: Enemy): Rect {
    return rectAt(enemy.sprite.x, enemy.sprite.y, enemy.width, enemy.height);
  }
```

- [ ] **Step 3: Spawn tanks**

Replace `spawnEnemy()` entirely:

```ts
  private spawnEnemy(): void {
    const isTank = Phaser.Math.FloatBetween(0, 1) < TANK_CHANCE;
    const width = isTank ? TANK_WIDTH : ENEMY_WIDTH;
    const height = isTank ? TANK_HEIGHT : ENEMY_HEIGHT;
    const color = isTank
      ? TANK_COLOR
      : HAZARD_COLORS[Phaser.Math.Between(0, HAZARD_COLORS.length - 1)];

    // Spawning baseX inside the wobble margin keeps the whole wobble arc on
    // screen, so no per-frame clamping is needed.
    const margin = width / 2 + ENEMY_WOBBLE_AMPLITUDE;
    const baseX = Phaser.Math.Between(margin, WIDTH - margin);

    const halo = this.add
      .image(baseX, -height, TEX.glow)
      .setDisplaySize(width * 2.6, height * 2)
      .setTint(color)
      .setAlpha(isTank ? 0.45 : 0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add
      .image(baseX, -height, ensureShardTexture(this, color))
      .setScale(isTank ? TANK_SCALE : ENEMY_SCALE)
      .setDepth(DEPTH.world);

    this.enemies.push({
      sprite,
      halo,
      color,
      baseX,
      prevX: baseX,
      elapsedMs: 0,
      fireState: createSpawner(
        isTank ? TANK_MIN_FIRE_INTERVAL_MS : ENEMY_MIN_FIRE_INTERVAL_MS,
        isTank ? TANK_MAX_FIRE_INTERVAL_MS : ENEMY_MAX_FIRE_INTERVAL_MS
      ),
      kind: isTank ? 'tank' : 'normal',
      hp: isTank ? TANK_HP : 1,
      width,
      height,
    });
  }
```

- [ ] **Step 4: Use each enemy's own size in the update loop**

In `update()`, inside the enemy loop, the halo offset becomes:

```ts
      enemy.halo.y = enemy.sprite.y - enemy.height * 0.15;
```

In the player-bullet filter, the enemy's horizontal sweep becomes:

```ts
        return intersects(bulletSwept, sweepY(sweepX(rect, enemy.prevX - enemy.width / 2), rect.y - fallDistance));
```

And the off-screen cull becomes:

```ts
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + enemy.height) {
        enemy.sprite.destroy();
        enemy.halo.destroy();
        return false;
      }
      return true;
    });
```

- [ ] **Step 5: Fire the fan**

Replace the enemy's fire block from Task 5 with:

```ts
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const shots =
          enemy.kind === 'tank'
            ? fanVelocities(TANK_SPREAD_COUNT, TANK_SPREAD_RADIANS, ENEMY_BULLET_SPEED)
            : fanVelocities(1, 0, ENEMY_BULLET_SPEED);
        for (const { vx, vy } of shots) {
          const rect = this.add.rectangle(
            enemy.sprite.x,
            enemy.sprite.y + enemy.height / 2 + ENEMY_BULLET_SIZE / 2,
            ENEMY_BULLET_SIZE,
            ENEMY_BULLET_SIZE,
            PALETTE.amber
          );
          rect.setDepth(DEPTH.world);
          firedThisFrame.push({ rect, vx, vy });
        }
      }
```

- [ ] **Step 6: Spend hit points instead of always killing**

In the player-bullet filter, replace the `if (target) { ... }` block with:

```ts
      if (target) {
        bullet.destroy();
        target.hp -= 1;
        if (target.hp > 0) {
          this.flashEnemy(target);
          return false;
        }
        this.explodeEnemy(target);
        this.enemies = this.enemies.filter((enemy) => enemy !== target);
        this.scoreState = addPoints(
          this.scoreState,
          target.kind === 'tank' ? TANK_KILL_POINTS : KILL_POINTS
        );
        this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);
        return false;
      }
```

Add `flashEnemy` next to `explodeEnemy`:

```ts
  /** White pop on a hit that did not kill, so the tank reads as damaged. */
  private flashEnemy(enemy: Enemy): void {
    enemy.sprite.setTintFill(PALETTE.text);
    this.time.delayedCall(TANK_FLASH_MS, () => {
      // The enemy may have died — or the whole run been reset — inside the
      // flash window, and a destroyed sprite must not be tinted.
      if (enemy.sprite.active) {
        enemy.sprite.clearTint();
      }
    });
  }
```

- [ ] **Step 7: Verify**

Run: `pnpm build`
Expected: PASS — no TypeScript errors. `ENEMY_HEIGHT` and `ENEMY_WIDTH` are still used (by `spawnEnemy` for ordinary enemies), so no unused-constant errors.

Run: `pnpm test`
Expected: PASS — all core tests green.

Play the game in a **visible** browser window (`pnpm dev`) and confirm:
- The ship follows the finger/cursor up and down, and cannot reach the HUD pills.
- Enemies come noticeably faster after a minute than at the start.
- Large rose enemies appear occasionally, flash white when shot, take five shots to destroy, score +50, and fire five bullets in a downward fan.
- Ordinary enemies still die in one shot for +10 and fire straight down.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add five-hit tank enemies with spread fire"
```

---

## Done when

`pnpm test` and `pnpm build` both pass, and a play session shows vertical steering, a spawn rate that tightens over the run, and tanks that take five shots and fire a five-way fan.
