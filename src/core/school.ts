// Big Bite's visible school: the fish swim in the deep band where the player
// can see them, and the cast is aimed at one of them. Pure and dt-driven,
// like the rest of core/ — the scene owns nothing but the pictures.

import type { CatchRarity } from './haul';
import { RARITIES } from './haul';

export interface SchoolBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SchoolConfig {
  /** Where the school may swim. */
  bounds: SchoolBounds;
  /** Target population; thinned by hooks, refilled on a timer. */
  fishCount: number;
  respawnDelayMs: number;
  /** Spawn odds per rarity. */
  weights: Record<CatchRarity, number>;
  /** Cruise speed per rarity, px/sec, jittered per fish. */
  speeds: Record<CatchRarity, number>;
  /** ± fraction applied to the cruise speed, rolled per fish. */
  speedJitter: number;
  /** A swimming fish this close to the hook turns and lunges for it. */
  biteRadius: number;
  /** A lunging fish this close to the hook has bitten. */
  catchRadius: number;
  /** How fast a lunge closes on the hook, px/sec. */
  lungeSpeed: number;
  /** A hook ignored this long pulls the nearest fish in — no dead casts. */
  attractAfterMs: number;
}

export interface Fish {
  id: number;
  rarity: CatchRarity;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  lunging: boolean;
}

export interface SchoolState {
  fish: Fish[];
  nextId: number;
  respawnInMs: number;
  /** How long the current hook has sat untouched. */
  hookIdleMs: number;
}

function between(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

function rollRarity(weights: Record<CatchRarity, number>, random: () => number): CatchRarity {
  const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  let roll = random() * total;
  for (const rarity of RARITIES) {
    roll -= weights[rarity];
    if (roll < 0) {
      return rarity;
    }
  }
  return RARITIES[RARITIES.length - 1];
}

/** Roll order: rarity, x, y, dir, speed jitter. */
function spawnFish(id: number, config: SchoolConfig, random: () => number): Fish {
  const rarity = rollRarity(config.weights, random);
  const { bounds } = config;
  const x = between(bounds.minX, bounds.maxX, random);
  const y = between(bounds.minY, bounds.maxY, random);
  const dir: 1 | -1 = random() < 0.5 ? -1 : 1;
  const jitter = 1 + (random() * 2 - 1) * config.speedJitter;
  return { id, rarity, x, y, dir, speed: config.speeds[rarity] * jitter, lunging: false };
}

export function createSchool(config: SchoolConfig, random: () => number = Math.random): SchoolState {
  const fish: Fish[] = [];
  for (let i = 0; i < config.fishCount; i += 1) {
    fish.push(spawnFish(i, config, random));
  }
  return { fish, nextId: config.fishCount, respawnInMs: config.respawnDelayMs, hookIdleMs: 0 };
}

export interface HookPoint {
  x: number;
  y: number;
}

/**
 * Advances the school. `hook` is where the bait hangs, or null when nothing
 * is in the water. When a lunging fish reaches the hook it is returned as
 * `bitten` and leaves the school — it is on the line now, not in the water.
 */
export function tickSchool(
  state: SchoolState,
  dt: number,
  hook: HookPoint | null,
  config: SchoolConfig,
  random: () => number = Math.random
): { state: SchoolState; bitten: Fish | null } {
  const seconds = dt / 1000;
  const { bounds } = config;
  // The idle clock runs while a hook sits in the water untouched.
  const hookIdleMs = hook === null ? 0 : state.hookIdleMs + dt;

  let bitten: Fish | null = null;
  const fish: Fish[] = [];
  for (const one of state.fish) {
    if (one.lunging && hook !== null) {
      const dx = hook.x - one.x;
      const dy = hook.y - one.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.min(config.lungeSpeed * seconds, dist);
      const x = dist === 0 ? one.x : one.x + (dx / dist) * step;
      const y = dist === 0 ? one.y : one.y + (dy / dist) * step;
      const moved: Fish = { ...one, x, y, dir: dx >= 0 ? 1 : -1 };
      if (Math.hypot(hook.x - x, hook.y - y) <= config.catchRadius) {
        // On the line now, not in the water.
        bitten = moved;
      } else {
        fish.push(moved);
      }
    } else {
      let { x, dir } = one;
      x += dir * one.speed * seconds;
      if (x > bounds.maxX) {
        x = bounds.maxX;
        dir = -1;
      } else if (x < bounds.minX) {
        x = bounds.minX;
        dir = 1;
      }
      fish.push({ ...one, x, dir, lunging: false });
    }
  }

  // One suitor at a time: the nearest fish takes the hook, either because it
  // wandered into the bite radius or because the hook has idled long enough
  // that the nearest fish anywhere comes for it — no cast may dead-end.
  if (hook !== null && bitten === null && !fish.some((one) => one.lunging)) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < fish.length; i += 1) {
      const dist = Math.hypot(hook.x - fish[i].x, hook.y - fish[i].y);
      if (dist < nearestDist) {
        nearest = i;
        nearestDist = dist;
      }
    }
    if (nearest >= 0 && (nearestDist <= config.biteRadius || hookIdleMs >= config.attractAfterMs)) {
      fish[nearest] = { ...fish[nearest], lunging: true };
    }
  }

  let { nextId, respawnInMs } = state;
  if (fish.length < config.fishCount) {
    respawnInMs -= dt;
    if (respawnInMs <= 0) {
      fish.push(spawnFish(nextId, config, random));
      nextId += 1;
      respawnInMs = config.respawnDelayMs;
    }
  } else {
    respawnInMs = config.respawnDelayMs;
  }

  return {
    state: { fish, nextId, respawnInMs, hookIdleMs },
    bitten,
  };
}
