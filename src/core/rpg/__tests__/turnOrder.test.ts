import { describe, expect, it } from 'vitest';
import { buildTurnOrder } from '../turnOrder';
import { createRng } from '../rng';

const actor = (id: string, spd: number, alive = true) => ({ id, spd, alive });

describe('buildTurnOrder', () => {
  it('puts the quickest first', () => {
    const order = buildTurnOrder(
      [actor('slow', 4), actor('fast', 20), actor('mid', 10)],
      createRng(1)
    );
    expect(order).toEqual(['fast', 'mid', 'slow']);
  });

  it('leaves the fallen out of the round', () => {
    const order = buildTurnOrder(
      [actor('up', 5), actor('down', 30, false)],
      createRng(1)
    );
    expect(order).toEqual(['up']);
  });

  it('includes everyone still standing exactly once', () => {
    const actors = [actor('a', 9), actor('b', 9), actor('c', 9), actor('d', 9)];
    const order = buildTurnOrder(actors, createRng(3));
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('breaks a tie differently from seed to seed, so speed ties are not a hidden pecking order', () => {
    const actors = [actor('a', 9), actor('b', 9), actor('c', 9), actor('d', 9)];
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => buildTurnOrder(actors, createRng(seed)).join(','))
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('still sorts by speed when a tie is in the middle of the field', () => {
    const order = buildTurnOrder(
      [actor('tieA', 10), actor('quick', 30), actor('tieB', 10), actor('crawl', 1)],
      createRng(9)
    );
    expect(order[0]).toBe('quick');
    expect(order[3]).toBe('crawl');
    expect([order[1], order[2]].sort()).toEqual(['tieA', 'tieB']);
  });

  it('is empty when nobody can act', () => {
    expect(buildTurnOrder([actor('x', 5, false)], createRng(1))).toEqual([]);
  });

  it('is reproducible from a seed', () => {
    const actors = [actor('a', 9), actor('b', 9), actor('c', 9)];
    expect(buildTurnOrder(actors, createRng(12))).toEqual(buildTurnOrder(actors, createRng(12)));
  });
});
