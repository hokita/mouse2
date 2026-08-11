import { describe, expect, it } from 'vitest';
import { createLives, hit, tickLives, isInvincible } from '../lives';

describe('lives', () => {
  it('starts with the given count and not invincible', () => {
    const state = createLives(3);
    expect(state.lives).toBe(3);
    expect(isInvincible(state)).toBe(false);
  });

  it('a hit removes one life and starts invincibility', () => {
    const result = hit(createLives(3), 1500);
    expect(result.tookHit).toBe(true);
    expect(result.dead).toBe(false);
    expect(result.state.lives).toBe(2);
    expect(isInvincible(result.state)).toBe(true);
  });

  it('ignores hits while invincible', () => {
    const first = hit(createLives(3), 1500);
    const second = hit(first.state, 1500);
    expect(second.tookHit).toBe(false);
    expect(second.state.lives).toBe(2);
  });

  it('invincibility expires after ticking down', () => {
    const first = hit(createLives(3), 1500);
    const ticked = tickLives(first.state, 1500);
    expect(isInvincible(ticked)).toBe(false);
    expect(hit(ticked, 1500).state.lives).toBe(1);
  });

  it('reports dead when the last life is lost', () => {
    const result = hit(createLives(1), 1500);
    expect(result.dead).toBe(true);
    expect(result.state.lives).toBe(0);
  });

  it('tick never drops the timer below zero', () => {
    const ticked = tickLives(createLives(3), 500);
    expect(ticked.invincibleMs).toBe(0);
  });
});
