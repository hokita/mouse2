import { CAR } from './car';
import { DODGER } from './dodger';
import { FISHING } from './fishing';
import { SHARED } from './shared';
import { SIGIL } from './sigil';

export type { SfxSpec } from './spec';

// The whole vocabulary of the game, one module per game plus the shared few.
//
// `volume` is the playback level, not the render level. It is per-effect
// because these are not equals: the all-clear fanfare wants the room, and the
// Dodger auto-fire tick wants to disappear into it.
//
// `volume` alone does not say how loud a sound actually is: its effective
// loudness is `volume` multiplied by its render's summed voice gains — a
// module changing gains without a reviewer glancing at `volume` (or the
// reverse) is how a sound quietly stops carrying.
export const SFX = {
  ...SHARED,
  ...DODGER,
  ...CAR,
  ...FISHING,
  ...SIGIL,
};

export type SfxName = keyof typeof SFX;
