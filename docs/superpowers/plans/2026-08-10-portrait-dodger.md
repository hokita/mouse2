# Portrait Dodger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the game from a landscape side-scrolling jump-dodger to a portrait, iPhone-focused vertical dodger — obstacles fall from the top, the player drags left/right along the bottom to avoid them.

**Architecture:** `GameScene` becomes drag-controlled and gravity-free: the player's `x` follows the pointer directly (no easing), obstacles fall straight down at a constant speed, and both are plain Phaser rectangles with hand-updated positions each frame — no Arcade Physics. `score.ts`, `spawner.ts`, and `collision.ts` under `src/core/` are axis-agnostic and are reused completely unchanged.

**Tech Stack:** TypeScript, Vite, Phaser 3 (no physics plugin), Vitest, pnpm. No image assets — rectangles only.

## Global Constraints

- Package manager: pnpm (all commands in this plan use `pnpm`).
- Canvas size: `430x932` (portrait, ratio ≈ 0.461 — matches iPhone 14/15 Pro Max logical points). Target device is iPhone, portrait orientation.
- Scaling: unchanged — Phaser `Scale.FIT` with `autoCenter: CENTER_BOTH`. No orientation lock or rotate-prompt; any other viewport just gets letterboxed/pillarboxed.
- Input: pointer/touch drag only. No keyboard input (out of scope per the design spec).
- `src/core/score.ts`, `src/core/spawner.ts`, `src/core/collision.ts` are unchanged — no new pure logic needed, existing Vitest coverage stays valid as-is.
- `src/scenes/GameScene.ts` is glue code, not unit tested — verified by running the app.
- No Arcade Physics: `GameScene.ts` advances every game object's position by hand each frame using `delta`.

---

## Task 1: Portrait Canvas, Drag-Controlled Player, and Falling Obstacles

**Files:**
- Modify: `src/gameConfig.ts`
- Modify: `src/main.ts`
- Modify: `src/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `createScore`, `tickScore`, `getScoreValue` from `src/core/score.ts`; `createSpawner`, `tickSpawner` from `src/core/spawner.ts`; `intersects`, `Rect` from `src/core/collision.ts` — all unchanged, already present in the codebase.
- Produces: `WIDTH = 430`, `HEIGHT = 932` from `src/gameConfig.ts`; a `GameScene` with no Arcade Physics, a drag-controlled `player` (`Phaser.GameObjects.Rectangle`), and falling `obstacles` (`Phaser.GameObjects.Rectangle[]`). Task 2 consumes none of these directly — it only interacts with the running app through the browser.

- [ ] **Step 1: Update `src/gameConfig.ts`**

Replace its contents:

```ts
export const WIDTH = 430;
export const HEIGHT = 932;
```

- [ ] **Step 2: Update `src/main.ts` to drop the Arcade Physics config**

Replace its contents:

```ts
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { WIDTH, HEIGHT } from './gameConfig';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

new Phaser.Game(config);
```

- [ ] **Step 3: Rewrite `src/scenes/GameScene.ts`**

Replace its entire contents:

```ts
import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { WIDTH, HEIGHT } from '../gameConfig';

const PLAYER_SIZE = 40;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;
// Caps how much sim time a single frame advances score/spawn/obstacle-fall
// timing by. At the cap, an obstacle falls OBSTACLE_SPEED * (MAX_DELTA_MS /
// 1000) = 30px in one step — well under the player/obstacle size, so a long
// stalled frame (e.g. a backgrounded tab) can't let an obstacle skip past
// the player without ever overlapping it.
const MAX_DELTA_MS = 100;

type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private state: GameState = 'playing';

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.player = this.add.rectangle(WIDTH / 2, PLAYER_Y, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

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
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);

    this.scoreState = tickScore(this.scoreState, safeDelta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    const fallDistance = OBSTACLE_SPEED * (safeDelta / 1000);
    for (const obstacle of this.obstacles) {
      obstacle.y += fallDistance;
    }

    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.toRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.y > HEIGHT + OBSTACLE_HEIGHT) {
        obstacle.destroy();
        return false;
      }
      return true;
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.movePlayerTo(pointer.x);
    } else {
      this.restart();
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !pointer.isDown) {
      return;
    }
    this.movePlayerTo(pointer.x);
  }

  private movePlayerTo(x: number): void {
    const half = PLAYER_SIZE / 2;
    this.player.x = Phaser.Math.Clamp(x, half, WIDTH - half);
  }

  private spawnObstacle(): void {
    const half = OBSTACLE_WIDTH / 2;
    const x = Phaser.Math.Between(half, WIDTH - half);
    const obstacle = this.add.rectangle(x, -OBSTACLE_HEIGHT, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, 0xff0000);
    this.obstacles.push(obstacle);
  }

  private toRect(obj: Phaser.GameObjects.Rectangle): Rect {
    const bounds = obj.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
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
    this.player.x = WIDTH / 2;
  }
}
```

- [ ] **Step 4: Run the unit test suite**

Run: `pnpm test`
Expected: all `src/core/__tests__/*` tests still pass (score, spawner, collision — unchanged, 13 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/gameConfig.ts src/main.ts src/scenes/GameScene.ts
git commit -m "feat: rework game as a portrait, drag-controlled vertical dodger"
```

---

## Task 2: Manual Playtest (Final Verification)

**Files:** none (no code changes — verification only)

**Interfaces:** N/A

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` and open the printed local URL (e.g. `http://localhost:5173`) in a browser.

- [ ] **Step 2: Verify the portrait canvas renders**

A tall portrait canvas (sky-blue background) appears, letterboxed/pillarboxed to fit the browser window. A green player square sits near the bottom-center. "Score: 0" is visible top-left. No "rotate your device" prompt appears at any window size.

- [ ] **Step 3: Verify drag control**

Press and hold the mouse button (or touch, on a real device) on the canvas and move left/right. The player square should snap to the pointer's horizontal position on press and keep following it while held, staying fully on-screen (never moving past the left/right edges) even when dragging past them.

- [ ] **Step 4: Verify falling obstacles, collision, and restart**

Red obstacle rectangles should spawn from random horizontal positions above the top edge and fall straight down at a steady speed. The score should increase while playing. Let (or steer into) an obstacle hit the player — movement should freeze and "Game Over", the final score, and "Tap to Restart" should appear. Click/tap the canvas to confirm it resets the player to center, clears obstacles, resets the score to 0, and resumes play.

- [ ] **Step 5: Verify on a real portrait viewport**

Using the browser's device toolbar (or an actual iPhone), set the viewport to a real portrait phone size (e.g. 390×844 or similar) and confirm the canvas fills it correctly with no distortion, and that touch drag/tap works the same as with the mouse.

- [ ] **Step 6: Check the browser console**

Confirm no errors or exceptions were logged during steps 2-5.

- [ ] **Step 7: Stop the dev server**

Stop the `pnpm dev` process (Ctrl+C).
