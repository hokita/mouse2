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

// Rendering buffers off an OfflineAudioContext takes real time — 75–160 ms in
// practice — so MenuScene.create() runs and calls playMusic before its buffer
// exists. bus.ts remembers that first request and replays it once rendering
// catches up, rather than let it vanish.
const game = new Phaser.Game(config);
initAudio(game);
