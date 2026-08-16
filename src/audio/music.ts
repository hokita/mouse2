import { loopLengthSec, sequence, stepDurationSec } from './notes';
import type { Step } from './notes';
import { noise, tone } from './synth';

// Five loops, three tracks each: a bass, a lead and a drum row. Every track is
// 32 steps of an eighth note, which at 100–120 bpm is a loop of eight to ten
// seconds — long enough not to nag, short enough to render at boot.
//
// All three arrays in a spec MUST be 32 entries. The loop point comes from the
// lead, so a short bass array would silently truncate the loop.

export type MusicName = 'menu' | 'dodger' | 'car' | 'fish' | 'reel';
export type Drum = 'kick' | 'hat' | null;

export interface MusicSpec {
  bpm: number;
  leadType: OscillatorType;
  leadGain: number;
  bass: Step[];
  lead: Step[];
  drums: Drum[];
}

const STEPS_PER_BEAT = 2;

const _ = null;
const k: Drum = 'kick';
const h: Drum = 'hat';

export const MUSIC: Record<MusicName, MusicSpec> = {
  // Calm, unhurried, and quiet enough to sit under a decision.
  menu: {
    bpm: 100,
    leadType: 'triangle',
    leadGain: 0.16,
    bass: [
      'D2', _, _, _, 'D2', _, _, _,
      'A2', _, _, _, 'A2', _, _, _,
      'B2', _, _, _, 'B2', _, _, _,
      'G2', _, _, _, 'G2', _, _, _,
    ],
    lead: [
      'D4', _, 'F#4', _, 'A4', _, 'F#4', _,
      'E4', _, 'A4', _, 'C#5', _, 'A4', _,
      'D5', _, 'B4', _, 'F#4', _, 'B4', _,
      'G4', _, 'B4', _, 'D5', _, 'B4', _,
    ],
    drums: [
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, _, _,
      k, _, _, _, h, _, h, _,
    ],
  },

  // Driving: a walking bass and a busy arpeggio, minor and forward-leaning.
  dodger: {
    bpm: 120,
    leadType: 'square',
    leadGain: 0.13,
    bass: [
      'A1', _, 'A1', _, 'A1', _, 'G1', _,
      'A1', _, 'A1', _, 'C2', _, 'B1', _,
      'A1', _, 'A1', _, 'A1', _, 'G1', _,
      'F1', _, 'F1', _, 'E1', _, 'E1', _,
    ],
    lead: [
      'A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'E5', 'G5',
      'A4', 'C5', 'E5', 'C5', 'B4', 'D5', 'F#5', 'D5',
      // Bar 3 was a verbatim repeat of bar 1, which made the loop feel half
      // as long as it is. Same A-minor triad (+ G passing tone) as bar 1, so
      // it still sits on the same bass, but starts on the fifth and inverts
      // the contour instead of retracing it.
      'E5', 'C5', 'A4', 'C5', 'E5', 'G5', 'A4', 'C5',
      'F4', 'A4', 'C5', 'A4', 'E4', 'G#4', 'B4', 'E5',
    ],
    drums: [
      k, h, _, h, k, h, _, h,
      k, h, _, h, k, h, h, h,
      k, h, _, h, k, h, _, h,
      k, h, _, h, k, h, k, h,
    ],
  },

  // A night drive: a steady pulse on the beat, the lead sparse above it.
  car: {
    bpm: 112,
    leadType: 'sawtooth',
    leadGain: 0.1,
    bass: [
      'E2', _, 'E2', _, 'E2', _, 'E2', _,
      'E2', _, 'E2', _, 'D2', _, 'D2', _,
      'C2', _, 'C2', _, 'C2', _, 'C2', _,
      'B1', _, 'B1', _, 'B1', _, 'B1', _,
    ],
    lead: [
      'B4', _, _, 'E5', _, _, 'B4', _,
      _, 'G4', _, _, 'B4', _, _, _,
      'C5', _, _, 'G4', _, _, 'E5', _,
      _, 'D5', _, _, 'B4', _, _, _,
    ],
    drums: [
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, _, h, h,
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, _, h, h,
    ],
  },

  // Sparse and watery: long bass notes, a melody with room between the notes,
  // and almost no percussion.
  fish: {
    bpm: 104,
    leadType: 'triangle',
    leadGain: 0.18,
    bass: [
      'G2', _, _, _, 'G2', _, _, _,
      'C3', _, _, _, 'C3', _, _, _,
      'E2', _, _, _, 'E2', _, _, _,
      'A2', _, _, _, 'A2', _, _, _,
    ],
    lead: [
      'G4', _, _, 'B4', _, 'D5', _, _,
      'E5', _, _, 'D5', _, _, 'B4', _,
      'G4', _, 'B4', _, _, 'E5', _, _,
      'D5', _, _, 'B4', _, 'G4', _, _,
    ],
    drums: [
      k, _, _, _, _, _, _, _,
      _, _, _, _, h, _, _, _,
      k, _, _, _, _, _, _, _,
      _, _, _, _, h, _, _, _,
    ],
  },

  // A rolling shanty for Reel Rush: the bass rocks like a hull, the lead
  // works up and down the D-minor scale the way a reel winds in and pays out.
  reel: {
    bpm: 108,
    leadType: 'square',
    leadGain: 0.12,
    bass: [
      'D2', _, _, _, 'D2', _, 'D2', _,
      'F2', _, _, _, 'F2', _, 'F2', _,
      'C2', _, _, _, 'C2', _, 'C2', _,
      'G2', _, _, _, 'A2', _, 'A2', _,
    ],
    lead: [
      'D4', _, 'F4', 'G4', 'A4', _, 'F4', 'A4',
      'C5', _, 'A4', 'C5', 'D5', _, 'C5', 'A4',
      'G4', _, 'E4', 'G4', 'A4', _, 'G4', 'E4',
      'F4', 'G4', 'A4', _, 'E4', _, 'D4', _,
    ],
    drums: [
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, _, h, h,
      k, _, h, _, k, _, h, _,
      k, _, h, _, k, h, k, _,
    ],
  },
};

export function musicLengthSec(spec: MusicSpec): number {
  return loopLengthSec(spec.lead, spec.bpm, STEPS_PER_BEAT);
}

export function renderMusic(spec: MusicSpec, ctx: BaseAudioContext, dest: AudioNode): void {
  // `gate` only scales how long a single step sounds for; it has no idea
  // what comes after and cannot hold a note across the rests that follow it
  // (see sequence() in notes.ts). A 0.95 gate on the bass just means each
  // struck root rings for 95% of one eighth note, not "until the next bass
  // note" — a low end that reads as continuous under the lead comes from
  // striking the root often (see menu/fish above), not from this gate. A
  // short gate on the lead keeps the arpeggio articulated instead of smeared.
  for (const event of sequence(spec.bass, spec.bpm, STEPS_PER_BEAT, 0.95)) {
    tone(ctx, dest, {
      type: 'triangle',
      freq: event.freq,
      start: event.startSec,
      duration: event.durSec,
      gain: 0.22,
      attack: 0.05,
    });
  }

  for (const event of sequence(spec.lead, spec.bpm, STEPS_PER_BEAT, 0.75)) {
    tone(ctx, dest, {
      type: spec.leadType,
      freq: event.freq,
      start: event.startSec,
      duration: event.durSec,
      gain: spec.leadGain,
      attack: 0.07,
    });
  }

  const step = stepDurationSec(spec.bpm, STEPS_PER_BEAT);
  spec.drums.forEach((drum, index) => {
    if (drum === null) {
      return;
    }
    const start = index * step;
    if (drum === 'kick') {
      tone(ctx, dest, {
        type: 'sine',
        freq: 140,
        endFreq: 46,
        start,
        duration: 0.16,
        gain: 0.3,
        attack: 0.02,
      });
    } else {
      noise(ctx, dest, {
        start,
        duration: 0.045,
        gain: 0.06,
        filterStart: 9000,
        filterEnd: 5200,
      });
    }
  });
}
