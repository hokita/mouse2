import { PALETTE } from './ui/theme';

export type GameIcon = 'ship' | 'car' | 'fish' | 'bobber';

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
  {
    title: 'Fish Catch',
    tagline: 'Tap the fish, leave the trash',
    sceneKey: 'FishScene',
    accent: PALETTE.mint,
    icon: 'fish',
  },
  {
    title: 'Big Bite',
    tagline: 'Wait for it… strike!',
    sceneKey: 'BiteScene',
    accent: PALETTE.violet,
    icon: 'bobber',
  },
];
