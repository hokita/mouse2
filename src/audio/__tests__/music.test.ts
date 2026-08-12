import { describe, expect, it } from 'vitest';
import { MUSIC, musicLengthSec } from '../music';
import { noteToFreq } from '../notes';

// MUSIC is pure data (no Web Audio touched at module scope), so this is the
// one place the loop invariant documented at the top of music.ts — all three
// arrays in a spec are exactly 32 entries — actually gets checked. Nothing
// else here would catch a short bass or drums array; tsc sees only `Step[]`
// and `Drum[]`, and a truncated loop is inaudible until someone listens for
// the seam.
describe.each(Object.entries(MUSIC))('MUSIC.%s', (_name, spec) => {
  it('has 32 steps in bass, lead and drums', () => {
    expect(spec.bass).toHaveLength(32);
    expect(spec.lead).toHaveLength(32);
    expect(spec.drums).toHaveLength(32);
  });

  it('parses every non-null bass and lead step as a note', () => {
    for (const step of [...spec.bass, ...spec.lead]) {
      if (step === null) {
        continue;
      }
      expect(() => noteToFreq(step)).not.toThrow();
    }
  });

  it('keeps bpm within the design’s 100–120 range', () => {
    expect(spec.bpm).toBeGreaterThanOrEqual(100);
    expect(spec.bpm).toBeLessThanOrEqual(120);
  });

  it('loops in eight to ten seconds', () => {
    const length = musicLengthSec(spec);
    expect(length).toBeGreaterThanOrEqual(8);
    expect(length).toBeLessThanOrEqual(10);
  });
});
