import { describe, expect, it } from 'vitest';
import { ENEMY_HEIGHT, enemiesOnScreen, enemyLifetimeMs } from '../field';

describe('enemyLifetimeMs', () => {
  it('covers the screen plus a body height either side', () => {
    // 932 + 2 * 83.33 = 1098.67px at 90px/s.
    expect(enemyLifetimeMs()).toBeCloseTo(((932 + 2 * ENEMY_HEIGHT) / 90) * 1000, 5);
  });

  it('halves when enemies fall twice as fast', () => {
    expect(enemyLifetimeMs(180)).toBeCloseTo(enemyLifetimeMs(90) / 2, 5);
  });
});

describe('enemiesOnScreen', () => {
  it('is lifetime over the spawn interval', () => {
    expect(enemiesOnScreen(1000)).toBeCloseTo(enemyLifetimeMs() / 1000, 5);
  });

  it('doubles when enemies spawn twice as often', () => {
    expect(enemiesOnScreen(500)).toBeCloseTo(enemiesOnScreen(1000) * 2, 5);
  });
});
