import { describe, expect, it } from 'vitest';
import { createDistance, getDistanceValue, tickDistance } from '../distance';

describe('distance', () => {
  it('starts at zero', () => {
    expect(getDistanceValue(createDistance())).toBe(0);
  });

  it('accumulates speed over time', () => {
    const state = tickDistance(createDistance(), 300, 1000);
    expect(state.pixels).toBe(300);
  });

  it('adds up across ticks', () => {
    let state = createDistance();
    state = tickDistance(state, 300, 500);
    state = tickDistance(state, 600, 500);
    expect(state.pixels).toBe(450);
  });

  it('reports distance in whole metres', () => {
    const state = tickDistance(createDistance(), 250, 1000);
    expect(getDistanceValue(state)).toBe(25);
  });

  it('rounds partial metres down', () => {
    const state = tickDistance(createDistance(), 259, 1000);
    expect(getDistanceValue(state)).toBe(25);
  });

  it('does not mutate the state it is given', () => {
    const state = createDistance();
    tickDistance(state, 300, 1000);
    expect(state.pixels).toBe(0);
  });
});
