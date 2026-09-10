/**
 * The flat-ground projection the Car Racer road is drawn with.
 *
 * One fact does all the work here: on a flat plane viewed by a camera looking
 * along it, how big a thing appears is proportional to how far below the
 * horizon it touches the ground. So a single ratio — this row's drop below the
 * horizon over the player's row's drop — is at once the scale to draw at, the
 * factor that pulls the road's edges in toward the vanishing point, and (via
 * its reciprocal) how far down the track the row sits.
 *
 * It lives in core rather than with the scene's art because the same numbers
 * size the collision boxes: a car drawn at two-thirds scale is hit at
 * two-thirds scale, and a projection that could disagree with the picture is
 * one the player would feel as an unfair crash.
 */

export interface Perspective {
  /** Screen y of the vanishing point — where the road's edges meet. */
  horizonY: number;
  /** Screen y of the row drawn at 1:1. The player's own row. */
  baseY: number;
  /** Screen x the road converges to. */
  centerX: number;
}

/**
 * Drawing scale for screen row `y`: 0 at the horizon, 1 at the player's row,
 * and above 1 for the rows below it — the road keeps widening past the player
 * rather than stopping at their bumper.
 *
 * Clamped at 0 so a caller that asks about a row above the horizon gets a
 * degenerate point instead of a mirrored, negative-width world.
 */
export function scaleAt(p: Perspective, y: number): number {
  return Math.max(0, (y - p.horizonY) / (p.baseY - p.horizonY));
}

/**
 * Slides a ground-plane x — measured at the player's row, where the road is
 * its full width — onto screen row `y`.
 */
export function projectX(p: Perspective, x: number, y: number): number {
  return p.centerX + (x - p.centerX) * scaleAt(p, y);
}

/**
 * How far down the track row `y` sits, given that the player's own row sits
 * `cameraDepth` from the camera. The inverse of the scale relation, in the
 * same units `cameraDepth` is in.
 *
 * This is what the road's markings are anchored to: spacing them evenly in
 * depth (rather than evenly down the screen) is what makes them bunch up
 * toward the horizon and rush apart as they arrive. Infinite at the horizon,
 * which is the honest answer — the horizon is infinitely far away.
 */
export function depthAt(p: Perspective, y: number, cameraDepth: number): number {
  const scale = scaleAt(p, y);
  return scale <= 0 ? Infinity : cameraDepth / scale - cameraDepth;
}
