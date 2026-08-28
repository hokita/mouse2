export interface SfxSpec {
  // Each one is a handful of voices over a fixed span; `durationSec` must
  // cover the last voice's tail or the render truncates it. sfx.test.ts
  // enforces this, so a reader who breaks it will find out from a test
  // rather than by ear.
  durationSec: number;
  volume: number;
  render(ctx: BaseAudioContext, dest: AudioNode): void;
}
