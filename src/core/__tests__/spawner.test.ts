import { describe, expect, it } from 'vitest';
import { createSpawner, tickSpawner } from '../spawner';

describe('spawner', () => {
  it('does not spawn before the interval elapses', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 300);
    expect(result.shouldSpawn).toBe(false);
  });

  it('spawns once the interval has elapsed', () => {
    let state = createSpawner(500, 500);
    let result = tickSpawner(state, 300);
    state = result.state;
    result = tickSpawner(state, 300);
    expect(result.shouldSpawn).toBe(true);
  });

  it('resets the timer after spawning', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 600);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.timer).toBe(0);
  });

  it('picks the minimum interval when random() returns 0', () => {
    const state = createSpawner(100, 200, () => 0);
    expect(state.nextInterval).toBe(100);
  });

  it('picks the maximum interval when random() returns 1', () => {
    const state = createSpawner(100, 200, () => 1);
    expect(state.nextInterval).toBe(200);
  });
});
