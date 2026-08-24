import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { CarScene } from './scenes/CarScene';
import { FishScene } from './scenes/FishScene';
import { BiteScene } from './scenes/BiteScene';
import { QuestScene } from './scenes/QuestScene';
import { BattleScene } from './scenes/BattleScene';
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
  // Phaser's default is a single touch pointer. On a phone, a hold is often
  // sustained by rolling to a second finger before lifting the first; with
  // one pointer that second finger is invisible and the hold "drops" while a
  // finger is still on the glass. Big Bite's reel reads held pointers, so
  // track enough of them for a hand.
  input: {
    activePointers: 3,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, GameScene, CarScene, FishScene, BiteScene, QuestScene, BattleScene],
};

// Rendering buffers off an OfflineAudioContext takes real time — 75–160 ms in
// practice — so MenuScene.create() runs and calls playMusic before its buffer
// exists. bus.ts remembers that first request and replays it once rendering
// catches up, rather than let it vanish.
const game = new Phaser.Game(config);
initAudio(game);
