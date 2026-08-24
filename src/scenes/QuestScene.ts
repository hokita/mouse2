import Phaser from 'phaser';
import { WIDTH } from '../gameConfig';
import { playMusic, playSfx } from '../audio/bus';
import type { BattleState } from '../core/rpg/battle';
import type { EnemyId } from '../core/rpg/enemies';
import { MAP_ROWS, nodeAt } from '../core/rpg/nodeMap';
import type { MapNode } from '../core/rpg/nodeMap';
import { HEROES, heroStats } from '../core/rpg/party';
import { createRng } from '../core/rpg/rng';
import { SKILLS } from '../core/rpg/skills';
import {
  battleSeed,
  createRun,
  currentNode,
  encounterAt,
  encounterSeed,
  finishBattle,
  isVictory,
  openTreasure,
  optionsFor,
  shrineOffer,
  takeBoon,
  takeRest,
  travelTo,
} from '../core/rpg/run';
import type { LevelUp, RunState } from '../core/rpg/run';
import { PALETTE, displayStyle } from '../ui/theme';
import { DEPTH, containerHitArea, createBackButton, createSoundButton, createStarBackdrop, transitionTo } from '../ui/widgets';
import type { Starfield } from '../ui/widgets';
import {
  NODE,
  SIGIL,
  elementColor,
  ensureHeroSigil,
  ensureNodeGlyph,
  ensureSkillGlyph,
  ensureUiGlyph,
} from '../ui/questTextures';
import { createNodeCard } from './quest/nodeCard';
import type { NodeCard } from './quest/nodeCard';
import { BATTLE_ACCENT } from './BattleScene';

// The campaign map: fourteen rows of icons and the lines between them.
//
// This screen is the only place the shape of a run is visible. With no text
// there is no chapter title and no quest log, so "how far in am I" has to be
// answered by watching the icons above you run out — which is why the whole
// map is on screen at once and never scrolls.
//
// The run itself lives on the scene instance rather than in scene data.
// Phaser reuses scene instances, so `this.run` survives the round trip out to
// BattleScene and back; only a genuinely new run rebuilds it.

/** Row 0 sits at the bottom and the boss at the top, so progress climbs. */
const MAP_TOP = 186;
const MAP_BOTTOM = 872;
const COLUMN_GAP = 98;
const PARTY_STRIP_Y = 104;

export interface QuestSceneData {
  /** Present when arriving back from a fight. */
  battle?: BattleState;
  foes?: EnemyId[];
}

export class QuestScene extends Phaser.Scene {
  private stars!: Starfield;
  private run!: RunState;
  private card!: NodeCard;
  private mapLayer!: Phaser.GameObjects.Container;
  private partyStrip!: Phaser.GameObjects.Container;
  /** True once the run has ended or a hand-over has begun. */
  private settled = false;
  /** Levels gained in the fight just finished, waiting to be celebrated. */
  private pendingLevelUps: LevelUp[] = [];
  /**
   * True between stepping onto a node and that node resolving.
   *
   * The map is redrawn the moment the party moves, which re-arms whatever the
   * new node leads to — so without this a second tap during the step could
   * move them on again and the node they landed on would never resolve.
   */
  private moving = false;

  constructor() {
    super('QuestScene');
  }

  init(data: QuestSceneData): void {
    this.settled = false;
    this.moving = false;
    this.pendingLevelUps = [];

    if (data.battle && data.foes && this.run) {
      this.resolveBattle(data.battle, data.foes);
      return;
    }
    this.run = createRun(Math.floor(Math.random() * 1_000_000));
  }

  /**
   * Folds a finished fight back into the run.
   *
   * A loss ends the run here rather than in BattleScene, because only the map
   * knows what a loss costs — the fight itself has no idea whether it was the
   * first skirmish or the boss.
   */
  private resolveBattle(battle: BattleState, foes: EnemyId[]): void {
    if (battle.outcome === 'lost') {
      this.settled = true;
      this.run = { ...this.run, party: this.run.party.map((h) => ({ ...h, hp: 0 })) };
      return;
    }
    const result = finishBattle(this.run, battle, foes);
    this.run = result.run;
    this.pendingLevelUps = result.levelUps;
  }

  create(): void {
    this.stars = createStarBackdrop(this);
    this.cameras.main.fadeIn(280, 0, 0, 0);

    this.mapLayer = this.add.container(0, 0).setDepth(DEPTH.world);
    this.partyStrip = this.add.container(0, PARTY_STRIP_Y).setDepth(DEPTH.hud);
    this.card = createNodeCard(this, BATTLE_ACCENT);

    createBackButton(this, {
      accent: BATTLE_ACCENT,
      onTap: () => transitionTo(this, 'MenuScene'),
      isArmed: () => !this.settled,
    });
    createSoundButton(this, { accent: BATTLE_ACCENT, depth: DEPTH.overlay + 1 });

    playMusic(this, 'quest');

    this.drawMap();
    this.drawParty();

    if (this.settled) {
      this.time.delayedCall(420, () => this.endRun(false));
      return;
    }
    if (isVictory(this.run)) {
      this.settled = true;
      this.time.delayedCall(420, () => this.endRun(true));
      return;
    }

    if (this.pendingLevelUps.length) {
      this.time.delayedCall(320, () => this.celebrateLevelUps());
    }
  }

  update(_time: number, delta: number): void {
    this.stars.scroll(delta * 0.006);
  }

  // --- drawing ------------------------------------------------------------

  private positionOf(node: MapNode): { x: number; y: number } {
    const rowsBelow = MAP_ROWS - 1 - node.row;
    const y = MAP_TOP + (rowsBelow * (MAP_BOTTOM - MAP_TOP)) / (MAP_ROWS - 1);
    const width = this.run.map.nodes.filter((n) => n.row === node.row).length;
    const x = WIDTH / 2 + (node.col - (width - 1) / 2) * COLUMN_GAP;
    return { x, y };
  }

  private drawMap(): void {
    this.mapLayer.removeAll(true);

    const reachable = new Set(optionsFor(this.run).map((n) => n.id));
    const here = currentNode(this.run);

    // Edges first, so every icon sits on top of its own threads.
    const lines = this.add.graphics();
    for (const node of this.run.map.nodes) {
      const from = this.positionOf(node);
      for (const nextId of node.next) {
        const to = this.positionOf(nodeAt(this.run.map, nextId)!);
        const live = node.id === here.id && reachable.has(nextId);
        lines.lineStyle(live ? 3 : 2, live ? BATTLE_ACCENT : PALETTE.surfaceEdge, live ? 0.95 : 0.4);
        lines.beginPath();
        lines.moveTo(from.x, from.y);
        lines.lineTo(to.x, to.y);
        lines.strokePath();
      }
    }
    this.mapLayer.add(lines);

    for (const node of this.run.map.nodes) {
      this.mapLayer.add(this.drawNode(node, reachable.has(node.id), node.id === here.id));
    }
  }

  private drawNode(node: MapNode, reachable: boolean, here: boolean): Phaser.GameObjects.Container {
    const { x, y } = this.positionOf(node);
    const root = this.add.container(x, y);
    const visited = this.run.visited.includes(node.id);

    const size = node.kind === 'boss' ? NODE * 1.35 : NODE * 0.82;
    const tint =
      node.kind === 'boss'
        ? PALETTE.gold
        : node.kind === 'elite'
          ? PALETTE.rose
          : node.kind === 'rest'
            ? PALETTE.mint
            : node.kind === 'treasure'
              ? PALETTE.gold
              : PALETTE.text;

    const plate = this.add.graphics();
    const radius = node.kind === 'boss' ? 32 : 23;
    plate.fillStyle(PALETTE.surface, visited || reachable || here ? 0.95 : 0.55);
    plate.fillCircle(0, 0, radius);
    plate.lineStyle(2, reachable || here ? BATTLE_ACCENT : PALETTE.surfaceEdge, reachable || here ? 0.95 : 0.5);
    plate.strokeCircle(0, 0, radius);
    root.add(plate);

    const icon = this.add
      .image(0, 0, ensureNodeGlyph(this, node.kind))
      .setDisplaySize(size, size)
      .setTint(tint);
    root.add(icon);

    // Three states, three treatments: where you have been is dimmed and
    // ticked, where you are is pinned, where you may go pulses.
    if (visited && !here) {
      root.setAlpha(0.42);
      root.add(this.add.image(14, -14, ensureUiGlyph(this, 'check')).setDisplaySize(20, 20).setTint(PALETTE.mint));
    } else if (!reachable && !here) {
      root.setAlpha(0.5);
    }

    if (here) {
      root.add(
        this.add.image(0, -radius - 14, ensureUiGlyph(this, 'pin')).setDisplaySize(26, 26).setTint(BATTLE_ACCENT)
      );
    }

    if (reachable && !this.settled && !this.moving) {
      root.setSize(radius * 2 + 16, radius * 2 + 16);
      root.setInteractive(containerHitArea(radius * 2 + 16, radius * 2 + 16));
      root.once('pointerdown', () => this.travel(node));
      this.tweens.add({
        targets: root,
        scale: 1.12,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    return root;
  }

  /** Three compact readouts: who is standing, how hurt, and what level. */
  private drawParty(): void {
    this.partyStrip.removeAll(true);
    const slot = WIDTH / 3;

    this.run.party.forEach((hero, index) => {
      const x = slot * index + slot / 2;
      const stats = heroStats(hero);
      const fraction = Math.max(0, hero.hp / stats.maxHp);

      const sigil = this.add
        .image(x - 44, 0, ensureHeroSigil(this, HEROES[hero.id].sigil))
        .setDisplaySize(SIGIL * 0.52, SIGIL * 0.52)
        .setTint(hero.hp > 0 ? PALETTE.text : PALETTE.muted)
        .setAlpha(hero.hp > 0 ? 1 : 0.45);

      const bar = this.add.graphics();
      bar.fillStyle(PALETTE.skyTop, 0.7);
      bar.fillRoundedRect(x - 28, -5, 66, 10, 5);
      if (fraction > 0) {
        bar.fillStyle(fraction > 0.5 ? PALETTE.mint : fraction > 0.25 ? PALETTE.amber : PALETTE.rose, 1);
        bar.fillRoundedRect(x - 28, -5, Math.max(10, 66 * fraction), 10, 5);
      }
      bar.lineStyle(1.2, PALETTE.surfaceEdge, 0.8);
      bar.strokeRoundedRect(x - 28, -5, 66, 10, 5);

      const level = this.add
        .text(x - 44, 20, `${hero.level}`, displayStyle(14, PALETTE.muted))
        .setOrigin(0.5, 0.5);

      this.partyStrip.add([sigil, bar, level]);
    });
  }

  // --- moving -------------------------------------------------------------

  private offerMoves(): void {
    this.drawMap();
    this.drawParty();
  }

  private travel(node: MapNode): void {
    if (this.settled || this.moving) {
      return;
    }
    this.moving = true;
    playSfx(this, 'tap');
    this.run = travelTo(this.run, node.id);
    this.drawMap();
    this.drawParty();
    this.time.delayedCall(260, () => this.resolveNode(node));
  }

  private resolveNode(node: MapNode): void {
    const rng = createRng(encounterSeed(this.run, node));

    switch (node.kind) {
      case 'battle':
      case 'elite':
      case 'boss': {
        const foes = encounterAt(node, rng);
        this.settled = true;
        this.cameras.main.fadeOut(240, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('BattleScene', {
            party: this.run.party,
            foes,
            bag: this.run.bag,
            seed: battleSeed(this.run, node),
            returnTo: 'QuestScene',
          });
        });
        break;
      }
      case 'rest':
        playSfx(this, 'heal');
        this.run = takeRest(this.run);
        this.card.showRest(() => this.afterCard());
        break;
      case 'treasure': {
        const { run, gained } = openTreasure(this.run, rng);
        this.run = run;
        playSfx(this, 'rare');
        this.card.showTreasure(gained, () => this.afterCard());
        break;
      }
      case 'shrine':
        playSfx(this, 'milestone');
        this.card.showShrine(shrineOffer(rng), (boon) => {
          this.run = takeBoon(this.run, boon);
          playSfx(this, 'levelup');
          this.afterCard();
        });
        break;
      default:
        this.offerMoves();
        break;
    }
  }

  /**
   * Says "you got stronger" the only way this game can.
   *
   * A rising sigil over the portrait, and beside it the glyph of anything
   * newly learned flying up into view. Without this the player's skill tray
   * would silently grow an icon between one fight and the next, and they
   * would meet a skill they were never told they had.
   */
  private celebrateLevelUps(): void {
    playSfx(this, 'levelup');
    const slot = WIDTH / 3;

    for (const levelUp of this.pendingLevelUps) {
      const index = this.run.party.findIndex((h) => h.id === levelUp.hero);
      if (index < 0) {
        continue;
      }
      const x = slot * index + slot / 2 - 44;

      const arrow = this.add
        .image(x, PARTY_STRIP_Y, ensureUiGlyph(this, 'up'))
        .setDisplaySize(22, 22)
        .setTint(PALETTE.gold)
        .setDepth(DEPTH.effects);
      this.tweens.add({
        targets: arrow,
        y: PARTY_STRIP_Y - 40,
        alpha: 0,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => arrow.destroy(),
      });

      levelUp.learned.forEach((skill, order) => {
        const glyph = this.add
          .image(x + 34 + order * 30, PARTY_STRIP_Y, ensureSkillGlyph(this, SKILLS[skill].glyph))
          .setDisplaySize(26, 26)
          .setTint(elementColor(SKILLS[skill].element))
          .setDepth(DEPTH.effects);
        this.tweens.add({
          targets: glyph,
          y: PARTY_STRIP_Y - 46,
          alpha: 0,
          duration: 1100,
          delay: 160 + order * 120,
          ease: 'Quad.easeOut',
          onComplete: () => glyph.destroy(),
        });
      });
    }

    this.pendingLevelUps = [];
    this.drawParty();
  }

  private afterCard(): void {
    this.moving = false;
    this.drawParty();
    this.offerMoves();
  }

  private endRun(won: boolean): void {
    this.settled = true;
    this.drawMap();
    playSfx(this, won ? 'levelup' : 'gameover');
    this.card.showOutcome(
      won,
      () => this.scene.restart({}),
      () => transitionTo(this, 'MenuScene')
    );
  }
}
