# Landscape Orientation Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause the dodger game and show a "rotate your device" overlay whenever the viewport is portrait (taller than wide), so the game is only played in its unshrunk landscape form.

**Architecture:** A pure `isPortrait(width, height)` function in `src/core/` decides portrait vs. landscape. `main.ts` wires a `resize`/`orientationchange` listener that calls this function and, on every change, toggles a full-screen overlay `<div>` in `index.html` and calls Phaser's `game.scene.pause('GameScene')` / `resume('GameScene')` — which freezes the entire scene `update()` loop (score, spawner, physics), not just Arcade Physics.

**Tech Stack:** TypeScript, Vite, Phaser 3 (Arcade Physics), Vitest, pnpm.

## Global Constraints

- Red/green TDD for all `src/core/` logic: write the failing test first, then the minimal implementation (per project CLAUDE.md).
- Package manager is pnpm — use `pnpm test`, `pnpm dev`, etc.
- No new image assets — overlay icon/text is CSS/unicode only, consistent with the game's rectangle-only visuals.
- `GameScene`'s Phaser scene key is `'GameScene'` (see `src/scenes/GameScene.ts:43`, `super('GameScene')`) — must match exactly in `game.scene.pause('GameScene')` / `resume('GameScene')` calls.

---

### Task 1: `isPortrait` core logic

**Files:**
- Create: `src/core/orientation.ts`
- Test: `src/core/__tests__/orientation.test.ts`

**Interfaces:**
- Produces: `isPortrait(width: number, height: number): boolean` — returns `true` when `height > width` (portrait), `false` otherwise (landscape, including the square case where `width === height`).

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/orientation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isPortrait } from '../orientation';

describe('isPortrait', () => {
  it('returns true when height is greater than width', () => {
    expect(isPortrait(400, 800)).toBe(true);
  });

  it('returns false when width is greater than height', () => {
    expect(isPortrait(800, 400)).toBe(false);
  });

  it('returns false when width equals height (square)', () => {
    expect(isPortrait(500, 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/__tests__/orientation.test.ts`
Expected: FAIL — `Cannot find module '../orientation'` (or similar module-not-found error).

- [ ] **Step 3: Write minimal implementation**

Create `src/core/orientation.ts`:

```typescript
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/__tests__/orientation.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/orientation.ts src/core/__tests__/orientation.test.ts
git commit -m "feat: add isPortrait orientation check"
```

---

### Task 2: Rotate-device overlay and pause/resume wiring

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `isPortrait(width: number, height: number): boolean` from Task 1 (`src/core/orientation.ts`).
- Consumes: Phaser scene key `'GameScene'` (see Global Constraints).

- [ ] **Step 1: Add the overlay markup and CSS to `index.html`**

Modify `index.html` — add the overlay CSS inside the existing `<style>` block, and the overlay markup right after `<div id="app"></div>`:

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

      #rotate-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #000;
        color: #fff;
        font-family: sans-serif;
        text-align: center;
      }

      #rotate-overlay.visible {
        display: flex;
      }

      .rotate-overlay__icon {
        font-size: 64px;
        margin-bottom: 16px;
      }

      .rotate-overlay__message {
        font-size: 20px;
        margin: 0;
        padding: 0 24px;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="rotate-overlay">
      <div class="rotate-overlay__icon">&#8635;</div>
      <p class="rotate-overlay__message">Rotate your device to play</p>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Wire the resize listener and pause/resume in `main.ts`**

Modify `src/main.ts`:

```typescript
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { WIDTH, HEIGHT } from './gameConfig';
import { isPortrait } from './core/orientation';

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
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
    },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);
const rotateOverlay = document.getElementById('rotate-overlay')!;

function updateOrientation(): void {
  const portrait = isPortrait(window.innerWidth, window.innerHeight);
  rotateOverlay.classList.toggle('visible', portrait);
  if (portrait) {
    game.scene.pause('GameScene');
  } else {
    game.scene.resume('GameScene');
  }
}

game.events.once(Phaser.Core.Events.READY, () => {
  updateOrientation();
  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', updateOrientation);
});
```

`updateOrientation` and the listeners are registered inside the `READY` event handler (fired once Phaser finishes booting and `GameScene` has started) so `game.scene.pause('GameScene')`/`resume('GameScene')` never run before the scene exists.

- [ ] **Step 3: Manually verify in the browser**

Run: `pnpm dev`, open the printed local URL in a browser.

1. Open browser devtools, enable the device toolbar, select a portrait phone preset (e.g. 390×844).
   Expected: the "Rotate your device to play" overlay covers the screen immediately; the game underneath is not visible/interactive.
2. Let a few seconds pass, then switch the device toolbar to a landscape preset (e.g. 844×390).
   Expected: the overlay disappears, the game is visible and playable (jumping via tap/click/Space works), and the score continues from where the game actually was (not reset) — since it was frozen, not restarted, while portrait.
3. Trigger a game over (let an obstacle hit the player), then switch to portrait and back to landscape.
   Expected: overlay shows/hides correctly, and the "Game Over" screen is still showing after returning to landscape (state preserved, not reset).
4. Resize the plain desktop browser window (not device toolbar) to be taller than wide.
   Expected: overlay shows even in desktop mode, confirming the universal viewport check (not device/touch-only).

- [ ] **Step 4: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: pause game and show rotate-device overlay in portrait"
```
