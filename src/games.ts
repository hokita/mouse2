export interface GameEntry {
  title: string;
  sceneKey: string;
}

export const GAMES: GameEntry[] = [
  { title: 'Dodger', sceneKey: 'GameScene' },
  { title: 'Car Racer', sceneKey: 'CarScene' },
];
