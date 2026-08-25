import Phaser from 'phaser';
import type { Combatant } from '../../core/rpg/battle';
import { SKILLS, skillGrid } from '../../core/rpg/skills';
import type { SkillId } from '../../core/rpg/skills';
import { ITEMS } from '../../core/rpg/items';
import type { Bag, ItemId } from '../../core/rpg/items';
import { PALETTE, RADIUS, displayStyle } from '../../ui/theme';
import { DEPTH, containerHitArea } from '../../ui/widgets';
import {
  GLYPH,
  elementColor,
  ensureCommandGlyph,
  ensureElementMark,
  ensureItemGlyph,
  ensureSkillGlyph,
} from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The bottom third: four commands, and the tray that opens over them.
//
// Everything here obeys the same grammar as the rest of the game. Shape says
// what a skill does — a blade cuts, a droplet mends — weight says how hard,
// and colour says which element. So the player learns a handful of shapes
// rather than seventeen names, and a skill they have never cast still tells
// them what it will do.
//
// The skill tray is a grid, and the grid is the fourth thing that speaks:
// down the side is what a skill is made of, across is how hard it lands. The
// mother's nine cells are three colours by three weights, so the cell to the
// right of a bolt she has cast is that same bolt, heavier. Position is the
// only label these icons will ever get, which is why a weight a hero has no
// skill for is drawn as a hole and never closed up.
//
// A skill they cannot afford is dimmed rather than hidden. Hiding it would
// make the tray change shape between turns, and a menu whose buttons move is
// a menu that has to be re-read every time it opens.

export type Choice =
  | { kind: 'attack' }
  | { kind: 'skill'; skill: SkillId }
  | { kind: 'guard' }
  | { kind: 'item'; item: ItemId };

const BUTTON_W = 92;
const BUTTON_H = 78;
/** One line of the grid: a glyph, and its price under it. */
const ROW_H = 60;
const TRAY_PAD = 14;
/** The tallest tray anyone opens — the mother's three colours. */
const MAX_TRAY_ROWS = 3;

const trayHeight = (rows: number): number => Math.max(1, rows) * ROW_H + TRAY_PAD * 2;

export interface CommandBar {
  container: Phaser.GameObjects.Container;
  /** Shows the four commands for this hero and reports what they picked. */
  show(actor: Combatant, learned: SkillId[], bag: Bag, onChoose: (choice: Choice) => void): void;
  hide(): void;
  /** Closes any open tray, back to the four commands. */
  reset(): void;
}

interface Button {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  paint(enabled: boolean, pressed: boolean): void;
}

export function createCommandBar(scene: Phaser.Scene, baseY: number, accent: number): CommandBar {
  const container = scene.add.container(0, 0).setDepth(DEPTH.hud);
  // Anchored by its foot just above the command row and grown upwards, so a
  // one-row tray and a three-row tray open from the same edge and the thumb
  // that reached for a skill is never asked to travel a different distance.
  const trayFoot = baseY - BUTTON_H / 2 - 10;
  const tray = scene.add.container(0, trayFoot).setDepth(DEPTH.hud).setVisible(false);
  container.add(tray);

  let onChooseNow: ((choice: Choice) => void) | null = null;

  function makeButton(x: number, y: number, texture: string, width = BUTTON_W, height = BUTTON_H): Button {
    const root = scene.add.container(x, y);
    const bg = scene.add.graphics();
    const icon = scene.add.image(0, 0, texture).setDisplaySize(GLYPH * 0.8, GLYPH * 0.8);

    const paint = (enabled: boolean, pressed: boolean): void => {
      bg.clear();
      bg.fillStyle(pressed ? PALETTE.surfaceEdge : PALETTE.surface, enabled ? 0.96 : 0.5);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, RADIUS.button);
      bg.lineStyle(2, accent, enabled ? (pressed ? 1 : 0.55) : 0.18);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, RADIUS.button);
      icon.setAlpha(enabled ? 1 : 0.3);
    };
    paint(true, false);

    root.add([bg, icon]);
    root.setSize(width, height);
    return { root, bg, icon, paint };
  }

  // --- the four commands ---------------------------------------------------

  const commandRow = scene.add.container(0, baseY);
  container.add(commandRow);

  // Both faces of the second button are generated up front. Building one
  // lazily when a caster first steps up would mean asking Phaser for a
  // texture mid-fight, and a key requested before its generator has run binds
  // to the missing-texture fallback for good.
  const rodTexture = ensureCommandGlyph(scene, 'skill');
  const mightTexture = ensureCommandGlyph(scene, 'might');

  const commandSpecs: { texture: string; open: 'skill' | 'item' | null; choice: Choice }[] = [
    { texture: ensureCommandGlyph(scene, 'attack'), open: null, choice: { kind: 'attack' } },
    { texture: rodTexture, open: 'skill', choice: { kind: 'attack' } },
    { texture: ensureCommandGlyph(scene, 'guard'), open: null, choice: { kind: 'guard' } },
    { texture: ensureCommandGlyph(scene, 'item'), open: 'item', choice: { kind: 'attack' } },
  ];

  const gap = (WIDTH - commandSpecs.length * BUTTON_W) / (commandSpecs.length + 1);
  const commandButtons = commandSpecs.map((spec, index) => {
    const x = gap + BUTTON_W / 2 + index * (BUTTON_W + gap);
    const button = makeButton(x, 0, spec.texture);
    commandRow.add(button.root);
    return button;
  });

  function closeTray(): void {
    tray.setVisible(false);
    tray.removeAll(true);
    commandButtons.forEach((b) => b.paint(true, false));
  }

  // --- the tray ------------------------------------------------------------

  interface Entry {
    texture: string;
    tint: number;
    enabled: boolean;
    choice: Choice;
    count?: number;
    /** Element mark, for the skills whose shape alone cannot say which. */
    mark?: string;
  }

  /** Rows of cells. A `null` cell is a hole the grid needs to stay square. */
  function openTray(rows: (Entry | null)[][]): void {
    tray.removeAll(true);

    const height = trayHeight(rows.length);
    const panel = scene.add.graphics();
    panel.fillStyle(PALETTE.surface, 0.97);
    panel.fillRoundedRect(16, -height, WIDTH - 32, height, RADIUS.card);
    panel.lineStyle(2, accent, 0.5);
    panel.strokeRoundedRect(16, -height, WIDTH - 32, height, RADIUS.card);
    tray.add(panel);

    if (rows.length === 0) {
      // An empty tray still opens, and still has to say something. A struck
      // through circle is the one glyph here that means "nothing to see".
      const empty = scene.add.graphics();
      empty.lineStyle(3, PALETTE.muted, 0.7);
      empty.strokeCircle(WIDTH / 2, -height / 2, 18);
      empty.beginPath();
      empty.moveTo(WIDTH / 2 - 13, -height / 2 - 13);
      empty.lineTo(WIDTH / 2 + 13, -height / 2 + 13);
      empty.strokePath();
      tray.add(empty);
    }

    // One slot width for the whole tray, measured off the widest row, so a
    // column stays in the same place from the first row to the last.
    const columns = Math.max(1, ...rows.map((row) => row.length));
    const slot = Math.min(74, (WIDTH - 60) / columns);
    const startX = WIDTH / 2 - ((columns - 1) * slot) / 2;

    rows.forEach((row, rowIndex) => {
      const y = -height + TRAY_PAD + ROW_H / 2 + rowIndex * ROW_H;
      row.forEach((entry, index) => {
        if (!entry) {
          return;
        }
        const root = scene.add.container(startX + index * slot, y);
        const icon = scene.add
          .image(0, -8, entry.texture)
          .setDisplaySize(GLYPH * 0.72, GLYPH * 0.72)
          .setTint(entry.tint)
          .setAlpha(entry.enabled ? 1 : 0.28);
        root.add(icon);
        if (entry.mark) {
          // The bolts of a weight share one shape and differ only in tint, so
          // on their own they are unreadable to anyone who cannot separate the
          // colours. Monsters already carry a shaped element mark to make a
          // weakness legible without colour; without the matching mark here the
          // player could see what to hit and still not know which spell hits
          // it, which leaves that path built at one end only.
          root.add(
            scene.add
              .image(14, -20, entry.mark)
              .setDisplaySize(14, 14)
              .setTint(entry.tint)
              .setAlpha(entry.enabled ? 1 : 0.3)
          );
        }
        if (entry.count !== undefined) {
          const count = scene.add
            .text(0, 18, `${entry.count}`, displayStyle(15, PALETTE.text))
            .setOrigin(0.5, 0.5)
            .setAlpha(entry.enabled ? 0.95 : 0.3);
          root.add(count);
        }
        root.setSize(slot, ROW_H - 4);
        if (entry.enabled) {
          root.setInteractive(containerHitArea(slot, ROW_H - 4));
          root.once('pointerdown', () => {
            const choose = onChooseNow;
            closeTray();
            choose?.(entry.choice);
          });
        }
        tray.add(root);
      });
    });

    tray.setVisible(true);
    tray.setAlpha(0);
    tray.y = trayFoot + 8;
    scene.tweens.add({ targets: tray, alpha: 1, y: trayFoot, duration: 160, ease: 'Quad.easeOut' });
  }

  return {
    container,

    show(actor: Combatant, learned: SkillId[], bag: Bag, onChoose: (choice: Choice) => void): void {
      onChooseNow = onChoose;
      closeTray();
      container.setVisible(true);

      // The second button wears a rod for whoever casts and a fist for
      // whoever swings. The test is the stat, not the colour: the daughter's
      // whole kit is `plain` and she is still unmistakably a caster, so
      // asking "does this carry an element" handed her a fist. Asking what
      // the skill runs on splits the party where it actually divides —
      // everything the father does is `atk`, everything she does is `mag`.
      const casts = learned.some((id) => SKILLS[id].stat === 'mag');
      commandButtons[1].icon.setTexture(casts ? rodTexture : mightTexture);

      commandButtons.forEach((button, index) => {
        const spec = commandSpecs[index];
        button.root.removeAllListeners();
        button.paint(true, false);
        button.root.setInteractive(containerHitArea(BUTTON_W, BUTTON_H));
        button.root.on('pointerdown', () => {
          if (spec.open === 'skill') {
            openTray(
              skillGrid(learned).map((gridRow) =>
                gridRow.cells.map((id) => {
                  if (!id) {
                    return null;
                  }
                  const skill = SKILLS[id];
                  return {
                    texture: ensureSkillGlyph(scene, skill.glyph),
                    tint: elementColor(skill.element),
                    enabled: skill.mpCost <= actor.mp,
                    choice: { kind: 'skill', skill: id } as Choice,
                    count: skill.mpCost,
                    mark:
                      skill.element === 'plain'
                        ? undefined
                        : ensureElementMark(scene, skill.element),
                  };
                })
              )
            );
            return;
          }
          if (spec.open === 'item') {
            const carried = (Object.keys(ITEMS) as ItemId[])
              .filter((id) => (bag[id] ?? 0) > 0)
              .map((id) => ({
                texture: ensureItemGlyph(scene, ITEMS[id].glyph),
                tint: PALETTE.text,
                enabled: true,
                choice: { kind: 'item', item: id } as Choice,
                count: bag[id] ?? 0,
              }));
            // The bag is a bag, not a grid: one row, and an empty one opens
            // as no rows at all so the tray can say "nothing to see".
            openTray(carried.length ? [carried] : []);
            return;
          }
          closeTray();
          onChoose(spec.choice);
        });
      });
    },

    hide(): void {
      closeTray();
      container.setVisible(false);
      commandButtons.forEach((button) => button.root.disableInteractive());
    },

    reset(): void {
      closeTray();
    },
  };
}

/** How much vertical room the bar and its tray need. */
export const COMMAND_BAR_HEIGHT = BUTTON_H + trayHeight(MAX_TRAY_ROWS) + 24;
