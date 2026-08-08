import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { WIDTH, HEIGHT } from './gameConfig';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#87ceeb',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
