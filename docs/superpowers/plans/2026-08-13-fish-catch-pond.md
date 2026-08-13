# Fish Catch Pond Rebuild — As-Built Record

> **Status: shipped.** This began as an implementation plan. It has been
> rewritten to record what was actually built, because the plan it started as
> disagreed with the code in four of its eight tasks — every one of those
> disagreements was a value the plan got wrong and the running game corrected.
> The original plan, with its pre-execution code blocks, is in git history at
> `be1a69c`. The design intent lives in
> `docs/superpowers/specs/2026-08-13-fish-catch-pond-design.md`.

**Goal:** Fish Catch "looked a bit cheap". Make it look like it belongs beside
the menu that launches it, without touching a line of gameplay.

**Result:** 16 code commits on `feat/fish-catch-pond-polish`. `update()` is
byte-identical to before the branch; every grid, tap-target, difficulty,
scoring and audio constant is unchanged. 172 tests pass, `tsc --noEmit` and
`vite build` are clean.

**Tech:** TypeScript, Phaser 3.80, Vite, Vitest, pnpm.

---

## What shipped

| File | Change |
|---|---|
| `src/ui/pondTextures.ts` | **New.** Every Fish Catch texture: fish, rare fish, can, the two hole halves, shimmer, lily pad, reeds, splash ring. |
| `src/scenes/fish/pondBackdrop.ts` | **New.** The pond world behind the holes: gradient, moon, reeds, pads, drift, wandering ripples. |
| `src/scenes/fish/holeGrid.ts` | **New.** The hole grid geometry and `holeCenter()`, shared by the scene and the scenery so the two cannot drift apart. |
| `src/ui/textures.ts` | Lost its Fish Catch section (570 → 341 lines); gained two exported drawing helpers. |
| `src/scenes/FishScene.ts` | Delegates the backdrop, keeps the holes, uses rings for splashes, shares one droplet emitter. |
| `src/scenes/MenuScene.ts` | Draws the fish card icon from a "dry" texture variant. |
| `src/ui/theme.ts` | Gained `PALETTE.moon`; lost the now-unused `PALETTE.pondDeep`. |

### The hole

The centrepiece, and the part the original plan got most wrong.

The plan diagnosed the old hole as inverted: it lit the near lip brighter than
the water inside, so twelve holes read as twelve raised beans. That diagnosis
was right. The plan's *fix* — light the far wall, darken the near lip — was
wrong, and shipping it produced a hole whose interior peaked in brightness just
under the top rim at roughly luminance 119 against a backdrop of 26. That is
the canonical shading of a lit dome. An adversarial review caught it after the
branch had already passed a full whole-branch review.

What ships instead:

- The interior is **darkest just under the top rim**, where the rim itself cuts
  off the moon, easing only slightly lighter toward the far wall. Every value
  in it stays below the water around it, because that is what recessed means.
- The **rim ring is the brightest element**. A hole is read from its edge
  catching light, not from its inside being bright.
- The rim's own shadow is thrown down the inside of the far wall, walked as
  segments along the ellipse. The original used `g.arc`, which draws a circle —
  on a 112 × 50 opening it cut across the middle instead of hugging the edge.
- The textures sit on a **padded 168 × 104 canvas** (`POND_TEX_WIDTH/HEIGHT`).
  The contact shadow had nowhere to fall off inside a canvas the size of the
  hole and had degenerated into a hard step. The hole itself is unmoved and
  unchanged in size, so no layout or tap target shifted.

### Everything else

- **Idle shimmer** — a caustic texture per hole on a slow `yoyo`/`repeat: -1`
  tween with a per-hole random delay, so the twelve breathe out of phase. Its
  own depth band (`DEPTH.world - 0.5`) so all twelve additive quads batch in
  one draw call.
- **The backdrop commits to one viewpoint.** The rising bubbles are gone — they
  were the underwater reading, contradicting the holes' top-down one. The water
  is lit from above and darkens downward, and both ends of the gradient are
  pulled well down so the holes stay the brightest things on screen.
- **Scenery** — lily pads and reed clumps in the four empty bands. Each pad
  bakes only its *notch* per variant; the rim light and cast shadow keep one
  fixed direction, because rotating the sprite would rotate its lighting and
  break the single-moon premise.
- **Splashes** — an expanding open ring plus thrown droplets. The ring is baked
  round and flattened once at the use site, so a ripple sits on the same ground
  plane the holes imply.
- **Sprites** — fish and can carry a moon rim light and sink into the waterline.
  The waterline wash is confined to the silhouette, and is skipped entirely for
  the menu card, where there is no water for it to explain.

---

## Corrections during execution

Ten fix rounds. Nine were the plan's own values being wrong, not an
implementer misreading them — the implementers transcribed faithfully each
time. This is the most useful thing this document records.

| # | What the plan specified | What was wrong on screen | Fix |
|---|---|---|---|
| 1 | Waterline as 60 bars with a vertical bow | Ends stair-stepped; read as a dotted zipper | Redrawn |
| 2 | Near lip as one flat fill | Hid the deep of the hole; two-tone lozenge | Gradient melting into the water |
| 3 | Rim ellipse at full size | Antialiased edge survived outside the hard-edged lip fill: a dotted halo under every hole | Rim inset |
| 4 | Backdrop gradient + two broad glows | Washed the top third to fog; the top two rows of holes vanished into it | Darker water, contained moon |
| 5 | Pads mid-green, reeds hairline | Pie charts and scratches | Dark silhouettes, thicker tapered blades |
| 6 | Waterline tint via full-width `fillRect` | Tinted the transparent margin: a translucent box under every sprite | Scanlined inside the silhouette |
| 7 | Contact shadow rings grown past the canvas | Clipped to a hard edge | Resized to fit — later superseded by padding the canvas |
| 8 | Far wall lit, near lip dark | The hole read as a convex dome | Interior dark throughout, rim lit |
| 9 | "Thin lens" waterline (a 41:1 ellipse) | Rasterised to a bar with square ends — the seam it replaced | 1px columns with `sin` alpha falloff |
| 10 | Ring baked flat, then flattened again | Ripples implied a different camera tilt than the holes | Baked round, flattened once |

Rounds 8–10 came from an adversarial review *after* a clean whole-branch
review had declared the branch ready to merge. Thirteen of its fourteen
findings were fixed; the fourteenth was declined on the grounds that deriving
the sprite waterline band from `LIFT` would couple a baked texture to a
gameplay constant, turning a `LIFT` change into a silent runtime mismatch
rather than a build error.

One of that review's findings was **rejected as wrong**: a claim, at high
severity and with a plausible Node reproduction, that a negative alpha wraps to
~254 and bakes an opaque stripe across every fish. Reading the actual baked
texture pixels disproved it — `generateTexture` renders through Canvas2D
regardless of the game renderer, and CSS clamps negative alpha to zero.

---

## Verification

- 172 tests pass; `tsc --noEmit` and `vite build` clean. No new unit tests: this
  is rendering-only work with no new logic to red/green.
- A full 60-second run: all five levels fire, every pop-up dives at time-up, the
  card lands on calm water, Play Again does not stack tweens, and there are no
  console errors or scenery-overlap warnings.
- Dodger and Car Racer both still render correctly after their shared texture
  module was cut down.
- **Frame cost**, measured back to back in one session: Fish Catch **2.75 ms**,
  Dodger 3.04 ms, Car Racer 4.77 ms. The rebuilt game is the cheapest of the
  three. Padding the hole textures costs ~0.19 ms across all 36 quads,
  established by hiding them and by resizing them back.

## Known and accepted

- Reeds rooted in the bottom band rise behind the last row of holes. The band is
  only ~90 px tall, so any reed with real height must; the holes are opaque and
  it reads as depth. A `warnIfSceneryOverlapsHoles()` guard now checks every
  hand-placed pad and reed against the real grid at create time, so a future
  grid retune says so instead of failing silently.
- The scenery tables are still hand-placed literals. They now derive their
  meaning from `holeGrid.ts` rather than from copied numbers, and the guard
  above is what enforces it.
