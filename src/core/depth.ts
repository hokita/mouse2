/** How many horizontal bands Reel Rush slices its water column into. */
export const BAND_COUNT = 3;

/**
 * What a fish from each band pays, shallowest first. The whole game is this
 * table: deeper water means faster fish and a longer reach for the hook, and
 * the payout is what makes that trip worth taking.
 */
export const BAND_POINTS = [10, 20, 30] as const;

/** The golden fish pays the same wherever it swims — it is the prize itself. */
export const RARE_POINTS = 50;

/** Hooking junk costs the same as Fish Catch's trash, for the same reason:
 * enough to sting, not enough to feel like the run is ruined. */
export const JUNK_POINTS = -15;

/**
 * Which band a depth `y` falls in, 0 being the shallowest.
 *
 * Clamped at both ends rather than trusted: swimmers bob a few pixels around
 * their spawn depth, so one riding the very top or bottom edge of the column
 * must still land in a real band instead of indexing off the table.
 */
export function depthBandAt(y: number, top: number, bottom: number, bandCount: number = BAND_COUNT): number {
  if (bandCount <= 1 || bottom <= top) {
    return 0;
  }
  const t = (y - top) / (bottom - top);
  const band = Math.floor(t * bandCount);
  return Math.min(bandCount - 1, Math.max(0, band));
}

/** Centre depth of a band — where the guide labels and spawns anchor. */
export function bandCenterY(band: number, top: number, bottom: number, bandCount: number = BAND_COUNT): number {
  const height = (bottom - top) / bandCount;
  return top + height * (band + 0.5);
}
