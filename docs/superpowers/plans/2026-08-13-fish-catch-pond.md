# Fish Catch Pond Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fish Catch look like it belongs next to the menu it launches from — holes that read as holes, a pond world around them, and one light source everything agrees with — without touching a line of gameplay.

**Architecture:** All new art is `Phaser.GameObjects.Graphics` baked once into a canvas texture at scene create, exactly like every other sprite in this project. Motion is tweens and particle emitters over that baked art — no per-frame `Graphics` redraw, no shaders, because this has to hold 60fps on a phone. The Fish Catch art moves out of the shared `ui/textures.ts` into its own `ui/pondTextures.ts`, and the scenery construction moves out of `FishScene.ts` into `scenes/fish/pondBackdrop.ts`.

**Tech Stack:** TypeScript, Phaser 3.80, Vite, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-13-fish-catch-pond-design.md`

## Global Constraints

- **No image assets.** Every texture is generated with `Graphics` and `generateTexture`. The repo is deliberately asset-free.
- **Gameplay is untouched.** `HOLE_LEFT`, `HOLE_COLUMN_GAP`, `HOLE_TOP`, `HOLE_ROW_GAP`, `COLUMNS`, `ROWS`, `TAP_PAD`, `LIFT`, `LEVELS`, `RUN_MS`, `LEVEL_STEP_MS`, `POINTS`, and every `core/` module keep their current values and behaviour. If a task tempts you to change one, you have misread the task.
- **Sprite dimensions are hitboxes.** `FISH_WIDTH`, `FISH_HEIGHT`, `TRASH_WIDTH`, `TRASH_HEIGHT`, `POND_WIDTH`, `POND_HEIGHT` keep their current values (76, 52, 44, 56, 128, 64). Art may be redrawn inside those bounds; the numbers do not move.
- **Canvas is 430 x 932** (`src/gameConfig.ts`, `WIDTH` and `HEIGHT`).
- **Every task ends green.** `pnpm test` and `pnpm build` must both pass before every commit. No new unit tests are expected — this is rendering-only work with no new logic — but the 16 existing core/audio test files must keep passing untouched.
- **Verification is visual.** Each task says what to look at in the browser. Do not claim a task is done without having looked.

## Running the game to look at it

The dev server and browser check is the same every task, so it is written out once here:

```bash
pnpm dev --port 5177
```

Open `http://localhost:5177/`, tap the **Fish Catch** card (third card, around y=625 in a 430px-wide viewport).

**Critical:** Phaser throttles to roughly 1fps when its tab is hidden or backgrounded, which makes a working scene look frozen and half-drawn. If tweens appear stuck or the menu cards never appear, the tab is not visible — bring the window forward and make the tab active before concluding anything is broken.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/ui/textures.ts` | Modify | Shared effects (glow, spark, fades), Dodger and Car Racer art. Loses its Fish Catch section; gains two exported helpers. |
| `src/ui/pondTextures.ts` | Create | Every Fish Catch texture: fish, rare fish, can, hole halves, lily pad, reeds, splash ring. |
| `src/scenes/fish/pondBackdrop.ts` | Create | Builds the pond world behind the holes: gradient, moon sheen, reeds, lily pads, drifting motes, wandering ripples. |
| `src/scenes/FishScene.ts` | Modify | Delegates the backdrop, keeps the holes (their idle shimmer and two-layer draw order are part of staging pop-ups), uses the new ring texture for splashes. |
| `src/scenes/MenuScene.ts` | Modify | Import path only — it draws a fish on the Fish Catch card. |
| `src/ui/theme.ts` | Modify | One new palette entry: `moon`. |

---

## Task 1: Move the Fish Catch art into its own module

A pure move plus two helper exports. Nothing changes on screen — that is the point, and it is what makes the next six tasks reviewable.

**Files:**
- Create: `src/ui/pondTextures.ts`
- Modify: `src/ui/textures.ts` (export `define` and `fillPolygon`; delete lines 27-29 of `TEX`, `fishTexture` at 40-42, and the whole `--- Fish Catch ---` section at 350-570)
- Modify: `src/scenes/FishScene.ts:16-29` (imports)
- Modify: `src/scenes/MenuScene.ts:10-15` (imports)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/ui/textures.ts` gains `export function define(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): string` and `export function fillPolygon(g: Phaser.GameObjects.Graphics, points: number[][], color: number, alpha?: number): void` — both currently module-private, unchanged in body.
  - `src/ui/pondTextures.ts` exports `POND_TEX` (`{ back, lip, trash }`), `fishTexture(color: number, rare: boolean): string`, `FISH_WIDTH`, `FISH_HEIGHT`, `TRASH_WIDTH`, `TRASH_HEIGHT`, `POND_WIDTH`, `POND_HEIGHT`, `ensureFishTexture(scene, color, options?: { rare?: boolean }): string`, `ensureTrashTexture(scene): string`, `ensurePondTextures(scene): void`.

- [ ] **Step 1: Export the two drawing helpers from `textures.ts`**

In `src/ui/textures.ts`, add `export` to the two existing declarations. Bodies are unchanged:

```typescript
export function define(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw): string {
```

```typescript
export function fillPolygon(g: Phaser.GameObjects.Graphics, points: number[][], color: number, alpha = 1): void {
```

Leave `inset` private — no pond texture uses it.

- [ ] **Step 2: Create `src/ui/pondTextures.ts` with the moved code**

Cut `fishTexture` (textures.ts:40-42) and the entire `// --- Fish Catch ---` section (textures.ts:350 through the end of `ensurePondTextures`) into the new file. Bodies are copied **verbatim** — this step must not change a single drawing call. Only the surrounding scaffolding is new:

```typescript
import Phaser from 'phaser';
import { PALETTE, shade } from './theme';
import { define, fillPolygon } from './textures';

// Fish Catch's art, kept apart from the shared effects and the other two
// games. It is the largest single set in the project — a pond, its scenery
// and everything that surfaces out of it — and ui/textures.ts was already the
// biggest file here before it grew a world.

export const POND_TEX = {
  back: 'pond-back',
  lip: 'pond-lip',
  trash: 'pond-trash',
} as const;

export function fishTexture(color: number, rare: boolean): string {
  return `fish-${color.toString(16)}${rare ? '-rare' : ''}`;
}

// ... then the verbatim bodies of the constants and the three ensure* functions
```

The three moved functions reference `TEX.trash`, `TEX.pondBack` and `TEX.pondLip`; those become `POND_TEX.trash`, `POND_TEX.back` and `POND_TEX.lip`. That is the only edit permitted inside them.

- [ ] **Step 3: Delete the moved code from `textures.ts`**

Remove `pondBack`, `pondLip` and `trash` from the `TEX` object (lines 27-29), remove `fishTexture`, and remove the whole `--- Fish Catch ---` section. `textures.ts` should now end after the Car Racer section.

- [ ] **Step 4: Repoint the two consumers**

`src/scenes/FishScene.ts` — the single texture import block becomes two. `TEX` is still needed there for `glow`, `spark` and `topFade`:

```typescript
import { TEX, ensureFxTextures, ensureGradient } from '../ui/textures';
import {
  FISH_HEIGHT,
  FISH_WIDTH,
  POND_HEIGHT,
  POND_TEX,
  POND_WIDTH,
  TRASH_HEIGHT,
  TRASH_WIDTH,
  ensureFishTexture,
  ensurePondTextures,
  ensureTrashTexture,
} from '../ui/pondTextures';
```

Then update the three use sites in that file: `TEX.pondBack` → `POND_TEX.back` (line ~254), `TEX.pondLip` → `POND_TEX.lip` (line ~259), `TEX.trash` → `POND_TEX.trash` (line ~423).

`src/scenes/MenuScene.ts` — move `FISH_HEIGHT`, `FISH_WIDTH` and `ensureFishTexture` out of its `../ui/textures` import and into a new `../ui/pondTextures` import. Anything else it imports from `../ui/textures` stays put.

- [ ] **Step 5: Verify nothing moved on screen**

```bash
pnpm test && pnpm build
```
Expected: tests pass, `tsc --noEmit` clean, vite build succeeds.

Then run the game (see "Running the game to look at it") and confirm Fish Catch renders **exactly** as before, and that the Fish Catch card on the menu still shows its fish. A pure move that changes the picture means something was mistyped.

- [ ] **Step 6: Commit**

```bash
git add src/ui/pondTextures.ts src/ui/textures.ts src/scenes/FishScene.ts src/scenes/MenuScene.ts
git commit -m "refactor(fish): move the pond art into ui/pondTextures"
```

---

## Task 2: Rebuild the hole so it reads as a hole

The near lip is currently lighter than the water inside it, which inverts the depth cue and is why twelve holes read as twelve beans. This is the single biggest win in the plan.

**Files:**
- Modify: `src/ui/theme.ts` (add `moon` to `PALETTE`)
- Modify: `src/ui/pondTextures.ts` (`ensurePondTextures` — replace both texture bodies)

**Interfaces:**
- Consumes: `POND_TEX`, `POND_WIDTH`, `POND_HEIGHT`, `define` from Task 1.
- Produces: `PALETTE.moon` (`0xdfe9ff`), used by Tasks 4, 5 and 7. `ensurePondTextures` keeps its signature.

- [ ] **Step 1: Add the moon colour**

In `src/ui/theme.ts`, inside the Fish Catch block of `PALETTE` (just after `gold`):

```typescript
  /** Moonlight. One light source, overhead — every rim light in the pond
   * agrees with it, which is most of what stops the scene looking flat. */
  moon: 0xdfe9ff,
```

- [ ] **Step 2: Replace `ensurePondTextures` with the new drawing**

The whole function body in `src/ui/pondTextures.ts`:

```typescript
/**
 * A hole in the pond, drawn in two halves that sandwich whatever comes out of
 * it: `back` is the opening, `lip` is the near rim in front.
 *
 * The lighting is the point. Looking down into a hole, the far wall is what
 * catches the moon and the near opening is what falls away into the dark — so
 * the texture is brightest just under its top rim and darkest at the bottom.
 * Drawn the other way round (a bright near lip, as this used to be) the eye
 * reads a raised lozenge instead of an opening, and twelve of them read as
 * twelve beans floating on the water.
 */
export function ensurePondTextures(scene: Phaser.Scene): void {
  const cx = POND_WIDTH / 2;
  const cy = POND_HEIGHT / 2;
  // The hole is inset from the texture edge so there is room to lay a shadow
  // and a wet rim around it without growing the texture — and so the sprite
  // still measures exactly POND_WIDTH x POND_HEIGHT at the use site.
  const rimW = 122;
  const rimH = 58;
  const holeW = 112;
  const holeH = 50;
  const rimColor = shade(PALETTE.seaDeep, 0.16);

  define(scene, POND_TEX.back, POND_WIDTH, POND_HEIGHT, (g) => {
    // Contact shadow, stacked outward from the rim so it falls off smoothly.
    for (let i = 6; i > 0; i -= 1) {
      g.fillStyle(0x000000, 0.05);
      g.fillEllipse(cx, cy + 2, rimW + i * 2.4, rimH + i * 1.8);
    }

    // The wet rim: the pond surface immediately around the opening, lifted a
    // little out of the backdrop so the hole sits *in* something.
    g.fillStyle(rimColor, 1);
    g.fillEllipse(cx, cy, rimW, rimH);

    // The opening, filled row by row. Brightness peaks just below the top
    // rim — the sliver above that peak is the rim's own shadow, and without
    // it the lit far wall runs straight into the rim and the two merge.
    const rx = holeW / 2;
    const ry = holeH / 2;
    const deep = Phaser.Display.Color.IntegerToColor(PALETTE.pondRim);
    const wall = Phaser.Display.Color.IntegerToColor(PALETTE.pond);
    for (let y = 0; y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = rx * Math.sqrt(1 - dy * dy);
      const t = (dy + 1) / 2;
      const brightness = Math.pow(1 - t, 1.6) * (0.35 + 0.65 * Math.min(t / 0.14, 1));
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(deep, wall, 100, Math.round(brightness * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // A specular crescent high on the inner wall, where the moon lands.
    g.lineStyle(2.5, PALETTE.moon, 0.16);
    g.beginPath();
    g.arc(cx, cy, ry * 0.86, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335));
    g.strokePath();

    // Caustics, kept to the lit half where light could plausibly reach.
    g.lineStyle(1.5, 0xffffff, 0.07);
    g.strokeEllipse(cx, cy - 3, holeW * 0.54, holeH * 0.42);
    g.lineStyle(1, 0xffffff, 0.05);
    g.strokeEllipse(cx, cy - 5, holeW * 0.28, holeH * 0.22);
  });

  define(scene, POND_TEX.lip, POND_WIDTH, POND_HEIGHT, (g) => {
    // The near rim, drawn in front of whatever has surfaced. It is the same
    // ellipse as the wet rim behind, clipped to its lower half, so the two
    // meet edge to edge and the hole has one continuous outline.
    for (let y = Math.floor(cy); y < POND_HEIGHT; y += 1) {
      const dy = (y + 0.5 - cy) / (rimH / 2);
      if (Math.abs(dy) >= 1) {
        continue;
      }
      const half = (rimW / 2) * Math.sqrt(1 - dy * dy);
      g.fillStyle(rimColor, 1);
      g.fillRect(cx - half, y, half * 2, 1);
    }

    // The waterline. Drawn as a run of short bars that fade out toward the
    // ends and bow very slightly downward: a straight full-width rect across
    // a round hole reads as a seam, which is what it used to do.
    const bars = 60;
    for (let i = 0; i < bars; i += 1) {
      const t = i / (bars - 1);
      const fade = Math.sin(Math.PI * t);
      g.fillStyle(PALETTE.moon, 0.3 * Math.pow(fade, 1.5));
      g.fillRect(8 + t * (POND_WIDTH - 16), cy - 1.5 + (1 - fade) * 1.4, 2.6, 2.2);
    }
  });
}
```

- [ ] **Step 3: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass.

Run the game and look at an empty hole. It should read as an opening: dark at the bottom, lit just under the top edge, with a soft shadow around it and no hard bar across the middle. Then wait for a fish and confirm it is still cut off at the waterline by the lip — the occlusion must survive, only its colour changes.

- [ ] **Step 4: Commit**

```bash
git add src/ui/theme.ts src/ui/pondTextures.ts
git commit -m "feat(fish): make the holes read as holes"
```

---

## Task 3: Give the empty holes something to do

Eleven of the twelve holes are empty at any moment and all of them are perfectly static.

**Files:**
- Modify: `src/ui/pondTextures.ts` (add `POND_TEX.shimmer` and `ensureShimmerTexture`)
- Modify: `src/scenes/FishScene.ts:250-263` (`createHoles`)

**Interfaces:**
- Consumes: `POND_TEX`, `define`, `POND_WIDTH`, `POND_HEIGHT`.
- Produces: `POND_TEX.shimmer` and `export function ensureShimmerTexture(scene: Phaser.Scene): string`.

- [ ] **Step 1: Add the shimmer texture**

In `src/ui/pondTextures.ts`, add `shimmer: 'pond-shimmer'` to `POND_TEX`, then:

```typescript
/** Two faint caustic rings, scaled and faded on a slow loop inside each hole. */
export function ensureShimmerTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.shimmer, POND_WIDTH, POND_HEIGHT, (g) => {
    const cx = POND_WIDTH / 2;
    const cy = POND_HEIGHT / 2;
    g.lineStyle(2.5, PALETTE.moon, 0.5);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.46, POND_HEIGHT * 0.34);
    g.lineStyle(1.5, PALETTE.moon, 0.34);
    g.strokeEllipse(cx, cy, POND_WIDTH * 0.24, POND_HEIGHT * 0.18);
  });
}
```

- [ ] **Step 2: Call it in `create`**

In `src/scenes/FishScene.ts`, add `ensureShimmerTexture` to the `../ui/pondTextures` import and call `ensureShimmerTexture(this);` alongside the other `ensure*` calls at the top of `create()`.

- [ ] **Step 3: Add the shimmer to each hole**

Replace the body of `createHoles` in `src/scenes/FishScene.ts`:

```typescript
  private createHoles(): void {
    for (let hole = 0; hole < HOLE_COUNT; hole += 1) {
      const { x, y } = this.holeCenter(hole);
      this.add
        .image(x, y, POND_TEX.back)
        .setDisplaySize(POND_WIDTH, POND_HEIGHT)
        .setDepth(DEPTH.world - 1);

      // Each hole breathes on its own clock. Started together they would
      // pulse in lockstep, which reads as a screen effect rather than as
      // twelve separate patches of moving water.
      const shimmer = this.add
        .image(x, y - 3, POND_TEX.shimmer)
        .setDisplaySize(POND_WIDTH, POND_HEIGHT)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.world - 1);
      this.tweens.add({
        targets: shimmer,
        alpha: { from: 0.05, to: 0.3 },
        scaleX: { from: 0.72, to: 1 },
        scaleY: { from: 0.72, to: 1 },
        duration: Phaser.Math.Between(2600, 4200),
        delay: Phaser.Math.Between(0, 2600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // In front of anything that surfaces here — see ensurePondTextures.
      this.add
        .image(x, y, POND_TEX.lip)
        .setDisplaySize(POND_WIDTH, POND_HEIGHT)
        .setDepth(DEPTH.world + 1);
    }
  }
```

Note `setDisplaySize` before the scale tween: `setDisplaySize` sets `scaleX`/`scaleY` under the hood, so tweening scale from 0.72 to 1 afterwards is relative to the texture's native size, which here is the same 128x64. That is why the shimmer texture is deliberately authored at `POND_WIDTH x POND_HEIGHT`.

- [ ] **Step 4: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass.

Run the game and watch the empty holes for ten seconds without tapping. The twelve should be visibly out of phase with each other, and the effect should be a slow glimmer, not a blink. `createHoles` is called once from `create()` and never from `resetState()`, so playing again must not stack a second set of tweens — confirm by finishing a run, tapping Play Again, and checking the shimmer has not doubled in brightness.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pondTextures.ts src/scenes/FishScene.ts
git commit -m "feat(fish): let the empty holes shimmer"
```

---

## Task 4: Build the pond backdrop module

The backdrop is lit from below and full of rising bubbles, which is the underwater reading; the holes are the top-down reading. This task commits to top-down and moves the whole backdrop out of the scene.

**Files:**
- Create: `src/scenes/fish/pondBackdrop.ts`
- Modify: `src/scenes/FishScene.ts` (delete `createBackdrop` at 213-248, call the new function from `create`)

**Interfaces:**
- Consumes: `PALETTE.moon` (Task 2), `TEX.glow`, `TEX.spark`, `TEX.topFade`, `ensureGradient`, `DEPTH`.
- Produces: `export function createPondBackdrop(scene: Phaser.Scene): void`. Task 5 adds reeds and lilies inside it.

- [ ] **Step 1: Create the module**

```typescript
import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { PALETTE } from '../../ui/theme';
import { TEX, ensureGradient } from '../../ui/textures';
import { DEPTH } from '../../ui/widgets';

// The world the holes sit in: a night pond seen from above.
//
// Everything here commits to that one reading. The scene used to hedge —
// bubbles rose through the water, which only makes sense looking sideways
// from below, while the holes had waterlines and lips, which only make sense
// looking down from above. Two viewpoints on screen at once is most of why
// the pond did not cohere.

/** Builds the backdrop. Call once, from the scene's create(). */
export function createPondBackdrop(scene: Phaser.Scene): void {
  // Lit at the top, darkening downward — the moon is up there. The old
  // gradient ran the other way and lit the water from underneath.
  scene.add
    .image(WIDTH / 2, HEIGHT / 2, ensureGradient(scene, PALETTE.seaDeep, PALETTE.seaTop))
    .setDisplaySize(WIDTH, HEIGHT)
    .setDepth(DEPTH.backdrop);

  // The moon's sheen on the surface, and the path it throws down the water.
  scene.add
    .image(WIDTH / 2, HEIGHT * 0.06, TEX.glow)
    .setDisplaySize(WIDTH * 1.9, HEIGHT * 0.42)
    .setTint(PALETTE.moon)
    .setAlpha(0.14)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.add
    .image(WIDTH * 0.38, HEIGHT * 0.42, TEX.glow)
    .setDisplaySize(WIDTH * 0.42, HEIGHT * 0.8)
    .setTint(PALETTE.moon)
    .setAlpha(0.05)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);

  // Motes drifting across the surface, replacing the bubbles that used to
  // rise through it. Slow and sideways: this is pollen on water, not air in
  // a tank.
  const drift = scene.add.particles(0, 0, TEX.spark, {
    x: -12,
    y: { min: 0, max: HEIGHT },
    speedX: { min: 5, max: 16 },
    speedY: { min: -3, max: 3 },
    scale: { min: 0.1, max: 0.24 },
    alpha: { start: 0.22, end: 0 },
    lifespan: { min: 12_000, max: 22_000 },
    frequency: 900,
    tint: [PALETTE.moon, PALETTE.cyan],
    blendMode: 'ADD',
  });
  drift.setDepth(DEPTH.backdrop);

  // A wide, very faint ring crossing the water every few seconds, so the
  // surface between the holes is never completely still.
  scene.time.addEvent({
    delay: 2600,
    loop: true,
    callback: () => surfaceRipple(scene),
  });

  // Darkens the water behind the HUD pills so the readouts stay legible.
  scene.add
    .image(WIDTH / 2, 0, TEX.topFade)
    .setOrigin(0.5, 0)
    .setDisplaySize(WIDTH, 190)
    .setAlpha(0.85)
    .setDepth(DEPTH.effects);
}

function surfaceRipple(scene: Phaser.Scene): void {
  const ring = scene.add
    .image(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(140, HEIGHT - 120), TEX.glow)
    .setDisplaySize(40, 18)
    .setTint(PALETTE.moon)
    .setAlpha(0.07)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.backdrop);
  scene.tweens.add({
    targets: ring,
    displayWidth: 240,
    displayHeight: 96,
    alpha: 0,
    duration: 3200,
    ease: 'Sine.easeOut',
    onComplete: () => ring.destroy(),
  });
}
```

- [ ] **Step 2: Delete `createBackdrop` from the scene and call the module**

In `src/scenes/FishScene.ts`, delete the whole `createBackdrop` method (lines 213-248) and change the call in `create()` from `this.createBackdrop();` to `createPondBackdrop(this);`. Add the import:

```typescript
import { createPondBackdrop } from './fish/pondBackdrop';
```

Then remove now-unused imports from that file: `ensureGradient` is no longer used by `FishScene`, and `TEX` is still used (for `glow` and `spark` in `splash`, `ripple` and `burst`) so it stays. `pnpm build` will name anything you get wrong.

- [ ] **Step 3: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass, with no unused-import errors.

Run the game. The water should now be lighter at the top and darkest at the bottom, with a soft moon glow across the top. No bubbles should rise. The score and time pills must still be clearly legible against the top fade.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/fish/pondBackdrop.ts src/scenes/FishScene.ts
git commit -m "feat(fish): commit the pond to one viewpoint"
```

---

## Task 5: Plant the pond — lily pads and reeds

The dead bands are the top band (roughly y 120-210, under the HUD fade), the four ~88px gaps between hole rows (holes occupy y 214-278, 366-430, 518-582, 670-734), and the bottom band (y 734-820, above the level toast at 836 and the hint at 880).

**Files:**
- Modify: `src/ui/pondTextures.ts` (add `POND_TEX.lily`, `POND_TEX.reeds`, `ensureLilyTexture`, `ensureReedTexture`)
- Modify: `src/scenes/fish/pondBackdrop.ts` (place and animate them)

**Interfaces:**
- Consumes: `define`, `fillPolygon`, `PALETTE.moon`, `createPondBackdrop`.
- Produces: `export const LILY_SIZE = 64`, `export const REED_WIDTH = 96`, `export const REED_HEIGHT = 150`, `export function ensureLilyTexture(scene: Phaser.Scene): string`, `export function ensureReedTexture(scene: Phaser.Scene): string`.

- [ ] **Step 1: Add the lily pad texture**

In `src/ui/pondTextures.ts`, add `lily: 'pond-lily'` and `reeds: 'pond-reeds'` to `POND_TEX`, then:

```typescript
export const LILY_SIZE = 64;

/**
 * A lily pad: a disc with a wedge cut out of it, rim-lit along its upper
 * edge. The notch is what makes it a lily pad rather than a green dot, and it
 * is drawn as a polygon that returns to the centre rather than cut out of a
 * circle — Graphics has no way to subtract a shape, and filling the notch with
 * a background colour would only work over one exact backdrop.
 */
export function ensureLilyTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.lily, LILY_SIZE, LILY_SIZE, (g) => {
    const c = LILY_SIZE / 2;
    const r = c - 2;
    const body = shade(PALETTE.grass, -0.18);

    const steps = 44;
    const notch = Phaser.Math.DegToRad(42);
    const points: number[][] = [[c, c]];
    for (let i = 0; i <= steps; i += 1) {
      const a = notch / 2 + (i / steps) * (Math.PI * 2 - notch);
      points.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    fillPolygon(g, points, body);

    // Lit along the top, shaded along the bottom — the same overhead moon.
    g.lineStyle(2, PALETTE.moon, 0.16);
    g.beginPath();
    g.arc(c, c, r - 1, Phaser.Math.DegToRad(198), Phaser.Math.DegToRad(342));
    g.strokePath();
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(c, c + r * 0.52, r * 1.5, r * 0.7);

    // Veins, radiating away from the notch.
    g.lineStyle(1, shade(PALETTE.grass, 0.2), 0.22);
    for (const deg of [70, 130, 190, 250, 310]) {
      const a = Phaser.Math.DegToRad(deg);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * r * 0.88, c + Math.sin(a) * r * 0.88);
      g.strokePath();
    }
  });
}
```

- [ ] **Step 2: Add the reed texture**

```typescript
export const REED_WIDTH = 96;
export const REED_HEIGHT = 150;

/**
 * A clump of reeds, rooted at the bottom of its texture. Near-black on
 * purpose: these are silhouettes at the edge of the light, and anything
 * brighter starts competing with the holes for attention.
 */
export function ensureReedTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.reeds, REED_WIDTH, REED_HEIGHT, (g) => {
    const blade = shade(PALETTE.grassDark, -0.5);
    const stalks: { x: number; lean: number; length: number; width: number; head: boolean }[] = [
      { x: 16, lean: -13, length: 96, width: 7, head: false },
      { x: 33, lean: 6, length: 138, width: 6, head: true },
      { x: 48, lean: -5, length: 112, width: 8, head: false },
      { x: 64, lean: 15, length: 132, width: 6, head: true },
      { x: 80, lean: 9, length: 84, width: 7, head: false },
    ];

    for (const stalk of stalks) {
      const tipX = stalk.x + stalk.lean;
      const tipY = REED_HEIGHT - stalk.length;
      fillPolygon(g, [
        [stalk.x - stalk.width / 2, REED_HEIGHT],
        [stalk.x + stalk.width / 2, REED_HEIGHT],
        [tipX, tipY],
      ], blade);
      // A cattail head on the taller two.
      if (stalk.head) {
        g.fillStyle(blade, 1);
        g.fillEllipse(tipX, tipY + 12, 8, 26);
      }
      // A thread of moonlight down the lit edge of each blade.
      g.lineStyle(1, PALETTE.moon, 0.1);
      g.beginPath();
      g.moveTo(stalk.x - stalk.width * 0.3, REED_HEIGHT);
      g.lineTo(tipX - 1, tipY + 4);
      g.strokePath();
    }
  });
}
```

- [ ] **Step 3: Plant them in the backdrop**

In `src/scenes/fish/pondBackdrop.ts`, import the new pieces and call one new function from `createPondBackdrop`, immediately after the moonpath glow and before the drift emitter (so scenery sits under the motes):

```typescript
import {
  LILY_SIZE,
  POND_TEX,
  REED_HEIGHT,
  REED_WIDTH,
  ensureLilyTexture,
  ensureReedTexture,
} from '../../ui/pondTextures';
```

```typescript
  ensureLilyTexture(scene);
  ensureReedTexture(scene);
  plantPond(scene);
```

And the function itself:

```typescript
// Where the pads and reeds go. The holes occupy four bands at y 214-278,
// 366-430, 518-582 and 670-734, and they run nearly the full width — so the
// scenery lives in the gaps between those bands, in the strip under the HUD,
// and in the strip above the level toast. Everything sits below the hole
// rims, so a pad that reaches a hole tucks behind it instead of colliding.
const LILIES: { x: number; y: number; scale: number; angle: number }[] = [
  { x: 44, y: 172, scale: 0.62, angle: 24 },
  { x: 388, y: 158, scale: 0.5, angle: -68 },
  { x: 70, y: 322, scale: 0.78, angle: 132 },
  { x: 356, y: 336, scale: 0.56, angle: -18 },
  { x: 214, y: 474, scale: 0.46, angle: 78 },
  { x: 62, y: 626, scale: 0.68, angle: -114 },
  { x: 372, y: 616, scale: 0.54, angle: 40 },
  { x: 148, y: 782, scale: 0.86, angle: 8 },
];

const REEDS: { x: number; y: number; scale: number; flip: boolean }[] = [
  { x: 22, y: 214, scale: 0.72, flip: false },
  { x: 404, y: 206, scale: 0.62, flip: true },
  { x: 350, y: 824, scale: 0.9, flip: true },
  { x: 40, y: 830, scale: 0.78, flip: false },
];

function plantPond(scene: Phaser.Scene): void {
  for (const reed of REEDS) {
    const clump = scene.add
      .image(reed.x, reed.y, POND_TEX.reeds)
      .setOrigin(0.5, 1)
      .setDisplaySize(REED_WIDTH * reed.scale, REED_HEIGHT * reed.scale)
      .setFlipX(reed.flip)
      .setAlpha(0.85)
      .setDepth(DEPTH.backdrop);
    // Rooted at the base, so the sway pivots where a reed actually bends.
    scene.tweens.add({
      targets: clump,
      angle: { from: -1.6, to: 1.6 },
      duration: Phaser.Math.Between(3800, 5600),
      delay: Phaser.Math.Between(0, 2000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  for (const lily of LILIES) {
    const pad = scene.add
      .image(lily.x, lily.y, POND_TEX.lily)
      .setDisplaySize(LILY_SIZE * lily.scale, LILY_SIZE * lily.scale)
      .setAngle(lily.angle)
      .setDepth(DEPTH.backdrop);
    scene.tweens.add({
      targets: pad,
      y: lily.y + 3,
      angle: lily.angle + 2.5,
      duration: Phaser.Math.Between(4200, 6400),
      delay: Phaser.Math.Between(0, 2400),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass.

Run the game and check three things: no lily pad or reed sits on top of a hole rim (they must all be behind, at `DEPTH.backdrop`); the "TAP THE FISH · LEAVE THE TRASH" hint and the level toast are still readable over the bottom reeds; and every previously empty band now has something in it. Adjust the coordinates in `LILIES` and `REEDS` if a pad lands somewhere that reads as clutter — those two tables exist to be tuned by eye.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pondTextures.ts src/scenes/fish/pondBackdrop.ts
git commit -m "feat(fish): plant lily pads and reeds in the pond"
```

---

## Task 6: Make a splash look like a splash

`splash` and `ripple` both scale up a filled glow blob, which reads as a flash of light rather than as water moving.

**Files:**
- Modify: `src/ui/pondTextures.ts` (add `POND_TEX.ring` and `ensureRingTexture`)
- Modify: `src/scenes/FishScene.ts` (`splash` at 551-568, `ripple` at 571-588)

**Interfaces:**
- Consumes: `define`, `POND_TEX`.
- Produces: `export const RING_SIZE = 64`, `export function ensureRingTexture(scene: Phaser.Scene): string`.

- [ ] **Step 1: Add the ring texture**

Add `ring: 'pond-ring'` to `POND_TEX`, then:

```typescript
export const RING_SIZE = 64;

/**
 * An open ring, flattened into perspective. The splash used to be a filled
 * glow scaled up, which the eye reads as a flash rather than as water: the
 * hole in the middle is what makes it a ripple.
 */
export function ensureRingTexture(scene: Phaser.Scene): string {
  return define(scene, POND_TEX.ring, RING_SIZE, RING_SIZE, (g) => {
    const c = RING_SIZE / 2;
    g.lineStyle(5, 0xffffff, 0.85);
    g.strokeEllipse(c, c, RING_SIZE - 10, (RING_SIZE - 10) * 0.56);
    g.lineStyle(2, 0xffffff, 0.3);
    g.strokeEllipse(c, c, RING_SIZE - 22, (RING_SIZE - 22) * 0.56);
  });
}
```

- [ ] **Step 2: Use it, and throw droplets with it**

In `src/scenes/FishScene.ts`, add `POND_TEX` members and `ensureRingTexture` to the pond import, call `ensureRingTexture(this);` in `create()`, and replace both methods:

```typescript
  /** Expanding ring at the waterline — every arrival and departure gets one. */
  private splash(x: number, y: number, color: number): void {
    this.expandRing(x, y, color, { from: 40, to: 156, alpha: 0.75, duration: 460 });

    // A handful of droplets thrown up out of the ring. Emitted upward and
    // pulled back down, because a splash that only spreads sideways reads as
    // a shockwave.
    const drops = this.add.particles(x, y - 4, TEX.spark, {
      speed: { min: 40, max: 120 },
      angle: { min: 236, max: 304 },
      gravityY: 420,
      lifespan: { min: 260, max: 460 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [color, PALETTE.moon],
      blendMode: 'ADD',
      emitting: false,
    });
    drops.setDepth(DEPTH.effects);
    drops.explode(5);
    this.time.delayedCall(700, () => drops.destroy());
  }

  /** Feedback for a tap that hit nothing, so the water never feels dead. */
  private ripple(x: number, y: number): void {
    this.expandRing(x, y, PALETTE.cyan, { from: 20, to: 88, alpha: 0.4, duration: 360 });
  }

  private expandRing(
    x: number,
    y: number,
    color: number,
    spec: { from: number; to: number; alpha: number; duration: number }
  ): void {
    const ring = this.add
      .image(x, y, POND_TEX.ring)
      .setDisplaySize(spec.from, spec.from * 0.56)
      .setTint(color)
      .setAlpha(spec.alpha)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: ring,
      displayWidth: spec.to,
      displayHeight: spec.to * 0.56,
      alpha: 0,
      duration: spec.duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
```

- [ ] **Step 3: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass.

Run the game. Tap empty water: a small open ring should spread and fade. Watch a fish surface and a fish dive: each should throw a ring plus a few droplets. Then tap several fish in quick succession at the last difficulty level and confirm the framerate holds — each splash creates and destroys an emitter, so this is where the cost lands.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pondTextures.ts src/scenes/FishScene.ts
git commit -m "feat(fish): splash with rings and droplets"
```

---

## Task 7: Light the fish and the can with the same moon

The sprites currently carry their own internal lighting and none of it agrees with the scene around them.

**Files:**
- Modify: `src/ui/pondTextures.ts` (`ensureFishTexture`, `ensureTrashTexture`)

**Interfaces:**
- Consumes: `PALETTE.moon`, `FISH_WIDTH`, `FISH_HEIGHT`, `TRASH_WIDTH`, `TRASH_HEIGHT`.
- Produces: nothing new — both functions keep their signatures and their texture sizes.

- [ ] **Step 1: Rim-light the fish and sink its lower edge**

In `ensureFishTexture`, insert this immediately before the `if (rare)` block, after the smile is drawn:

```typescript
    // Moonlight along the back, and water over the belly. A fish is lifted
    // only 18px out of a hole, so its lowest band is still at the waterline —
    // tinting it toward the pond is what stops the sprite reading as a decal
    // laid on top of the hole.
    g.lineStyle(2, PALETTE.moon, 0.3);
    g.beginPath();
    g.arc(cx, cy, ry * 1.02, Phaser.Math.DegToRad(206), Phaser.Math.DegToRad(334));
    g.strokePath();

    for (let y = Math.floor(h * 0.72); y < h; y += 1) {
      const depth = (y - h * 0.72) / (h * 0.28);
      g.fillStyle(PALETTE.pondRim, 0.36 * depth);
      g.fillRect(0, y, w, 1);
    }
```

Note `rx` and `ry` are already in scope from the top of that function, as are `w`, `h`, `cx` and `cy`.

- [ ] **Step 2: Do the same for the can**

At the end of `ensureTrashTexture`, after the final `strokeEllipse`:

```typescript
    // The same overhead moon, and the same waterline.
    g.lineStyle(1.5, PALETTE.moon, 0.22);
    g.beginPath();
    g.moveTo(left + 3, top + h * 0.08);
    g.lineTo(left + 3, base - 4);
    g.strokePath();

    for (let y = Math.floor(h * 0.74); y < h; y += 1) {
      const depth = (y - h * 0.74) / (h * 0.26);
      g.fillStyle(PALETTE.pondRim, 0.34 * depth);
      g.fillRect(0, y, w, 1);
    }
```

- [ ] **Step 3: Verify**

```bash
pnpm test && pnpm build
```
Expected: both pass.

Run the game. A surfaced fish should have a pale edge along its back and should darken into the water at the waterline rather than ending in a hard cut. Check the can too — and check the menu card, which draws a fish at a larger scale and will show any heavy-handedness immediately.

The wobble tween rotates a surfaced fish by up to 7°, which tilts the baked waterline tint with it. At 0.36 alpha this should not be noticeable; if it is, lower the alpha rather than removing the effect.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pondTextures.ts
git commit -m "feat(fish): light the catch with the same moon"
```

---

## Task 8: Full-run verification

**Files:** none — this task changes nothing unless it finds something.

- [ ] **Step 1: Green build**

```bash
pnpm test && pnpm build
```
Expected: all existing test files pass, `tsc --noEmit` clean, vite build succeeds.

- [ ] **Step 2: Play a whole run**

Play all 60 seconds without skipping. Check:

- All five level toasts appear and are readable over the new scenery.
- Rare fish still get their gold aura and screen flash, and the aura still sits behind the fish and in front of the hole.
- Tapping trash still shakes the camera; the score still floors at zero.
- At level 5, with four things up at once, the framerate holds.
- The `TIME UP!` card appears over a calm pond, and Play Again resets to a clean scene with no doubled shimmer, no leftover pop-ups and no accumulated ripples.
- The back-to-menu chip works mid-run, and the menu's Fish Catch card still draws its fish.

- [ ] **Step 3: Check the other two games are untouched**

Play a few seconds of Dodger and Car Racer. Task 1 moved code out of the file they both draw from, so this confirms nothing was cut that they needed.

- [ ] **Step 4: Capture the result**

Take a screenshot of the pond mid-run for the pull request, and compare it against the same view before the branch.

- [ ] **Step 5: Commit anything the run turned up**

Only if Steps 2-4 found something worth changing:

```bash
git add -A
git commit -m "fix(fish): <what the full run turned up>"
```

---

## Self-review notes

**Spec coverage:** hole rebuild → Task 2; idle shimmer → Task 3; viewpoint commit, gradient re-weight, moon sheen, drift, bubble removal → Task 4; lily pads, reeds, top-band HUD-fade note → Task 5; splash and ripple rings → Task 6; sprite rim light and waterline tint → Task 7; `ui/pondTextures.ts` and `scenes/fish/pondBackdrop.ts` splits → Tasks 1 and 4; testing and out-of-scope → Global Constraints and Task 8.

**Known tuning points:** the `LILIES` and `REEDS` coordinate tables in Task 5, and the alpha values in Task 7, are meant to be adjusted by eye during their own verification steps. That is tuning inside a task, not a deviation from the plan.
