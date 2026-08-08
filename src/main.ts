import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { WIDTH, HEIGHT } from './gameConfig';
import { isPortrait } from './core/orientation';

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

const game = new Phaser.Game(config);
const rotateOverlay = document.getElementById('rotate-overlay')!;

function updateOrientation(): void {
  const portrait = isPortrait(window.innerWidth, window.innerHeight);
  rotateOverlay.classList.toggle('visible', portrait);
  if (portrait) {
    game.scene.pause('GameScene');
  } else {
    game.scene.resume('GameScene');
  }
}

game.events.once(Phaser.Core.Events.READY, () => {
  updateOrientation();
  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', updateOrientation);
});
