import Phaser from 'phaser';
import type { Combatant } from '../../core/rpg/battle';
import { SKILLS } from '../../core/rpg/skills';
import type { SkillId } from '../../core/rpg/skills';
import { ITEMS } from '../../core/rpg/items';
import type { Bag, ItemId } from '../../core/rpg/items';
import { PALETTE, RADIUS, displayStyle } from '../../ui/theme';
import { DEPTH, containerHitArea } from '../../ui/widgets';
import {
  GLYPH,
  elementColor,
  ensureCommandGlyph,
  ensureItemGlyph,
  ensureSkillGlyph,
} from '../../ui/questTextures';
import { WIDTH } from '../../gameConfig';

// The bottom third: four commands, and the tray that opens over them.
//
// Everything here obeys the same two-part grammar as the rest of the game.
// Shape says what a skill does — a blade is a heavy single hit, a fan sweeps
// everyone, a droplet mends. Colour says which element it carries. So the
// player learns ten shapes rather than twenty-five names, and a skill they
// have never used before still tells them what it will do.
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
const TRAY_H = 96;

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
  const tray = scene.add.container(0, baseY - TRAY_H - 8).setDepth(DEPTH.hud).setVisible(false);
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

  const commandSpecs: { texture: string; open: 'skill' | 'item' | null; choice: Choice }[] = [
    { texture: ensureCommandGlyph(scene, 'attack'), open: null, choice: { kind: 'attack' } },
    { texture: ensureCommandGlyph(scene, 'skill'), open: 'skill', choice: { kind: 'attack' } },
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

  function openTray(
    entries: { texture: string; tint: number; enabled: boolean; choice: Choice; count?: number }[]
  ): void {
    tray.removeAll(true);

    const panel = scene.add.graphics();
    panel.fillStyle(PALETTE.surface, 0.97);
    panel.fillRoundedRect(16, -TRAY_H / 2, WIDTH - 32, TRAY_H, RADIUS.card);
    panel.lineStyle(2, accent, 0.5);
    panel.strokeRoundedRect(16, -TRAY_H / 2, WIDTH - 32, TRAY_H, RADIUS.card);
    tray.add(panel);

    if (entries.length === 0) {
      // An empty tray still opens, and still has to say something. A struck
      // through circle is the one glyph here that means "nothing to see".
      const empty = scene.add.graphics();
      empty.lineStyle(3, PALETTE.muted, 0.7);
      empty.strokeCircle(WIDTH / 2, 0, 18);
      empty.beginPath();
      empty.moveTo(WIDTH / 2 - 13, -13);
      empty.lineTo(WIDTH / 2 + 13, 13);
      empty.strokePath();
      tray.add(empty);
    }

    const slot = Math.min(74, (WIDTH - 60) / Math.max(1, entries.length));
    const startX = WIDTH / 2 - ((entries.length - 1) * slot) / 2;

    entries.forEach((entry, index) => {
      const root = scene.add.container(startX + index * slot, 0);
      const icon = scene.add
        .image(0, -6, entry.texture)
        .setDisplaySize(GLYPH * 0.78, GLYPH * 0.78)
        .setTint(entry.tint)
        .setAlpha(entry.enabled ? 1 : 0.28);
      root.add(icon);
      if (entry.count !== undefined) {
        const count = scene.add
          .text(0, 26, `${entry.count}`, displayStyle(16, PALETTE.text))
          .setOrigin(0.5, 0.5)
          .setAlpha(entry.enabled ? 0.95 : 0.3);
        root.add(count);
      }
      root.setSize(slot, TRAY_H - 10);
      if (entry.enabled) {
        root.setInteractive(containerHitArea(slot, TRAY_H - 10));
        root.once('pointerdown', () => {
          const choose = onChooseNow;
          closeTray();
          choose?.(entry.choice);
        });
      }
      tray.add(root);
    });

    tray.setVisible(true);
    tray.setAlpha(0);
    tray.y = baseY - TRAY_H - 2;
    scene.tweens.add({ targets: tray, alpha: 1, y: baseY - TRAY_H - 10, duration: 160, ease: 'Quad.easeOut' });
  }

  return {
    container,

    show(actor: Combatant, learned: SkillId[], bag: Bag, onChoose: (choice: Choice) => void): void {
      onChooseNow = onChoose;
      closeTray();
      container.setVisible(true);

      commandButtons.forEach((button, index) => {
        const spec = commandSpecs[index];
        button.root.removeAllListeners();
        button.paint(true, false);
        button.root.setInteractive(containerHitArea(BUTTON_W, BUTTON_H));
        button.root.on('pointerdown', () => {
          if (spec.open === 'skill') {
            openTray(
              learned.map((id) => ({
                texture: ensureSkillGlyph(scene, SKILLS[id].glyph),
                tint: elementColor(SKILLS[id].element),
                enabled: SKILLS[id].mpCost <= actor.mp,
                choice: { kind: 'skill', skill: id } as Choice,
                count: SKILLS[id].mpCost,
              }))
            );
            return;
          }
          if (spec.open === 'item') {
            openTray(
              (Object.keys(ITEMS) as ItemId[])
                .filter((id) => (bag[id] ?? 0) > 0)
                .map((id) => ({
                  texture: ensureItemGlyph(scene, ITEMS[id].glyph),
                  tint: PALETTE.text,
                  enabled: true,
                  choice: { kind: 'item', item: id } as Choice,
                  count: bag[id] ?? 0,
                }))
            );
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
export const COMMAND_BAR_HEIGHT = BUTTON_H + TRAY_H + 24;
