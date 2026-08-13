// The grid of holes the pond's targets surface from — a shared source of
// truth so the hole positions and anything laid out relative to them (the
// backdrop's lily pads and reeds, in particular) can't drift apart.

export const COLUMNS = 3;
export const ROWS = 4;
export const HOLE_COUNT = COLUMNS * ROWS;
export const HOLE_LEFT = 76;
export const HOLE_COLUMN_GAP = 139;
export const HOLE_TOP = 246;
export const HOLE_ROW_GAP = 152;

/** Centre of hole `hole`, indexed left-to-right, then top-to-bottom. */
export function holeCenter(hole: number): { x: number; y: number } {
  return {
    x: HOLE_LEFT + (hole % COLUMNS) * HOLE_COLUMN_GAP,
    y: HOLE_TOP + Math.floor(hole / COLUMNS) * HOLE_ROW_GAP,
  };
}
