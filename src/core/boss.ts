// The final boss's tuning. Everything that decides how hard the fight is
// lives here rather than in the scene, so a test can read the same numbers
// the game runs on — the reasoning that put core/difficulty.ts and
// core/field.ts here too. This module must stay free of Phaser: GameScene
// cannot be imported from a test, and a test that re-declared these numbers
// would go on passing after someone changed the real ones.

/** Degrees to radians. Local rather than Phaser.Math.DegToRad — see above. */
const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * 45 HP. At PLAYER_FIRE_INTERVAL_MS of 400 the player lands 2.5 bullets a
 * second, so this is 18s of perfect uptime and 25-35s of realistic play. It
 * divides into three phases of exactly 15 hits, each roughly 10s — long
 * enough that every phase registers, short enough to hold a small child's
 * attention.
 */
export const BOSS_MAX_HP = 45;

export const BOSS_WIDTH = 230;
export const BOSS_HEIGHT = 120;

/** Where the hull settles, so it spans y 140-260 on a 932-tall screen. */
export const BOSS_STATION_Y = 200;
export const BOSS_SPAWN_Y = -120;
export const BOSS_ARRIVAL_MS = 1200;

/** Clearance from each screen edge at the extremes of the slide. */
export const BOSS_EDGE_MARGIN = 16;

/**
 * When the boss comes. The spawn interval reaches its 700-1000ms floor at
 * 60s, so the player gets 30s at full field pressure first. A time trigger
 * rather than a score one means every run is the same length and a child who
 * survives always reaches the boss.
 */
export const BOSS_TIME_MS = 90_000;

/**
 * How much faster the leftover field falls once the boss is due.
 *
 * An enemy lives (HEIGHT + 2 * ENEMY_HEIGHT) / ENEMY_FALL_SPEED seconds —
 * about 12.2s. One that spawned just before the 90s mark would hold the boss
 * off for that whole time, which is a stall, not a dramatic beat. Tripling
 * caps the wait at about 4.1s while still reading as the field falling away
 * rather than being deleted.
 */
export const BOSS_CLEAR_FALL_MULTIPLIER = 3;

/** Against a tank's 150. The run's whole point, priced accordingly. */
export const BOSS_KILL_POINTS = 1000;

export type BossPhase = 1 | 2 | 3;

export interface BossPhaseSpec {
  /** One full left-right-left sweep. */
  slidePeriodMs: number;
  fanCount: number;
  /** Full width of the fan; the outermost shots sit half of it either side. */
  fanSpreadRadians: number;
  fireIntervalMs: number;
  /** Only the last phase aims at the player. */
  aimedIntervalMs: number | null;
}

export const BOSS_PHASES: Record<BossPhase, BossPhaseSpec> = {
  1: { slidePeriodMs: 5000, fanCount: 3, fanSpreadRadians: deg(45), fireIntervalMs: 1800, aimedIntervalMs: null },
  2: { slidePeriodMs: 3800, fanCount: 5, fanSpreadRadians: deg(80), fireIntervalMs: 1400, aimedIntervalMs: null },
  3: { slidePeriodMs: 3000, fanCount: 5, fanSpreadRadians: deg(80), fireIntervalMs: 1400, aimedIntervalMs: 2200 },
};

/**
 * Which phase `hp` falls in. Boundaries are fractions of max HP, not
 * hardcoded HP values, so retuning BOSS_MAX_HP keeps the three phases equal
 * instead of silently unbalancing them.
 */
export function phaseAt(hp: number, maxHp: number = BOSS_MAX_HP): BossPhase {
  const fraction = hp / maxHp;
  if (fraction > 2 / 3) {
    return 1;
  }
  if (fraction > 1 / 3) {
    return 2;
  }
  return 3;
}
