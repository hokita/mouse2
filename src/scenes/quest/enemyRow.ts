import Phaser from 'phaser';
import type { BattleState, Combatant } from '../../core/rpg/battle';
import { ENEMIES } from '../../core/rpg/enemies';
import { HEROES } from '../../core/rpg/party';
import { PALETTE } from '../../ui/theme';
import { DEPTH, containerHitArea } from '../../ui/widgets';
import { TEX } from '../../ui/textures';
import {
  FOE,
  MARK,
  QUEST_TEX,
  elementColor,
  ensureElementMark,
  ensureFoeTexture,
  ensureHeroSigil,
} from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The other side of the fight, and the turn queue above it.
//
// Every monster is drawn in the colour of the element that kills it, and
// wears that element's mark on its plate. That is the entire lesson this game
// has to teach, repeated on every enemy on every screen, because there is no
// second place to put it — no bestiary, no tooltip, no line of dialogue.
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
    const tint = def.affinity.weak ? elementColor(def.affinity.weak) : PALETTE.muted;

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
    // violet — with no words anywhere, colour alone would lock them out.
    const mark = scene.add
      .image(0, FOE * scale * 0.5 + 6, ensureElementMark(scene, def.affinity.weak ?? 'plain'))
      .setDisplaySize(MARK, MARK)
      .setTint(tint);

    const bar = scene.add.graphics();
    const ring = scene.add
      .image(0, 0, QUEST_TEX.targetRing)
      .setDisplaySize(FOE * 1.4 * scale, FOE * 1.4 * scale)
      .setTint(PALETTE.text)
      .setVisible(false);

    root.add([glow, body, mark, bar, ring]);
    root.setSize(FOE * scale, FOE * scale + 40);
    container.add(root);
    foes.push({ id: foe.id, root, body, bar, ring, homeY: centerY });
  });

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
          ? ensureHeroSigil(scene, HEROES[combatant.heroId!].sigil)
          : ensureElementMark(scene, ENEMIES[combatant.enemyId!].affinity.weak ?? 'plain');
        const tint = isHero
          ? PALETTE.text
          : elementColor(ENEMIES[combatant.enemyId!].affinity.weak ?? 'plain');
        const icon = scene.add
          .image(x, 0, key)
          .setDisplaySize(size, size)
          .setTint(tint)
          .setAlpha(index === 0 ? 1 : 0.5 - index * 0.05);
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
