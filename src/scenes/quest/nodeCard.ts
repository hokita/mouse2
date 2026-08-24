import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../../gameConfig';
import { BOONS } from '../../core/rpg/run';
import type { BoonId } from '../../core/rpg/run';
import { ITEMS } from '../../core/rpg/items';
import type { ItemId } from '../../core/rpg/items';
import { PALETTE, RADIUS, displayStyle } from '../../ui/theme';
import { DEPTH, containerHitArea } from '../../ui/widgets';
import { TEX } from '../../ui/textures';
import {
  GLYPH,
  ensureBoonGlyph,
  ensureItemGlyph,
  ensureNodeGlyph,
  ensureUiGlyph,
} from '../../ui/questTextures';

// What happens when you step on a node that is not a fight.
//
// Each of these is a sentence a text JRPG would print — "the party rests and
// recovers", "you found 2 potions", "choose a blessing" — rendered instead as
// one big glyph and, where there is a quantity, a number. The card is modal
// and swallows taps, so there is never a question of what the game is waiting
// for.

export interface NodeCard {
  /** A bed: everything back. Tap anywhere to carry on. */
  showRest(onDone: () => void): void;
  /** A chest: these went in the bag. */
  showTreasure(items: ItemId[], onDone: () => void): void;
  /** A shrine: one of these three, permanently, for the whole party. */
  showShrine(offer: BoonId[], onPick: (boon: BoonId) => void): void;
  /**
   * The end of the run.
   *
   * Deliberately not the shared game-over overlay the arcade games use: that
   * card is built around a word and a score, and this game has neither. A
   * crown or a broken crown, and two icon buttons, says the same thing.
   */
  showOutcome(won: boolean, onReplay: () => void, onMenu: () => void): void;
  hide(): void;
}

export function createNodeCard(scene: Phaser.Scene, accent: number): NodeCard {
  const root = scene.add.container(0, 0).setDepth(DEPTH.overlay).setVisible(false);

  const scrim = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, PALETTE.skyTop, 0.86);
  const card = scene.add.container(WIDTH / 2, HEIGHT / 2);
  root.add([scrim, card]);

  function open(width: number, height: number): void {
    card.removeAll(true);

    const glow = scene.add
      .image(0, 0, TEX.glow)
      .setDisplaySize(width * 1.6, height * 1.5)
      .setTint(accent)
      .setAlpha(0.22);
    const panel = scene.add.graphics();
    panel.fillStyle(PALETTE.surface, 0.98);
    panel.fillRoundedRect(-width / 2, -height / 2, width, height, RADIUS.card);
    panel.lineStyle(2, accent, 0.7);
    panel.strokeRoundedRect(-width / 2, -height / 2, width, height, RADIUS.card);
    card.add([glow, panel]);

    root.setVisible(true);
    root.setAlpha(0);
    card.setScale(0.92);
    scrim.setInteractive();
    scene.tweens.add({ targets: root, alpha: 1, duration: 170, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: card, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  function hide(): void {
    scene.tweens.killTweensOf(root);
    scene.tweens.killTweensOf(card);
    scrim.disableInteractive();
    scrim.removeAllListeners();
    root.setVisible(false);
  }

  /** Any tap on the scrim dismisses. Used by the cards that need no choice. */
  function dismissOn(onDone: () => void): void {
    scrim.removeAllListeners();
    scrim.once('pointerdown', () => {
      hide();
      onDone();
    });
  }

  function iconButton(x: number, y: number, texture: string, onTap: () => void): Phaser.GameObjects.Container {
    const button = scene.add.container(x, y);
    const bg = scene.add.graphics();
    bg.fillStyle(PALETTE.surfaceEdge, 0.9);
    bg.fillRoundedRect(-42, -32, 84, 64, RADIUS.button);
    bg.lineStyle(2, accent, 0.7);
    bg.strokeRoundedRect(-42, -32, 84, 64, RADIUS.button);
    const icon = scene.add.image(0, 0, texture).setDisplaySize(GLYPH * 0.62, GLYPH * 0.62);
    button.add([bg, icon]);
    button.setSize(84, 64);
    button.setInteractive(containerHitArea(84, 64));
    button.on('pointerdown', onTap);
    return button;
  }

  return {
    showRest(onDone: () => void): void {
      open(280, 240);
      card.add(
        scene.add
          .image(0, -26, ensureNodeGlyph(scene, 'rest'))
          .setDisplaySize(96, 96)
          .setTint(PALETTE.mint)
      );
      card.add(
        scene.add.image(0, 62, ensureUiGlyph(scene, 'check')).setDisplaySize(40, 40).setTint(PALETTE.mint)
      );
      dismissOn(onDone);
    },

    showTreasure(items: ItemId[], onDone: () => void): void {
      open(300, 250);
      card.add(
        scene.add
          .image(0, -62, ensureNodeGlyph(scene, 'treasure'))
          .setDisplaySize(74, 74)
          .setTint(PALETTE.gold)
      );

      // Counted rather than listed twice: two potions is one flask and a 2,
      // never two flasks, so the row stays the same shape however much is in
      // the chest.
      const tally = new Map<ItemId, number>();
      for (const item of items) {
        tally.set(item, (tally.get(item) ?? 0) + 1);
      }
      const entries = [...tally.entries()];
      const startX = -((entries.length - 1) * 78) / 2;
      entries.forEach(([item, count], index) => {
        const x = startX + index * 78;
        card.add(
          scene.add.image(x, 34, ensureItemGlyph(scene, ITEMS[item].glyph)).setDisplaySize(52, 52)
        );
        card.add(
          scene.add.text(x, 82, `${count}`, displayStyle(22, PALETTE.text)).setOrigin(0.5, 0.5)
        );
      });
      dismissOn(onDone);
    },

    showShrine(offer: BoonId[], onPick: (boon: BoonId) => void): void {
      open(340, 300);
      card.add(
        scene.add
          .image(0, -104, ensureNodeGlyph(scene, 'shrine'))
          .setDisplaySize(56, 56)
          .setTint(PALETTE.gold)
      );

      offer.forEach((boon, index) => {
        const y = -22 + index * 76;
        const option = scene.add.container(0, y);
        const bg = scene.add.graphics();
        bg.fillStyle(PALETTE.skyTop, 0.6);
        bg.fillRoundedRect(-140, -32, 280, 64, RADIUS.button);
        bg.lineStyle(2, accent, 0.5);
        bg.strokeRoundedRect(-140, -32, 280, 64, RADIUS.button);
        const icon = scene.add
          .image(0, 0, ensureBoonGlyph(scene, BOONS[boon].glyph))
          .setDisplaySize(44, 44)
          .setTint(PALETTE.gold);
        option.add([bg, icon]);
        option.setSize(280, 64);
        option.setInteractive(containerHitArea(280, 64));
        option.once('pointerdown', () => {
          hide();
          onPick(boon);
        });
        card.add(option);
      });

      // No tap-to-dismiss here: a shrine is the one card that demands an
      // answer, and letting the scrim close it would silently forfeit it.
      scrim.removeAllListeners();
    },

    showOutcome(won: boolean, onReplay: () => void, onMenu: () => void): void {
      open(320, 320);
      card.add(
        scene.add
          .image(0, -78, ensureNodeGlyph(scene, 'boss'))
          .setDisplaySize(110, 110)
          .setTint(won ? PALETTE.gold : PALETTE.muted)
          .setAlpha(won ? 1 : 0.55)
      );
      if (won) {
        card.add(
          scene.add.image(0, 6, ensureUiGlyph(scene, 'check')).setDisplaySize(56, 56).setTint(PALETTE.mint)
        );
      } else {
        // A struck-through mark: the same shape a crossed-out anything has.
        const cross = scene.add.graphics();
        cross.lineStyle(7, PALETTE.rose, 0.9);
        cross.beginPath();
        cross.moveTo(-26, -20);
        cross.lineTo(26, 32);
        cross.moveTo(26, -20);
        cross.lineTo(-26, 32);
        cross.strokePath();
        card.add(cross);
      }
      card.add(iconButton(-58, 106, ensureUiGlyph(scene, 'replay'), onReplay));
      card.add(iconButton(58, 106, ensureUiGlyph(scene, 'home'), onMenu));
      scrim.removeAllListeners();
    },

    hide,
  };
}
