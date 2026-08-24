import Phaser from 'phaser';
import { HEIGHT } from '../gameConfig';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import {
  activeCombatant,
  canAct,
  createBattle,
  enemyCommand,
  livingFoes,
  livingHeroes,
  takeTurn,
} from '../core/rpg/battle';
import type { BattleEvent, BattleState, Combatant, Command } from '../core/rpg/battle';
import type { EnemyId } from '../core/rpg/enemies';
import { ITEMS } from '../core/rpg/items';
import type { Bag } from '../core/rpg/items';
import { createParty, learnedSkills } from '../core/rpg/party';
import type { Hero } from '../core/rpg/party';
import { createRng } from '../core/rpg/rng';
import type { Rng } from '../core/rpg/rng';
import { SKILLS } from '../core/rpg/skills';
import { PALETTE, displayStyle } from '../ui/theme';
import {
  DEPTH,
  createBackButton,
  createSoundButton,
  createStarBackdrop,
  transitionTo,
} from '../ui/widgets';
import type { Starfield } from '../ui/widgets';
import {
  PIP,
  elementColor,
  ensureStatusPip,
  statusColor,
} from '../ui/questTextures';
import { createEnemyRow } from './quest/enemyRow';
import type { EnemyRow } from './quest/enemyRow';
import { createPartyBar } from './quest/partyBar';
import type { PartyBar } from './quest/partyBar';
import { createCommandBar } from './quest/commandBar';
import type { Choice, CommandBar } from './quest/commandBar';
import { createNodeCard } from './quest/nodeCard';
import type { NodeCard } from './quest/nodeCard';

// One fight.
//
// The scene's whole job is to render a BattleState and hand back one Command
// per hero turn; every rule lives in core/rpg and none of it is repeated here.
// What this file owns is timing — the beat between an action and its result,
// which is the only thing standing in for the sentence a text JRPG would
// print. "Rin attacks! 17 damage!" becomes a lunge, a pause, and a number.

export const BATTLE_ACCENT = PALETTE.rose;

/** Vertical anatomy of the screen, top to bottom. */
const QUEUE_Y = 104;
const ENEMY_Y = 268;
const PARTY_Y = 512;
const COMMAND_Y = HEIGHT - 116;

/** How long one beat of the resolution lasts. */
const BEAT = 300;

export interface BattleSceneData {
  party?: Hero[];
  foes?: EnemyId[];
  bag?: Bag;
  seed?: number;
  /** Scene to hand back to when the fight ends. Absent means play standalone. */
  returnTo?: string;
}

export class BattleScene extends Phaser.Scene {
  private stars!: Starfield;
  private state!: BattleState;
  /**
   * What is currently on screen, which lags `state` during a turn.
   *
   * `takeTurn` hands back the fully resolved end of the turn in one go, but
   * the whole point of the event list is that a wordless game shows one beat
   * at a time. Painting from `state` meant the first damage number of an
   * all-target spell arrived with every HP bar already at its final value,
   * and a status pip appeared before the beat that inflicted it. So the scene
   * keeps its own copy and walks it forward one event at a time.
   */
  private display!: BattleState;
  private rng!: Rng;
  private party!: Hero[];
  private foes!: EnemyId[];
  private returnTo?: string;

  private enemies!: EnemyRow;
  private roster!: PartyBar;
  private commands!: CommandBar;
  private card!: NodeCard;

  /** True once the fight has ended and the scene is on its way out. */
  private settled = false;
  /** True while events are animating — all input is ignored. */
  private busy = false;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    // Scene instances outlive the scenes they run, so everything mutable is
    // rebuilt here rather than carried over from the last visit.
    this.settled = false;
    this.busy = false;
    this.party = data.party ?? createParty();
    this.foes = data.foes ?? ['blob', 'imp'];
    this.returnTo = data.returnTo;
    this.rng = createRng(data.seed ?? Date.now() % 100000);
    this.state = createBattle(this.party, this.foes, this.rng, data.bag ?? { potion: 2 });
    this.display = this.state;
  }

  create(): void {
    this.stars = createStarBackdrop(this);
    this.cameras.main.fadeIn(280, 0, 0, 0);

    this.enemies = createEnemyRow(this, this.state, ENEMY_Y, QUEUE_Y);
    this.roster = createPartyBar(this, PARTY_Y, BATTLE_ACCENT);
    this.commands = createCommandBar(this, COMMAND_Y, BATTLE_ACCENT);

    createBackButton(this, {
      accent: BATTLE_ACCENT,
      onTap: () => transitionTo(this, 'MenuScene'),
      isArmed: () => !this.settled,
    });
    createSoundButton(this, { accent: BATTLE_ACCENT, depth: DEPTH.overlay + 1 });

    this.card = createNodeCard(this, BATTLE_ACCENT);

    playMusic(this, 'battle');

    this.refresh();
    this.time.delayedCall(420, () => this.beginTurn());
  }

  update(_time: number, delta: number): void {
    this.stars.scroll(delta * 0.008);
  }

  private refresh(): void {
    this.enemies.update(this.display);
    this.enemies.setQueue(this.display);
    this.roster.update(this.display);
  }

  // --- the turn loop ------------------------------------------------------

  private beginTurn(): void {
    if (this.state.outcome !== 'ongoing') {
      this.finish();
      return;
    }

    const actor = activeCombatant(this.state);
    if (!actor) {
      this.finish();
      return;
    }

    this.refresh();
    this.roster.setActive(actor.side === 'party' ? actor.id : null);

    // A sleeper never sees a menu. The pip on their portrait is the reason,
    // and floating it again as their turn passes is what connects the two.
    if (!canAct(this.state)) {
      this.floatPip(actor, 'sleep');
      this.time.delayedCall(BEAT * 2, () => this.resolve({ kind: 'guard' }));
      return;
    }

    if (actor.side === 'foes') {
      this.enemies.lunge(actor.id);
      this.time.delayedCall(BEAT * 1.5, () => this.resolve(enemyCommand(this.state, this.rng)));
      return;
    }

    const hero = this.party.find((h) => `hero:${h.id}` === actor.id)!;
    this.commands.show(actor, learnedSkills(hero), this.state.bag, (choice) =>
      this.onChoose(actor, choice)
    );
  }

  /**
   * Turns a chosen command into a targeted one.
   *
   * Anything that lands on everybody skips this step entirely. Asking a
   * player to aim a spell that cannot be aimed is a tap that teaches them
   * their choices matter less than they do.
   */
  private onChoose(actor: Combatant, choice: Choice): void {
    if (this.busy) {
      return;
    }
    // Whatever was being aimed is abandoned. The command row stays live
    // through targeting precisely so a player can change their mind.
    this.clearAim();

    if (choice.kind === 'guard') {
      this.resolve({ kind: 'guard' });
      return;
    }

    if (choice.kind === 'attack') {
      this.aim(
        livingFoes(this.state).map((c) => c.id),
        'foes',
        (target) => this.resolve({ kind: 'attack', target })
      );
      return;
    }

    if (choice.kind === 'skill') {
      const skill = SKILLS[choice.skill];
      if (skill.target === 'oneFoe') {
        this.aim(livingFoes(this.state).map((c) => c.id), 'foes', (target) =>
          this.resolve({ kind: 'skill', skill: choice.skill, target })
        );
      } else if (skill.target === 'oneAlly') {
        this.aim(livingHeroes(this.state).map((c) => c.id), 'party', (target) =>
          this.resolve({ kind: 'skill', skill: choice.skill, target })
        );
      } else {
        this.resolve({ kind: 'skill', skill: choice.skill, target: actor.id });
      }
      return;
    }

    const item = ITEMS[choice.item];
    if (item.target === 'oneAlly') {
      this.aim(livingHeroes(this.state).map((c) => c.id), 'party', (target) =>
        this.resolve({ kind: 'item', item: choice.item, target })
      );
    } else {
      this.resolve({ kind: 'item', item: choice.item });
    }
  }

  /**
   * Waits for the player to point at somebody.
   *
   * The command row is deliberately left on screen. Hiding it would strand
   * anyone who opened the skill tray, picked a spell and then changed their
   * mind: this game has no back button in a fight, so the only way out of
   * targeting has to be choosing something else.
   */
  private aim(ids: string[], side: 'foes' | 'party', onPick: (id: string) => void): void {
    const pick = (id: string): void => {
      this.clearAim();
      playSfx(this, 'tap');
      onPick(id);
    };
    if (side === 'foes') {
      this.enemies.offerTargets(ids, pick);
    } else {
      this.roster.offerTargets(ids, pick);
    }
  }

  private clearAim(): void {
    this.enemies.offerTargets([], () => {});
    this.roster.offerTargets([], () => {});
  }

  private resolve(command: Command): void {
    if (this.busy || this.settled) {
      return;
    }
    this.commands.hide();
    this.clearAim();

    const { state, events } = takeTurn(this.state, command, this.rng);
    // An illegal command hands back the identical state. Nothing happened, so
    // put the menu back rather than spending the turn.
    if (state === this.state) {
      this.beginTurn();
      return;
    }

    // `display` stays on the turn's opening position; playEvents walks it
    // forward beat by beat until it catches up with `state`.
    this.display = this.state;
    this.state = state;
    this.busy = true;
    this.playEvents(events, () => {
      this.busy = false;
      this.beginTurn();
    });
  }

  // --- turning events into things you can watch ---------------------------

  private playEvents(events: BattleEvent[], done: () => void): void {
    let delay = 0;

    for (const event of events) {
      this.time.delayedCall(delay, () => {
        this.applyToDisplay(event);
        this.playEvent(event);
      });
      // A hit needs a beat to land; bookkeeping like an expiring pip does not
      // and would only pad the fight out.
      delay += event.type === 'statusExpired' || event.type === 'act' ? BEAT * 0.35 : BEAT;
    }

    this.time.delayedCall(delay + BEAT * 0.4, () => {
      // Whatever the events did not cover — the new turn order, the spent
      // item — arrives here, once the beats have all been seen.
      this.display = this.state;
      this.refresh();
      done();
    });
  }

  /**
   * Walks the on-screen copy forward by exactly one event.
   *
   * Mirrors what battle.ts already did to produce the event, which is a
   * duplication worth paying for: the alternative is threading a snapshot
   * through every step of the resolver purely so the renderer can watch.
   */
  private applyToDisplay(event: BattleEvent): void {
    const combatants = this.display.combatants.map((c) => ({ ...c, statuses: [...c.statuses] }));
    const at = (id: string): Combatant | undefined => combatants.find((c) => c.id === id);

    switch (event.type) {
      case 'act': {
        // MP is spent inside takeTurn without an event of its own, so the
        // pips would otherwise stay full until the whole turn finished.
        const actor = at(event.actor);
        if (actor && event.skill) {
          actor.mp = Math.max(0, actor.mp - SKILLS[event.skill].mpCost);
        }
        break;
      }
      case 'damage': {
        const target = at(event.target);
        if (target) {
          target.hp = Math.max(0, target.hp - event.amount);
          target.statuses = target.statuses.filter((status) => status.kind !== 'sleep');
        }
        break;
      }
      case 'heal': {
        const target = at(event.target);
        if (target) {
          target.hp = Math.min(target.stats.maxHp, target.hp + event.amount);
        }
        break;
      }
      case 'mp': {
        const target = at(event.target);
        if (target) {
          target.mp = Math.min(target.stats.maxMp, target.mp + event.amount);
        }
        break;
      }
      case 'status': {
        const target = at(event.target);
        if (target && !target.statuses.some((s) => s.kind === event.status)) {
          // Duration is cosmetic here: the pip only has to appear on the beat
          // that put it there, and the real turn count arrives at the end.
          target.statuses = [...target.statuses, { kind: event.status, turns: 1 }];
        }
        break;
      }
      case 'statusExpired': {
        const target = at(event.target);
        if (target) {
          target.statuses = target.statuses.filter((status) => status.kind !== event.status);
        }
        break;
      }
      case 'cured': {
        const target = at(event.target);
        if (target) {
          target.statuses = target.statuses.filter((status) => status.kind === 'regen');
        }
        break;
      }
      case 'guard': {
        const actor = at(event.actor);
        if (actor) {
          actor.guarding = true;
        }
        break;
      }
      default:
        break;
    }

    this.display = { ...this.display, combatants };
  }

  private playEvent(event: BattleEvent): void {
    switch (event.type) {
      case 'damage': {
        const target = this.find(event.target);
        if (!target) {
          return;
        }
        const { x, y } = this.positionOf(event.target);
        // The size of the number is the lesson. A hit on the weakness comes
        // back big and tinted with the colour that caused it; a resisted one
        // comes back small and grey. Nothing has to be written down.
        const weak = event.band === 'weak';
        const resisted = event.band === 'resist';
        this.floatNumber(
          x,
          y,
          `${event.amount}`,
          weak ? elementColor(event.element) : resisted ? PALETTE.muted : PALETTE.text,
          weak ? 40 : resisted ? 20 : 28
        );
        if (weak) {
          this.cameras.main.shake(180, 0.006);
          playSfx(this, 'weak');
        } else {
          playSfx(this, target.side === 'party' ? 'hurt' : 'slash');
        }
        this.flash(event.target);
        this.refresh();
        break;
      }
      case 'heal': {
        const { x, y } = this.positionOf(event.target);
        this.floatNumber(x, y, `${event.amount}`, PALETTE.mint, 28);
        playSfx(this, 'heal');
        this.refresh();
        break;
      }
      case 'mp': {
        const { x, y } = this.positionOf(event.target);
        this.floatNumber(x, y, `${event.amount}`, PALETTE.cyan, 24);
        playSfx(this, 'heal');
        this.refresh();
        break;
      }
      case 'status': {
        const target = this.find(event.target);
        if (target) {
          this.floatPip(target, event.status);
          playSfx(this, 'afflict');
        }
        this.refresh();
        break;
      }
      case 'cured':
        playSfx(this, 'heal');
        this.refresh();
        break;
      case 'guard': {
        const { x, y } = this.positionOf(event.actor);
        this.floatNumber(x, y, '', PALETTE.cyan, 0);
        playSfx(this, 'guard');
        break;
      }
      case 'down':
        if (event.target.startsWith('foe:')) {
          this.enemies.fell(event.target);
        }
        playSfx(this, 'gameover');
        this.refresh();
        break;
      case 'act':
        if (event.skill && SKILLS[event.skill].mpCost > 0) {
          playSfx(this, 'cast');
        }
        break;
      case 'asleep':
        this.refresh();
        break;
      default:
        break;
    }
  }

  private find(id: string): Combatant | undefined {
    return this.display.combatants.find((c) => c.id === id);
  }

  private positionOf(id: string): { x: number; y: number } {
    return id.startsWith('foe:') ? this.enemies.positionOf(id) : this.roster.positionOf(id);
  }

  private floatNumber(x: number, y: number, text: string, color: number, size: number): void {
    if (size === 0 || text === '') {
      return;
    }
    const label = this.add
      .text(x, y - 10, text, displayStyle(size, color))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: label,
      y: y - 62,
      alpha: 0,
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private floatPip(target: Combatant, kind: Parameters<typeof statusColor>[0]): void {
    const { x, y } = this.positionOf(target.id);
    const pip = this.add
      .image(x, y - 10, ensureStatusPip(this, kind))
      .setDisplaySize(PIP * 1.6, PIP * 1.6)
      .setTint(statusColor(kind))
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: pip,
      y: y - 58,
      alpha: 0,
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => pip.destroy(),
    });
  }

  private flash(id: string): void {
    if (!id.startsWith('foe:')) {
      return;
    }
    const { x, y } = this.enemies.positionOf(id);
    const ring = this.add.graphics().setDepth(DEPTH.effects);
    ring.lineStyle(4, PALETTE.text, 0.8);
    ring.strokeCircle(x, y, 30);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 260,
      onComplete: () => ring.destroy(),
    });
  }

  // --- the end ------------------------------------------------------------

  private finish(): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.commands.hide();
    this.clearAim();
    this.roster.setActive(null);
    this.display = this.state;
    this.refresh();

    if (this.returnTo) {
      // The map owns what a win or a loss means; this scene only reports it.
      this.time.delayedCall(500, () => {
        this.scene.start(this.returnTo!, { battle: this.state, foes: this.foes });
      });
      return;
    }

    const won = this.state.outcome === 'won';
    fadeOutMusic(this);
    playSfx(this, won ? 'levelup' : 'gameover');
    this.time.delayedCall(560, () => {
      this.card.showOutcome(
        won,
        () => this.scene.restart({ foes: this.foes }),
        () => transitionTo(this, 'MenuScene')
      );
    });
  }
}
