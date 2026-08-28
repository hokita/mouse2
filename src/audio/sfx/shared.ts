import { noteToFreq } from '../notes';
import { noise, tone } from '../synth';
import type { SfxSpec } from './spec';

// Sounds that belong to no single game: the menu's tap, the transition into
// a run, and the sting that ends one.

export const SHARED = {
  tap: {
    durationSec: 0.12,
    volume: 0.45,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'square',
        freq: noteToFreq('E5'),
        start: 0,
        duration: 0.07,
        gain: 0.5,
        attack: 0.05,
      });
    },
  },

  launch: {
    durationSec: 0.34,
    volume: 0.5,
    render(ctx, dest) {
      tone(ctx, dest, {
        type: 'triangle',
        freq: noteToFreq('A3'),
        endFreq: noteToFreq('A5'),
        start: 0,
        duration: 0.28,
        gain: 0.5,
        attack: 0.12,
      });
      noise(ctx, dest, {
        start: 0,
        duration: 0.28,
        gain: 0.07,
        filterStart: 900,
        filterEnd: 6000,
      });
    },
  },

  gameover: {
    durationSec: 0.9,
    volume: 0.6,
    render(ctx, dest) {
      // Three steps down. The last one is held longest so the run reads as
      // over rather than interrupted.
      const notes: Array<[string, number, number]> = [
        ['G4', 0, 0.18],
        ['E4', 0.18, 0.18],
        ['A3', 0.36, 0.5],
      ];
      for (const [note, start, duration] of notes) {
        tone(ctx, dest, {
          type: 'square',
          freq: noteToFreq(note),
          start,
          duration,
          gain: 0.45,
          attack: 0.06,
        });
        tone(ctx, dest, {
          type: 'triangle',
          freq: noteToFreq(note) / 2,
          start,
          duration,
          gain: 0.3,
          attack: 0.06,
        });
      }
    },
  },
} satisfies Record<string, SfxSpec>;
