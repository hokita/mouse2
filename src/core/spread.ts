export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Velocities for `count` bullets fanned symmetrically about straight down.
 * `spreadRadians` is the full width of the fan, so the outermost bullets sit
 * half of it either side of vertical. Screen y grows downward, so straight
 * down is `{ vx: 0, vy: speed }`.
 */
export function fanVelocities(count: number, spreadRadians: number, speed: number): Velocity[] {
  if (count <= 1) {
    return [{ vx: 0, vy: speed }];
  }
  const step = spreadRadians / (count - 1);
  return Array.from({ length: count }, (_, index) => {
    const angle = -spreadRadians / 2 + step * index;
    return { vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed };
  });
}
