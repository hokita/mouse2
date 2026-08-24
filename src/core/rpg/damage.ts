import { affinityBand, elementMultiplier } from './elements';
import type { Affinity, AffinityBand, Element } from './elements';
import type { Rng } from './rng';

// The damage formula. Everything the player will ever be told about combat
// maths comes out of this function as a single number on screen, so the shape
// of it matters more than usual: the numbers have to be small enough to read
// at a glance and separated enough that a good decision looks different from
// a bad one.

/** A guarding target takes half. Deliberately a round, guessable number. */
export const GUARD_MULT = 0.5;

/**
 * Defence softness. Damage is scaled by DEF_PIVOT / (DEF_PIVOT + defence), so
 * defence equal to the pivot halves a hit. A subtractive formula was the
 * other option and was rejected: it lets defence reach zero damage, and a
 * fight where nothing happens is unreadable when nothing can be written.
 */
const DEF_PIVOT = 60;

/** Swing-to-swing noise, +/- 10%. Enough to feel alive, too small to mislead. */
const VARIANCE = 0.1;

export interface DamageInput {
  /** 100 is a baseline swing; a heavy skill is 150-200. */
  power: number;
  element: Element;
  /** Already resolved to atk or mag by the caller. */
  attackStat: number;
  defense: number;
  affinity?: Affinity;
  guarding?: boolean;
  /** Attack-down and friends, from `status.attackMultiplier`. */
  attackerMult?: number;
}

export interface DamageResult {
  amount: number;
  /** How the scene should draw the number: big and tinted, or small and grey. */
  band: AffinityBand;
}

export function computeDamage(input: DamageInput, rng: Rng): DamageResult {
  const { power, element, attackStat, defense, affinity = {}, guarding = false, attackerMult = 1 } = input;

  const multiplier = elementMultiplier(element, affinity);
  const roll = 1 + (rng() * 2 - 1) * VARIANCE;

  const raw =
    attackStat *
    (power / 100) *
    (DEF_PIVOT / (DEF_PIVOT + defense)) *
    multiplier *
    attackerMult *
    (guarding ? GUARD_MULT : 1) *
    roll;

  // Floor, then a hard minimum of one: a hit that shows 0 reads as a miss,
  // and this game has no misses to explain.
  return { amount: Math.max(1, Math.floor(raw)), band: affinityBand(multiplier) };
}

/** Healing skips defence and elements — only the healer and the skill matter. */
export function computeHeal(power: number, magStat: number, rng: Rng): number {
  const roll = 1 + (rng() * 2 - 1) * VARIANCE;
  return Math.max(1, Math.floor(magStat * (power / 100) * roll));
}
