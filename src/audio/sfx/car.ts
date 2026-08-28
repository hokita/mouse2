import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// --- Car Racer ---------------------------------------------------------

export const CAR = {
  crash: {
    durationSec: 0.6,
    volume: 0.6,
    render(ctx, dest) {
      noise(ctx, dest, {
        start: 0,
        duration: 0.5,
        gain: 0.75,
        filterStart: 3400,
        filterEnd: 120,
      });
      tone(ctx, dest, {
        type: 'sine',
        freq: 160,
        endFreq: 42,
        start: 0,
        duration: 0.42,
        gain: 0.6,
        attack: 0.02,
      });
      // A second, smaller impact: wreckage settling.
      noise(ctx, dest, {
        start: 0.16,
        duration: 0.24,
        gain: 0.3,
        filterStart: 2600,
        filterEnd: 300,
      });
    },
  },

  milestone: {
    durationSec: 0.34,
    volume: 0.4,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('D5'),
        start: 0,
        duration: 0.12,
        gain: 0.4,
        attack: 0.06,
      });
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A5'),
        start: 0.1,
        duration: 0.2,
        gain: 0.4,
        attack: 0.06,
      });
    },
  },
} satisfies Record<string, SfxSpec>;
