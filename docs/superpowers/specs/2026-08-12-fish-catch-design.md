# Fish Catch Design

**Date:** 2026-08-12
**Status:** Approved

## Overview

A third game for the menu: a Whac-A-Mole in a night pond. Twelve holes sit in
a 3 × 4 grid; fish surface out of them one or two at a time, and the player
taps them before they dive back. A rare gold fish is worth much more than an
ordinary one. Junk surfaces too, and tapping junk costs points — it is the
only way to lose any. The run lasts a minute and gets faster in visible steps
rather than sliding gradually, so the change of pace is something a small
child can feel.

## Gameplay

### Holes and pop-ups

- 12 holes in a fixed 3 × 4 grid, spaced so no two tap targets touch.
- One thing at a time per hole. A spawn that lands with every hole busy, or
  with the on-screen cap already reached, is simply skipped.
- Everything that surfaces pops up with a bounce, wobbles while it is up, and
  dives back on a timer. A missed fish costs nothing.
- Each hole is drawn in two halves that sandwich whatever comes out of it, so
  a fish's tail is hidden behind the water rather than floating on top of it.

### What surfaces

| Kind | Points | Notes |
|---|---|---|
| Fish | +10 | Four colours, facing either way. |
| Rare fish | +30 | Gold, sparkling, with an aura and a screen flash on the catch. |
| Trash (a dented can) | −15 | Grey and angular, so it never gets mistaken for a fish. |

One random roll picks the kind, with the rare and trash odds taking slices of
it and ordinary fish getting the rest.

### Scoring

- The score is floored at zero. A penalty that pushes a five-year-old's score
  below zero stops reading as "that one didn't count" and starts reading as
  "you are losing".
- Untapped trash costs nothing — only tapping it does.
- Tap targets get a 12px pad per side so an imprecise finger still lands its
  catch. Trash gets no pad at all: padding the one thing that costs points
  would punish exactly the near-misses the pad exists to forgive. Where two
  targets overlap, the nearest to the tap wins.

### Difficulty steps

Five levels, one every 12 seconds of the 60-second run. Level 1 has no trash
in it at all, so a new player's first taps always land on something good.

| Level | Gap between pop-ups | Time up | Max at once | Rare | Trash |
|---|---|---|---|---|---|
| 1 | 1100–1500ms | 2600ms | 2 | 5% | 0% |
| 2 | 900–1250ms | 2300ms | 3 | 7% | 14% |
| 3 | 750–1050ms | 2000ms | 3 | 9% | 20% |
| 4 | 620–900ms | 1750ms | 4 | 11% | 25% |
| 5 | 500–780ms | 1500ms | 4 | 13% | 30% |

Each step flashes a "LEVEL n · FASTER!" toast, and re-tunes the running
spawner instead of restarting it — the interval already rolled at the old,
slower pace is clamped into the new range so the change is felt immediately.

### End of run

At zero the clock stops, everything still up dives, and the shared game-over
card appears with `TIME UP!` and the final score, over the usual Play Again /
Menu pair.

## Architecture

Follows the existing pattern: pure logic in `src/core/` with unit tests,
Phaser rendering and wiring in a scene.

New core modules:

- `core/countdown.ts` — the run clock. Elapsed time is derived from what is
  left rather than accumulated separately, so the difficulty ramp and the
  readout can never disagree.
- `core/levels.ts` — `levelIndexAt(elapsedMs, stepMs, levelCount)`, the whole
  of the step ladder's timing.
- `core/popups.ts` — `pickKind`, `pickFreeHole` and the points table.

Reused and extended:

- `core/spawner.ts` — pop-up timing, plus a new `retuneSpawner` for the level
  steps.
- `core/score.ts` — `addPoints` grew an optional floor; the two older games
  pass none and are unaffected.
- `core/lanes.ts` — `freeLanes` backs `pickFreeHole`. A grid of holes and a
  row of lanes are the same "which slots are taken" question.
- `core/collision.ts` — `rectAt` / `intersects` do the tap hit-testing.

Rendering lives in `scenes/FishScene.ts`, and the artwork (fish, rare fish,
can, and the two halves of a hole) is generated in `ui/textures.ts` like every
other sprite in the project. The menu gains a third card and a `fish` icon.
