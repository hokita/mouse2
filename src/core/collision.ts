export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rect for a sprite drawn from its centre. Every game object in the project
 * uses the default centred origin, so this is how a sprite's position becomes
 * a collision box.
 */
export function rectAt(centerX: number, centerY: number, width: number, height: number): Rect {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
