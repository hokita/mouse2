export function laneCenterX(lane: number, laneCount: number, roadLeft: number, roadWidth: number): number {
  return roadLeft + (roadWidth * (lane + 0.5)) / laneCount;
}

export function freeLanes(occupied: readonly number[], laneCount: number): number[] {
  const taken = new Set(occupied);
  const free: number[] = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    if (!taken.has(lane)) {
      free.push(lane);
    }
  }
  return free;
}

// Picks a lane to drop a new traffic car into, or null when there is nowhere
// safe to put one. `occupied` lists the lanes that still hold traffic close
// enough to the top of the road that a new car would land alongside it.
//
// Spawning is refused whenever it would leave the player one lane or fewer to
// aim at: with laneCount lanes, an unlucky random sequence could otherwise
// wall off the whole road within a couple of spawn intervals and kill a
// player who did nothing wrong. Keeping one lane open is what makes every
// wave passable rather than merely usually passable.
export function pickSpawnLane(
  occupied: readonly number[],
  laneCount: number,
  random: () => number = Math.random
): number | null {
  const free = freeLanes(occupied, laneCount);
  if (free.length <= 1) {
    return null;
  }
  // random() is documented as [0, 1), but clamp anyway so a stubbed or
  // rounding-edge 1 can't index past the end of the array.
  const index = Math.min(free.length - 1, Math.floor(random() * free.length));
  return free[index];
}
