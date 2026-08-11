import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../gameConfig';
import { GAMES } from '../games';

const TITLE_Y = HEIGHT * 0.25;
const BUTTON_WIDTH = 260;
const BUTTON_HEIGHT = 70;
const BUTTON_SPACING = 24;
const FIRST_BUTTON_Y = HEIGHT * 0.45;
const BUTTON_COLOR = 0x4444ff;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.add
      .text(WIDTH / 2, TITLE_Y, 'mouse2', {
        fontSize: '40px',
        color: '#000000',
      })
      .setOrigin(0.5, 0.5);

    GAMES.forEach((game, index) => {
      const y = FIRST_BUTTON_Y + index * (BUTTON_HEIGHT + BUTTON_SPACING);

      const button = this.add.rectangle(WIDTH / 2, y, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_COLOR);
      button.setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.scene.start(game.sceneKey));

      this.add
        .text(WIDTH / 2, y, game.title, {
          fontSize: '24px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0.5);
    });
  }
}
