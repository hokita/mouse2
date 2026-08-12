import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../gameConfig';
import { GAMES } from '../games';
import type { GameEntry, GameIcon } from '../games';
import { PALETTE, RADIUS, bodyStyle, displayStyle, labelStyle } from '../ui/theme';
import {
  CAR_HEIGHT,
  CAR_WIDTH,
  FISH_HEIGHT,
  FISH_WIDTH,
  SHIP_SIZE,
  TEX,
  ensureCarTexture,
  ensureFishTexture,
  ensureFxTextures,
  ensureShipTexture,
} from '../ui/textures';
import { DEPTH, containerHitArea, createStarBackdrop, transitionTo } from '../ui/widgets';
import type { Starfield } from '../ui/widgets';
import { PLAYER_CAR_COLOR } from './CarScene';
import { FISH_COLORS } from './FishScene';

const TITLE_Y = HEIGHT * 0.28;
const CARD_WIDTH = 350;
const CARD_HEIGHT = 122;
const CARD_SPACING = 24;
const FIRST_CARD_Y = HEIGHT * 0.47;

export class MenuScene extends Phaser.Scene {
  private stars!: Starfield;
  private cards: Phaser.GameObjects.Container[] = [];
  /** True once a game has been chosen and the hand-over fade has begun. */
  private launching = false;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    // The Scene instance is reused on every visit but its display list is
    // not, so both of these have to start fresh — a stale `launching` would
    // leave the menu permanently unresponsive on the way back in.
    this.cards = [];
    this.launching = false;

    this.stars = createStarBackdrop(this);
    ensureFxTextures(this);

    this.cameras.main.fadeIn(320, 0, 0, 0);

    const eyebrow = this.add
      .text(WIDTH / 2, TITLE_Y - 52, 'PICK YOUR RUN', labelStyle(13, PALETTE.cyan))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    eyebrow.setLetterSpacing(5);

    this.add
      .image(WIDTH / 2, TITLE_Y, TEX.glow)
      .setDisplaySize(360, 220)
      .setTint(PALETTE.cyan)
      .setAlpha(0.2)
      .setDepth(DEPTH.backdrop);

    const title = this.add
      .text(WIDTH / 2, TITLE_Y, 'mouse2', displayStyle(66))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    title.setLetterSpacing(2);

    const rule = this.add.graphics().setDepth(DEPTH.hud);
    rule.fillStyle(PALETTE.cyan, 0.9);
    rule.fillRoundedRect(WIDTH / 2 - 26, TITLE_Y + 44, 52, 4, 2);

    this.add
      .text(WIDTH / 2, TITLE_Y + 74, 'Three small games. One thumb.', bodyStyle(15))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);

    GAMES.forEach((game, index) => {
      const y = FIRST_CARD_Y + index * (CARD_HEIGHT + CARD_SPACING);
      const card = this.createCard(game, y);

      // Stagger the cards in under the title so the menu arrives rather than
      // just appearing.
      card.setAlpha(0);
      card.y = y + 26;
      this.tweens.add({
        targets: card,
        alpha: 1,
        y,
        duration: 420,
        delay: 120 + index * 90,
        ease: 'Cubic.easeOut',
      });
    });

    const footer = this.add
      .text(WIDTH / 2, HEIGHT - 74, 'TAP OR DRAG TO PLAY', labelStyle(12, PALETTE.muted))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    footer.setLetterSpacing(4);
    this.tweens.add({
      targets: footer,
      alpha: 0.45,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  update(_time: number, delta: number): void {
    // A slow drift keeps the menu alive without pulling the eye off the cards.
    this.stars.scroll(delta * 0.012);
  }

  private createCard(game: GameEntry, y: number): Phaser.GameObjects.Container {
    const card = this.add.container(WIDTH / 2, y).setDepth(DEPTH.hud);
    const halfW = CARD_WIDTH / 2;
    const halfH = CARD_HEIGHT / 2;

    const glow = this.add
      .image(0, 0, TEX.glow)
      .setDisplaySize(CARD_WIDTH * 1.15, CARD_HEIGHT * 1.7)
      .setTint(game.accent)
      .setAlpha(0.16);

    const bg = this.add.graphics();
    const paint = (pressed: boolean): void => {
      bg.clear();
      bg.fillStyle(PALETTE.surface, pressed ? 1 : 0.96);
      bg.fillRoundedRect(-halfW, -halfH, CARD_WIDTH, CARD_HEIGHT, RADIUS.card);
      // A hairline along the top edge lifts the card off the starfield. A
      // half-height highlight would do it too, but its lower edge shows up as
      // a line straight across the middle of the card.
      bg.lineStyle(1.5, 0xffffff, 0.09);
      bg.beginPath();
      bg.moveTo(-halfW + 22, -halfH + 1.5);
      bg.lineTo(halfW - 22, -halfH + 1.5);
      bg.strokePath();
      bg.lineStyle(2, game.accent, pressed ? 0.9 : 0.45);
      bg.strokeRoundedRect(-halfW, -halfH, CARD_WIDTH, CARD_HEIGHT, RADIUS.card);
    };
    paint(false);

    // Tinted plate behind the artwork, so each game gets a recognisable badge.
    const plate = this.add.graphics();
    plate.fillStyle(game.accent, 0.16);
    plate.fillRoundedRect(-halfW + 16, -40, 80, 80, 20);
    plate.lineStyle(1.5, game.accent, 0.45);
    plate.strokeRoundedRect(-halfW + 16, -40, 80, 80, 20);

    const icon = this.createIcon(game.icon).setPosition(-halfW + 56, 0);

    const title = this.add
      .text(-halfW + 112, -16, game.title, displayStyle(26))
      .setOrigin(0, 0.5);
    const tagline = this.add
      .text(-halfW + 112, 14, game.tagline, bodyStyle(13.5))
      .setOrigin(0, 0.5);

    const chevron = this.add
      .text(halfW - 24, 0, '▶', displayStyle(16, game.accent))
      .setOrigin(0.5, 0.5);

    card.add([glow, bg, plate, icon, title, tagline, chevron]);
    card.setSize(CARD_WIDTH, CARD_HEIGHT);
    card.setInteractive(containerHitArea(CARD_WIDTH, CARD_HEIGHT));

    this.cards.push(card);

    card.on('pointerdown', () => {
      // One guard for the whole menu rather than one per card. The camera
      // fade below runs for a fifth of a second, and a card tapped during it
      // would otherwise start a second scene on top of the chosen one —
      // landing the player in a game they did not pick.
      if (this.launching) {
        return;
      }
      this.launching = true;
      for (const other of this.cards) {
        other.disableInteractive();
      }
      paint(true);
      this.tweens.add({
        targets: card,
        scale: 0.97,
        duration: 110,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      transitionTo(this, game.sceneKey);
    });
    card.on('pointerout', () => {
      if (!this.launching) {
        paint(false);
      }
    });

    return card;
  }

  private createIcon(icon: GameIcon): Phaser.GameObjects.Image {
    if (icon === 'ship') {
      return this.add.image(0, 0, ensureShipTexture(this)).setDisplaySize(SHIP_SIZE * 1.2, SHIP_SIZE * 1.2);
    }
    if (icon === 'fish') {
      // Sized to sit inside the 80px badge plate with a little air around it.
      const scale = 0.78;
      return this.add
        .image(0, 0, ensureFishTexture(this, FISH_COLORS[1]))
        .setDisplaySize(FISH_WIDTH * scale, FISH_HEIGHT * scale);
    }
    const scale = 0.72;
    return this.add
      .image(0, 0, ensureCarTexture(this, PLAYER_CAR_COLOR, { stripe: true }))
      .setDisplaySize(CAR_WIDTH * scale, CAR_HEIGHT * scale);
  }
}
