import Phaser from 'phaser';
import type { BattleState, Combatant } from '../../core/rpg/battle';
import { HEROES } from '../../core/rpg/party';
import { PALETTE, RADIUS, displayStyle } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';
import { PIP, SIGIL, ensureHeroSigil, ensureStatusPip, statusColor } from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The party's three rows along the lower middle of the screen.
//
// Each row is one hero and answers three questions without naming any of
// them: how hurt are they (a bar), how much have they got left to cast with
// (a row of pips), and what is stuck to them (pips orbiting the sigil).
//
// MP is pips rather than a second bar on purpose. A spell costs a countable
// number, so a countable display lets the player check affordability by
// looking rather than by subtracting — and two identical bars stacked on one
// row would be read as one thing measured twice.

const ROW_HEIGHT = 62;
const LEFT = 22;
const SIGIL_X = LEFT + 26;
const BAR_X = LEFT + 56;
const BAR_WIDTH = 214;
const BAR_HEIGHT = 14;
const MP_PIP_R = 4;
const MP_PIP_GAP = 11;
/** Beyond this the pips would run under the HP readout, so they stack up. */
const MP_PER_ROW = 18;

export interface PartyBar {
  container: Phaser.GameObjects.Container;
  update(state: BattleState): void;
  /** Lifts the row of whoever is acting, and dims the rest. */
  setActive(id: string | null): void;
  /** Screen position of a hero's sigil, for floating numbers and targeting. */
  positionOf(id: string): { x: number; y: number };
  /** Offers these heroes as targets. Passing an empty list clears the offer. */
  offerTargets(ids: string[], onPick: (id: string) => void): void;
}

interface Row {
  id: string;
  root: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Graphics;
  hp: Phaser.GameObjects.Text;
  mp: Phaser.GameObjects.Graphics;
  statuses: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  y: number;
}

export function createPartyBar(scene: Phaser.Scene, topY: number, accent: number): PartyBar {
  const container = scene.add.container(0, 0).setDepth(DEPTH.hud);
  const rows: Row[] = [];

  for (const kind of ['poison', 'sleep', 'atkDown', 'regen'] as const) {
    ensureStatusPip(scene, kind);
  }

  Object.values(HEROES).forEach((def, index) => {
    const y = topY + index * ROW_HEIGHT;
    const root = scene.add.container(0, y);

    const ring = scene.add.graphics();
    const plate = scene.add.graphics();
    plate.fillStyle(PALETTE.surface, 0.9);
    plate.fillCircle(SIGIL_X, 0, 23);
    plate.lineStyle(1.5, PALETTE.surfaceEdge, 0.9);
    plate.strokeCircle(SIGIL_X, 0, 23);

    const sigil = scene.add
      .image(SIGIL_X, 0, ensureHeroSigil(scene, def.sigil))
      .setDisplaySize(SIGIL * 0.62, SIGIL * 0.62)
      .setTint(accent);

    const bar = scene.add.graphics();
    const hp = scene.add.text(BAR_X + BAR_WIDTH + 10, -9, '', displayStyle(17)).setOrigin(0, 0);
    const mp = scene.add.graphics();
    const statuses = scene.add.container(0, 0);

    // A transparent rectangle rather than the container itself: the row's
    // drawn parts are thin and scattered, and a hit area that matches them
    // would leave dead gaps between a sigil and its bar.
    const hit = scene.add
      .rectangle(WIDTH / 2, 0, WIDTH - 32, ROW_HEIGHT - 6, 0xffffff, 0)
      .setOrigin(0.5, 0.5);

    root.add([ring, plate, sigil, bar, hp, mp, statuses, hit]);
    container.add(root);
    rows.push({ id: `hero:${def.id}`, root, bar, hp, mp, statuses, ring, hit, y });
  });

  function paintRow(row: Row, hero: Combatant): void {
    const alive = hero.hp > 0;
    const fraction = Math.max(0, hero.hp / hero.stats.maxHp);

    row.bar.clear();
    row.bar.fillStyle(PALETTE.skyTop, 0.75);
    row.bar.fillRoundedRect(BAR_X, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
    if (fraction > 0) {
      // The bar turns as it empties. It is the one place in the game where a
      // colour does not mean an element, which is safe only because it is
      // also the one colour that moves — a red that slides down a bar is not
      // going to be mistaken for a monster's affinity.
      const tint =
        fraction > 0.5 ? PALETTE.mint : fraction > 0.25 ? PALETTE.amber : PALETTE.rose;
      row.bar.fillStyle(tint, 1);
      row.bar.fillRoundedRect(
        BAR_X,
        -BAR_HEIGHT / 2,
        Math.max(BAR_HEIGHT, BAR_WIDTH * fraction),
        BAR_HEIGHT,
        BAR_HEIGHT / 2
      );
    }
    row.bar.lineStyle(1.5, PALETTE.surfaceEdge, 0.8);
    row.bar.strokeRoundedRect(BAR_X, -BAR_HEIGHT / 2, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);

    row.hp.setText(`${Math.max(0, hero.hp)}`);
    row.hp.setColor(alive ? '#f1f4ff' : '#8e9bc6');

    row.mp.clear();
    for (let i = 0; i < hero.stats.maxMp; i += 1) {
      const col = i % MP_PER_ROW;
      const line = Math.floor(i / MP_PER_ROW);
      const x = BAR_X + 4 + col * MP_PIP_GAP;
      const y = BAR_HEIGHT / 2 + 8 + line * 9;
      row.mp.fillStyle(i < hero.mp ? PALETTE.cyan : PALETTE.surfaceEdge, i < hero.mp ? 0.95 : 0.5);
      row.mp.fillCircle(x, y, MP_PIP_R);
    }

    row.statuses.removeAll(true);
    hero.statuses.forEach((status, i) => {
      const pip = scene.add
        .image(BAR_X + BAR_WIDTH + 44 + i * (PIP + 3), -6, ensureStatusPip(scene, status.kind))
        .setDisplaySize(PIP, PIP)
        .setTint(statusColor(status.kind));
      row.statuses.add(pip);
    });

    row.root.setAlpha(alive ? 1 : 0.4);
  }

  return {
    container,

    update(state: BattleState): void {
      for (const row of rows) {
        const hero = state.combatants.find((c) => c.id === row.id);
        if (hero) {
          paintRow(row, hero);
        }
      }
    },

    setActive(id: string | null): void {
      for (const row of rows) {
        row.ring.clear();
        if (row.id === id) {
          row.ring.fillStyle(accent, 0.14);
          row.ring.fillRoundedRect(LEFT - 8, -ROW_HEIGHT / 2 + 4, WIDTH - 2 * LEFT + 16, ROW_HEIGHT - 8, RADIUS.pill);
          row.ring.lineStyle(2, accent, 0.75);
          row.ring.strokeRoundedRect(LEFT - 8, -ROW_HEIGHT / 2 + 4, WIDTH - 2 * LEFT + 16, ROW_HEIGHT - 8, RADIUS.pill);
        }
      }
    },

    positionOf(id: string): { x: number; y: number } {
      const row = rows.find((r) => r.id === id);
      return { x: SIGIL_X, y: row ? row.y : 0 };
    },

    offerTargets(ids: string[], onPick: (id: string) => void): void {
      for (const row of rows) {
        row.hit.removeAllListeners();
        if (ids.includes(row.id)) {
          row.hit.setInteractive({ useHandCursor: true });
          row.hit.once('pointerdown', () => onPick(row.id));
        } else {
          row.hit.disableInteractive();
        }
      }
    },
  };
}

export const PARTY_ROW_HEIGHT = ROW_HEIGHT;
