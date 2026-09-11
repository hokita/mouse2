import { describe, expect, it } from 'vitest';
import { createTrack } from '../track';

/** A small deterministic generator, so a shape can be asserted twice. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('createTrack', () => {
  it('opens every run straight and flat', () => {
    const track = createTrack(lcg(7));
    for (let index = 0; index < 50; index += 1) {
      expect(track.curveAt(index)).toBe(0);
      expect(track.riseAt(index)).toBe(0);
    }
  });

  it('does not stay straight and flat forever', () => {
    const track = createTrack(lcg(7));
    const curves = [];
    const rises = [];
    for (let index = 0; index < 400; index += 1) {
      curves.push(track.curveAt(index));
      rises.push(track.riseAt(index));
    }
    expect(curves.some((curve) => curve > 0.02)).toBe(true);
    expect(curves.some((curve) => curve < -0.02)).toBe(true);
    expect(rises.some((rise) => Math.abs(rise) > 20)).toBe(true);
  });

  it('lays the same road twice for the same generator', () => {
    const first = createTrack(lcg(99));
    const second = createTrack(lcg(99));
    for (let index = 0; index < 300; index += 1) {
      expect(second.curveAt(index)).toBe(first.curveAt(index));
      expect(second.riseAt(index)).toBe(first.riseAt(index));
    }
  });

  it('lays the same road whichever order it is asked about', () => {
    const straight = createTrack(lcg(4));
    const jumped = createTrack(lcg(4));
    // Ask the second one for a far segment first: generating ahead must not
    // change what the segments in between turn out to be.
    jumped.curveAt(280);
    for (let index = 0; index < 280; index += 1) {
      expect(jumped.curveAt(index)).toBe(straight.curveAt(index));
      expect(jumped.riseAt(index)).toBe(straight.riseAt(index));
    }
  });

  it('answers the same question the same way every time', () => {
    const track = createTrack(lcg(11));
    for (const index of [3, 120, 233, 120, 3]) {
      expect(track.curveAt(index)).toBe(track.curveAt(index));
      expect(track.riseAt(index)).toBe(track.riseAt(index));
    }
  });

  it('keeps every bend within the sharpest one it has', () => {
    const track = createTrack(lcg(23));
    for (let index = 0; index < 2000; index += 1) {
      expect(Math.abs(track.curveAt(index))).toBeLessThanOrEqual(0.4);
    }
  });

  it('keeps the road inside its height range however long it runs', () => {
    const track = createTrack(lcg(5));
    for (let index = 0; index < 5000; index += 1) {
      expect(Math.abs(track.riseAt(index))).toBeLessThanOrEqual(260);
    }
  });

  it('climbs and turns smoothly, never in a step', () => {
    const track = createTrack(lcg(31));
    for (let index = 1; index < 2000; index += 1) {
      // The generator gives a climb the room it needs: MAX_SLOPE per segment.
      expect(Math.abs(track.riseAt(index) - track.riseAt(index - 1))).toBeLessThan(5);
      expect(Math.abs(track.curveAt(index) - track.curveAt(index - 1))).toBeLessThan(0.07);
    }
  });

  it('leaves no seam between one section and the next', () => {
    // A section hands its finishing height to the next one as a starting
    // height; a break in that chain would show as a cliff across the road.
    const track = createTrack(lcg(77));
    let previous = track.riseAt(0);
    let biggestStep = 0;
    for (let index = 1; index < 3000; index += 1) {
      const rise = track.riseAt(index);
      biggestStep = Math.max(biggestStep, Math.abs(rise - previous));
      previous = rise;
    }
    expect(biggestStep).toBeLessThan(5);
  });
});
