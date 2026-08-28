export interface SfxSpec {
  durationSec: number;
  volume: number;
  render(ctx: BaseAudioContext, dest: AudioNode): void;
}
