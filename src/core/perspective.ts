/**
 * The camera Car Racer's road is drawn through.
 *
 * A pinhole eye sitting `depth` behind the player and `height` above the road,
 * looking level along it. Everything the game draws — the road's own strips,
 * the traffic standing on them, the palms down the verges — is placed by these
 * three functions, so the world can bend and rise underneath the player
 * without anything having to be told about it twice.
 *
 * The units are the ones the distance readout counts in: a depth of 1 is a
 * metre of road. Lateral offsets are given at the player's own row, where the
 * projection is 1:1 — which makes them screen pixels as well, and is what lets
 * the lanes, the car's width and its collision box all stay in the numbers the
 * game was tuned with.
 *
 * It lives in core rather than with the scene's art because it sizes the
 * hitboxes as much as the picture: a projection that could disagree with what
 * is drawn is one the player would feel as an unfair crash.
 */

export interface Camera {
  /** Screen y a flat road runs away to. Eye level. */
  horizonY: number;
  /** Screen y of the road at depth zero — the player's own row. */
  baseY: number;
  /** Screen x a straight road converges to. */
  centerX: number;
  /** How far behind depth zero the eye sits, in metres of road. */
  depth: number;
  /** How high the eye sits above the road, in the units `rise` is given in. */
  height: number;
}

/**
 * How big something at depth `z` is drawn: 1 at the player's row, half that a
 * camera-depth further on, and larger for the road that carries on past the
 * player toward the bottom of the screen.
 *
 * Zero behind the eye, where perspective has nothing to say — a point there
 * would otherwise come back mirrored and enormous.
 */
export function scaleAt(camera: Camera, z: number): number {
  const fromEye = z + camera.depth;
  return fromEye <= 0 ? 0 : camera.depth / fromEye;
}

/** Screen x of something `offsetX` to the side of the road's centre line. */
export function screenXAt(camera: Camera, z: number, offsetX: number): number {
  return camera.centerX + offsetX * scaleAt(camera, z);
}

/**
 * How far down the road the ground has to be for it to sit `pixels` higher up
 * the screen than the ground at the player's row.
 *
 * The bridge between a thing's picture and its footprint, and the exact
 * inverse of `screenYAt` rather than the straight-line guess at it: something
 * drawn 50 px tall at 1:1 covers this much road, so this is the length at
 * which it should be hit. Size a footprint any other way and the collision
 * disagrees with the only thing the player can actually see — a crash with
 * clear road still showing between the two cars.
 *
 * Infinite at the horizon and beyond, where no amount of road is enough.
 */
export function depthOfPixels(camera: Camera, pixels: number): number {
  const drop = camera.baseY - camera.horizonY;
  return pixels >= drop ? Infinity : (camera.depth * pixels) / (drop - pixels);
}

/**
 * Screen y of ground at depth `z` that stands `rise` above the ground under
 * the camera.
 *
 * Level ground runs to the horizon; ground as high as the eye is level with it
 * however far away it is, and anything higher climbs above it. That is the
 * whole of what makes a hill read as a hill.
 */
export function screenYAt(camera: Camera, z: number, rise = 0): number {
  const drop = camera.baseY - camera.horizonY;
  return camera.horizonY + drop * scaleAt(camera, z) * (1 - rise / camera.height);
}
