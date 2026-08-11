export function wobbleX(
  baseX: number,
  elapsedMs: number,
  amplitude: number,
  periodMs: number
): number {
  return baseX + amplitude * Math.sin((2 * Math.PI * elapsedMs) / periodMs);
}
