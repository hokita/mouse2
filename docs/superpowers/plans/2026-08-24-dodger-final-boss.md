# Dodger Final Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Dodger a finish line — at 90 seconds the debris field clears, a large enemy descends, and killing it wins the run.

**Architecture:** Pure tuning and geometry go in `src/core/boss.ts` with unit tests; the boss's Phaser objects go in `src/scenes/dodger/boss.ts`; `GameScene` gains a `runPhase` field and delegates. This is the split the codebase already uses (`core/difficulty.ts` + `core/spread.ts` for tuning, `src/scenes/fish/` for a scene's own helpers).

**Tech Stack:** TypeScript, Phaser 3.90, Vite, Vitest. `pnpm test` runs the suite; `pnpm build` type-checks via `tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-08-24-dodger-final-boss-design.md`

## Global Constraints

- Screen is `WIDTH = 430`, `HEIGHT = 932` (portrait iPhone), from `src/gameConfig.ts`.
- Core modules must NOT import Phaser. `src/core/*.ts` is Phaser-free so tests can import it; `GameScene` is not importable from a test because it pulls in Phaser. Use `Math.PI / 180` rather than `Phaser.Math.DegToRad` in core.
- Boss tuning constants live in `core/boss.ts`, never inline in the scene — same reason `core/field.ts` exists: a test that re-declares a number goes on passing after someone changes the real one.
- Boss HP is 45; phases split at fractions 2/3 and 1/3 of max HP, never at hardcoded HP values.
- Boss bullets travel at 150 px/s, identical to `ENEMY_BULLET_SPEED`.
- Existing behaviour before 90 s must not change. All 189 existing tests stay green.
- Commit after every task.

### Refinement of the spec (deliberate)

The spec says `scenes/dodger/boss.ts` owns "boss bullets". While reading the
code it became clear that is the wrong seam: `GameScene`'s `enemyBullets`
array already carries `{ rect, vx, vy }` on an arbitrary heading, and already
has a swept player-collision pass and a four-edge off-screen cull built for
exactly this. So the boss module **emits shot descriptors** and `GameScene`
materialises them into `enemyBullets`. Boss bullets are then enemy bullets in
every respect, and none of that collision code is duplicated. Everything else
follows the spec as written.

---

### Task 1: Boss tuning table and phase selection

**Files:**
- Create: `src/core/boss.ts`
- Test: `src/core/__tests__/boss.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BossPhase` (`1 | 2 | 3`), `BossPhaseSpec`, `BOSS_PHASES: Record<BossPhase, BossPhaseSpec>`, `phaseAt(hp: number, maxHp?: number): BossPhase`, and the constants `BOSS_MAX_HP = 45`, `BOSS_WIDTH = 230`, `BOSS_HEIGHT = 120`, `BOSS_STATION_Y = 200`, `BOSS_EDGE_MARGIN = 16`, `BOSS_SPAWN_Y = -120`, `BOSS_ARRIVAL_MS = 1200`, `BOSS_TIME_MS = 90_000`, `BOSS_CLEAR_FALL_MULTIPLIER = 3`, `BOSS_KILL_POINTS = 1000`.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/boss.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { BOSS_MAX_HP, BOSS_PHASES, phaseAt } from '../boss';

describe('phaseAt', () => {
  it('opens in phase 1 at full health', () => {
    expect(phaseAt(BOSS_MAX_HP)).toBe(1);
  });

  it('splits the bar into three equal runs of 15 hits', () => {
    // The table in the design doc: 45-31, 30-16, 15-0. Asserted at the
    // boundaries rather than the middles, because the boundaries are where
    // an off-by-one silently turns one phase into 14 hits and its neighbour
    // into 16.
    expect(phaseAt(31)).toBe(1);
    expect(phaseAt(30)).toBe(2);
    expect(phaseAt(16)).toBe(2);
    expect(phaseAt(15)).toBe(3);
    expect(phaseAt(1)).toBe(3);
  });

  it('keeps the split proportional when max HP changes', () => {
    // Phases are fractions of max, not hardcoded HP, so retuning BOSS_MAX_HP
    // cannot silently unbalance them.
    expect(phaseAt(100, 100)).toBe(1);
    expect(phaseAt(67, 100)).toBe(1);
    expect(phaseAt(66, 100)).toBe(2);
    expect(phaseAt(34, 100)).toBe(2);
    expect(phaseAt(33, 100)).toBe(3);
  });

  it('treats a dead boss as phase 3', () => {
    expect(phaseAt(0)).toBe(3);
  });
});

describe('BOSS_PHASES', () => {
  it('escalates: each phase slides faster and fires sooner than the last', () => {
    expect(BOSS_PHASES[2].slidePeriodMs).toBeLessThan(BOSS_PHASES[1].slidePeriodMs);
    expect(BOSS_PHASES[3].slidePeriodMs).toBeLessThan(BOSS_PHASES[2].slidePeriodMs);
    expect(BOSS_PHASES[2].fireIntervalMs).toBeLessThanOrEqual(BOSS_PHASES[1].fireIntervalMs);
    expect(BOSS_PHASES[3].fireIntervalMs).toBeLessThanOrEqual(BOSS_PHASES[2].fireIntervalMs);
  });

  it('only aims in the last phase', () => {
    expect(BOSS_PHASES[1].aimedIntervalMs).toBeNull();
    expect(BOSS_PHASES[2].aimedIntervalMs).toBeNull();
    expect(BOSS_PHASES[3].aimedIntervalMs).toBe(2200);
  });

  it('widens the fan after phase 1', () => {
    expect(BOSS_PHASES[1].fanCount).toBe(3);
    expect(BOSS_PHASES[2].fanCount).toBe(5);
    expect(BOSS_PHASES[3].fanCount).toBe(5);
    expect(BOSS_PHASES[2].fanSpreadRadians).toBeGreaterThan(BOSS_PHASES[1].fanSpreadRadians);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/__tests__/boss.test.ts`
Expected: FAIL — `Failed to resolve import "../boss"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/boss.ts`:

```typescript
// The final boss's tuning. Everything that decides how hard the fight is
// lives here rather than in the scene, so a test can read the same numbers
// the game runs on — the reasoning that put core/difficulty.ts and
// core/field.ts here too. This module must stay free of Phaser: GameScene
// cannot be imported from a test, and a test that re-declared these numbers
// would go on passing after someone changed the real ones.

/** Degrees to radians. Local rather than Phaser.Math.DegToRad — see above. */
const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * 45 HP. At PLAYER_FIRE_INTERVAL_MS of 400 the player lands 2.5 bullets a
 * second, so this is 18s of perfect uptime and 25-35s of realistic play. It
 * divides into three phases of exactly 15 hits, each roughly 10s — long
 * enough that every phase registers, short enough to hold a small child's
 * attention.
 */
export const BOSS_MAX_HP = 45;

export const BOSS_WIDTH = 230;
export const BOSS_HEIGHT = 120;

/** Where the hull settles, so it spans y 140-260 on a 932-tall screen. */
export const BOSS_STATION_Y = 200;
export const BOSS_SPAWN_Y = -120;
export const BOSS_ARRIVAL_MS = 1200;

/** Clearance from each screen edge at the extremes of the slide. */
export const BOSS_EDGE_MARGIN = 16;

/**
 * When the boss comes. The spawn interval reaches its 700-1000ms floor at
 * 60s, so the player gets 30s at full field pressure first. A time trigger
 * rather than a score one means every run is the same length and a child who
 * survives always reaches the boss.
 */
export const BOSS_TIME_MS = 90_000;

/**
 * How much faster the leftover field falls once the boss is due.
 *
 * An enemy lives (HEIGHT + 2 * ENEMY_HEIGHT) / ENEMY_FALL_SPEED seconds —
 * about 12.2s. One that spawned just before the 90s mark would hold the boss
 * off for that whole time, which is a stall, not a dramatic beat. Tripling
 * caps the wait at about 4.1s while still reading as the field falling away
 * rather than being deleted.
 */
export const BOSS_CLEAR_FALL_MULTIPLIER = 3;

/** Against a tank's 150. The run's whole point, priced accordingly. */
export const BOSS_KILL_POINTS = 1000;

export type BossPhase = 1 | 2 | 3;

export interface BossPhaseSpec {
  /** One full left-right-left sweep. */
  slidePeriodMs: number;
  fanCount: number;
  /** Full width of the fan; the outermost shots sit half of it either side. */
  fanSpreadRadians: number;
  fireIntervalMs: number;
  /** Only the last phase aims at the player. */
  aimedIntervalMs: number | null;
}

export const BOSS_PHASES: Record<BossPhase, BossPhaseSpec> = {
  1: { slidePeriodMs: 5000, fanCount: 3, fanSpreadRadians: deg(45), fireIntervalMs: 1800, aimedIntervalMs: null },
  2: { slidePeriodMs: 3800, fanCount: 5, fanSpreadRadians: deg(80), fireIntervalMs: 1400, aimedIntervalMs: null },
  3: { slidePeriodMs: 3000, fanCount: 5, fanSpreadRadians: deg(80), fireIntervalMs: 1400, aimedIntervalMs: 2200 },
};

/**
 * Which phase `hp` falls in. Boundaries are fractions of max HP, not
 * hardcoded HP values, so retuning BOSS_MAX_HP keeps the three phases equal
 * instead of silently unbalancing them.
 */
export function phaseAt(hp: number, maxHp: number = BOSS_MAX_HP): BossPhase {
  const fraction = hp / maxHp;
  if (fraction > 2 / 3) {
    return 1;
  }
  if (fraction > 1 / 3) {
    return 2;
  }
  return 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/__tests__/boss.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/boss.ts src/core/__tests__/boss.test.ts
git commit -m "Add the boss's phase table and phase selection"
```

---

### Task 2: Boss geometry — slide, descent, and the anti-pocket floor

**Files:**
- Modify: `src/core/boss.ts`
- Test: `src/core/__tests__/boss.test.ts`

**Interfaces:**
- Consumes: `BOSS_PHASES`, `BossPhase`, `BOSS_WIDTH`, `BOSS_HEIGHT`, `BOSS_STATION_Y`, `BOSS_SPAWN_Y`, `BOSS_EDGE_MARGIN` from Task 1.
- Produces: `slideBounds(screenWidth: number): { minX: number; maxX: number }`, `slideX(elapsedMs: number, phase: BossPhase, minX: number, maxX: number): number`, `arrivalY(t: number): number` (`t` is descent progress, clamped to 0..1), `bossHullBottom(): number`, `playerFloorForHull(hullCenterY: number, playerSize: number, clearance: number): number`, `bossPlayerFloor(playerSize: number, clearance: number): number`.

- [ ] **Step 1: Write the failing test**

Append to `src/core/__tests__/boss.test.ts` and extend the import at the top to:

```typescript
import {
  BOSS_MAX_HP,
  BOSS_PHASES,
  BOSS_SPAWN_Y,
  BOSS_STATION_Y,
  BOSS_WIDTH,
  arrivalY,
  bossHullBottom,
  bossPlayerFloor,
  phaseAt,
  playerFloorForHull,
  slideBounds,
  slideX,
} from '../boss';
```

Import exactly these — no more. `tsconfig.json` sets `noUnusedLocals: true`
and includes `src`, so test files are type-checked and one unused import
fails `pnpm build`.

```typescript
describe('slideBounds', () => {
  it('keeps the whole hull on screen with a margin at each edge', () => {
    const { minX, maxX } = slideBounds(430);
    expect(minX).toBe(131);
    expect(maxX).toBe(299);
    expect(minX - BOSS_WIDTH / 2).toBeGreaterThanOrEqual(0);
    expect(maxX + BOSS_WIDTH / 2).toBeLessThanOrEqual(430);
  });
});

describe('slideX', () => {
  const { minX, maxX } = slideBounds(430);

  it('starts at the left extreme', () => {
    expect(slideX(0, 1, minX, maxX)).toBeCloseTo(minX, 5);
  });

  it('reaches the right extreme at half a period', () => {
    expect(slideX(BOSS_PHASES[1].slidePeriodMs / 2, 1, minX, maxX)).toBeCloseTo(maxX, 5);
  });

  it('returns to the left extreme after a full period', () => {
    expect(slideX(BOSS_PHASES[1].slidePeriodMs, 1, minX, maxX)).toBeCloseTo(minX, 5);
  });

  it('never leaves the bounds, at any phase or time', () => {
    for (const phase of [1, 2, 3] as const) {
      for (let ms = 0; ms <= 12_000; ms += 37) {
        const x = slideX(ms, phase, minX, maxX);
        expect(x).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(x).toBeLessThanOrEqual(maxX + 1e-9);
      }
    }
  });

  it('eases — it moves slower at the turns than at mid-sweep', () => {
    // The cosine ease is what makes the hull readable rather than a
    // ping-pong ball. Compare the distance covered in the same 50ms at the
    // turn against mid-sweep.
    const period = BOSS_PHASES[1].slidePeriodMs;
    const atTurn = Math.abs(slideX(50, 1, minX, maxX) - slideX(0, 1, minX, maxX));
    const atMid = Math.abs(
      slideX(period / 4 + 50, 1, minX, maxX) - slideX(period / 4, 1, minX, maxX)
    );
    expect(atTurn).toBeLessThan(atMid);
  });

  it('covers more ground in the same time in later phases', () => {
    // Exercises slideX itself rather than re-asserting the BOSS_PHASES table
    // (which the phase-table tests already cover): a shorter period must
    // translate into more distance travelled from the turn in equal time.
    const travelled = (phase: 1 | 2 | 3) => Math.abs(slideX(400, phase, minX, maxX) - minX);
    expect(travelled(2)).toBeGreaterThan(travelled(1));
    expect(travelled(3)).toBeGreaterThan(travelled(2));
  });
});

describe('arrivalY', () => {
  it('starts off the top of the screen', () => {
    expect(arrivalY(0)).toBe(BOSS_SPAWN_Y);
  });

  it('ends on station', () => {
    expect(arrivalY(1)).toBeCloseTo(BOSS_STATION_Y, 5);
  });

  it('clamps outside 0..1 rather than overshooting', () => {
    expect(arrivalY(-1)).toBe(BOSS_SPAWN_Y);
    expect(arrivalY(4)).toBeCloseTo(BOSS_STATION_Y, 5);
  });

  it('descends monotonically', () => {
    let previous = arrivalY(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const y = arrivalY(t);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });
});

describe('bossPlayerFloor', () => {
  it('sits below the hull, so there is no safe pocket above the boss', () => {
    // The invariant the whole fight depends on. Without it the player parks
    // above the hull, out of reach of downward fans, and the fight is free.
    const floor = bossPlayerFloor(40, 18);
    expect(floor - 40 / 2).toBeGreaterThanOrEqual(bossHullBottom());
  });

  it('matches the design doc for the real ship', () => {
    expect(bossHullBottom()).toBe(260);
    expect(bossPlayerFloor(40, 18)).toBe(298);
  });

  it('still leaves the player most of the screen', () => {
    expect(bossPlayerFloor(40, 18)).toBeLessThan(932 * 0.35);
  });
});

describe('playerFloorForHull', () => {
  it('agrees with bossPlayerFloor once the hull is on station', () => {
    expect(playerFloorForHull(BOSS_STATION_Y, 40, 18)).toBe(bossPlayerFloor(40, 18));
  });

  it('never lets the descending hull overlap the ship', () => {
    // The regression this function exists for. The hull descends on a
    // quadratic ease-out; a floor that interpolated linearly from
    // PLAYER_MIN_Y to 298 fell BEHIND the hull for t in [0.55, 0.85] and
    // overlapped the ship by up to 9.6px — the boss's entrance stealing a
    // heart the player could do nothing about. Deriving the floor from the
    // hull's live position makes the overlap impossible by construction,
    // whatever easing the descent later uses.
    for (let step = 0; step <= 100; step += 1) {
      const t = step / 100;
      const hullY = arrivalY(t);
      const shipTop = Math.max(110, playerFloorForHull(hullY, 40, 18)) - 40 / 2;
      expect(shipTop).toBeGreaterThanOrEqual(hullY + 120 / 2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/__tests__/boss.test.ts`
Expected: FAIL — `slideBounds is not a function` (and the other new names undefined).

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/boss.ts`:

```typescript
/** How far the hull may slide with a margin held at each screen edge. */
export function slideBounds(screenWidth: number): { minX: number; maxX: number } {
  return {
    minX: BOSS_WIDTH / 2 + BOSS_EDGE_MARGIN,
    maxX: screenWidth - BOSS_WIDTH / 2 - BOSS_EDGE_MARGIN,
  };
}

/**
 * Hull centre x at `elapsedMs` into the fight.
 *
 * A cosine ease rather than a triangle wave: the hull slows visibly into each
 * turn, which is what lets a child read where it is going. A linear slide of
 * a 230px body reads as a ping-pong ball.
 */
export function slideX(elapsedMs: number, phase: BossPhase, minX: number, maxX: number): number {
  const period = BOSS_PHASES[phase].slidePeriodMs;
  const t = (elapsedMs % period) / period;
  const eased = (1 - Math.cos(2 * Math.PI * t)) / 2;
  return minX + (maxX - minX) * eased;
}

/** Hull centre y during the descent, `t` being progress clamped to 0..1. */
export function arrivalY(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  // Ease-out: drops in fast, settles onto station rather than snapping.
  const eased = 1 - (1 - clamped) ** 2;
  return BOSS_SPAWN_Y + (BOSS_STATION_Y - BOSS_SPAWN_Y) * eased;
}

/** Bottom edge of the hull once the boss is on station. */
export function bossHullBottom(): number {
  return BOSS_STATION_Y + BOSS_HEIGHT / 2;
}

/**
 * The ship's floor for a hull whose centre is at `hullCenterY`.
 *
 * Derived from the hull's live position rather than interpolated
 * independently. A floor that eased linearly from PLAYER_MIN_Y to the
 * on-station value fell behind the quadratic descent for t in [0.55, 0.85]
 * and let the hull overlap the ship by up to 9.6px — the boss's entrance
 * taking a heart the player could not avoid. Tracking the hull makes that
 * impossible by construction, whatever easing the descent uses.
 *
 * Callers clamp the result up to PLAYER_MIN_Y: while the hull is still off
 * the top of the screen this returns a value above it, and the ship should
 * keep its ordinary range until the boss actually needs the room.
 */
export function playerFloorForHull(
  hullCenterY: number,
  playerSize: number,
  clearance: number
): number {
  return hullCenterY + BOSS_HEIGHT / 2 + playerSize / 2 + clearance;
}

/**
 * The ship's floor once the boss is on station.
 *
 * PLAYER_MIN_Y (110) would leave a pocket between the HUD and the hull's top
 * edge where the player could park out of reach of every downward fan, which
 * would make the fight free. Pushing the floor below the hull removes it. The
 * ship keeps y 298-912 of a 932px screen, which is ample.
 */
export function bossPlayerFloor(playerSize: number, clearance: number): number {
  return playerFloorForHull(BOSS_STATION_Y, playerSize, clearance);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/__tests__/boss.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/boss.ts src/core/__tests__/boss.test.ts
git commit -m "Add the boss's slide, descent and anti-pocket player floor"
```

---

### Task 3: Boss hull texture

**Files:**
- Modify: `src/ui/textures.ts`

**Interfaces:**
- Consumes: `BOSS_WIDTH`, `BOSS_HEIGHT` from `core/boss.ts` (Task 1); existing `define`, `fillPolygon`, `shade`, `PALETTE`.
- Produces: `TEX.boss` (string key `'dodger-boss'`) and `ensureBossTexture(scene: Phaser.Scene): string`.

There is no unit test here: texture generation needs a live Phaser canvas, and
the project has never tested its art. It is verified in the browser in Task 8.

- [ ] **Step 1: Add the texture key**

In `src/ui/textures.ts`, add to the `TEX` object (after `ship: 'dodger-ship',`):

```typescript
  boss: 'dodger-boss',
```

- [ ] **Step 2: Extend the core/boss import**

At the top of `src/ui/textures.ts`, the existing import is:

```typescript
import { SHARD_HEIGHT, SHARD_WIDTH } from '../core/field';
```

Add below it:

```typescript
import { BOSS_HEIGHT, BOSS_WIDTH } from '../core/boss';
```

- [ ] **Step 3: Write the texture builder**

Add to `src/ui/textures.ts`, immediately after `ensureShardTexture`:

```typescript
/**
 * The final boss's hull, drawn at exactly its collision box's size as the
 * ship and the shards are.
 *
 * Deliberately the shard's silhouette inverted and widened: it reads as the
 * same family of threat, one rank up, rather than as a creature from another
 * game. Plated in a darkened rose so the phase tints (which brighten toward
 * white) have somewhere to travel.
 */
export function ensureBossTexture(scene: Phaser.Scene): string {
  return define(scene, TEX.boss, BOSS_WIDTH, BOSS_HEIGHT, (g) => {
    const w = BOSS_WIDTH;
    const h = BOSS_HEIGHT;
    const base = shade(PALETTE.rose, -0.35);

    // Wide, blunt wedge pointing down at the player.
    const body: number[][] = [
      [w * 0.08, 0],
      [w * 0.92, 0],
      [w, h * 0.38],
      [w * 0.72, h * 0.88],
      [w * 0.5, h],
      [w * 0.28, h * 0.88],
      [0, h * 0.38],
    ];

    fillPolygon(g, body, base);

    // Armour plating: three bands across the hull, alternating light and
    // shadow, so the body reads as solid rather than as a flat silhouette.
    fillPolygon(g, [[w * 0.08, 0], [w * 0.92, 0], [w * 0.86, h * 0.22], [w * 0.14, h * 0.22]], 0xffffff, 0.16);
    fillPolygon(g, [[w * 0.14, h * 0.22], [w * 0.86, h * 0.22], [w * 0.8, h * 0.5], [w * 0.2, h * 0.5]], 0x000000, 0.18);

    // The core, and the two gun ports the fans come out of.
    g.fillStyle(shade(PALETTE.rose, 0.5), 1);
    g.fillCircle(w * 0.5, h * 0.52, h * 0.16);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(w * 0.5, h * 0.52, h * 0.07);

    g.fillStyle(shade(PALETTE.amber, -0.1), 1);
    g.fillRect(w * 0.26, h * 0.62, w * 0.08, h * 0.14);
    g.fillRect(w * 0.66, h * 0.62, w * 0.08, h * 0.14);

    g.lineStyle(3, shade(PALETTE.rose, 0.25), 0.9);
    g.strokePoints(
      body.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true
    );
  });
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm build`
Expected: PASS — no type errors. (`ensureBossTexture` is unused until Task 4; that is fine, `noUnusedLocals` does not apply to exports.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/textures.ts
git commit -m "Draw the boss hull"
```

---

### Task 4: The boss module

**Files:**
- Create: `src/scenes/dodger/boss.ts`

**Interfaces:**
- Consumes: everything from `core/boss.ts` (Tasks 1-2), `ensureBossTexture` (Task 3), `createSpawner`/`tickSpawner` from `core/spawner`, `fanVelocities` from `core/spread`, `rectAt`/`Rect` from `core/collision`, `TEX`/`ensureFxTextures` from `ui/textures`, `DEPTH` from `ui/widgets`, `PALETTE`/`shade` from `ui/theme`.
- Produces:
  - `interface BossShot { x: number; y: number; vx: number; vy: number }`
  - `interface Boss { … }` (opaque to the scene except `hp` and `phase`)
  - `spawnBoss(scene: Phaser.Scene): Boss`
  - `updateBoss(scene: Phaser.Scene, boss: Boss, dtMs: number, targetX: number, targetY: number): BossShot[]`
  - `bossArrived(boss: Boss): boolean`
  - `bossArrivalProgress(boss: Boss): number` — 0..1 descent progress; used inside this module to drive `arrivalY`. Exported for completeness; the scene does not need it.
  - `damageBoss(scene: Phaser.Scene, boss: Boss, amount: number): boolean` — true if this killed it
  - `bossRect(boss: Boss): Rect`
  - `bossCenter(boss: Boss): { x: number; y: number }`
  - `destroyBoss(boss: Boss): void`

- [ ] **Step 1: Write the module**

Create `src/scenes/dodger/boss.ts`:

```typescript
import Phaser from 'phaser';
import { WIDTH } from '../../gameConfig';
import { PALETTE, shade } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';
import { TEX, ensureBossTexture, ensureFxTextures } from '../../ui/textures';
import { createSpawner, tickSpawner } from '../../core/spawner';
import type { SpawnerState } from '../../core/spawner';
import { fanVelocities } from '../../core/spread';
import { rectAt } from '../../core/collision';
import type { Rect } from '../../core/collision';
import {
  BOSS_ARRIVAL_MS,
  BOSS_HEIGHT,
  BOSS_MAX_HP,
  BOSS_PHASES,
  BOSS_SPAWN_Y,
  BOSS_WIDTH,
  arrivalY,
  phaseAt,
  slideBounds,
  slideX,
} from '../../core/boss';
import type { BossPhase } from '../../core/boss';

// The final boss's Phaser side: the hull, its halo, its health bar, and the
// decision of when to fire. GameScene never touches these objects directly.
//
// The boss does NOT own its bullets. It returns shot descriptors and the
// scene turns them into ordinary entries in its enemyBullets array, which
// already carries an arbitrary heading and already has a swept player
// collision pass and a four-edge cull. Boss bullets are enemy bullets.

/** Speed matches ENEMY_BULLET_SPEED — the speed the player already reads. */
const BULLET_SPEED = 150;

const BAR_MARGIN = 18;
const BAR_Y = 82;
const BAR_HEIGHT = 14;
const BAR_WIDTH = WIDTH - BAR_MARGIN * 2;

const FLASH_MS = 90;

/**
 * Each phase brightens the hull toward white. Rose throughout: the boss is
 * the tank's big sibling, and the escalation should read as "hotter", not as
 * a different object.
 */
const PHASE_TINT: Record<BossPhase, number> = {
  1: shade(PALETTE.rose, -0.15),
  2: PALETTE.rose,
  3: shade(PALETTE.rose, 0.35),
};

export interface BossShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Boss {
  hull: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  barFill: Phaser.GameObjects.Rectangle;
  barFrame: Phaser.GameObjects.Graphics;
  hp: number;
  phase: BossPhase;
  /** Time on station, driving the slide. Not advanced during the descent. */
  elapsedMs: number;
  /** Time since the descent began, capped at BOSS_ARRIVAL_MS. */
  arrivalMs: number;
  fireState: SpawnerState;
  aimedState: SpawnerState;
  flashTimer?: Phaser.Time.TimerEvent;
}

export function spawnBoss(scene: Phaser.Scene): Boss {
  // Idempotent — define() returns early if the texture already exists — so
  // this costs nothing on the second run and removes any dependence on
  // GameScene having called it first.
  ensureFxTextures(scene);
  const { minX } = slideBounds(WIDTH);

  const halo = scene.add
    .image(minX, BOSS_SPAWN_Y, TEX.glow)
    .setDisplaySize(BOSS_WIDTH * 1.5, BOSS_HEIGHT * 1.6)
    .setTint(PHASE_TINT[1])
    .setAlpha(0.34)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.world - 1);

  const hull = scene.add
    .image(minX, BOSS_SPAWN_Y, ensureBossTexture(scene))
    .setTint(PHASE_TINT[1])
    .setDepth(DEPTH.world);

  // Bar frame and fill sit in the band between the HUD pills (which end at
  // y 72) and the hull's top edge on station (y 140).
  const barFrame = scene.add.graphics().setDepth(DEPTH.hud);
  barFrame.fillStyle(PALETTE.skyTop, 0.55);
  barFrame.fillRoundedRect(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
  barFrame.lineStyle(1.5, PALETTE.surfaceEdge, 0.8);
  barFrame.strokeRoundedRect(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);

  const barFill = scene.add
    .rectangle(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, PALETTE.rose)
    .setOrigin(0, 0)
    .setDepth(DEPTH.hud);

  const phase1 = BOSS_PHASES[1];
  return {
    hull,
    halo,
    barFill,
    barFrame,
    hp: BOSS_MAX_HP,
    phase: 1,
    elapsedMs: 0,
    arrivalMs: 0,
    fireState: createSpawner(phase1.fireIntervalMs, phase1.fireIntervalMs),
    aimedState: createSpawner(2200, 2200),
  };
}

export function bossArrivalProgress(boss: Boss): number {
  return Math.min(1, boss.arrivalMs / BOSS_ARRIVAL_MS);
}

export function bossArrived(boss: Boss): boolean {
  return boss.arrivalMs >= BOSS_ARRIVAL_MS;
}

export function bossCenter(boss: Boss): { x: number; y: number } {
  return { x: boss.hull.x, y: boss.hull.y };
}

export function bossRect(boss: Boss): Rect {
  return rectAt(boss.hull.x, boss.hull.y, BOSS_WIDTH, BOSS_HEIGHT);
}

/**
 * Advances the boss a frame and returns any shots it fired.
 *
 * During the descent it neither slides nor fires — the arrival is a beat the
 * player gets to watch, not an ambush.
 */
export function updateBoss(
  scene: Phaser.Scene,
  boss: Boss,
  dtMs: number,
  targetX: number,
  targetY: number
): BossShot[] {
  if (!bossArrived(boss)) {
    boss.arrivalMs = Math.min(BOSS_ARRIVAL_MS, boss.arrivalMs + dtMs);
    boss.hull.y = arrivalY(bossArrivalProgress(boss));
    boss.halo.x = boss.hull.x;
    boss.halo.y = boss.hull.y;
    return [];
  }

  boss.elapsedMs += dtMs;
  const { minX, maxX } = slideBounds(WIDTH);
  boss.hull.x = slideX(boss.elapsedMs, boss.phase, minX, maxX);
  boss.halo.x = boss.hull.x;
  boss.halo.y = boss.hull.y;

  const spec = BOSS_PHASES[boss.phase];
  const muzzleY = boss.hull.y + BOSS_HEIGHT / 2;
  const shots: BossShot[] = [];

  const fire = tickSpawner(boss.fireState, dtMs);
  boss.fireState = fire.state;
  if (fire.shouldSpawn) {
    for (const { vx, vy } of fanVelocities(spec.fanCount, spec.fanSpreadRadians, BULLET_SPEED)) {
      shots.push({ x: boss.hull.x, y: muzzleY, vx, vy });
    }
  }

  if (spec.aimedIntervalMs !== null) {
    const aimed = tickSpawner(boss.aimedState, dtMs);
    boss.aimedState = aimed.state;
    if (aimed.shouldSpawn) {
      // Two-line normalise, deliberately not a core module — see the design
      // doc's "deliberately not extracted".
      const dx = targetX - boss.hull.x;
      const dy = targetY - muzzleY;
      const length = Math.hypot(dx, dy) || 1;
      shots.push({
        x: boss.hull.x,
        y: muzzleY,
        vx: (dx / length) * BULLET_SPEED,
        vy: (dy / length) * BULLET_SPEED,
      });
    }
  }

  return shots;
}

/** Applies damage. Returns true if this was the killing blow. */
export function damageBoss(scene: Phaser.Scene, boss: Boss, amount: number): boolean {
  boss.hp = Math.max(0, boss.hp - amount);
  boss.barFill.width = (BAR_WIDTH * boss.hp) / BOSS_MAX_HP;

  if (boss.hp <= 0) {
    return true;
  }

  const nextPhase = phaseAt(boss.hp);
  if (nextPhase !== boss.phase) {
    boss.phase = nextPhase;
    const spec = BOSS_PHASES[nextPhase];
    boss.fireState = createSpawner(spec.fireIntervalMs, spec.fireIntervalMs);
    boss.hull.setTint(PHASE_TINT[nextPhase]);
    boss.halo.setTint(PHASE_TINT[nextPhase]);
    scene.cameras.main.shake(180, 0.008);
  }

  // Each flash owns its timer and cancels the one before it, so a fast
  // sequence of hits cannot let an early timer clear a later hit's tint —
  // the same reasoning as flashEnemy in GameScene.
  boss.flashTimer?.remove();
  boss.hull.setTintFill(PALETTE.text);
  boss.flashTimer = scene.time.delayedCall(FLASH_MS, () => {
    if (boss.hull.active) {
      boss.hull.setTint(PHASE_TINT[boss.phase]);
    }
  });

  return false;
}

export function destroyBoss(boss: Boss): void {
  boss.flashTimer?.remove();
  boss.hull.destroy();
  boss.halo.destroy();
  boss.barFill.destroy();
  boss.barFrame.destroy();
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Confirm the existing suite is untouched**

Run: `pnpm test`
Expected: PASS — 209 tests (189 existing + 20 from Tasks 1-2), 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/dodger/boss.ts
git commit -m "Add the boss module: hull, health bar, phases and firing"
```

---

### Task 5: Run phases and the clearing beat

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `BOSS_TIME_MS`, `BOSS_CLEAR_FALL_MULTIPLIER` from `core/boss.ts`.
- Produces: a `runPhase` field on `GameScene` with values `'field' | 'clearing' | 'incoming' | 'boss'`, reset by `resetState()`.

At the end of this task the game reaches 90 s, stops spawning, sweeps the
field away in about 4 s — and then sits empty. The boss arrives in Task 6.

- [ ] **Step 1: Add the import**

In `src/scenes/GameScene.ts`, after the existing `import { spawnRange } from '../core/difficulty';`:

```typescript
import { BOSS_CLEAR_FALL_MULTIPLIER, BOSS_TIME_MS } from '../core/boss';
```

- [ ] **Step 2: Add the run-phase type**

Next to the existing `type GameState = 'playing' | 'gameOver';` (line 108), add:

```typescript
/**
 * Where in the run we are, kept separate from GameState (how it ended) so
 * every existing `state === 'gameOver'` check keeps working untouched and a
 * heart lost at any phase takes the same path it always did.
 */
type RunPhase = 'field' | 'clearing' | 'incoming' | 'boss';
```

- [ ] **Step 3: Add the field**

In the `GameScene` class, after `private elapsedMs!: number;`:

```typescript
  private runPhase!: RunPhase;
```

- [ ] **Step 4: Reset it**

In `resetState()`, immediately after `this.elapsedMs = 0;`:

```typescript
    this.runPhase = 'field';
```

- [ ] **Step 5: Gate spawning and trigger the clear**

In `update()`, replace this existing block:

```typescript
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

with:

```typescript
    if (this.runPhase === 'field') {
      if (this.elapsedMs >= BOSS_TIME_MS) {
        // Nothing else spawns from here on; the field on screen is the last
        // of it.
        this.runPhase = 'clearing';
      } else {
        const spawnResult = tickSpawner(this.spawnerState, safeDelta);
        this.spawnerState = spawnResult.state;
        if (spawnResult.shouldSpawn) {
          this.spawnEnemy();
          // Redraw the next wait from the range the run has reached.
          // Rebuilding discards the spawner's sub-frame carryover, which is
          // far smaller than the interval it is folded into.
          const range = spawnRange(this.elapsedMs);
          this.spawnerState = createSpawner(range.min, range.max);
        }
      }
    }
```

- [ ] **Step 6: Sweep the field away faster**

Replace the existing line:

```typescript
    const fallDistance = ENEMY_FALL_SPEED * (safeDelta / 1000);
```

with:

```typescript
    // Tripled while clearing so the last enemy cannot hold the boss off for
    // its full ~12.2s lifetime — see BOSS_CLEAR_FALL_MULTIPLIER.
    const fallMultiplier = this.runPhase === 'clearing' ? BOSS_CLEAR_FALL_MULTIPLIER : 1;
    const fallDistance = ENEMY_FALL_SPEED * fallMultiplier * (safeDelta / 1000);
```

- [ ] **Step 7: Silence the departing field**

In the per-enemy loop in `update()`, change:

```typescript
      if (enemyFire.shouldSpawn && this.isOnScreen(enemy)) {
```

to:

```typescript
      if (enemyFire.shouldSpawn && this.isOnScreen(enemy) && this.runPhase !== 'clearing') {
```

- [ ] **Step 8: Type-check and test**

Run: `pnpm build && pnpm test`
Expected: both PASS, 209 tests.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "Stop the field at 90s and sweep it away for the boss"
```

---

### Task 6: The boss descends and shoves the player down

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `spawnBoss`, `updateBoss`, `bossArrived`, `bossCenter`, `destroyBoss`, `Boss` from `scenes/dodger/boss.ts`; `bossPlayerFloor`, `playerFloorForHull` from `core/boss.ts`.
- Produces: `this.boss: Boss | null` and `this.playerFloor: number` on `GameScene`.

- [ ] **Step 1: Add the imports**

```typescript
import { bossPlayerFloor, playerFloorForHull } from '../core/boss';
import {
  bossArrived,
  bossCenter,
  destroyBoss,
  spawnBoss,
  updateBoss,
} from './dodger/boss';
import type { Boss } from './dodger/boss';
```

Merge `bossPlayerFloor` and `playerFloorForHull` into the `core/boss` import
added in Task 5 rather than writing a second import from the same module.

Import exactly these names — `noUnusedLocals` is on, so an import this task
does not use fails the build. In particular do NOT import
`bossArrivalProgress`: the floor is derived from the hull's position, not
from descent progress, so nothing in the scene calls it.

- [ ] **Step 2: Add the constant and fields**

Next to the existing `PLAYER_MIN_Y` definition, add:

```typescript
// The floor the ship is pushed down to for the boss fight, derived from the
// hull's own geometry so it cannot drift: without it there is a pocket above
// the hull where the player sits out of reach of every downward fan.
const PLAYER_BOSS_MIN_Y = bossPlayerFloor(PLAYER_SIZE, HUD_CLEARANCE);
```

In the class body, after `private runPhase!: RunPhase;`:

```typescript
  private boss: Boss | null = null;
  private playerFloor!: number;
```

- [ ] **Step 3: Reset them**

In `resetState()`, after `this.runPhase = 'field';`:

```typescript
    this.playerFloor = PLAYER_MIN_Y;
    if (this.boss) {
      destroyBoss(this.boss);
      this.boss = null;
    }
```

- [ ] **Step 4: Use the floor when steering**

In `movePlayerTo`, change:

```typescript
    const nextY = Phaser.Math.Clamp(y, PLAYER_MIN_Y, HEIGHT - half);
```

to:

```typescript
    const nextY = Phaser.Math.Clamp(y, this.playerFloor, HEIGHT - half);
```

- [ ] **Step 5: Start the arrival when the field is empty**

In `update()`, find the existing enemy-cull filter:

```typescript
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + enemy.height) {
        enemy.sprite.destroy();
        enemy.halo.destroy();
        return false;
      }
      return true;
    });
```

Immediately after it, add:

```typescript
    if (this.runPhase === 'clearing' && this.enemies.length === 0) {
      this.startBossArrival();
    }
```

- [ ] **Step 6: Write the arrival**

Add this method to `GameScene`, just before `updateLivesPill()`:

```typescript
  /** The field is gone; bring the boss in. */
  private startBossArrival(): void {
    this.runPhase = 'incoming';
    this.boss = spawnBoss(this);
    playSfx(this, 'levelup');
    this.cameras.main.flash(220, 255, 95, 126);
    this.cameras.main.shake(300, 0.006);
  }
```

- [ ] **Step 7: Drive the boss each frame**

Position matters: this block must sit **immediately after** the existing
`const firedThisFrame: EnemyBullet[] = [];` line in `update()`. Task 7 adds
the boss's shots to `firedThisFrame`, and putting the block here now means
Task 7 never has to move it.

The return value is deliberately not captured yet — `noUnusedLocals` is on,
so an unused `shots` would fail the build. Task 7 captures it.

```typescript
    if (this.boss) {
      updateBoss(this, this.boss, safeDelta, this.player.x, this.player.y);
      if (this.runPhase === 'incoming') {
        // The descending hull pushes the ship out of its space rather than
        // teleporting it: a hard switch would snap the ship up to 188px.
        //
        // The floor is read off the hull's live position, NOT interpolated
        // toward PLAYER_BOSS_MIN_Y in parallel: the descent eases
        // quadratically, so a linear floor falls behind it in mid-descent and
        // the hull overlaps the ship — a heart lost to the entrance itself.
        this.playerFloor = Math.max(
          PLAYER_MIN_Y,
          playerFloorForHull(bossCenter(this.boss).y, PLAYER_SIZE, HUD_CLEARANCE)
        );
        this.player.y = Math.max(this.player.y, this.playerFloor);
        if (bossArrived(this.boss)) {
          this.runPhase = 'boss';
          this.playerFloor = PLAYER_BOSS_MIN_Y;
        }
      }
    }
```

- [ ] **Step 8: Type-check and test**

Run: `pnpm build && pnpm test`
Expected: both PASS, 209 tests.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "Bring the boss down and push the ship clear of its hull"
```

---

### Task 7: The fight — the boss shoots, the boss takes damage

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `updateBoss` (already wired in Task 6), `bossRect`, `damageBoss` from `scenes/dodger/boss.ts`.
- Produces: nothing new; wires the boss into the three existing collision passes.

- [ ] **Step 1: Extend the boss import**

Add `bossRect` and `damageBoss` to the existing `./dodger/boss` import from Task 6.

- [ ] **Step 2: Feed the boss's shots into enemyBullets**

Task 6 already put the boss block in the right place — directly after
`const firedThisFrame: EnemyBullet[] = [];`. Now capture the return value and
materialise the shots. Change the block's first line from
`updateBoss(this, …);` to `const shots = updateBoss(this, …);` and add the
loop at the end of the block, so it reads:

```typescript
    if (this.boss) {
      const shots = updateBoss(this, this.boss, safeDelta, this.player.x, this.player.y);
      if (this.runPhase === 'incoming') {
        // The descending hull pushes the ship out of its space rather than
        // teleporting it: a hard switch would snap the ship up to 188px.
        //
        // The floor is read off the hull's live position, NOT interpolated
        // toward PLAYER_BOSS_MIN_Y in parallel: the descent eases
        // quadratically, so a linear floor falls behind it in mid-descent and
        // the hull overlaps the ship — a heart lost to the entrance itself.
        this.playerFloor = Math.max(
          PLAYER_MIN_Y,
          playerFloorForHull(bossCenter(this.boss).y, PLAYER_SIZE, HUD_CLEARANCE)
        );
        this.player.y = Math.max(this.player.y, this.playerFloor);
        if (bossArrived(this.boss)) {
          this.runPhase = 'boss';
          this.playerFloor = PLAYER_BOSS_MIN_Y;
        }
      }
      for (const shot of shots) {
        const rect = this.add.rectangle(
          shot.x,
          shot.y,
          ENEMY_BULLET_SIZE,
          ENEMY_BULLET_SIZE,
          PALETTE.amber
        );
        rect.setDepth(DEPTH.world);
        // Joins firedThisFrame, not enemyBullets, for the same reason the
        // enemies' shots do: a bullet born this frame postdates the player's
        // drag and must not be tested against that historical path.
        firedThisFrame.push({ rect, vx: shot.vx, vy: shot.vy });
      }
    }
```

- [ ] **Step 3: Let player bullets hit the boss**

In the `this.playerBullets = this.playerBullets.filter(...)` pass, after the
`if (target) { … }` block closes and *before* the off-screen discard
(`if (bullet.y < -PLAYER_BULLET_HEIGHT)`), insert:

```typescript
      // The boss is checked after ordinary enemies so a bullet never damages
      // both in one frame. Only once it is on station: shooting it out of
      // the sky during its entrance would rob the arrival of its beat.
      if (this.boss && this.runPhase === 'boss' && intersects(bulletSwept, bossRect(this.boss))) {
        bullet.destroy();
        if (damageBoss(this, this.boss, 1)) {
          this.triggerWin();
        }
        return false;
      }
```

- [ ] **Step 4: Make the hull solid**

After the existing "enemy's fall happens after the player has settled" block:

```typescript
    if (!collided) {
      collided = this.enemies.some((enemy) => {
        const rect = this.enemyRect(enemy);
        return intersects(playerRect, sweepY(rect, rect.y - fallDistance));
      });
    }
```

add:

```typescript
    // Ramming the hull costs a heart. Tested against the player's swept path
    // as the enemies are, so a fast drag into the boss cannot tunnel through
    // it. Live from the moment it appears — a descending hull that the ship
    // could sit inside would look broken.
    if (!collided && this.boss) {
      collided = movingRectHitsRect(prevPlayerRect, playerRect, bossRect(this.boss));
    }
```

- [ ] **Step 5: Stub the win so this compiles**

Add to `GameScene`, just before `triggerGameOver()` (Task 8 fills it in):

```typescript
  private triggerWin(): void {
    this.state = 'gameOver';
  }
```

- [ ] **Step 6: Type-check and test**

Run: `pnpm build && pnpm test`
Expected: both PASS, 209 tests.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "Wire the boss into the fight: its fans, its hull, its health"
```

---

### Task 8: Winning

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `BOSS_KILL_POINTS` from `core/boss.ts`; the existing `overlay.show(title, statLabel, statValue)`.
- Produces: `GameState` gains `'won'`.

- [ ] **Step 1: Extend GameState**

```typescript
type GameState = 'playing' | 'gameOver' | 'won';
```

- [ ] **Step 2: Arm the overlay for a win too**

In `create()`, the overlay is built with:

```typescript
      isArmed: () => this.state === 'gameOver' && this.overlayShown,
```

Change it to:

```typescript
      isArmed: () => this.state !== 'playing' && this.overlayShown,
```

- [ ] **Step 3: Add BOSS_KILL_POINTS to the core/boss import**

- [ ] **Step 4: Write the real triggerWin**

Replace the Task 7 stub with:

```typescript
  private triggerWin(): void {
    this.state = 'won';
    this.runPhase = 'boss';
    fadeOutMusic(this);
    playSfx(this, 'explode');
    playSfx(this, 'milestone');

    this.scoreState = addPoints(this.scoreState, BOSS_KILL_POINTS);
    this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);

    const boss = this.boss;
    if (boss) {
      const { x, y } = bossCenter(boss);
      const burst = this.add.particles(x, y, TEX.spark, {
        speed: { min: 120, max: 460 },
        lifespan: { min: 400, max: 900 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [PALETTE.rose, PALETTE.amber, PALETTE.text],
        blendMode: 'ADD',
        emitting: false,
      });
      burst.setDepth(DEPTH.effects);
      burst.explode(48);
      this.time.delayedCall(1200, () => burst.destroy());
      destroyBoss(boss);
      this.boss = null;
    }

    this.cameras.main.shake(420, 0.016);
    this.cameras.main.flash(260, 255, 95, 126);
    // The ship survives and the floor is released, so the win reads as the
    // player being left alone on a clear screen.
    this.playerFloor = PLAYER_MIN_Y;

    // Let the explosion read before the card covers it, as GAME OVER does.
    this.time.delayedCall(700, () => {
      if (this.state !== 'won') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('YOU WIN', 'Score', `${getScoreValue(this.scoreState)}`);
    });
  }
```

- [ ] **Step 5: Confirm the boss import needs nothing new**

`bossCenter` and `destroyBoss` were both imported in Task 6. Only
`BOSS_KILL_POINTS` (Step 3) is new here.

- [ ] **Step 6: Stop the boss's bullets from outliving the win**

`update()` returns early unless `state === 'playing'`, so a win freezes the
world with bullets mid-flight behind the card. That matches how GAME OVER
already behaves, so no change is needed — but confirm it by reading the guard
at the top of `update()`.

- [ ] **Step 7: Type-check and test**

Run: `pnpm build && pnpm test`
Expected: both PASS, 209 tests.

- [ ] **Step 8: Verify in a real browser**

The scene behaviour has no unit tests by design — the whole fight is Phaser.
Run `pnpm dev` and drive it in a **visible** Chrome window (a hidden window
throttles Phaser's RAF to ~1fps and the game will look frozen).

To avoid waiting 90 s per attempt, temporarily set `BOSS_TIME_MS` to `8_000`
in `src/core/boss.ts`, and **revert it before committing**.

Confirm each of these:
- At the trigger, spawning stops and the remaining enemies visibly accelerate off the bottom within ~4 s.
- The departing enemies stop firing.
- The boss descends, and the ship is pushed down smoothly rather than snapping.
- The ship cannot get above the hull.
- The health bar sits below the score/hearts pills, is not covered by the ship, and drains as you shoot.
- The hull brightens and the camera shakes at the two phase changes; the fan widens from 3 to 5.
- In phase 3 one shot per ~2.2 s tracks the ship.
- Ramming the hull costs a heart.
- Killing it shows `YOU WIN` with the score including +1000.
- `PLAY AGAIN` restarts a clean run: no boss, no health bar, ship free to the top again.
- Dying to the boss shows the ordinary `GAME OVER`.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "Win the run by killing the boss"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| 90 s trigger | 5 |
| Spawning stops, field sweeps at 3× | 5 |
| Departing enemies stop firing | 5 |
| 1200 ms descent, invulnerable and silent | 4, 6 |
| 45 HP, three 15-hit phases | 1 |
| Phase slide periods / fans / intervals | 1, 4 |
| Phase-3 aimed shot | 1, 4 |
| Cosine-eased slide, bounds 131–299 | 2, 4 |
| Bullets at 150 px/s from the hull's bottom edge | 4 |
| Ramming costs a heart | 7 |
| Ship floor 298, eased over the descent | 2, 6, 7 |
| Health bar at y 82 under the pills | 4 |
| Hearts carry over, no refill | — (no code: nothing refills them today) |
| +1000 and a `YOU WIN` card | 8 |
| Ordinary GAME OVER on defeat, no boss retry | — (no code: the existing path already does this) |
| `dodger` music kept, `levelup` on arrival | 6 |
| `resetState()` clears boss, bullets, floor, phase | 5, 6 |

**Type consistency:** `Boss`, `BossShot`, `BossPhase` and every function name
used in Tasks 5–8 are defined in Tasks 1–4. `spawnBoss`/`updateBoss`/
`bossArrived`/`bossArrivalProgress`/`bossRect`/`bossCenter`/`damageBoss`/
`destroyBoss` are spelled identically in their definition and at each call.

**Two ordering hazards, both handled explicitly:** the boss update must sit
after `firedThisFrame` is declared, so Task 6 Step 7 places it there from the
start rather than having Task 7 move it; and the boss's damage check must sit
after the ordinary-enemy `find` so one bullet cannot damage two things
(Task 7 Step 3).

**One `noUnusedLocals` trap defused:** the project compiles with
`noUnusedLocals: true`, so Task 6 calls `updateBoss(...)` without binding its
result and Task 7 introduces the `const shots =` binding at the same moment it
starts using it. Binding it early would fail `pnpm build` at the end of
Task 6.
