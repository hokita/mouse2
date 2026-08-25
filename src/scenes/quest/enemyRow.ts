import Phaser from 'phaser';
import type { BattleState, Combatant } from '../../core/rpg/battle';
import { ENEMIES } from '../../core/rpg/enemies';
import { PALETTE } from '../../ui/theme';
import { DEPTH, containerHitArea } from '../../ui/widgets';
import { TEX } from '../../ui/textures';
import {
  FOE,
  MARK,
  PIP,
  elementColor,
  ensureElementMark,
  ensureFoeTexture,
  ensureHeroFace,
  ensureStatusPip,
  ensureTargetRing,
  statusColor,
} from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The other side of the fight, and the turn queue above it.
//
// Every monster is drawn in the colour it *is*, and wears that element's mark
// on its plate. What beats it is not written here — it is read off the
// triangle badge in the corner, which is the one place the rule lives. That
// keeps the lesson in a single spot rather than restated, differently, on
// every silhouette on screen.
//
// Three abreast is the hard ceiling. A fourth silhouette on a 430px screen
// either overlaps its neighbour's HP bar or shrinks below a thumb.

const BAR_WIDTH = 96;
const BAR_HEIGHT = 9;

export interface EnemyRow {
  container: Phaser.GameObjects.Container;
  update(state: BattleState): void;
  positionOf(id: string): { x: number; y: number };
  offerTargets(ids: string[], onPick: (id: string) => void): void;
  /** Nudges a monster forward as it acts. */
  lunge(id: string): void;
  /** Fades a felled monster out rather than snapping it off screen. */
  fell(id: string): void;
  setQueue(state: BattleState): void;
}

interface Foe {
  id: string;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Image;
  statuses: Phaser.GameObjects.Container;
  homeY: number;
}

export function createEnemyRow(
  scene: Phaser.Scene,
  state: BattleState,
  centerY: number,
  queueY: number
): EnemyRow {
  const container = scene.add.container(0, 0).setDepth(DEPTH.world);
  const queue = scene.add.container(0, queueY).setDepth(DEPTH.hud);
  const foes: Foe[] = [];

  const monsters = state.combatants.filter((c) => c.side === 'foes');
  // Spread evenly and scale down when the field is full, so three fit without
  // the outer two hanging off the edge.
  const scale = monsters.length >= 3 ? 0.82 : 1;
  const span = WIDTH / (monsters.length + 1);

  monsters.forEach((foe, index) => {
    const x = span * (index + 1);
    const root = scene.add.container(x, centerY);
    const def = ENEMIES[foe.enemyId!];
    const tint = elementColor(def.element);

    const glow = scene.add
      .image(0, 0, TEX.glow)
      .setDisplaySize(FOE * 1.5 * scale, FOE * 1.4 * scale)
      .setTint(tint)
      .setAlpha(0.22);

    const body = scene.add
      .image(0, 0, ensureFoeTexture(scene, def.shape))
      .setDisplaySize(FOE * scale, FOE * scale)
      .setTint(tint);

    // The element mark repeats what the colour already says. Saying it twice
    // is what keeps the game playable for someone who cannot tell amber from
    // lime — with no words anywhere, colour alone would lock them out, and
    // the triangle badge would be a diagram they could not index into.
    const mark = scene.add
      .image(0, FOE * scale * 0.5 + 6, ensureElementMark(scene, def.element))
      .setDisplaySize(MARK, MARK)
      .setTint(tint);

    const bar = scene.add.graphics();
    const statuses = scene.add.container(0, -FOE * scale * 0.5 - 4);
    const ring = scene.add
      .image(0, 0, ensureTargetRing(scene))
      .setDisplaySize(FOE * 1.4 * scale, FOE * 1.4 * scale)
      .setTint(PALETTE.text)
      .setVisible(false);

    root.add([glow, body, mark, bar, statuses, ring]);
    root.setSize(FOE * scale, FOE * scale + 40);
    container.add(root);
    foes.push({ id: foe.id, root, body, bar, ring, statuses, homeY: centerY });
  });

  /**
   * The pips riding above a monster's head.
   *
   * Not decoration: `applyStatus` refreshes rather than stacks, so casting
   * `venom` at something already poisoned spends the MP and the turn for
   * nothing. The floating pip on the beat it lands is gone in under a second,
   * which leaves the player no way to tell — so the state has to persist on
   * the monster exactly as it does on the party's own portraits.
   */
  function paintStatuses(foe: Foe, combatant: Combatant): void {
    foe.statuses.removeAll(true);
    if (combatant.hp <= 0) {
      return;
    }
    const size = PIP * 0.9;
    const startX = -((combatant.statuses.length - 1) * (size + 3)) / 2;
    combatant.statuses.forEach((status, index) => {
      foe.statuses.add(
        scene.add
          .image(startX + index * (size + 3), 0, ensureStatusPip(scene, status.kind))
          .setDisplaySize(size, size)
          .setTint(statusColor(status.kind))
      );
    });
  }

  function paintBar(foe: Foe, combatant: Combatant): void {
    const fraction = Math.max(0, combatant.hp / combatant.stats.maxHp);
    const y = FOE * scale * 0.5 + 24;
    foe.bar.clear();
    if (combatant.hp <= 0) {
      return;
    }
    foe.bar.fillStyle(PALETTE.skyTop, 0.8);
    foe.bar.fillRoundedRect(-BAR_WIDTH / 2, y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
    foe.bar.fillStyle(PALETTE.rose, 1);
    foe.bar.fillRoundedRect(
      -BAR_WIDTH / 2,
      y,
      Math.max(BAR_HEIGHT, BAR_WIDTH * fraction),
      BAR_HEIGHT,
      BAR_HEIGHT / 2
    );
    foe.bar.lineStyle(1.2, PALETTE.surfaceEdge, 0.8);
    foe.bar.strokeRoundedRect(-BAR_WIDTH / 2, y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
  }

  return {
    container,

    update(next: BattleState): void {
      for (const foe of foes) {
        const combatant = next.combatants.find((c) => c.id === foe.id);
        if (combatant) {
          paintBar(foe, combatant);
          paintStatuses(foe, combatant);
        }
      }
    },

    /**
     * The strip of sigils along the top: who acts next, and in what order.
     *
     * The only way a player can plan a turn ahead. Without it, speed is a
     * hidden statistic that reorders the fight for reasons never shown.
     */
    setQueue(next: BattleState): void {
      queue.removeAll(true);
      next.order.slice(0, 6).forEach((id, index) => {
        const combatant = next.combatants.find((c) => c.id === id);
        if (!combatant) {
          return;
        }
        const size = index === 0 ? 26 : 19;
        const x = 30 + index * 34;
        const isHero = combatant.side === 'party';
        const key = isHero
          ? ensureHeroFace(scene, combatant.heroId!)
          : ensureElementMark(scene, ENEMIES[combatant.enemyId!].element);
        const icon = scene.add
          .image(x, 0, key)
          .setDisplaySize(size, size)
          .setAlpha(index === 0 ? 1 : 0.5 - index * 0.05);
        // A monster stands in the queue as its own colour, exactly as it does
        // on the field; a hero portrait is already painted and is left alone.
        if (!isHero) {
          icon.setTint(elementColor(ENEMIES[combatant.enemyId!].element));
        }
        queue.add(icon);
      });
    },

    positionOf(id: string): { x: number; y: number } {
      const foe = foes.find((f) => f.id === id);
      return foe ? { x: foe.root.x, y: foe.root.y } : { x: WIDTH / 2, y: centerY };
    },

    offerTargets(ids: string[], onPick: (id: string) => void): void {
      for (const foe of foes) {
        foe.root.removeAllListeners();
        const offered = ids.includes(foe.id);
        foe.ring.setVisible(offered);
        if (offered) {
          foe.root.setInteractive(containerHitArea(FOE * scale, FOE * scale + 40));
          foe.root.once('pointerdown', () => onPick(foe.id));
        } else {
          foe.root.disableInteractive();
        }
      }
      scene.tweens.killTweensOf(foes.map((f) => f.ring));
      for (const foe of foes) {
        if (ids.includes(foe.id)) {
          foe.ring.setAlpha(1);
          scene.tweens.add({
            targets: foe.ring,
            alpha: 0.35,
            duration: 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
    },

    lunge(id: string): void {
      const foe = foes.find((f) => f.id === id);
      if (!foe) {
        return;
      }
      scene.tweens.add({
        targets: foe.root,
        y: foe.homeY + 16,
        duration: 130,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    },

    fell(id: string): void {
      const foe = foes.find((f) => f.id === id);
      if (!foe) {
        return;
      }
      foe.root.disableInteractive();
      foe.ring.setVisible(false);
      scene.tweens.add({
        targets: foe.root,
        alpha: 0,
        scale: 0.7,
        y: foe.homeY + 24,
        duration: 380,
        ease: 'Quad.easeIn',
      });
    },
  };
}
