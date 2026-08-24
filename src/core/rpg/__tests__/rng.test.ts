import { describe, expect, it } from 'vitest';
import { createRng, randInt, pick, chance, shuffled } from '../rng';

describe('createRng', () => {
  it('returns the same sequence for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const first = [a(), a(), a(), a()];
    const second = [b(), b(), b(), b()];
    expect(first).toEqual(second);
  });

  it('diverges for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not get stuck on a constant', () => {
    const rng = createRng(0);
    const values = new Set(Array.from({ length: 50 }, () => rng()));
    expect(values.size).toBeGreaterThan(40);
  });
});

describe('randInt', () => {
  it('is inclusive of both ends', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      seen.add(randInt(rng, 1, 3));
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('returns the only value when the range is a point', () => {
    expect(randInt(createRng(5), 4, 4)).toBe(4);
  });
});

describe('pick', () => {
  it('chooses a member of the array', () => {
    const rng = createRng(3);
    const options = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(options).toContain(pick(rng, options));
    }
  });

  it('reaches every member given enough draws', () => {
    const rng = createRng(11);
    const options = ['a', 'b', 'c'];
    const seen = new Set(Array.from({ length: 200 }, () => pick(rng, options)));
    expect(seen.size).toBe(3);
  });
});

describe('chance', () => {
  it('never fires at probability 0 and always fires at 1', () => {
    const rng = createRng(21);
    for (let i = 0; i < 50; i += 1) {
      expect(chance(rng, 0)).toBe(false);
      expect(chance(rng, 1)).toBe(true);
    }
  });

  it('fires at roughly the requested rate', () => {
    const rng = createRng(42);
    let hits = 0;
    for (let i = 0; i < 4000; i += 1) {
      if (chance(rng, 0.25)) {
        hits += 1;
      }
    }
    expect(hits / 4000).toBeGreaterThan(0.21);
    expect(hits / 4000).toBeLessThan(0.29);
  });
});

describe('shuffled', () => {
  it('keeps every member and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffled(createRng(8), input);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('actually reorders', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const orders = new Set(
      Array.from({ length: 20 }, (_, seed) => shuffled(createRng(seed), input).join(','))
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
