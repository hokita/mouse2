import { PALETTE } from './ui/theme';

export type GameIcon = 'ship' | 'car';

export interface GameEntry {
  title: string;
  /** One-line pitch, shown under the title on the menu card. */
  tagline: string;
  sceneKey: string;
  /** Highlight colour for the menu card and for the game's own HUD. */
  accent: number;
  icon: GameIcon;
}

export const GAMES: GameEntry[] = [
  {
    title: 'Dodger',
    tagline: 'Slip through the falling debris',
    sceneKey: 'GameScene',
    accent: PALETTE.cyan,
    icon: 'ship',
  },
  {
    title: 'Car Racer',
    tagline: 'Weave through night traffic',
    sceneKey: 'CarScene',
    accent: PALETTE.amber,
    icon: 'car',
  },
];
