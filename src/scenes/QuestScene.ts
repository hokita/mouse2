import Phaser from 'phaser';
import { transitionTo } from '../ui/widgets';

// Placeholder: the campaign map lands in the next commit. Until then, tapping
// Sigil on the menu drops straight into a fight.
export class QuestScene extends Phaser.Scene {
  constructor() {
    super('QuestScene');
  }

  create(): void {
    transitionTo(this, 'BattleScene');
  }
}
