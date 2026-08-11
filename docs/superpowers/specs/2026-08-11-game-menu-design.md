# Game Menu — Design Spec

## Summary

Introduces a game-selection menu as the app's entry point. Today `GameScene` (the vertical dodger) auto-starts directly; this spec adds a `MenuScene` that starts first, lists the available game(s), and launches the picked one via Phaser's scene system. Only one game (the dodger) exists today, but the menu is structured so adding a second game later is a small, additive change — not a rewrite.

## Architecture

Phaser already models the app as a single-canvas state machine (one active Scene at a time, driven by `this.scene.start()`); this reuses that pattern rather than introducing a router or separate page.

- **`src/games.ts`** (new): a static registry of available games, e.g. `[{ title: 'Dodger', sceneKey: 'GameScene' }]`. Adding a future game means appending an entry here and registering its Scene class in `main.ts`'s scene list — no other menu code changes.
- **`src/scenes/MenuScene.ts`** (new): renders a title and one tappable button per entry in `games.ts`, stacked vertically. Tapping a button calls `this.scene.start(sceneKey)`.
- **`src/main.ts`**: `MenuScene` is added to the `scene` array *before* `GameScene`, so Phaser auto-starts it as the initial scene (unchanged otherwise).

## Menu Screen (`MenuScene`)

Visual style matches the existing minimal placeholder look (flat-colored rectangles, black text, no sprites) rather than introducing new asset conventions.

- A centered title text near the top (e.g. `"mouse2"`).
- One button per `games.ts` entry: a rectangle GameObject with the game's `title` centered on it, `setInteractive()` + `pointerdown` → `this.scene.start(sceneKey)`. With a single entry today, this renders as one centered button; the layout stacks additional entries vertically below it, so a second game drops in without a layout rewrite.
- No keyboard navigation, animations/transitions, icons, or per-game preview art — tap targets are plain labeled rectangles, consistent with the dodger's own placeholder graphics.

## Game Over Screen (`GameScene` changes)

Currently, `gameOverText` shows `"Game Over\nScore: N\nTap to Restart"` as one block, and *any* tap on the canvas restarts (`handlePointerDown` calls `this.restart()` unconditionally while `state === 'gameOver'`). This is split into distinct, independently-tappable actions:

- `gameOverText`: shows `"Game Over\nScore: N"` only (no longer interactive, purely informational).
- A `"Tap to Restart"` text button: `setInteractive()` + `pointerdown` → `this.restart()` (same reset behavior as today).
- A `"Back to Menu"` text button: `setInteractive()` + `pointerdown` → `this.scene.start('MenuScene')`.
- The scene-wide `handlePointerDown` listener no longer restarts on an arbitrary tap during `gameOver` — input is handled entirely by the two buttons now, so tapping one doesn't also trigger the other.

## State Reset Fix (`GameScene`)

`create()` currently only runs once per app load, so `scoreState`, `spawnerState`, `obstacles`, and `prevPlayerX` are effectively initialized only via field initializers (run once, at construction) or via the manual `restart()` method (run on in-place restart). Once the menu can route into `GameScene` repeatedly — Menu → play → die → Menu → play again — Phaser reuses the same `GameScene` instance and re-runs `create()` on every `scene.start('GameScene')`, but without a fix, stale state (old score, destroyed obstacle references, previous player position) would leak into the new run.

Fix: extract the reset logic (score/spawner/obstacles/`prevPlayerX`/player position) into a single method used by both `create()` and `restart()`, so every fresh entry into the scene — whether from the menu or an in-place restart — starts from a clean state.

## Testing Strategy

Consistent with `GameScene`'s existing convention (and the prior decision to keep trivial Phaser glue out of the unit-tested `core/` layer): `MenuScene` and the `GameScene` changes are plain Phaser glue with no non-trivial pure logic to extract, so they're verified manually via `pnpm dev` rather than unit tested. Manual check covers: menu loads first, tapping the Dodger button starts the game, dying shows both buttons working independently (Restart resets in place; Menu returns to the menu), and playing a second round after returning from the menu starts with a clean score/board (validates the state-reset fix). `src/core/*` tests are unaffected.

## Out of Scope

- A second actual game — only the registry/menu structure is built now; `games.ts` still lists just the dodger.
- Scene transition animations/fades.
- Keyboard/arrow-key menu navigation (touch/tap only, consistent with the iPhone focus).
- A pause or back-to-menu affordance during active gameplay (only reachable from the Game Over screen, per prior decision).
- High-score display or persistence on the menu.
