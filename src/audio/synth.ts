// Two voices — a shaped oscillator and a filtered noise burst — are enough to
// build every sound in the game, the same way a handful of draw calls build
// every sprite in ui/textures.ts.
//
// Everything takes an explicit `start` time in context seconds and writes into
// a BaseAudioContext, so the same code renders into an OfflineAudioContext at
// boot without knowing it is not playing live.

export interface ToneOptions {
  type: OscillatorType;
  freq: number;
  /** Sweeps from `freq` to here across the note when given. */
  endFreq?: number;
  start: number;
  duration: number;
  gain: number;
  /** Fraction of the note spent ramping up. Small is percussive. */
  attack?: number;
}

/**
 * Gain never ramps to or from a true zero: exponentialRampToValueAtTime is
 * undefined at 0, and a linear ramp on a decaying note clicks. A near-silent
 * floor is the standard dodge.
 */
const SILENCE = 0.0001;

export function tone(ctx: BaseAudioContext, dest: AudioNode, opts: ToneOptions): void {
  const { type, freq, endFreq, start, duration, gain, attack = 0.08 } = opts;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENCE, start);
  env.gain.exponentialRampToValueAtTime(Math.max(SILENCE, gain), start + duration * attack);
  env.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

  osc.connect(env).connect(dest);
  osc.start(start);
  // A hair of tail past the envelope, so the stop itself is never the click.
  osc.stop(start + duration + 0.01);
}

export interface NoiseOptions {
  start: number;
  duration: number;
  gain: number;
  /** Low-pass cutoff at the top of the burst and at its end. */
  filterStart?: number;
  filterEnd?: number;
}

export function noise(ctx: BaseAudioContext, dest: AudioNode, opts: NoiseOptions): void {
  const { start, duration, gain, filterStart = 4000, filterEnd = 300 } = opts;

  const frames = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // A cutoff falling across the burst is what turns white noise into an
  // explosion rather than a hiss: the bright edge arrives first and the body
  // darkens as it decays.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterStart, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), start + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(Math.max(SILENCE, gain), start);
  env.gain.exponentialRampToValueAtTime(SILENCE, start + duration);

  src.connect(filter).connect(env).connect(dest);
  src.start(start);
  src.stop(start + duration);
}

/**
 * Renders one sound to a buffer. OfflineAudioContext needs no user gesture and
 * renders far faster than real time, so every sound in the game can be built
 * at boot and then played like any loaded file.
 */
export async function renderBuffer(
  sampleRate: number,
  durationSec: number,
  draw: (ctx: BaseAudioContext, dest: AudioNode) => void
): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(durationSec * sampleRate));
  const ctx = new OfflineAudioContext(1, frames, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  draw(ctx, master);
  return ctx.startRendering();
}
