# Landscape Orientation Guard — Design Spec

## Summary

The dodger game (see [2026-08-03-dodger-game-design.md](./2026-08-03-dodger-game-design.md)) uses a fixed 800×400 (2:1 landscape) internal canvas scaled with Phaser's `FIT` mode. On a portrait phone, `FIT` letterboxes this down to a thin horizontal strip in the middle of the screen. The original spec explicitly scoped out any portrait handling.

This spec adds a lightweight orientation guard: when the viewport is taller than it is wide, the game pauses and a "please rotate your device" overlay covers the screen, so the game is only played (and only visible in its unshrunk form) in landscape.

## Approach

Two approaches were considered:

- **Hard orientation lock** (Screen Orientation API, `screen.orientation.lock('landscape')`) — rejected. It only works in fullscreen mode on Chromium/Android and isn't supported at all on iOS Safari, so it would need a portrait fallback anyway for a large share of mobile users, without actually simplifying anything.
- **Rotate-device overlay** (chosen) — detect portrait via viewport dimensions, pause the game, and show a full-screen "rotate your device" message until the viewport is landscape again. Works uniformly across all browsers/devices since it doesn't depend on any orientation-lock API.

The overlay check is a **universal viewport check** (`height > width`), not device/touch detection. This is intentionally simple: no device sniffing, and a desktop window resized narrower than tall gets the same treatment. This is a rare case in practice (desktop windows are usually wider than tall) and an acceptable minor imprecision for the simplicity gained.

## Architecture

- **`src/core/orientation.ts`** — pure function `isPortrait(width: number, height: number): boolean`, returning `height > width`. Lives under `src/core/` alongside `score.ts`/`spawner.ts`/`collision.ts` and is unit-tested with Vitest using red/green TDD, per the project's core-logic pattern (no Phaser dependency).
- **Overlay markup** — a full-screen `<div id="rotate-overlay">` added to `index.html`, hidden by default, positioned above the Phaser canvas via `z-index` so it blocks all pointer events to the game while visible. Contains a centered message + icon (CSS/unicode-drawn, no new image assets — consistent with the game's rectangle-only visuals).
- **Wiring (`main.ts`)** — not unit-tested, same rationale as `GameScene.ts` (DOM/Phaser dependency, verified manually). A `resize`/`orientationchange` listener calls `isPortrait(window.innerWidth, window.innerHeight)` and, whenever the result changes:
  - toggles the overlay's visibility, and
  - calls `game.scene.pause('GameScene')` (portrait) or `game.scene.resume('GameScene')` (landscape).

  Both actions are driven by the same `isPortrait()` result so they can't drift out of sync with each other.

  `scene.pause()`/`scene.resume()` (Phaser's Scene Manager) is used rather than `physics.pause()`, because it freezes the entire scene `update()` loop — score ticking and spawn timing included, not just Arcade Physics — matching the "pause completely" requirement below.

## Behavior

- **Load in portrait**: overlay shows immediately; the scene starts paused, so the player never sees an unpaused frame before being told to rotate.
- **Mid-game rotate landscape → portrait → landscape**: whatever state the game was in (`playing` or `gameOver`) freezes exactly as-is (obstacles, score, game-over text all frozen mid-frame) and resumes exactly where it left off on rotating back — `scene.pause()` doesn't reset any state, it only stops calling `update()`.
- **Square viewport edge case**: `height > width` is strict, so an exactly-square viewport counts as landscape (not blocked).

## Testing Strategy

- **Unit-tested (TDD)**: `src/core/orientation.ts` + `src/core/__tests__/orientation.test.ts`, covering portrait, landscape, and the square edge case.
- **Manual verification**: overlay show/hide and pause/resume wiring, checked via `pnpm dev` using browser devtools' device toolbar (simulated rotation) and manual window resizing — same manual-check approach already used for `GameScene.ts`.

## File Structure Changes

```
mouse2/
  src/
    core/
      orientation.ts
      __tests__/
        orientation.test.ts
    main.ts             # + resize/orientationchange listener, scene pause/resume wiring
  index.html             # + #rotate-overlay markup and CSS
```

## Out of Scope

- Hard orientation-lock (Screen Orientation API) and fullscreen mode
- Device/touch-capability detection (viewport check is universal, see Approach)
- PWA/installable-app packaging
- Animated rotate icon or sound
