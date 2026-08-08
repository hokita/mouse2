# Dodger Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-button endless runner/dodger game (TypeScript + Vite + Phaser 3) where the player jumps over scrolling obstacles, with a score, game-over screen, and restart.

**Architecture:** A single Phaser `GameScene` renders and drives input/physics. All game rules that don't need Phaser (scoring, obstacle spawn timing, collision detection) live as pure, unit-tested TypeScript functions under `src/core/`, built with red/green TDD. `GameScene` is thin glue code that calls into `src/core/` each frame and reacts to the results.

**Tech Stack:** TypeScript, Vite (`vanilla-ts`-style manual setup), Phaser 3 (Arcade Physics), Vitest, pnpm. No image assets — all game objects are colored rectangles.

## Global Constraints

- Package manager: pnpm (all commands in this plan use `pnpm`).
- TypeScript `strict: true`, `noUnusedLocals`/`noUnusedParameters` enabled.
- No image/sprite assets — game objects are Phaser rectangles.
- `src/core/*` must have zero imports from `phaser` and must be covered by Vitest unit tests written test-first (red/green TDD).
- `src/scenes/GameScene.ts` is glue code, not unit tested — verified by running the app.
- Canvas size: 800x400 (landscape). Target device is a smartphone in landscape orientation; no portrait layout.
- Scaling: Phaser `Scale.FIT` with `autoCenter: CENTER_BOTH` so the 800x400 canvas fills the device viewport; `index.html` sets a non-zoomable viewport meta tag and disables touch scrolling/bounce via CSS.
- Input is tap/click/Space — Phaser's `pointerdown` event already covers both mouse and touch, so no separate touch-handling code is needed.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working Vite + TypeScript + Phaser project with `pnpm dev` and `pnpm build` both working, and `pnpm test` runnable via Vitest. Later tasks add files under `src/core/` and `src/scenes/` and import `Phaser` the same way `src/main.ts` does here.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mouse2",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({});
```

- [ ] **Step 4: Create `index.html`**

This game targets smartphones in landscape orientation, scaled to fill the device viewport, so the viewport meta tag disables pinch-zoom and the inline CSS disables touch scrolling/bounce/callouts:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Dodger Game</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        overscroll-behavior: none;
        touch-action: none;
        background: #000;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/main.ts`**

The game's internal resolution stays 800x400 (landscape), but `Phaser.Scale.FIT` scales that canvas to fill the actual device viewport while preserving aspect ratio:

```ts
import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 400,
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
    },
  },
  scene: {},
};

new Phaser.Game(config);
```

- [ ] **Step 6: Update `.gitignore`**

A `.gitignore` already exists in this repo (with a `.superpowers/` entry from workspace setup — leave that line as-is). Append these two lines to it:

```
node_modules
dist
```

- [ ] **Step 7: Install dependencies**

Run: `pnpm install`
Expected: lockfile (`pnpm-lock.yaml`) created, no errors.

- [ ] **Step 8: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors, `dist/` produced.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts index.html src/main.ts .gitignore
git commit -m "chore: scaffold Vite + TypeScript + Phaser project"
```

---

## Task 2: Core Logic — Collision Detection

**Files:**
- Create: `src/core/collision.ts`
- Test: `src/core/__tests__/collision.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `function intersects(a: Rect, b: Rect): boolean` — AABB overlap check using top-left `x`/`y` coordinates.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/collision.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { intersects } from '../collision';

describe('intersects', () => {
  it('returns true when rectangles overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(true);
  });

  it('returns false when rectangles do not overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 20, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(false);
  });

  it('returns false when rectangles only touch at an edge', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(false);
  });

  it('is symmetric regardless of argument order', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(intersects(b, a));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/__tests__/collision.test.ts`
Expected: FAIL — cannot find module `../collision`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/collision.ts`:

```ts
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/core/__tests__/collision.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/collision.ts src/core/__tests__/collision.test.ts
git commit -m "feat: add AABB collision detection"
```

---

## Task 3: Core Logic — Score

**Files:**
- Create: `src/core/score.ts`
- Test: `src/core/__tests__/score.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface ScoreState { elapsedMs: number }`
  - `function createScore(): ScoreState`
  - `function tickScore(state: ScoreState, dt: number): ScoreState` — returns a new state with `elapsedMs` increased by `dt` (milliseconds).
  - `function getScoreValue(state: ScoreState): number` — `Math.floor(elapsedMs / 100)`.

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createScore, tickScore, getScoreValue } from '../score';

describe('score', () => {
  it('starts at zero', () => {
    const state = createScore();
    expect(getScoreValue(state)).toBe(0);
  });

  it('increases as time elapses', () => {
    let state = createScore();
    state = tickScore(state, 250);
    expect(getScoreValue(state)).toBe(2);
  });

  it('accumulates elapsed time across multiple ticks', () => {
    let state = createScore();
    state = tickScore(state, 60);
    state = tickScore(state, 60);
    expect(getScoreValue(state)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/__tests__/score.test.ts`
Expected: FAIL — cannot find module `../score`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/score.ts`:

```ts
export interface ScoreState {
  elapsedMs: number;
}

export function createScore(): ScoreState {
  return { elapsedMs: 0 };
}

export function tickScore(state: ScoreState, dt: number): ScoreState {
  return { elapsedMs: state.elapsedMs + dt };
}

export function getScoreValue(state: ScoreState): number {
  return Math.floor(state.elapsedMs / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/core/__tests__/score.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/score.ts src/core/__tests__/score.test.ts
git commit -m "feat: add survival-time score tracking"
```

---

## Task 4: Core Logic — Obstacle Spawner

**Files:**
- Create: `src/core/spawner.ts`
- Test: `src/core/__tests__/spawner.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface SpawnerState { minInterval: number; maxInterval: number; timer: number; nextInterval: number }`
  - `function createSpawner(minInterval: number, maxInterval: number, random?: () => number): SpawnerState`
  - `function tickSpawner(state: SpawnerState, dt: number, random?: () => number): { state: SpawnerState; shouldSpawn: boolean }`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/spawner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSpawner, tickSpawner } from '../spawner';

describe('spawner', () => {
  it('does not spawn before the interval elapses', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 300);
    expect(result.shouldSpawn).toBe(false);
  });

  it('spawns once the interval has elapsed', () => {
    let state = createSpawner(500, 500);
    let result = tickSpawner(state, 300);
    state = result.state;
    result = tickSpawner(state, 300);
    expect(result.shouldSpawn).toBe(true);
  });

  it('resets the timer after spawning', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 600);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.timer).toBe(0);
  });

  it('picks the minimum interval when random() returns 0', () => {
    const state = createSpawner(100, 200, () => 0);
    expect(state.nextInterval).toBe(100);
  });

  it('picks the maximum interval when random() returns 1', () => {
    const state = createSpawner(100, 200, () => 1);
    expect(state.nextInterval).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/__tests__/spawner.test.ts`
Expected: FAIL — cannot find module `../spawner`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/spawner.ts`:

```ts
export interface SpawnerState {
  minInterval: number;
  maxInterval: number;
  timer: number;
  nextInterval: number;
}

function randomInterval(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

export function createSpawner(
  minInterval: number,
  maxInterval: number,
  random: () => number = Math.random
): SpawnerState {
  return {
    minInterval,
    maxInterval,
    timer: 0,
    nextInterval: randomInterval(minInterval, maxInterval, random),
  };
}

export function tickSpawner(
  state: SpawnerState,
  dt: number,
  random: () => number = Math.random
): { state: SpawnerState; shouldSpawn: boolean } {
  const timer = state.timer + dt;
  if (timer >= state.nextInterval) {
    return {
      state: {
        ...state,
        timer: 0,
        nextInterval: randomInterval(state.minInterval, state.maxInterval, random),
      },
      shouldSpawn: true,
    };
  }
  return { state: { ...state, timer }, shouldSpawn: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/core/__tests__/spawner.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/spawner.ts src/core/__tests__/spawner.test.ts
git commit -m "feat: add randomized obstacle spawn timer"
```

---

## Task 5: GameScene — World, Player, Jump

**Files:**
- Create: `src/scenes/GameScene.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing from `core/` yet
- Produces: a `GameScene` class (default export not used; named export `GameScene`) registered in `main.ts`'s Phaser config, establishing the `PhysicsRect` type alias and constants (`WIDTH`, `GROUND_Y`, `GROUND_HEIGHT`, `PLAYER_SIZE`, `PLAYER_START_X`, `JUMP_VELOCITY`) that later tasks extend.

- [ ] **Step 1: Create `src/scenes/GameScene.ts`**

```ts
import Phaser from 'phaser';

const WIDTH = 800;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.jump());
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }
}
```

- [ ] **Step 2: Update `src/main.ts` to use `GameScene`**

Replace the contents of `src/main.ts`:

```ts
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 400,
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
```

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts src/main.ts
git commit -m "feat: add player, ground, and jump input to GameScene"
```

---

## Task 6: GameScene — Score Display

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `createScore(): ScoreState`, `tickScore(state, dt): ScoreState`, `getScoreValue(state): number` from `src/core/score.ts` (Task 3)
- Produces: `scoreText` field and score-ticking wired into `update()`, which Task 8 will later gate on game state.

- [ ] **Step 1: Replace `src/scenes/GameScene.ts` with score wiring added**

```ts
import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue, ScoreState } from '../core/score';

const WIDTH = 800;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private scoreState: ScoreState = createScore();
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.jump());

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: display survival-time score in GameScene"
```

---

## Task 7: GameScene — Obstacle Spawning and Movement

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `createSpawner(min, max): SpawnerState`, `tickSpawner(state, dt): { state, shouldSpawn }` from `src/core/spawner.ts` (Task 4)
- Produces: `obstacles: PhysicsRect[]` field, populated/moved/cleaned up each frame; consumed by Task 8's collision check.

- [ ] **Step 1: Replace `src/scenes/GameScene.ts` with obstacle spawning added**

```ts
import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue, ScoreState } from '../core/score';
import { createSpawner, tickSpawner, SpawnerState } from '../core/spawner';

const WIDTH = 800;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: PhysicsRect[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.jump());

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, delta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    }
    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }

  private spawnObstacle(): void {
    const obstacle = this.physics.add.existing(
      this.add.rectangle(
        WIDTH + OBSTACLE_WIDTH,
        GROUND_Y - OBSTACLE_HEIGHT / 2,
        OBSTACLE_WIDTH,
        OBSTACLE_HEIGHT,
        0xff0000
      )
    ) as PhysicsRect;
    obstacle.body.setAllowGravity(false);
    this.obstacles.push(obstacle);
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: spawn and move obstacles in GameScene"
```

---

## Task 8: GameScene — Collision Detection and Game Over State

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `intersects(a: Rect, b: Rect): boolean` from `src/core/collision.ts` (Task 2)
- Produces: `state: 'playing' | 'gameOver'` field. When `'gameOver'`, score/spawn/obstacle-movement no longer advance and player/obstacle velocities are frozen. Task 9 consumes this `state` field and adds the restart transition back to `'playing'`.

- [ ] **Step 1: Replace `src/scenes/GameScene.ts` with collision detection added**

```ts
import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue, ScoreState } from '../core/score';
import { createSpawner, tickSpawner, SpawnerState } from '../core/spawner';
import { intersects, Rect } from '../core/collision';

const WIDTH = 800;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: PhysicsRect[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;
  private state: GameState = 'playing';

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.jump());

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }

    if (this.state !== 'playing') {
      return;
    }

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, delta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    }
    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });

    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.toRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }
  }

  private jump(): void {
    if (this.state !== 'playing') {
      return;
    }
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }

  private spawnObstacle(): void {
    const obstacle = this.physics.add.existing(
      this.add.rectangle(
        WIDTH + OBSTACLE_WIDTH,
        GROUND_Y - OBSTACLE_HEIGHT / 2,
        OBSTACLE_WIDTH,
        OBSTACLE_HEIGHT,
        0xff0000
      )
    ) as PhysicsRect;
    obstacle.body.setAllowGravity(false);
    this.obstacles.push(obstacle);
  }

  private toRect(obj: Phaser.GameObjects.Rectangle): Rect {
    return {
      x: obj.x - obj.width / 2,
      y: obj.y - obj.height / 2,
      width: obj.width,
      height: obj.height,
    };
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.player.body.setVelocity(0, 0);
    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(0);
    }
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: detect player/obstacle collisions and freeze on game over"
```

---

## Task 9: GameScene — Game Over Screen and Restart

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `state: GameState` and `triggerGameOver()` from Task 8
- Produces: final `GameScene` behavior — game-over text overlay and Space/click restart, completing the spec.

- [ ] **Step 1: Replace `src/scenes/GameScene.ts` with the game-over screen and restart wired in**

```ts
import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue, ScoreState } from '../core/score';
import { createSpawner, tickSpawner, SpawnerState } from '../core/spawner';
import { intersects, Rect } from '../core/collision';

const WIDTH = 800;
const HEIGHT = 400;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: PhysicsRect[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private state: GameState = 'playing';

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.handleAction());

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });

    this.gameOverText = this.add.text(WIDTH / 2, HEIGHT / 2, '', {
      fontSize: '28px',
      color: '#000000',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5, 0.5);
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.handleAction();
    }

    if (this.state !== 'playing') {
      return;
    }

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, delta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    }
    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });

    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.toRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }
  }

  private handleAction(): void {
    if (this.state === 'playing') {
      this.jump();
    } else {
      this.restart();
    }
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }

  private spawnObstacle(): void {
    const obstacle = this.physics.add.existing(
      this.add.rectangle(
        WIDTH + OBSTACLE_WIDTH,
        GROUND_Y - OBSTACLE_HEIGHT / 2,
        OBSTACLE_WIDTH,
        OBSTACLE_HEIGHT,
        0xff0000
      )
    ) as PhysicsRect;
    obstacle.body.setAllowGravity(false);
    this.obstacles.push(obstacle);
  }

  private toRect(obj: Phaser.GameObjects.Rectangle): Rect {
    return {
      x: obj.x - obj.width / 2,
      y: obj.y - obj.height / 2,
      width: obj.width,
      height: obj.height,
    };
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.player.body.setVelocity(0, 0);
    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(0);
    }
    this.gameOverText.setText(
      `Game Over\nScore: ${getScoreValue(this.scoreState)}\nTap to Restart`
    );
  }

  private restart(): void {
    this.state = 'playing';
    this.scoreState = createScore();
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.scoreText.setText('Score: 0');
    this.gameOverText.setText('');
    for (const obstacle of this.obstacles) {
      obstacle.destroy();
    }
    this.obstacles = [];
    this.player.setPosition(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2);
    this.player.body.setVelocity(0, 0);
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add game-over screen and restart"
```

---

## Task 10: Manual Playtest (Final Verification)

**Files:** none (no code changes — verification only)

**Interfaces:** N/A

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm test`
Expected: all `src/core/__tests__/*` tests pass (collision, score, spawner).

- [ ] **Step 2: Run the production build**

Run: `pnpm build`
Expected: no TypeScript errors, `dist/` produced.

- [ ] **Step 3: Start the dev server and playtest in a browser**

Run: `pnpm dev`, then open the printed local URL (e.g. `http://localhost:5173`) in a browser and verify:
- A green player square rests on a brown ground bar against a sky-blue background, with "Score: 0" top-left.
- Pressing Space, clicking, or tapping makes the player jump; it falls back down under gravity.
- Red obstacle rectangles spawn from the right at randomized intervals and scroll left.
- The score increases while playing.
- Colliding with an obstacle freezes movement and shows "Game Over", the final score, and "Tap to Restart".
- Tapping/clicking/pressing Space after game over resets the player position, clears obstacles, and resets the score to 0, resuming play.
- Using the browser's device toolbar (or an actual phone), the canvas scales to fill a landscape phone viewport without distortion, and tapping the canvas triggers jump/restart (no page scroll/zoom/bounce).

- [ ] **Step 4: Stop the dev server**

Stop the `pnpm dev` process (Ctrl+C).
