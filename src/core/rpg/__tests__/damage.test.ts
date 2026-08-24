import { describe, expect, it } from 'vitest';
import { GUARD_MULT, computeDamage, computeHeal } from '../damage';
import { createRng } from '../rng';

/** No variance, so every number below is the formula and nothing else. */
const flat = () => 0.5;

const BASE = { power: 100, element: 'plain' as const, attackStat: 30, defense: 20 };

describe('computeDamage', () => {
  it('never returns a fraction of a point', () => {
    const { amount } = computeDamage({ ...BASE, power: 37 }, createRng(1));
    expect(Number.isInteger(amount)).toBe(true);
  });

  it('scales with the attacker and shrinks against the defender', () => {
    const weak = computeDamage({ ...BASE, attackStat: 15 }, flat).amount;
    const strong = computeDamage({ ...BASE, attackStat: 60 }, flat).amount;
    expect(strong).toBeGreaterThan(weak);

    const soft = computeDamage({ ...BASE, defense: 5 }, flat).amount;
    const armoured = computeDamage({ ...BASE, defense: 80 }, flat).amount;
    expect(soft).toBeGreaterThan(armoured);
  });

  it('lets defence blunt a hit but never erase it', () => {
    const { amount } = computeDamage({ ...BASE, defense: 100000 }, flat);
    expect(amount).toBe(1);
  });

  it('scales with skill power', () => {
    const light = computeDamage({ ...BASE, power: 60 }, flat).amount;
    const heavy = computeDamage({ ...BASE, power: 180 }, flat).amount;
    expect(heavy).toBeGreaterThan(light * 2);
  });

  it('hits far harder on a weakness than off it, and says so', () => {
    const off = computeDamage({ ...BASE, element: 'ice', affinity: { weak: 'fire' } }, flat);
    const on = computeDamage({ ...BASE, element: 'fire', affinity: { weak: 'fire' } }, flat);
    expect(on.amount).toBeGreaterThan(off.amount * 1.5);
    expect(on.band).toBe('weak');
    expect(off.band).toBe('neutral');
  });

  it('reports a resisted hit so the scene can draw it small', () => {
    const result = computeDamage({ ...BASE, element: 'ice', affinity: { resist: 'ice' } }, flat);
    expect(result.band).toBe('resist');
  });

  it('halves a hit on a guarding target', () => {
    const open = computeDamage(BASE, flat).amount;
    const guarded = computeDamage({ ...BASE, guarding: true }, flat).amount;
    expect(guarded).toBe(Math.max(1, Math.floor(open * GUARD_MULT)));
  });

  it('weakens an attacker that is under attack-down', () => {
    const full = computeDamage(BASE, flat).amount;
    const cowed = computeDamage({ ...BASE, attackerMult: 0.6 }, flat).amount;
    expect(cowed).toBeLessThan(full);
  });

  it('varies from swing to swing, but only a little', () => {
    const rng = createRng(4);
    const rolls = Array.from({ length: 200 }, () => computeDamage(BASE, rng).amount);
    const spread = new Set(rolls);
    expect(spread.size).toBeGreaterThan(1);

    const flatAmount = computeDamage(BASE, flat).amount;
    for (const roll of rolls) {
      expect(roll).toBeGreaterThanOrEqual(Math.floor(flatAmount * 0.85));
      expect(roll).toBeLessThanOrEqual(Math.ceil(flatAmount * 1.15));
    }
  });

  it('is reproducible from a seed', () => {
    const a = createRng(77);
    const b = createRng(77);
    expect(computeDamage(BASE, a).amount).toBe(computeDamage(BASE, b).amount);
  });
});

describe('computeHeal', () => {
  it('scales with the healer and the skill', () => {
    expect(computeHeal(100, 40, flat)).toBeGreaterThan(computeHeal(100, 10, flat));
    expect(computeHeal(200, 20, flat)).toBeGreaterThan(computeHeal(80, 20, flat));
  });

  it('always mends at least a point', () => {
    expect(computeHeal(1, 1, flat)).toBeGreaterThanOrEqual(1);
  });

  it('returns whole points', () => {
    expect(Number.isInteger(computeHeal(85, 33, createRng(2)))).toBe(true);
  });
});
