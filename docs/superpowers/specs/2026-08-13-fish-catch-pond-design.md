# Fish Catch Pond Rebuild Design

**Date:** 2026-08-13
**Status:** Approved

## Overview

Fish Catch plays well but looks cheap next to the menu it is launched from.
This is a rendering-only rebuild of the pond it is played in: the holes get
depth, the water gets a world around it, and everything gets lit from one
place. Gameplay is untouched — the same grid, the same tap targets, the same
level ladder, the same scoring and audio.

## What is wrong now

Four things, in the order they hurt:

1. **The holes read as beans, not holes.** The lip drawn in front of a hole is
   *lighter* than the water inside it, which inverts the depth cue: the part
   nearest the viewer is the brightest, so the eye reads a raised lozenge
   rather than an opening. Nothing casts a shadow, and the twelve are
   identical stamps.
2. **The pond has no pond in it.** A flat gradient and one glow. The band under
   the HUD and the band above the hint are empty, and so are the four gaps
   between hole rows.
3. **The scene contradicts itself.** Bubbles rise through the backdrop, which
   only makes sense underwater looking sideways; the holes have waterlines and
   lips, which only make sense above the pond looking down. Both readings are
   on screen at once.
4. **Nothing idles.** Empty holes are perfectly static, so at any moment most
   of the screen is dead pixels.

## Direction

**Above the pond, looking down** — the reading the holes already imply, and the
one that matches what the game asks the player to do. Everything that implies
the other reading goes.

**Moonlight, cool** — the existing cyan/teal palette, so the three games still
read as one product. A single light source overhead-left, and every rim light
in the scene agrees with it.

## Approach

All new art is generated `Graphics` baked once into textures at scene create,
the way every other sprite in this project is made. Motion is tweens and
particle emitters over that baked art. No per-frame `Graphics` redraw and no
shaders: a caustics shader would look better, but this has to hold 60fps on a
phone, and staggered tweens over baked textures buy most of the look for a
fraction of the cost.

## The hole

> **Corrected after implementation.** The original version of this section
> proposed swapping the roles of the near lip and the far wall — lighting the
> far wall and darkening the near lip. That was built, and it was wrong: it
> produced an interior that peaked in brightness just under the top rim, at
> roughly luminance 119 against a backdrop of 26, which is the shading of a lit
> dome. The fix below is what actually ships. The original wording is in git
> history at `634ab3c`.

An opening is read from its **edge catching light** and its **inside falling
dark** — not from its inside being bright. The old hole was inverted, but the
first correction inverted it into a different wrong answer.

| Part | Before the branch | Shipped |
|---|---|---|
| Rim ring | Nothing | The brightest element in the texture: the lit wet edge of the pool |
| Interior, under the top rim | Dark | **Darkest** — the rim cuts the moon off here |
| Interior, toward the far wall | Light | Eases slightly lighter, but stays below the water around it |
| Near lip (front) | Light, with a hard rect highlight | Starts on the same lit edge and darkens into the backdrop |
| Outer edge | Nothing | A soft contact shadow with room to fall off, on a canvas padded past the hole |

The rim's own shadow is thrown down the inside of the far wall. It is walked as
segments along the ellipse rather than stroked with `g.arc`, which draws a
circle — on a 112 × 50 opening an arc cuts across the middle instead of hugging
the edge, and that is part of what made the first attempt read as a dome.

The near lip keeps being drawn in front of whatever surfaces, exactly as
today — the occlusion that sells "coming up out of the water" is unchanged.
What changes is that a fish is now occluded by dark water instead of by a
bright lozenge, so it reads as emerging rather than as pasted behind.

The hard `fillRect` waterline highlight goes. A straight bar across a round
hole reads as a seam; the replacement is an arc that fades out toward the
sides.

### Idle shimmer

Each hole carries a faint caustic ellipse on a slow scale-and-alpha tween,
`yoyo` and `repeat: -1`, with a per-hole random delay so the twelve breathe out
of phase rather than pulsing in lockstep. Twelve tweens, no per-frame cost.

## The pond world

New scenery fills the empty bands: the top band between the HUD and the first
row, the four ~88px gaps between hole rows, and the bottom band above the
hint.

- **Lily pads.** Dark green notched discs with a moon rim-light along the upper
  edge and two vein lines. Six to eight, scattered at varied scale and
  rotation, drawn *below* the hole rims so their edges tuck behind the holes
  rather than colliding with them. Each bobs very slowly.
- **Reeds.** Near-black blade clusters along the bottom edge and in the top
  band, swaying slowly and out of phase with each other. The top band sits
  under the existing HUD fade, which darkens the top 190px — reeds there are
  placed to be silhouettes seen through it, and the fade keeps its job of
  holding the score and time readouts legible.
- **Moon sheen.** A soft elliptical highlight across the top third plus a faint
  vertical moonpath down the water, so the rim lights on the pads, the holes
  and the fish all have a source to agree with.
- **Surface drift.** The rising bubbles are removed. In their place, slow
  horizontally drifting motes on the surface, and an occasional large, very
  faint ripple ring crossing the water.
- **Backdrop gradient.** Re-weighted to darken toward the bottom. It currently
  brightens downward, which lights the water from below — the underwater
  reading again.

## Splash and surface effects

The splash is currently a filled glow blob scaled up. It becomes a stroked
ring expanding and fading, plus four or five droplet sparks thrown upward. The
shape difference is most of what makes a splash read as a splash rather than as
a flash of light.

The miss ripple keeps its behaviour and gains the same ring treatment, at a
smaller scale.

## Popup sprites

The fish, rare fish and can shapes are kept — they read correctly already.
Each gains a moon rim-light along its top edge and a soft contact shadow where
it meets the waterline, so it is lit by the same source as the rest of the
scene instead of sitting in its own lighting.

## Architecture

Two files are already the largest in the project, and this change would push
both further, so it splits as it grows.

- **`src/ui/pondTextures.ts`** — new. The Fish Catch art moves out of
  `ui/textures.ts` (570 lines, serving all three games) and the new scenery
  joins it there. `ui/textures.ts` keeps the shared effects and the two other
  games.
- **`src/scenes/fish/pondBackdrop.ts`** — new. `createPondBackdrop(scene)`
  builds the gradient, moon, reeds, lilies and drift, so `FishScene.ts` (643
  lines) stays about the game rather than about the scenery.

`FishScene.ts` keeps the holes, because their idle shimmer and their two-layer
draw order are part of how pop-ups are staged, not part of the backdrop.

## Testing

This is rendering-only: no new logic, nothing to red/green. The existing core
tests must keep passing untouched, and `pnpm build` must typecheck clean.
Verification is visual — screenshots of the result compared against the
current game.

## Out of scope

Grid positions, tap targets and `TAP_PAD`; the level ladder; scoring; audio;
the menu; the other two games.
