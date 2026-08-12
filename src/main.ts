import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { CarScene } from './scenes/CarScene';
import { FishScene } from './scenes/FishScene';
import { WIDTH, HEIGHT } from './gameConfig';
import { PALETTE, css } from './ui/theme';
import { initAudio } from './audio/bus';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: css(PALETTE.skyTop),
  // Every sprite is a generated canvas texture, so let the renderer smooth
  // them when the FIT scaler lands the canvas on a fractional size.
  render: {
    antialias: true,
    roundPixels: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, GameScene, CarScene, FishScene],
};

// Buffers render off an OfflineAudioContext, which needs no user gesture — so
// every sound is ready long before the first tap unlocks playback.
const game = new Phaser.Game(config);
initAudio(game);
