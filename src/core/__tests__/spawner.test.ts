import { describe, expect, it } from 'vitest';
import { createSpawner, retuneSpawner, tickSpawner } from '../spawner';

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

  it('carries the overflow time forward after spawning, instead of discarding it', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 600);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.timer).toBe(100);
  });

  it('carries forward a large overflow from a single big delta tick', () => {
    const state = createSpawner(500, 500);
    const result = tickSpawner(state, 1300);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.timer).toBe(800);
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

describe('retuneSpawner', () => {
  it('keeps the time already banked toward the next spawn', () => {
    let state = createSpawner(1000, 1000);
    state = tickSpawner(state, 400).state;
    expect(retuneSpawner(state, 500, 700).timer).toBe(400);
  });

  it('takes the new range', () => {
    const state = retuneSpawner(createSpawner(1000, 1000), 500, 700);
    expect(state.minInterval).toBe(500);
    expect(state.maxInterval).toBe(700);
  });

  it('pulls a too-long pending interval down into the new range', () => {
    const state = retuneSpawner(createSpawner(1000, 1000), 500, 700);
    expect(state.nextInterval).toBe(700);
  });

  it('pushes a too-short pending interval up into the new range', () => {
    const state = retuneSpawner(createSpawner(200, 200), 500, 700);
    expect(state.nextInterval).toBe(500);
  });

  it('leaves a pending interval that is already in range alone', () => {
    const state = retuneSpawner(createSpawner(600, 600), 500, 700);
    expect(state.nextInterval).toBe(600);
  });

  it('spawns on the next tick when the banked time already covers the new interval', () => {
    let state = createSpawner(2000, 2000);
    state = tickSpawner(state, 700).state;
    state = retuneSpawner(state, 500, 500);
    expect(tickSpawner(state, 16).shouldSpawn).toBe(true);
  });
});
