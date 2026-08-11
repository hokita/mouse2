import type { Rect } from './collision';

// A moving object is only ever sampled once per frame, so a fast enough one
// can sit clear of a target on frame N and clear of it again on frame N + 1
// while having passed straight through it in between. These helpers widen a
// rect to cover the whole span it travelled since its previous position, so
// the ordinary `intersects()` check catches that pass-through.

/** Rect covering the horizontal span between a previous left edge and `rect`. */
export function sweepX(rect: Rect, previousX: number): Rect {
  const left = Math.min(rect.x, previousX);
  const right = Math.max(rect.x + rect.width, previousX + rect.width);
  return { x: left, y: rect.y, width: right - left, height: rect.height };
}

/** Rect covering the vertical span between a previous top edge and `rect`. */
export function sweepY(rect: Rect, previousY: number): Rect {
  const top = Math.min(rect.y, previousY);
  const bottom = Math.max(rect.y + rect.height, previousY + rect.height);
  return { x: rect.x, y: top, width: rect.width, height: bottom - top };
}
