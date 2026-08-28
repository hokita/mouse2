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
export const SFX = {
  ...SHARED,
  ...DODGER,
  ...CAR,
  ...FISHING,
  ...SIGIL,
};

export type SfxName = keyof typeof SFX;
