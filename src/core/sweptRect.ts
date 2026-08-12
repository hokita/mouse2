import type { Rect } from './collision';

// `sweepX`/`sweepY` widen a rect to the axis-aligned union of where it was and
// where it is. That is exact for motion along one axis, but on a diagonal the
// union also covers the two corners the mover never touched — so a target
// sitting in one of those corners registers a hit that never happened. With
// the player free to move on both axes, that error costs the child hearts.
//
// This does the swept test properly: shrink the mover to a point by growing
// the target by the mover's extents (a Minkowski sum), then clip the mover's
// centre path against that grown rect. Motion is treated as a straight line
// between the frame's endpoints, which is what the pointer actually produces.

/** Clips a segment against a rect (Liang–Barsky); true if any of it is inside. */
function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, rect: Rect): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  // Each edge as (direction, distance-to-edge): the segment is inside the slab
  // while distance stays non-negative.
  const edges: Array<[number, number]> = [
    [-dx, x0 - rect.x],
    [dx, rect.x + rect.width - x0],
    [-dy, y0 - rect.y],
    [dy, rect.y + rect.height - y0],
  ];

  let enter = 0;
  let exit = 1;
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      // Parallel to this edge: either wholly inside the slab or wholly outside.
      if (distance < 0) {
        return false;
      }
      continue;
    }
    const t = distance / direction;
    if (direction < 0) {
      if (t > exit) {
        return false;
      }
      enter = Math.max(enter, t);
    } else {
      if (t < enter) {
        return false;
      }
      exit = Math.min(exit, t);
    }
  }
  return true;
}

/**
 * Whether a rect moving in a straight line from `from` to `to` touches
 * `target` at any point along the way. `from` and `to` are the same rect at
 * its start-of-frame and end-of-frame positions.
 */
export function movingRectHitsRect(from: Rect, to: Rect, target: Rect): boolean {
  const grown: Rect = {
    x: target.x - from.width / 2,
    y: target.y - from.height / 2,
    width: target.width + from.width,
    height: target.height + from.height,
  };
  return segmentHitsRect(
    from.x + from.width / 2,
    from.y + from.height / 2,
    to.x + to.width / 2,
    to.y + to.height / 2,
    grown
  );
}
