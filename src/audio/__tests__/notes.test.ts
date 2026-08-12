import { describe, expect, it } from 'vitest';
import { loopLengthSec, noteToFreq, sequence, stepDurationSec } from '../notes';

describe('noteToFreq', () => {
  it('puts concert A at 440 Hz', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440, 6);
  });

  it('doubles an octave up and halves an octave down', () => {
    expect(noteToFreq('A5')).toBeCloseTo(880, 6);
    expect(noteToFreq('A3')).toBeCloseTo(220, 6);
  });

  it('reads sharps', () => {
    expect(noteToFreq('A#4')).toBeCloseTo(466.164, 3);
    expect(noteToFreq('C4')).toBeCloseTo(261.626, 3);
  });

  it('handles a two-digit octave and a negative one', () => {
    expect(noteToFreq('C0')).toBeCloseTo(16.352, 3);
  });

  it('rejects a note name it cannot parse', () => {
    expect(() => noteToFreq('H4')).toThrow();
    expect(() => noteToFreq('A')).toThrow();
  });
});

describe('stepDurationSec', () => {
  it('splits a beat into steps', () => {
    // 120 bpm is a half-second beat; two steps per beat is a quarter second.
    expect(stepDurationSec(120, 2)).toBeCloseTo(0.25, 6);
    expect(stepDurationSec(100, 4)).toBeCloseTo(0.15, 6);
  });
});

describe('sequence', () => {
  it('places one event per step, in order', () => {
    const events = sequence(['A4', 'A5'], 120, 2);
    expect(events).toHaveLength(2);
    expect(events[0].startSec).toBeCloseTo(0, 6);
    expect(events[1].startSec).toBeCloseTo(0.25, 6);
    expect(events[1].freq).toBeCloseTo(880, 6);
  });

  it('skips rests but keeps the timing of everything after them', () => {
    const events = sequence(['A4', null, 'A4'], 120, 2);
    expect(events).toHaveLength(2);
    expect(events[1].startSec).toBeCloseTo(0.5, 6);
  });

  it('shortens each note by the gate so neighbours never overlap', () => {
    const events = sequence(['A4', 'A4'], 120, 2, 0.8);
    expect(events[0].durSec).toBeCloseTo(0.2, 6);
    expect(events[0].startSec + events[0].durSec).toBeLessThanOrEqual(events[1].startSec);
  });

  it('returns nothing for an empty pattern or one that is all rests', () => {
    expect(sequence([], 120, 2)).toEqual([]);
    expect(sequence([null, null], 120, 2)).toEqual([]);
  });
});

describe('loopLengthSec', () => {
  it('measures the whole pattern, rests included', () => {
    // 32 steps at 120 bpm, two steps to the beat: 32 * 0.25 = 8 seconds.
    expect(loopLengthSec(new Array(32).fill(null), 120, 2)).toBeCloseTo(8, 6);
  });
});
