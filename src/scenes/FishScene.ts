import Phaser from 'phaser';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { createCountdown, elapsed, isFinished, secondsLeft, tickCountdown } from '../core/countdown';
import type { CountdownState } from '../core/countdown';
import { levelIndexAt } from '../core/levels';
import { POINTS, pickFreeHole, pickKind } from '../core/popups';
import type { KindOdds, PopupKind } from '../core/popups';
import { addPoints, createScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, retuneSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { WIDTH, HEIGHT } from '../gameConfig';
import { PALETTE, displayStyle, labelStyle } from '../ui/theme';
import {
  FISH_HEIGHT,
  FISH_WIDTH,
  POND_HEIGHT,
  POND_WIDTH,
  TEX,
  TRASH_HEIGHT,
  TRASH_WIDTH,
  ensureFishTexture,
  ensureFxTextures,
  ensureGradient,
  ensurePondTextures,
  ensureTrashTexture,
} from '../ui/textures';
import {
  DEPTH,
  createBackButton,
  createGameOverOverlay,
  createSoundButton,
  createStatPill,
  transitionTo,
} from '../ui/widgets';
import type { GameOverOverlay, StatPill } from '../ui/widgets';

const ACCENT = PALETTE.mint;

/** How far the catch blip climbs per catch, and where the climb stops. */
const STREAK_DETUNE_CENTS = 100;
const STREAK_DETUNE_MAX = 6;

/** One run is a minute — long enough to get somewhere, short enough to redo. */
const RUN_MS = 60_000;

/** How long the game stays on each rung of the difficulty ladder. */
const LEVEL_STEP_MS = 12_000;

/** The ordinary fish, in the four colours the rest of the project uses. */
export const FISH_COLORS = [PALETTE.cyan, PALETTE.mint, PALETTE.violet, PALETTE.rose];

const COLUMNS = 3;
const ROWS = 4;
const HOLE_COUNT = COLUMNS * ROWS;
const HOLE_LEFT = 76;
const HOLE_COLUMN_GAP = 139;
const HOLE_TOP = 246;
const HOLE_ROW_GAP = 152;

/**
 * How high above its hole's centre each kind rides.
 *
 * Every one of them is lifted less than half its own height, so its bottom
 * edge stays behind the water lip drawn in front — that overlap is the whole
 * illusion of something surfacing rather than hovering over the pond.
 */
const LIFT: Record<PopupKind, number> = { fish: 18, rare: 18, trash: 16 };

/**
 * How much bigger than the sprite a fish's tap target is, per side.
 *
 * Trash deliberately gets none of this. The pad exists so a small, imprecise
 * finger still lands its catch — but a pad on the one thing that costs points
 * would punish exactly the near-misses it is there to forgive. The can is
 * drawn out to the edges of its texture for the same reason: transparent
 * margin around the art would be padding by another name.
 */
const TAP_PAD = 12;

// Caps how much sim time a single frame advances the clock and the spawn timer
// by. Nothing here moves under its own steam, so this is not about tunnelling:
// it stops a stalled frame (a backgrounded tab, say) from burning several
// seconds off the run and diving every fish that was up at the time.
const MAX_DELTA_MS = 100;

interface Level {
  /** Shortest and longest gap between two pop-ups. */
  minSpawnMs: number;
  maxSpawnMs: number;
  /** How long something stays up before it dives back down. */
  surfaceMs: number;
  /** Most things allowed above water at once. */
  maxActive: number;
  odds: KindOdds;
}

// The ladder the run climbs, a rung every LEVEL_STEP_MS. It starts with a
// single slow fish and no junk at all, so a new player's first taps always
// land on something good; from there the gaps close, more comes up at once,
// each catch stays up for less time, and the trash and the rare fish both grow
// more common.
const LEVELS: Level[] = [
  { minSpawnMs: 1100, maxSpawnMs: 1500, surfaceMs: 2600, maxActive: 2, odds: { rare: 0.05, trash: 0 } },
  { minSpawnMs: 900, maxSpawnMs: 1250, surfaceMs: 2300, maxActive: 3, odds: { rare: 0.07, trash: 0.14 } },
  { minSpawnMs: 750, maxSpawnMs: 1050, surfaceMs: 2000, maxActive: 3, odds: { rare: 0.09, trash: 0.2 } },
  { minSpawnMs: 620, maxSpawnMs: 900, surfaceMs: 1750, maxActive: 4, odds: { rare: 0.11, trash: 0.25 } },
  { minSpawnMs: 500, maxSpawnMs: 780, surfaceMs: 1500, maxActive: 4, odds: { rare: 0.13, trash: 0.3 } },
];

type GameState = 'playing' | 'timeUp';

interface Popup {
  hole: number;
  kind: PopupKind;
  sprite: Phaser.GameObjects.Image;
  /** Aura behind the rare fish; null for everything else. */
  glow: Phaser.GameObjects.Image | null;
  /** Time left above water. */
  lifeMs: number;
  /** True once caught or diving: it can't be tapped again on the way down. */
  leaving: boolean;
}

export class FishScene extends Phaser.Scene {
  private popups: Popup[] = [];
  private spawner!: SpawnerState;
  private countdown!: CountdownState;
  private levelIndex!: number;
  /** Consecutive good catches, which is what walks the catch blip upward. */
  private streak = 0;
  private scoreState!: ScoreState;
  private scorePill!: StatPill;
  private timePill!: StatPill;
  private levelToast!: Phaser.GameObjects.Text;
  private overlay!: GameOverOverlay;
  private overlayShown = false;
  private state!: GameState;

  constructor() {
    super('FishScene');
  }

  create(): void {
    ensureFxTextures(this);
    ensurePondTextures(this);
    ensureTrashTexture(this);
    for (const color of FISH_COLORS) {
      ensureFishTexture(this, color);
    }
    ensureFishTexture(this, PALETTE.gold, { rare: true });

    this.createBackdrop();
    this.createHoles();

    this.scorePill = createStatPill(this, {
      x: 18,
      y: 18,
      width: 150,
      label: 'Score',
      accent: ACCENT,
    });

    this.timePill = createStatPill(this, {
      x: WIDTH - 18,
      y: 18,
      width: 130,
      label: 'Time',
      align: 'right',
      accent: PALETTE.gold,
    });

    this.levelToast = this.add
      .text(WIDTH / 2, HEIGHT - 96, '', displayStyle(20, PALETTE.gold))
      .setOrigin(0.5, 0.5)
      .setAlpha(0)
      .setDepth(DEPTH.hud);
    this.levelToast.setLetterSpacing(2);

    const hint = this.add
      .text(WIDTH / 2, HEIGHT - 52, 'TAP THE FISH  ·  LEAVE THE TRASH', labelStyle(12))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    hint.setLetterSpacing(3);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleTap(pointer));

    createBackButton(this, {
      accent: ACCENT,
      onTap: () => transitionTo(this, 'MenuScene'),
      // See GameScene: live runs only, the card owns the exit once time is up.
      isArmed: () => this.state === 'playing',
    });

    createSoundButton(this, { accent: ACCENT, depth: DEPTH.overlay + 1 });

    this.overlay = createGameOverOverlay(this, {
      accent: ACCENT,
      onRestart: () => this.resetState(),
      onMenu: () => transitionTo(this, 'MenuScene'),
      // Tracks the card rather than just the run being over: it animates in a
      // beat after the horn, and these buttons should mean nothing until it is
      // up.
      isArmed: () => this.state === 'timeUp' && this.overlayShown,
    });

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.resetState();
  }

  /** Deep water, lit from below, with a slow drift of bubbles rising through it. */
  private createBackdrop(): void {
    this.add
      .image(WIDTH / 2, HEIGHT / 2, ensureGradient(this, PALETTE.seaTop, PALETTE.seaDeep))
      .setDisplaySize(WIDTH, HEIGHT)
      .setDepth(DEPTH.backdrop);

    this.add
      .image(WIDTH / 2, HEIGHT * 0.92, TEX.glow)
      .setDisplaySize(WIDTH * 1.8, HEIGHT * 0.55)
      .setTint(PALETTE.cyan)
      .setAlpha(0.22)
      .setDepth(DEPTH.backdrop);

    const bubbles = this.add.particles(0, 0, TEX.spark, {
      x: { min: 0, max: WIDTH },
      y: HEIGHT + 12,
      speedY: { min: -70, max: -22 },
      speedX: { min: -12, max: 12 },
      scale: { start: 0.38, end: 0.05 },
      alpha: { start: 0.4, end: 0 },
      lifespan: { min: 4500, max: 9000 },
      frequency: 380,
      tint: [PALETTE.cyan, 0xffffff],
      blendMode: 'ADD',
    });
    bubbles.setDepth(DEPTH.backdrop);

    // Darkens the water behind the HUD pills so the readouts stay legible.
    this.add
      .image(WIDTH / 2, 0, TEX.topFade)
      .setOrigin(0.5, 0)
      .setDisplaySize(WIDTH, 190)
      .setAlpha(0.85)
      .setDepth(DEPTH.effects);
  }

  private createHoles(): void {
    for (let hole = 0; hole < HOLE_COUNT; hole += 1) {
      const { x, y } = this.holeCenter(hole);
      this.add
        .image(x, y, TEX.pondBack)
        .setDisplaySize(POND_WIDTH, POND_HEIGHT)
        .setDepth(DEPTH.world - 1);
      // In front of anything that surfaces here — see ensurePondTextures.
      this.add
        .image(x, y, TEX.pondLip)
        .setDisplaySize(POND_WIDTH, POND_HEIGHT)
        .setDepth(DEPTH.world + 1);
    }
  }

  private holeCenter(hole: number): { x: number; y: number } {
    return {
      x: HOLE_LEFT + (hole % COLUMNS) * HOLE_COLUMN_GAP,
      y: HOLE_TOP + Math.floor(hole / COLUMNS) * HOLE_ROW_GAP,
    };
  }

  private resetState(): void {
    this.state = 'playing';
    this.overlayShown = false;
    this.overlay.hide();
    this.scoreState = createScore();
    this.countdown = createCountdown(RUN_MS);
    this.levelIndex = 0;
    this.spawner = createSpawner(LEVELS[0].minSpawnMs, LEVELS[0].maxSpawnMs);
    this.scorePill.setValue('0');
    this.timePill.setValue(`${secondsLeft(this.countdown)}`);
    this.levelToast.setAlpha(0);
    this.tweens.killTweensOf(this.levelToast);

    for (const popup of this.popups) {
      this.destroySprites(popup);
    }
    this.popups = [];

    this.streak = 0;
    playMusic(this, 'fish');
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const dt = Math.min(delta, MAX_DELTA_MS);

    this.countdown = tickCountdown(this.countdown, dt);
    this.timePill.setValue(`${secondsLeft(this.countdown)}`);

    const level = this.applyLevel(elapsed(this.countdown, RUN_MS));

    const spawn = tickSpawner(this.spawner, dt);
    this.spawner = spawn.state;
    if (spawn.shouldSpawn) {
      this.surface(level);
    }

    // Collected first, then dived: dive() mutates this.popups through its tween
    // callbacks, so the list must not be walked while it is being edited.
    const expired = this.popups.filter((popup) => {
      if (popup.leaving) {
        return false;
      }
      popup.lifeMs -= dt;
      return popup.lifeMs <= 0;
    });
    for (const popup of expired) {
      this.dive(popup);
    }

    if (isFinished(this.countdown)) {
      this.triggerTimeUp();
    }
  }

  /**
   * Returns the level the run is on now, re-tuning the spawner on the frame it
   * changes so the new, shorter gap is felt immediately rather than after the
   * interval that was already rolled at the old pace.
   */
  private applyLevel(elapsedMs: number): Level {
    const index = levelIndexAt(elapsedMs, LEVEL_STEP_MS, LEVELS.length);
    if (index !== this.levelIndex) {
      this.levelIndex = index;
      const level = LEVELS[index];
      this.spawner = retuneSpawner(this.spawner, level.minSpawnMs, level.maxSpawnMs);
      this.announceLevel(index);
    }
    return LEVELS[this.levelIndex];
  }

  private announceLevel(index: number): void {
    playSfx(this, 'levelup');
    this.levelToast.setText(`LEVEL ${index + 1}  ·  FASTER!`);
    this.tweens.killTweensOf(this.levelToast);
    this.levelToast.setAlpha(0).setScale(0.8);
    this.tweens.add({
      targets: this.levelToast,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 900,
    });
  }

  /** Brings one fish, rare fish or can up out of a free hole. */
  private surface(level: Level): void {
    if (this.popups.length >= level.maxActive) {
      return;
    }
    const hole = pickFreeHole(
      this.popups.map((popup) => popup.hole),
      HOLE_COUNT
    );
    if (hole === null) {
      return;
    }

    const kind = pickKind(level.odds);
    const { x, y } = this.holeCenter(hole);
    const top = y - LIFT[kind];

    let glow: Phaser.GameObjects.Image | null = null;
    if (kind === 'rare') {
      glow = this.add
        .image(x, top, TEX.glow)
        .setDisplaySize(FISH_WIDTH * 2.2, FISH_HEIGHT * 2.6)
        .setTint(PALETTE.gold)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.world - 1);
    }

    const sprite = this.add.image(x, top, this.textureFor(kind)).setDepth(DEPTH.world);
    // Fish alternate which way they face, so a row of them never looks stamped.
    sprite.setFlipX(kind !== 'trash' && hole % 2 === 0);

    const popup: Popup = { hole, kind, sprite, glow, lifeMs: level.surfaceMs, leaving: false };
    this.popups.push(popup);

    this.splash(x, y, kind === 'trash' ? PALETTE.muted : PALETTE.pond);

    // Breaks the surface with a bounce, then keeps moving while it is up: a
    // still target is a much harder thing for a young eye to notice.
    sprite.setScale(0.3);
    this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: sprite,
      angle: kind === 'trash' ? 4 : 7,
      duration: kind === 'trash' ? 900 : 520,
      delay: 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private textureFor(kind: PopupKind): string {
    if (kind === 'trash') {
      return TEX.trash;
    }
    if (kind === 'rare') {
      return ensureFishTexture(this, PALETTE.gold, { rare: true });
    }
    const color = FISH_COLORS[Phaser.Math.Between(0, FISH_COLORS.length - 1)];
    return ensureFishTexture(this, color);
  }

  private handleTap(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing') {
      return;
    }

    // Nearest wins. The tap pad makes fish overlap each other's targets at the
    // edges, and awarding the closest is the only reading of an ambiguous tap
    // that matches what the player was aiming at.
    let best: Popup | null = null;
    let bestDistance = Infinity;
    for (const popup of this.popups) {
      if (popup.leaving) {
        continue;
      }
      const pad = popup.kind === 'trash' ? 0 : TAP_PAD;
      if (!intersects(rectAt(pointer.x, pointer.y, pad * 2, pad * 2), this.popupRect(popup))) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, popup.sprite.x, popup.sprite.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = popup;
      }
    }

    if (best === null) {
      this.ripple(pointer.x, pointer.y);
      return;
    }
    this.catchPopup(best);
  }

  private popupRect(popup: Popup): Rect {
    const width = popup.kind === 'trash' ? TRASH_WIDTH : FISH_WIDTH;
    const height = popup.kind === 'trash' ? TRASH_HEIGHT : FISH_HEIGHT;
    return rectAt(popup.sprite.x, popup.sprite.y, width, height);
  }

  private catchPopup(popup: Popup): void {
    const points = POINTS[popup.kind];
    // Floored at zero: a run that reads as a negative number stops being a
    // game a five-year-old wants to finish. See addPoints.
    this.scoreState = addPoints(this.scoreState, points, 0);
    this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);

    const color = popup.kind === 'trash' ? PALETTE.rose : popup.kind === 'rare' ? PALETTE.gold : ACCENT;
    if (popup.kind === 'trash') {
      // A can breaks the run: the next fish starts the climb over.
      this.streak = 0;
      playSfx(this, 'trash');
    } else {
      const detune = Math.min(this.streak, STREAK_DETUNE_MAX) * STREAK_DETUNE_CENTS;
      this.streak += 1;
      playSfx(this, popup.kind === 'rare' ? 'rare' : 'catch', { detune });
    }
    this.floatPoints(popup.sprite.x, popup.sprite.y - 18, points, color);
    this.burst(popup.sprite.x, popup.sprite.y, color);
    if (popup.kind === 'trash') {
      this.cameras.main.shake(140, 0.005);
    } else if (popup.kind === 'rare') {
      this.cameras.main.flash(120, 255, 209, 102);
    }

    popup.leaving = true;
    this.tweens.killTweensOf(popup.sprite);
    this.tweens.add({
      targets: popup.sprite,
      scale: 0,
      angle: popup.kind === 'trash' ? 50 : -30,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeIn',
      onComplete: () => this.removePopup(popup),
    });
    if (popup.glow) {
      this.tweens.add({ targets: popup.glow, alpha: 0, duration: 200 });
    }
  }

  /** Sends an untapped pop-up back under, no penalty either way. */
  private dive(popup: Popup): void {
    playSfx(this, 'plop');
    popup.leaving = true;
    this.tweens.killTweensOf(popup.sprite);
    this.splash(popup.sprite.x, this.holeCenter(popup.hole).y, PALETTE.pond);
    this.tweens.add({
      targets: popup.sprite,
      y: this.holeCenter(popup.hole).y,
      scale: 0.3,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => this.removePopup(popup),
    });
    if (popup.glow) {
      this.tweens.add({ targets: popup.glow, alpha: 0, duration: 220 });
    }
  }

  private removePopup(popup: Popup): void {
    this.popups = this.popups.filter((other) => other !== popup);
    this.destroySprites(popup);
  }

  /**
   * Nothing is destroyed while a tween still points at it. The sprite and its
   * aura fade on separate tweens that can finish in either order, and a
   * restart can cut across both mid-flight — so whichever path gets here
   * first stops the tweens before the objects go.
   */
  private destroySprites(popup: Popup): void {
    this.tweens.killTweensOf(popup.sprite);
    popup.sprite.destroy();
    if (popup.glow) {
      this.tweens.killTweensOf(popup.glow);
      popup.glow.destroy();
    }
  }

  /** Expanding ring at the waterline — every arrival and departure gets one. */
  private splash(x: number, y: number, color: number): void {
    const ring = this.add
      .image(x, y, TEX.glow)
      .setDisplaySize(46, 22)
      .setTint(color)
      .setAlpha(0.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: ring,
      displayWidth: 150,
      displayHeight: 62,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Feedback for a tap that hit nothing, so the water never feels dead. */
  private ripple(x: number, y: number): void {
    const ring = this.add
      .image(x, y, TEX.glow)
      .setDisplaySize(24, 16)
      .setTint(PALETTE.cyan)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: ring,
      displayWidth: 80,
      displayHeight: 48,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private burst(x: number, y: number, color: number): void {
    const burst = this.add.particles(x, y, TEX.spark, {
      speed: { min: 60, max: 220 },
      lifespan: { min: 200, max: 480 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [color, PALETTE.text],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(DEPTH.effects);
    burst.explode(14);
    this.time.delayedCall(700, () => burst.destroy());
  }

  private floatPoints(x: number, y: number, points: number, color: number): void {
    const text = this.add
      .text(x, y, `${points > 0 ? '+' : ''}${points}`, displayStyle(28, color))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    this.tweens.add({
      targets: text,
      y: y - 56,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private triggerTimeUp(): void {
    this.state = 'timeUp';
    this.timePill.setValue('0');
    fadeOutMusic(this);
    playSfx(this, 'timeup');

    // Everything still up goes back under, so the card lands on calm water.
    for (const popup of this.popups) {
      if (!popup.leaving) {
        this.dive(popup);
      }
    }

    this.cameras.main.flash(200, 94, 242, 168);

    this.time.delayedCall(420, () => {
      if (this.state !== 'timeUp') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('TIME UP!', 'Score', `${getScoreValue(this.scoreState)}`);
    });
  }
}
