import { describe, expect, it } from 'vitest';
import { SFX } from '../sfx';
import { CAR } from '../sfx/car';
import { DODGER } from '../sfx/dodger';
import { FISHING } from '../sfx/fishing';
import { SHARED } from '../sfx/shared';
import { SIGIL } from '../sfx/sigil';

// SFX entries are data, but their shape is only visible by running them: a
// render function schedules voices into whatever context it is handed. This
// fake is that context, recording start/stop times and nothing else, which
// is enough to check the one invariant the file header states and TypeScript
// cannot — that durationSec is long enough to hold every voice.
//
// It implements exactly the surface synth.ts touches. If synth.ts grows a new
// node type, this fake fails loudly rather than silently missing voices.

interface Scheduled {
  start: number;
  stop: number;
}

class FakeParam {
  setValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeNode {
  // synth.ts chains `a.connect(b).connect(dest)`, so connect returns its
  // argument the way the real AudioNode.connect does.
  connect(next: FakeNode): FakeNode {
    return next;
  }
}

class FakeSource extends FakeNode {
  type = '';
  buffer: unknown = null;
  readonly frequency = new FakeParam();
  readonly gain = new FakeParam();
  private record: Scheduled | null = null;

  constructor(private readonly log: Scheduled[]) {
    super();
  }

  start(at: number): void {
    this.record = { start: at, stop: at };
    this.log.push(this.record);
  }

  stop(at: number): void {
    if (this.record !== null) {
      this.record.stop = at;
    }
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  readonly frequency = new FakeParam();
}

class FakeContext {
  readonly sampleRate = 48000;
  readonly scheduled: Scheduled[] = [];

  createOscillator(): FakeSource {
    return new FakeSource(this.scheduled);
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this.scheduled);
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createBuffer(_channels: number, frames: number): { getChannelData(): Float32Array } {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
}

// SFX is composed by spreading five per-game modules; a name defined in two
// of them would be silently overwritten by whichever spreads last, and every
// test above iterates the composed record so none of them would notice a
// sound going missing. Comparing key counts is what catches that a duplicate
// happened at all.
it('composes SFX from five modules with no name collisions', () => {
  const modules = [SHARED, DODGER, CAR, FISHING, SIGIL];
  const total = modules.reduce((sum, mod) => sum + Object.keys(mod).length, 0);
  expect(Object.keys(SFX)).toHaveLength(total);
});

describe.each(Object.entries(SFX))('SFX.%s', (_name, spec) => {
  it('fits every voice inside its durationSec', () => {
    const ctx = new FakeContext();
    spec.render(ctx as unknown as BaseAudioContext, new FakeNode() as unknown as AudioNode);

    expect(ctx.scheduled.length).toBeGreaterThan(0);
    const end = Math.max(...ctx.scheduled.map((voice) => voice.stop));
    expect(end).toBeLessThanOrEqual(spec.durationSec);
  });

  it('plays at a volume between 0 and 1', () => {
    expect(spec.volume).toBeGreaterThan(0);
    expect(spec.volume).toBeLessThanOrEqual(1);
  });
});
