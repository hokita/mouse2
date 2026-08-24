import Phaser from 'phaser';
import type { BattleState, Combatant } from '../../core/rpg/battle';
import { HEROES } from '../../core/rpg/party';
import { PALETTE, RADIUS, displayStyle, shade } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';
import {
  PIP,
  ensureGuardGlyph,
  ensureHeroFace,
  ensureStatusPip,
  statusColor,
} from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The party's three rows along the lower middle of the screen.
//
// Each row is one hero and answers three questions without naming any of
// them: how hurt are they (a bar), how much have they got left to cast with
// (a row of pips), and what is stuck to them (pips beside the portrait).
//
// MP is pips rather than a second bar on purpose. A spell costs a countable
// number, so a countable display lets the player check affordability by
// looking rather than by subtracting — and two identical bars stacked on one
// row would be read as one thing measured twice.

const ROW_HEIGHT = 62;
const LEFT = 22;
const SIGIL_X = LEFT + 30;
const BAR_X = LEFT + 64;
/**
 * Narrowed as the portrait grew, so the bar still ends where it used to and
 * the HP figure and status pips to its right do not have to move at all.
 */
const BAR_WIDTH = 206;
/** Big enough for a face to be a face. The row is 62px, so this is the ceiling. */
const PLATE_R = 27;
const BAR_HEIGHT = 14;
const MP_PIP_R = 4;
const MP_PIP_GAP = 11;
/** Fewest pips on a line — keeps a small pool from spreading out oddly. */
const MP_PER_LINE_MIN = 18;
/**
 * Hard ceiling on pip lines.
 *
 * The pips used to wrap every 18 at fixed spacing, which silently assumed a
 * small pool. A level-12 Wizard has 49 MP, and one repeatable Focus boon
 * takes that to 55 — a fourth line, 42px down, straight through the next
 * hero's portrait 39px away. Lines are capped and the spacing derived from
 * the width instead, so the row cannot grow past its own height whatever the
 * pool reaches.
 */
const MP_LINES = 2;
/** The drawn size of a portrait. Sits inside the plate with room to spare. */
const FACE_SIZE = 38;

export interface PartyBar {
  container: Phaser.GameObjects.Container;
  update(state: BattleState): void;
  /** Lifts the row of whoever is acting, and dims the rest. */
  setActive(id: string | null): void;
  /** Screen position of a hero's face, for floating numbers and targeting. */
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
  guard: Phaser.GameObjects.Image;
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
    // Lighter than the panels elsewhere, because two of the three have black
    // hair and a portrait needs something to be a silhouette against.
    plate.fillStyle(shade(PALETTE.surface, 0.18), 1);
    plate.fillCircle(SIGIL_X, 0, PLATE_R);
    plate.lineStyle(1.5, PALETTE.surfaceEdge, 0.9);
    plate.strokeCircle(SIGIL_X, 0, PLATE_R);

    // Deliberately untinted: the portrait is painted, and tinting it would
    // multiply skin, hair and eyes down to one wash. It is the only thing on
    // this row that does not take the run's accent colour.
    const face = scene.add
      .image(SIGIL_X, 0, ensureHeroFace(scene, def.id))
      .setDisplaySize(FACE_SIZE, FACE_SIZE);

    const bar = scene.add.graphics();
    const hp = scene.add.text(BAR_X + BAR_WIDTH + 10, -9, '', displayStyle(17)).setOrigin(0, 0);
    const mp = scene.add.graphics();
    const statuses = scene.add.container(0, 0);

    // Worn on the portrait rather than floated once, because guarding lasts
    // until this hero's next turn. It is a state, and an undrawn state does
    // not exist to a player who cannot be told about it in words.
    const guard = scene.add
      .image(SIGIL_X + 21, 18, ensureGuardGlyph(scene))
      .setDisplaySize(20, 20)
      .setTint(PALETTE.cyan)
      .setVisible(false);

    // A transparent rectangle rather than the container itself: the row's
    // drawn parts are thin and scattered, and a hit area that matches them
    // would leave dead gaps between a face and its bar.
    const hit = scene.add
      .rectangle(WIDTH / 2, 0, WIDTH - 32, ROW_HEIGHT - 6, 0xffffff, 0)
      .setOrigin(0.5, 0.5);

    root.add([ring, plate, face, bar, hp, mp, statuses, guard, hit]);
    container.add(root);
    rows.push({ id: `hero:${def.id}`, root, bar, hp, mp, statuses, guard, ring, hit, y });
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
    const perLine = Math.max(MP_PER_LINE_MIN, Math.ceil(hero.stats.maxMp / MP_LINES));
    const gap = Math.min(MP_PIP_GAP, (BAR_WIDTH - 8) / perLine);
    const radius = Math.min(MP_PIP_R, gap * 0.36);
    for (let i = 0; i < hero.stats.maxMp; i += 1) {
      const x = BAR_X + 4 + (i % perLine) * gap;
      const y = BAR_HEIGHT / 2 + 8 + Math.floor(i / perLine) * 9;
      row.mp.fillStyle(i < hero.mp ? PALETTE.cyan : PALETTE.surfaceEdge, i < hero.mp ? 0.95 : 0.5);
      row.mp.fillCircle(x, y, radius);
    }

    row.guard.setVisible(alive && hero.guarding);

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
