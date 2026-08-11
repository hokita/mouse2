export interface DistanceState {
  pixels: number;
}

/** How many pixels of road count as one displayed metre. */
const PIXELS_PER_METRE = 10;

export function createDistance(): DistanceState {
  return { pixels: 0 };
}

export function tickDistance(state: DistanceState, speed: number, dt: number): DistanceState {
  return { pixels: state.pixels + speed * (dt / 1000) };
}

export function getDistanceValue(state: DistanceState): number {
  return Math.floor(state.pixels / PIXELS_PER_METRE);
}
