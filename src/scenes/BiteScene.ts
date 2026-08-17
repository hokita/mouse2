import Phaser from 'phaser';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import { CATCH_POINTS } from '../core/haul';
import type { CatchRarity } from '../core/haul';
import { createSchool, tickSchool } from '../core/school';
import type { Fish, SchoolConfig, SchoolState } from '../core/school';
import { addPoints, createScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createTension, tickTension } from '../core/tension';
import type { TensionConfig, TensionState } from '../core/tension';
import { WIDTH, HEIGHT } from '../gameConfig';
import { FISH_HEIGHT, FISH_WIDTH, ensureFishTexture } from '../ui/pondTextures';
import {
  BOAT_HEIGHT,
  BOAT_WIDTH,
  BOBBER_HEIGHT,
  BOBBER_WIDTH,
  HOOK_HEIGHT,
  HOOK_WIDTH,
  MARK_BOAT_HEIGHT,
  MARK_BOAT_WIDTH,
  MARK_FISH_HEIGHT,
  MARK_FISH_WIDTH,
  REEL_TEX,
  ROD_TIP_X,
  ROD_TIP_Y,
  ensureBoatTexture,
  ensureBobberTexture,
  ensureBubbleTexture,
  ensureHookTexture,
  ensureMarkTextures,
  ensureRayTexture,
} from '../ui/reelTextures';
import { PALETTE, RADIUS, displayStyle, labelStyle, shade } from '../ui/theme';
import { TEX, ensureFxTextures, ensureGradient, ensureStarTextures } from '../ui/textures';
import {
  DEPTH,
  createBackButton,
  createGameOverOverlay,
  createSoundButton,
  createStatPill,
  transitionTo,
} from '../ui/widgets';
import type { GameOverOverlay, StatPill } from '../ui/widgets';

const ACCENT = PALETTE.violet;

/** Where the night sky ends and the water begins. */
const WATERLINE = 168;

/** A whole run is this many casts; the score is the haul they bring in. */
const CAST_COUNT = 8;

/** The boat keeps to the left so every cast has open water to land in. */
const BOAT_X = 96;
const BOAT_Y = WATERLINE - 26;

/** Where a cast may land: clear of the boat, clear of the far edge. */
const CAST_MIN_X = 150;
const CAST_MAX_X = WIDTH - 34;

/** The bobber's ball rides the waterline; the ride puts its cap above water
 * and its belly under the surface band drawn in front of it. */
const BOBBER_REST_Y = WATERLINE - 4;

/** How far the bobber goes under when a fish takes the hook. */
const BITE_DIP = 16;

/** How fast the baited hook falls through the water, px/sec. */
const SINK_PER_SEC = 340;

// Caps how much sim time one frame advances, as everywhere else: a stalled
// tab must not swallow the school out from under the player.
const MAX_DELTA_MS = 100;

/**
 * The school the player is fishing from. The fish are visible the whole
 * time — the game is choosing one and dropping the hook in its path. The
 * bounds keep every fish in castable water: the left edge stays reachable
 * from CAST_MIN_X's hook, and the floor stays above the fight panel so a
 * deep hookup is never hidden behind its own readout.
 */
const SCHOOL: SchoolConfig = {
  bounds: { minX: 110, maxX: WIDTH - 36, minY: 540, maxY: 740 },
  fishCount: 5,
  respawnDelayMs: 1800,
  weights: { common: 46, fine: 28, big: 18, golden: 8 },
  speeds: { common: 46, fine: 62, big: 34, golden: 108 },
  speedJitter: 0.25,
  biteRadius: 64,
  catchRadius: 12,
  lungeSpeed: 200,
  attractAfterMs: 2600,
};

/**
 * Spawn odds drift toward the rare end as the run goes on — the same arc
 * the old blind version had — so the last casts are the ones a golden is
 * most likely to swim in for.
 */
const START_WEIGHTS: Record<CatchRarity, number> = { common: 50, fine: 28, big: 16, golden: 6 };
const END_WEIGHTS: Record<CatchRarity, number> = { common: 30, fine: 26, big: 26, golden: 18 };

/** How each rarity reads underwater: colour, glow, and above all size. */
const LOOK: Record<CatchRarity, { color: number; rare: boolean; scale: number }> = {
  common: { color: PALETTE.cyan, rare: false, scale: 0.62 },
  fine: { color: PALETTE.mint, rare: false, scale: 0.85 },
  big: { color: PALETTE.amber, rare: false, scale: 1.2 },
  golden: { color: PALETTE.gold, rare: true, scale: 0.9 },
};

// The fights. Bigger fish reel in slower, load the line faster and thrash
// more of the time. Tuned as a gradient, not a cliff: held straight
// through, a common always lands, a fine usually does, a big rarely, and
// the golden never — each tier teaches a little more of the ease-off
// lesson, and easing off is cheap (tension falls fast) so the lesson is
// learnable without losing many fish.
const FIGHTS: Record<CatchRarity, TensionConfig> = {
  common: {
    reelPerSec: 0.4,
    slipPerSec: 0.12,
    risePerSec: 0.24,
    thrashRiseMult: 2.6,
    fallPerSec: 0.8,
    thrashMinGapMs: 1400,
    thrashMaxGapMs: 2400,
    thrashDurationMs: 700,
    escapeAfterSlackMs: 4000,
  },
  fine: {
    reelPerSec: 0.34,
    slipPerSec: 0.12,
    risePerSec: 0.22,
    thrashRiseMult: 2.6,
    fallPerSec: 0.8,
    thrashMinGapMs: 1200,
    thrashMaxGapMs: 2200,
    thrashDurationMs: 800,
    escapeAfterSlackMs: 4000,
  },
  big: {
    reelPerSec: 0.29,
    slipPerSec: 0.12,
    risePerSec: 0.3,
    thrashRiseMult: 2.6,
    fallPerSec: 0.8,
    thrashMinGapMs: 1000,
    thrashMaxGapMs: 1900,
    thrashDurationMs: 900,
    escapeAfterSlackMs: 4000,
  },
  golden: {
    reelPerSec: 0.26,
    slipPerSec: 0.12,
    risePerSec: 0.42,
    thrashRiseMult: 2.6,
    fallPerSec: 0.8,
    thrashMinGapMs: 900,
    thrashMaxGapMs: 1700,
    thrashDurationMs: 950,
    escapeAfterSlackMs: 4000,
  },
};

/**
 * The two tiers every tension channel agrees on: calm, warning, about to go.
 * The line in the water, the hull's lean and the panel's strand all read the
 * load through this one function, so they can never tell different stories.
 */
const TENSION_WARN = 0.5;
const TENSION_DANGER = 0.8;

function tensionColor(tension: number): number {
  return tension < TENSION_WARN ? PALETTE.mint : tension < TENSION_DANGER ? PALETTE.amber : PALETTE.rose;
}

/** How far into the top tier the load is, 0–1 — what the loud effects ride on. */
function tensionStrain(tension: number): number {
  return Math.max(0, (tension - TENSION_DANGER) / (1 - TENSION_DANGER));
}

/** The line with nothing on it: pale monofilament, no opinion about anything. */
const LINE_IDLE_COLOR = 0xbfd0f2;

/** The idle roll, matching the yoyo tween that used to do it: ±1.2° over 4600ms. */
const BOAT_SWAY_DEG = 1.2;
const BOAT_SWAY_RATE = (Math.PI * 2) / 4600;
/** Bow-down under full load. Past this the bow buries itself in the surface band. */
const BOAT_TILT_MAX_DEG = 8;
/** The hull is heavy: it leans into the load and rights itself, never snaps. */
const BOAT_TILT_EASE_MS = 130;

type Phase = 'idle' | 'casting' | 'waiting' | 'fighting' | 'resolving' | 'done';

interface FightBars {
  container: Phaser.GameObjects.Container;
  /** The hooked fish's colour, so the mark crossing the panel is that fish. */
  setFishColor(color: number): void;
  draw(progress: number, tension: number, thrashing: boolean): void;
}

export class BiteScene extends Phaser.Scene {
  private phase!: Phase;
  private castsUsed = 0;
  private rarity: CatchRarity = 'common';
  private schoolState!: SchoolState;
  private tensionState: TensionState | null = null;
  private scoreState!: ScoreState;
  /** True from the hook touching the water to the cast resolving. */
  private hookInWater = false;
  /**
   * True only once the hook has settled at the tapped depth. A hook that
   * tempted fish while still falling was offered to every fish in its sink
   * column, and whichever swam above the target stole the bite — aim only
   * means anything if the bait starts existing where it was aimed.
   */
  private hookArmed = false;
  /** The depth the fish was hooked at; the fight lifts it from here. */
  private biteY = 0;
  /**
   * Every pointer currently pressed on the water (chip taps stop their
   * events before the scene sees them). The fight reads "holding" from
   * this set, so a hold survives rolling from one finger to another.
   */
  private heldPointers = new Set<number>();
  /** Casting is ignored until this clock time — a restart double-tap must
   * not throw the new run's first cast. */
  private castBlockedUntil = 0;

  private scorePill!: StatPill;
  private castsPill!: StatPill;
  private hint!: Phaser.GameObjects.Text;
  private overlay!: GameOverOverlay;
  private overlayShown = false;

  private boat!: Phaser.GameObjects.Image;
  private bobber!: Phaser.GameObjects.Image;
  private hook!: Phaser.GameObjects.Image;
  private line!: Phaser.GameObjects.Graphics;
  private strainSparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private biteCue!: Phaser.GameObjects.Text;
  private fighter!: Phaser.GameObjects.Image;
  private fishSprites = new Map<number, Phaser.GameObjects.Image>();
  private bars!: FightBars;
  /** Clock for the bobber's idle sway and the school's bobbing. */
  private swayMs = 0;
  /** How far the hull has leaned into the load — eased, so it never snaps. */
  private boatTiltDeg = 0;
  /** One-off jolts (the cast flick, a thrash shudder) ride on top of the rest. */
  private boatFlick = { deg: 0 };
  /** Throttles the strain sparks, which would otherwise fire every frame. */
  private sparkCooldownMs = 0;
  /** True from the line parting to the bobber getting back to the rod. */
  private lineCut = false;

  constructor() {
    super('BiteScene');
  }

  create(): void {
    ensureFxTextures(this);
    ensureStarTextures(this);
    ensureBoatTexture(this);
    ensureBobberTexture(this);
    ensureBubbleTexture(this);
    ensureRayTexture(this);
    ensureHookTexture(this);
    ensureMarkTextures(this);
    for (const look of Object.values(LOOK)) {
      ensureFishTexture(this, look.color, { rare: look.rare });
      ensureFishTexture(this, look.color, { rare: look.rare, submerged: false });
    }

    this.createBackdrop();

    this.boat = this.add
      .image(BOAT_X, BOAT_Y, REEL_TEX.boat)
      .setDisplaySize(BOAT_WIDTH, BOAT_HEIGHT)
      .setDepth(DEPTH.world + 1);
    this.tweens.add({
      targets: this.boat,
      y: BOAT_Y + 4,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // The hull's angle is composed per frame in animateBoat() rather than
    // tweened: the idle roll, the load's lean and one-off jolts all have to
    // add up on one property, and only the roll is a loop.

    // Above the waterline band so the line visibly enters the water.
    this.line = this.add.graphics().setDepth(DEPTH.world + 3);

    this.bobber = this.add
      .image(0, 0, REEL_TEX.bobber)
      .setDisplaySize(BOBBER_WIDTH, BOBBER_HEIGHT)
      .setDepth(DEPTH.world + 1);

    this.hook = this.add
      .image(0, 0, REEL_TEX.hook)
      .setDisplaySize(HOOK_WIDTH, HOOK_HEIGHT)
      .setDepth(DEPTH.world + 1)
      .setVisible(false);

    this.biteCue = this.add
      .text(0, 0, '!', displayStyle(34, PALETTE.gold))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    // The hooked fish during a fight. The school fish it replaces is removed
    // from the sim, so this sprite simply takes over at the same spot.
    this.fighter = this.add.image(0, 0, ensureFishTexture(this, PALETTE.cyan)).setVisible(false).setDepth(DEPTH.world);

    // Sparks worked off the rod tip by a line at its limit. Fired by hand from
    // the fight, never on a frequency, so they only ever mean one thing.
    this.strainSparks = this.add
      .particles(0, 0, TEX.spark, {
        speed: { min: 40, max: 110 },
        angle: { min: 200, max: 340 },
        gravityY: 220,
        lifespan: { min: 240, max: 420 },
        scale: { start: 0.3, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [PALETTE.rose, PALETTE.amber],
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(DEPTH.effects);

    this.bars = this.createFightBars();

    this.scorePill = createStatPill(this, {
      x: 18,
      y: 18,
      width: 150,
      label: 'Score',
      accent: ACCENT,
    });

    this.castsPill = createStatPill(this, {
      x: WIDTH - 18,
      y: 18,
      width: 130,
      label: 'Casts',
      align: 'right',
      accent: PALETTE.gold,
    });

    this.hint = this.add
      .text(WIDTH / 2, WATERLINE + 30, '', labelStyle(12))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    this.hint.setLetterSpacing(3);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.heldPointers.add(pointer.id);
      this.handleTap(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.heldPointers.delete(pointer.id));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.heldPointers.delete(pointer.id));

    createBackButton(this, {
      accent: ACCENT,
      onTap: () => transitionTo(this, 'MenuScene'),
      isArmed: () => this.phase !== 'done',
    });

    createSoundButton(this, { accent: ACCENT, depth: DEPTH.overlay + 1 });

    this.overlay = createGameOverOverlay(this, {
      accent: ACCENT,
      onRestart: () => this.resetState(),
      onMenu: () => transitionTo(this, 'MenuScene'),
      isArmed: () => this.phase === 'done' && this.overlayShown,
    });

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.resetState();
  }

  private createBackdrop(): void {
    this.add
      .image(WIDTH / 2, WATERLINE / 2, ensureGradient(this, PALETTE.skyTop, PALETTE.skyBottom))
      .setDisplaySize(WIDTH, WATERLINE)
      .setDepth(DEPTH.backdrop);
    this.add
      .tileSprite(WIDTH / 2, WATERLINE / 2, WIDTH, WATERLINE, TEX.starsFar)
      .setAlpha(0.8)
      .setDepth(DEPTH.backdrop);

    // Low over the water, right of the HUD pills' gap and above the cast
    // zone — the boat holds the left, so the moon balances it on the right.
    const moonX = WIDTH - 70;
    const moonY = 122;
    this.add
      .image(moonX, moonY, TEX.glow)
      .setDisplaySize(150, 150)
      .setTint(PALETTE.moon)
      .setAlpha(0.4)
      .setDepth(DEPTH.backdrop);
    const moon = this.add.graphics().setDepth(DEPTH.backdrop);
    moon.fillStyle(PALETTE.moon, 1);
    moon.fillCircle(moonX, moonY, 19);
    moon.fillStyle(PALETTE.skyBottom, 0.25);
    moon.fillCircle(moonX - 6, moonY - 6, 5);
    moon.fillCircle(moonX + 6, moonY + 6, 3.5);

    const waterTop = shade(PALETTE.seaDeep, -0.05);
    this.add
      .image(WIDTH / 2, WATERLINE + (HEIGHT - WATERLINE) / 2, ensureGradient(this, waterTop, 0x02040a))
      .setDisplaySize(WIDTH, HEIGHT - WATERLINE)
      .setDepth(DEPTH.backdrop);

    for (const [x, width, height, lean] of [
      [96, 120, 340, -5],
      [216, 96, 300, 3],
      [330, 140, 390, -3],
    ]) {
      const ray = this.add
        .image(x, WATERLINE + 4, REEL_TEX.ray)
        .setOrigin(0.5, 0)
        .setDisplaySize(width, height)
        .setTint(PALETTE.moon)
        .setAngle(lean)
        .setAlpha(0.07)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.backdrop);
      this.tweens.add({
        targets: ray,
        alpha: { from: 0.04, to: 0.1 },
        x: x + Phaser.Math.Between(-12, 12),
        duration: Phaser.Math.Between(3200, 5200),
        delay: Phaser.Math.Between(0, 2000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.add
      .particles(0, 0, REEL_TEX.bubble, {
        x: { min: 20, max: WIDTH - 20 },
        y: HEIGHT - 20,
        speedY: { min: -34, max: -16 },
        speedX: { min: -6, max: 6 },
        lifespan: { min: 2800, max: 5200 },
        scale: { start: 0.45, end: 0.9 },
        alpha: { start: 0.26, end: 0 },
        frequency: 650,
        quantity: 1,
      })
      .setDepth(DEPTH.world - 1);

    const surface = this.add.graphics().setDepth(DEPTH.world + 2);
    surface.fillStyle(waterTop, 1);
    surface.fillRect(0, WATERLINE, WIDTH, 10);
    surface.fillStyle(PALETTE.moon, 0.22);
    surface.fillRect(0, WATERLINE - 1.5, WIDTH, 3);

    const seam = this.add
      .image(WIDTH / 2, WATERLINE, TEX.glow)
      .setDisplaySize(WIDTH * 1.3, 42)
      .setTint(PALETTE.moon)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world + 2);
    this.tweens.add({
      targets: seam,
      alpha: { from: 0.1, to: 0.22 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * The fight readout, in pictures. It used to be two identical bars labelled
   * REEL and LINE, which is the one shape this panel must not have: both grew
   * to the right, but one growing meant winning and the other meant losing,
   * and every other game a child has met teaches that a bar filling up is
   * good news. So the two are now opposed on four axes at once — horizontal
   * against vertical, one travelling mark against discrete rungs, growing
   * toward a goal against depleting, and colour on top of all of it. Getting
   * any one of them tells the story; mixing them up tells a story so wrong it
   * is obvious.
   *
   * The haul is a fish swimming home to the boat, laid out boat-left and
   * fish-right to match the water above, so the panel is a small map of the
   * screen rather than a contradiction of it. The line is a strand of rungs
   * that break off the top as the load comes on and grow straight back the
   * moment the player lets go — that regrowth is the whole lesson of the game
   * with no words in it.
   */
  private createFightBars(): FightBars {
    const PANEL_W = 310;
    const PANEL_H = 88;
    const container = this.add
      .container(WIDTH / 2, HEIGHT - 132)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.skyTop, 0.62);
    bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, RADIUS.pill);
    bg.lineStyle(1.5, PALETTE.surfaceEdge, 0.7);
    bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, RADIUS.pill);

    const RAIL_LEFT = -98;
    const RAIL_RIGHT = 66;
    const RAIL_Y = 0;
    const RAIL_DOTS = 12;
    const dotX = (i: number): number => RAIL_LEFT + ((RAIL_RIGHT - RAIL_LEFT) * i) / (RAIL_DOTS - 1);

    const COL_X = 112;
    const RUNGS = 6;
    const RUNG_W = 34;
    const RUNG_H = 7;
    const rungY = (i: number): number => 27.5 - i * (RUNG_H + 4);

    const marks = this.add.graphics();
    marks.fillStyle(PALETTE.surfaceEdge, 0.9);
    for (let i = 0; i < RAIL_DOTS; i += 1) {
      marks.fillCircle(dotX(i), RAIL_Y, 1.6);
    }
    marks.lineStyle(1, PALETTE.surfaceEdge, 0.55);
    for (let i = 0; i < RUNGS; i += 1) {
      marks.strokeRoundedRect(COL_X - RUNG_W / 2, rungY(i) - RUNG_H / 2, RUNG_W, RUNG_H, 3);
    }
    // The hook the strand hangs off, so the column has somewhere to be from.
    marks.lineStyle(1.5, PALETTE.muted, 0.7);
    marks.strokeCircle(COL_X, 37, 3);

    const boatMark = this.add
      .image(-124, RAIL_Y - 3, REEL_TEX.markBoat)
      .setDisplaySize(MARK_BOAT_WIDTH, MARK_BOAT_HEIGHT)
      .setTint(PALETTE.muted);
    const fishMark = this.add
      .image(RAIL_RIGHT, RAIL_Y, REEL_TEX.markFish)
      .setDisplaySize(MARK_FISH_WIDTH, MARK_FISH_HEIGHT);

    const fills = this.add.graphics();
    container.add([bg, marks, boatMark, fishMark, fills]);

    // Rungs only ever break one at a time, so a remembered count is all it
    // takes to catch the moment one goes and throw a chip off it.
    let lastWhole = RUNGS;

    return {
      container,
      setFishColor: (color: number): void => {
        fishMark.setTint(color);
      },
      draw: (progress: number, tension: number, thrashing: boolean): void => {
        const p = Phaser.Math.Clamp(progress, 0, 1);
        const t = Phaser.Math.Clamp(tension, 0, 1);
        fills.clear();

        // The haul: the fish swims the rail home, and the water it has already
        // crossed stays lit behind it.
        const fishX = Phaser.Math.Linear(RAIL_RIGHT, RAIL_LEFT, p);
        fishMark.x = fishX;
        fishMark.y = RAIL_Y + Math.sin(this.swayMs * 0.006) * 1.5;
        fills.fillStyle(ACCENT, 0.95);
        for (let i = 0; i < RAIL_DOTS; i += 1) {
          const x = dotX(i);
          if (x < fishX - 4) {
            fills.fillCircle(x, RAIL_Y, 2.2);
          }
        }

        // The line: rungs break off the top as it loads, and grow back the
        // instant the player eases off. Nothing here fills up — filling up is
        // the shape of the good news, one channel over.
        const left = (1 - t) * RUNGS;
        const whole = Math.floor(left);
        const frac = left - whole;
        const danger = t >= TENSION_DANGER;
        // Never below 0.7: the pulse is meant to raise an alarm, not to make
        // the last rung standing hard to see at the worst possible moment.
        const pulse = danger ? 0.7 + 0.3 * Math.sin(this.swayMs * 0.02) : 1;
        const shake = thrashing ? Math.sin(this.swayMs * 0.06) * 1.6 : 0;
        const color = tensionColor(t);

        // At the top tier the gaps light up too. A depleting gauge says its
        // worst news by being empty, and empty is the quietest a thing can
        // be — so the rungs that have gone keep glowing where they were, and
        // the whole column reads as alarm rather than as absence.
        if (danger) {
          fills.lineStyle(1, color, 0.4 * pulse);
          for (let i = whole; i < RUNGS; i += 1) {
            fills.strokeRoundedRect(
              COL_X - RUNG_W / 2 + shake,
              rungY(i) - RUNG_H / 2,
              RUNG_W,
              RUNG_H,
              3
            );
          }
        }

        fills.fillStyle(color, pulse);
        for (let i = 0; i < whole; i += 1) {
          fills.fillRoundedRect(COL_X - RUNG_W / 2 + shake, rungY(i) - RUNG_H / 2, RUNG_W, RUNG_H, 3);
        }
        // The rung on its way out frays from both edges. Its corner radius has
        // to shrink with it: a rounded rect narrower than its own corners
        // renders inside out.
        if (whole < RUNGS && frac > 0) {
          const w = RUNG_W * frac;
          if (w > 1) {
            fills.fillRoundedRect(
              COL_X - w / 2 + shake,
              rungY(whole) - RUNG_H / 2,
              w,
              RUNG_H,
              Math.min(3, w / 2)
            );
          }
        }
        if (whole < lastWhole) {
          this.snapRung(container, COL_X, rungY(whole));
        }
        lastWhole = whole;
      },
    };
  }

  /** Two chips thrown off a rung as it parts, so the break is not a silent pop. */
  private snapRung(container: Phaser.GameObjects.Container, x: number, y: number): void {
    for (const dir of [-1, 1]) {
      const chip = this.add
        .image(x + dir * 6, y, TEX.spark)
        .setDisplaySize(7, 5)
        .setTint(PALETTE.rose)
        .setAlpha(0.9);
      container.add(chip);
      this.tweens.add({
        targets: chip,
        x: x + dir * 26,
        y: y - 10,
        alpha: 0,
        angle: dir * 90,
        duration: 340,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  private resetState(): void {
    this.phase = 'idle';
    this.overlayShown = false;
    this.overlay.hide();
    this.scoreState = createScore();
    this.castsUsed = 0;
    this.tensionState = null;
    this.hookInWater = false;
    this.hookArmed = false;
    this.heldPointers.clear();
    this.castBlockedUntil = this.time.now + 400;
    this.schoolState = createSchool(this.schoolConfig());
    for (const sprite of this.fishSprites.values()) {
      sprite.destroy();
    }
    this.fishSprites.clear();
    this.scorePill.setValue('0');
    this.castsPill.setValue(`${CAST_COUNT}`);
    this.bars.container.setVisible(false);
    this.biteCue.setVisible(false);
    this.fighter.setVisible(false);
    this.hook.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.tweens.killTweensOf(this.hook);
    // The scene object outlives a run, so anything the fight left leaning,
    // shaking or cut has to be put back by hand.
    this.tweens.killTweensOf(this.boatFlick);
    this.boatFlick.deg = 0;
    this.boatTiltDeg = 0;
    this.sparkCooldownMs = 0;
    this.parkBobber();
    this.setHint('DROP THE HOOK ON A FISH');
    playMusic(this, 'reel');
  }

  /** The bobber dangles off the rod tip between casts. */
  private parkBobber(): void {
    // Back on the rod is exactly when a parted line is a whole line again.
    this.lineCut = false;
    this.bobber.setPosition(this.rodTipX() + 10, this.rodTipY() + 30);
    this.bobber.setAngle(0);
    this.bobber.setAlpha(1);
  }

  /**
   * The rod tip in world space. The offset is baked into the boat texture, so
   * it has to be rotated by whatever the hull is doing: the offset is 67px
   * long, and at the fight's full bow-down lean an unrotated one misses the
   * real tip by ten, leaving the line tied to a patch of empty sky.
   */
  private rodTipX(): number {
    const r = this.boat.rotation;
    return (
      this.boat.x + ROD_TIP_X * this.boat.scaleX * Math.cos(r) - ROD_TIP_Y * this.boat.scaleY * Math.sin(r)
    );
  }

  private rodTipY(): number {
    const r = this.boat.rotation;
    return (
      this.boat.y + ROD_TIP_X * this.boat.scaleX * Math.sin(r) + ROD_TIP_Y * this.boat.scaleY * Math.cos(r)
    );
  }

  private setHint(text: string, color: number = PALETTE.muted): void {
    this.hint.setText(text);
    this.hint.setColor(`#${color.toString(16).padStart(6, '0')}`);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DELTA_MS);
    this.swayMs += dt;

    // The boat goes first: the bobber and the line both hang off the rod tip,
    // and the rod tip is wherever this frame's lean has put it.
    this.animateBoat(dt);
    this.animateBobber();
    this.tickSchool(dt);
    this.drawLine();

    if (this.phase === 'fighting') {
      this.tickFighting(dt);
    }
  }

  /** The spawn odds drift across the run; everything else stands still. */
  private schoolConfig(): SchoolConfig {
    const t = Math.min(1, this.castsUsed / (CAST_COUNT - 1));
    const weights = {} as Record<CatchRarity, number>;
    for (const rarity of Object.keys(START_WEIGHTS) as CatchRarity[]) {
      weights[rarity] = START_WEIGHTS[rarity] + (END_WEIGHTS[rarity] - START_WEIGHTS[rarity]) * t;
    }
    return { ...SCHOOL, weights };
  }

  /**
   * The school swims through every phase — a still tank would give the game
   * away as a screenshot. The hook only tempts it once it has settled where
   * the player aimed it.
   */
  private tickSchool(dt: number): void {
    const hook = this.hookArmed ? { x: this.hook.x, y: this.hook.y } : null;
    const result = tickSchool(this.schoolState, dt, hook, this.schoolConfig());
    this.schoolState = result.state;
    this.syncSchoolSprites();
    if (result.bitten !== null) {
      this.beginFight(result.bitten);
    }
  }

  /** One sprite per sim fish: newcomers fade in, the hooked one vanishes
   * into the fighter, and everyone bobs on the sway clock. */
  private syncSchoolSprites(): void {
    const seen = new Set<number>();
    for (const fish of this.schoolState.fish) {
      seen.add(fish.id);
      let sprite = this.fishSprites.get(fish.id);
      if (sprite === undefined) {
        const look = LOOK[fish.rarity];
        sprite = this.add
          .image(fish.x, fish.y, ensureFishTexture(this, look.color, { rare: look.rare }))
          .setDisplaySize(FISH_WIDTH * look.scale, FISH_HEIGHT * look.scale)
          .setDepth(DEPTH.world)
          .setAlpha(0);
        this.tweens.add({ targets: sprite, alpha: 0.92, duration: 420 });
        this.fishSprites.set(fish.id, sprite);
      }
      const bob = Math.sin(this.swayMs * 0.0016 + fish.id * 1.7) * 3;
      sprite.setPosition(fish.x, fish.y + bob);
      sprite.setFlipX(fish.dir < 0);
      sprite.setAngle(
        fish.lunging ? fish.dir * -10 : Math.sin(this.swayMs * 0.002 + fish.id) * 4
      );
    }
    for (const [id, sprite] of this.fishSprites) {
      if (!seen.has(id)) {
        this.fishSprites.delete(id);
        sprite.destroy();
      }
    }
  }

  /**
   * The boat's whole angle, composed rather than tweened. A fish pulling on a
   * rod tip that sticks out over the bow drags that bow down, so the load
   * reads as lean — the one tension signal legible from across the room, and
   * the one a player who is watching the fish rather than the panel still
   * catches out of the corner of their eye.
   */
  private animateBoat(dt: number): void {
    const tension = this.phase === 'fighting' ? this.tensionState?.tension ?? 0 : 0;
    // Eased in real time rather than per frame, so a 30fps tab leans at the
    // same speed a 60fps one does.
    this.boatTiltDeg +=
      (BOAT_TILT_MAX_DEG * tension - this.boatTiltDeg) * (1 - Math.exp(-dt / BOAT_TILT_EASE_MS));
    // A boat being pulled over stops lolling: the roll quiets as the load
    // grows, and a judder takes over once the line is nearly gone.
    const sway = Math.sin(this.swayMs * BOAT_SWAY_RATE) * BOAT_SWAY_DEG * (1 - 0.6 * tension);
    const judder = Math.sin(this.swayMs * 0.05) * tensionStrain(tension) * 0.7;
    this.boat.angle = sway + this.boatTiltDeg + judder + this.boatFlick.deg;
  }

  /** Everything the bobber does on its own, per phase — jitter and sway ride
   * on top of wherever the last tween left it. */
  private animateBobber(): void {
    if (this.phase === 'idle') {
      this.bobber.x = this.rodTipX() + 10 + Math.sin(this.swayMs * 0.0021) * 4;
      this.bobber.y = this.rodTipY() + 30 + Math.cos(this.swayMs * 0.0017) * 3;
    } else if (this.phase === 'fighting') {
      const thrashing = this.tensionState?.thrashing === true;
      this.bobber.setAngle(Math.sin(this.swayMs * (thrashing ? 0.03 : 0.012)) * (thrashing ? 14 : 5));
    }
  }

  private drawLine(): void {
    const tipX = this.rodTipX();
    const tipY = this.rodTipY();
    const endX = this.bobber.x;
    const endY = this.bobber.y - BOBBER_HEIGHT / 2 + 4;

    // While a fish is on, the line IS the gauge, and it says so the way a real
    // one would: there is give in it while the load is light, and it pulls
    // straight, bright and thick as the load comes on. That is a change of
    // shape, not just of colour, so it still reads on a bad screen, to a
    // colour-blind eye, and to someone who cannot read a word of the HUD.
    const fighting = this.phase === 'fighting';
    const tension = fighting ? this.tensionState?.tension ?? 0 : 0;
    const thrashing = fighting && this.tensionState?.thrashing === true;

    const sag = fighting ? 12 * (1 - tension) : this.phase === 'casting' ? 6 : 14;
    const controlX = (tipX + endX) / 2;
    const controlY = (tipY + endY) / 2 + sag;

    const color = this.lineCut ? PALETTE.rose : fighting ? tensionColor(tension) : LINE_IDLE_COLOR;
    const width = fighting ? 1.5 + 2.6 * tension : 1.5;
    const alpha = fighting ? 0.55 + 0.4 * tension : 0.55;

    // Near the snap the line buzzes like a plucked string. The wave is pinned
    // at both ends — sin(3πt) is zero at t=0 and t=1 — so however hard it
    // shakes it stays tied to the rod tip and to the bobber, and the offset
    // rides the chord's normal so the amplitude is honest at any angle.
    // A thrash buzzes it at any tension: that is the tell to let go, delivered
    // in the channel the player's eyes are already on.
    const buzz = fighting ? tensionStrain(tension) * 3 + (thrashing ? 1.8 : 0) : 0;
    const dx = endX - tipX;
    const dy = endY - tipY;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const wave = Math.sin(this.swayMs * (thrashing ? 0.075 : 0.05));
    // A parted line keeps only the stub still on the rod.
    const span = this.lineCut ? 0.45 : 1;

    this.line.clear();
    this.line.lineStyle(width, color, alpha);
    this.line.beginPath();
    this.line.moveTo(tipX, tipY);
    // More samples while it is vibrating: three antinodes across fourteen
    // reads as a rendering fault rather than as a shake.
    const segments = buzz > 0 ? 28 : 14;
    for (let i = 1; i <= segments; i += 1) {
      const t = (i / segments) * span;
      const inv = 1 - t;
      const offset = buzz * Math.sin(Math.PI * 3 * t) * wave;
      const x = inv * inv * tipX + 2 * inv * t * controlX + t * t * endX + nx * offset;
      const y = inv * inv * tipY + 2 * inv * t * controlY + t * t * endY + ny * offset;
      this.line.lineTo(x, y);
    }
    this.line.strokePath();

    if (this.lineCut) {
      return;
    }

    // The leader under the surface, dimmer for the depth: bobber down to the
    // hook, or to the hooked fish once the hook has a mouth around it.
    let leaderEnd: { x: number; y: number } | null = null;
    if (this.hookInWater) {
      leaderEnd = { x: this.hook.x, y: this.hook.y - HOOK_HEIGHT / 2 };
    } else if (this.phase === 'fighting' && this.fighter.visible) {
      leaderEnd = { x: this.fighter.x, y: this.fighter.y };
    }
    if (leaderEnd !== null) {
      this.line.lineStyle(fighting ? width * 0.9 : 1.5, color, alpha * 0.5);
      this.line.beginPath();
      this.line.moveTo(this.bobber.x, this.bobber.y + BOBBER_HEIGHT * 0.2);
      this.line.lineTo(leaderEnd.x, leaderEnd.y);
      this.line.strokePath();
    }
  }

  private handleTap(pointer: Phaser.Input.Pointer): void {
    if (this.phase === 'idle' && pointer.y > WATERLINE + 8 && this.time.now >= this.castBlockedUntil) {
      this.cast(pointer.x, pointer.y);
    }
    // During a fight the press IS the input — holding is read straight off
    // the pointer in tickFighting, so there is nothing to do here. And once
    // the hook is wet the cast is committed: no recasts, no take-backs.
  }

  private cast(targetX: number, targetY: number): void {
    this.phase = 'casting';
    this.setHint('');

    playSfx(this, 'launch');
    // The rod flicks forward — one quick dip of the boat sells the throw. It
    // tweens a plain number rather than boat.angle, which animateBoat() now
    // assigns outright every frame and would overwrite.
    this.tweens.killTweensOf(this.boatFlick);
    this.boatFlick.deg = 0;
    this.tweens.add({
      targets: this.boatFlick,
      deg: 3,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.boatFlick.deg = 0;
      },
    });

    const x = Phaser.Math.Clamp(targetX, CAST_MIN_X, CAST_MAX_X);
    const depth = Phaser.Math.Clamp(targetY, SCHOOL.bounds.minY - 60, SCHOOL.bounds.maxY);
    const fromX = this.bobber.x;
    const fromY = this.bobber.y;
    const peakY = Math.min(fromY, WATERLINE) - 110;
    const flight = { t: 0 };
    this.tweens.killTweensOf(this.bobber);
    this.tweens.add({
      targets: flight,
      t: 1,
      duration: 520,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const t = flight.t;
        const inv = 1 - t;
        this.bobber.x = inv * inv * fromX + 2 * inv * t * ((fromX + x) / 2) + t * t * x;
        this.bobber.y = inv * inv * fromY + 2 * inv * t * peakY + t * t * BOBBER_REST_Y;
        this.bobber.setAngle(t * 360 * 0.5);
      },
      onComplete: () => {
        this.bobber.setAngle(0);
        this.splash(x, 0.7);
        playSfx(this, 'plop');
        this.sinkHook(x, depth);
      },
    });
  }

  /** The bait falls to the depth the player tapped — aim is x and depth
   * both. It arms only on arrival: the fish judge the bait where it was
   * aimed, never somewhere along the way down. */
  private sinkHook(x: number, depth: number): void {
    this.phase = 'waiting';
    this.hook.setPosition(x, WATERLINE + 10);
    this.hook.setVisible(true);
    this.hook.setAlpha(0.95);
    this.hookInWater = true;
    this.setHint('WAIT FOR THE BITE…');
    this.tweens.killTweensOf(this.hook);
    this.tweens.add({
      targets: this.hook,
      y: depth,
      duration: ((depth - WATERLINE) / SINK_PER_SEC) * 1000,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.hookArmed = true;
      },
    });
  }

  private beginFight(fish: Fish): void {
    this.phase = 'fighting';
    this.rarity = fish.rarity;
    this.biteY = fish.y;
    this.hookInWater = false;
    this.hookArmed = false;
    this.hook.setVisible(false);
    this.tweens.killTweensOf(this.hook);

    playSfx(this, 'bite');
    this.dipBobber();
    this.ripple(this.bobber.x, 0.8);
    this.biteCue.setPosition(this.bobber.x, WATERLINE - 26);
    this.biteCue.setVisible(true).setScale(0);
    this.tweens.add({ targets: this.biteCue, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.time.delayedCall(700, () => this.biteCue.setVisible(false));

    const look = LOOK[fish.rarity];
    this.fighter.setTexture(ensureFishTexture(this, look.color, { rare: look.rare }));
    this.fighter.setDisplaySize(FISH_WIDTH * look.scale, FISH_HEIGHT * look.scale);
    this.fighter.setPosition(fish.x, fish.y);
    this.fighter.setAlpha(1);
    this.fighter.setVisible(true);

    this.tensionState = createTension(FIGHTS[fish.rarity]);
    this.bars.container.setVisible(true);
    this.bars.setFishColor(look.color);
    this.bars.draw(0, 0, false);
    // The fight tells itself in pictures; this is for whoever is reading over
    // the player's shoulder, so it names things you can see rather than
    // things an angler would say.
    this.setHint('HOLD TO PULL  ·  LET GO IF IT SHAKES');
  }

  private dipBobber(): void {
    this.tweens.killTweensOf(this.bobber);
    this.bobber.y = BOBBER_REST_Y;
    this.tweens.add({
      targets: this.bobber,
      y: BOBBER_REST_Y + BITE_DIP,
      duration: 110,
      ease: 'Quad.easeOut',
    });
  }

  private tickFighting(dt: number): void {
    if (this.tensionState === null) {
      return;
    }
    const holding = this.heldPointers.size > 0;
    const result = tickTension(this.tensionState, dt, holding, FIGHTS[this.rarity]);
    this.tensionState = result.state;
    this.bars.draw(result.state.progress, result.state.tension, result.state.thrashing);

    // Sparks off the rod tip once the line is into its last tier — the loudest
    // signal, saved for the moment that has earned it.
    this.sparkCooldownMs -= dt;
    if (result.state.tension >= TENSION_DANGER && this.sparkCooldownMs <= 0) {
      this.strainSparks.emitParticleAt(this.rodTipX(), this.rodTipY(), 1);
      this.sparkCooldownMs = 90;
    }

    // The reel bar made visible in the water: progress hauls the fish up
    // from where it bit toward the surface, slack lets it dive back.
    const thrashing = result.state.thrashing;
    const wobble = thrashing ? 7 : 2.5;
    const speed = thrashing ? 0.03 : 0.012;
    const liftY = Phaser.Math.Linear(this.biteY, WATERLINE + 34, result.state.progress);
    this.fighter.setPosition(
      this.bobber.x + Math.sin(this.swayMs * speed) * wobble * 2,
      liftY + Math.cos(this.swayMs * speed * 0.8) * wobble
    );
    this.fighter.setAngle(Math.sin(this.swayMs * speed * 1.3) * (thrashing ? 24 : 8));

    for (const event of result.events) {
      if (event === 'thrashStart') {
        playSfx(this, 'hurt');
        this.cameras.main.shake(140, 0.0035);
        this.ripple(this.bobber.x, 0.5);
        // The camera shake is over in 140ms but a thrash runs the best part of
        // a second, and a shake of the whole screen is what a snap does too.
        // The hull jerking three times is local, lasts the danger, and belongs
        // to the line — so it can be read as "let go" rather than as "ouch".
        this.tweens.killTweensOf(this.boatFlick);
        this.tweens.add({
          targets: this.boatFlick,
          deg: 2.5,
          duration: 80,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.boatFlick.deg = 0;
          },
        });
      } else if (event === 'landed') {
        this.landCatch();
      } else if (event === 'snapped') {
        this.snapLine();
      } else if (event === 'escaped') {
        this.fishEscaped();
      }
    }
  }

  /** The line went slack for so long the fish worked itself off the hook. */
  private fishEscaped(): void {
    playSfx(this, 'plop');
    this.floatText(this.bobber.x, WATERLINE - 34, 'IT WRIGGLED OFF', PALETTE.muted);
    this.fleeFighter();
    this.tweens.killTweensOf(this.bobber);
    this.tweens.add({ targets: this.bobber, y: BOBBER_REST_Y, angle: 0, duration: 240, ease: 'Bounce.easeOut' });

    this.resolveCast();
  }

  private landCatch(): void {
    const points = CATCH_POINTS[this.rarity];
    this.scoreState = addPoints(this.scoreState, points, 0);
    this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);

    const golden = this.rarity === 'golden';
    playSfx(this, 'catch');
    if (golden) {
      playSfx(this, 'rare');
      this.cameras.main.flash(120, 255, 209, 102);
    }

    // Out of the water and into the boat, dry texture and all.
    const look = LOOK[this.rarity];
    this.fighter.setTexture(ensureFishTexture(this, look.color, { rare: look.rare, submerged: false }));
    const fromX = this.fighter.x;
    this.splash(this.bobber.x, 1);
    this.floatText(this.bobber.x, WATERLINE - 34, `+${points}`, golden ? PALETTE.gold : ACCENT);
    this.tweens.killTweensOf(this.fighter);
    this.tweens.add({
      targets: this.fighter,
      x: this.boat.x + 30,
      y: BOAT_Y - 40,
      angle: fromX > this.boat.x ? -140 : 140,
      scale: this.fighter.scaleX * 0.5,
      alpha: 0,
      duration: 560,
      ease: 'Cubic.easeIn',
    });

    this.resolveCast();
  }

  private snapLine(): void {
    playSfx(this, 'snap');
    this.cameras.main.shake(180, 0.006);
    // A line that has parted must stop being drawn attached to both ends: the
    // stub left whipping off the rod tip is the outcome, and it is one a
    // player who cannot read the word for it still understands.
    this.lineCut = true;
    this.strainSparks.emitParticleAt(this.rodTipX(), this.rodTipY(), 8);
    this.floatText(this.bobber.x, WATERLINE - 34, 'SNAPPED!', PALETTE.rose);
    this.fleeFighter();
    // The freed bobber springs back across the surface toward the boat.
    this.tweens.killTweensOf(this.bobber);
    this.tweens.add({
      targets: this.bobber,
      x: this.bobber.x - 60,
      y: BOBBER_REST_Y - 26,
      angle: -50,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: this.bobber, y: BOBBER_REST_Y, angle: 0, duration: 220, ease: 'Bounce.easeOut' });
      },
    });

    this.resolveCast();
  }

  private fleeFighter(): void {
    const away = this.fighter.x > WIDTH / 2 ? 1 : -1;
    this.fighter.setFlipX(away < 0);
    this.tweens.killTweensOf(this.fighter);
    this.tweens.add({
      targets: this.fighter,
      x: this.fighter.x + away * 180,
      y: Math.min(this.fighter.y + 80, SCHOOL.bounds.maxY),
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => this.fighter.setVisible(false),
    });
  }

  /** Books the cast and, after the outcome has had its moment, either hands
   * the rod back or ends the run. Exactly one call per cast, whatever way
   * the cast ended. */
  private resolveCast(): void {
    this.phase = 'resolving';
    this.tensionState = null;
    this.hookInWater = false;
    this.hookArmed = false;
    this.hook.setVisible(false);
    this.tweens.killTweensOf(this.hook);
    this.castsUsed += 1;
    this.castsPill.setValue(`${CAST_COUNT - this.castsUsed}`);
    this.bars.container.setVisible(false);
    this.setHint('');

    this.time.delayedCall(950, () => {
      if (this.phase !== 'resolving') {
        return;
      }
      if (this.castsUsed >= CAST_COUNT) {
        this.finishRun();
        return;
      }
      this.phase = 'idle';
      this.tweens.killTweensOf(this.bobber);
      this.parkBobber();
      this.setHint('DROP THE HOOK ON A FISH');
    });
  }

  private finishRun(): void {
    this.phase = 'done';
    fadeOutMusic(this);
    playSfx(this, 'timeup');
    this.cameras.main.flash(200, 157, 123, 255);
    this.tweens.killTweensOf(this.bobber);
    this.parkBobber();

    this.time.delayedCall(420, () => {
      if (this.phase !== 'done') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('HAUL IN!', 'Score', `${getScoreValue(this.scoreState)}`);
    });
  }

  /** Expanding ring on the surface, flattened into the water's perspective. */
  private ripple(x: number, strength: number): void {
    const ring = this.add
      .image(x, WATERLINE + 2, TEX.glow)
      .setDisplaySize(30, 12)
      .setTint(PALETTE.moon)
      .setAlpha(0.5 * strength)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.effects);
    this.tweens.add({
      targets: ring,
      displayWidth: 30 + 130 * strength,
      displayHeight: 12 + 30 * strength,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private splash(x: number, strength: number): void {
    this.ripple(x, strength);
    const drops = this.add.particles(x, WATERLINE, TEX.spark, {
      speed: { min: 50, max: 140 },
      angle: { min: 236, max: 304 },
      gravityY: 460,
      lifespan: { min: 260, max: 480 },
      scale: { start: 0.36, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [PALETTE.pond, PALETTE.moon],
      blendMode: 'ADD',
      emitting: false,
    });
    drops.setDepth(DEPTH.effects);
    drops.explode(Math.round(4 + strength * 5));
    this.time.delayedCall(700, () => drops.destroy());
  }

  private floatText(x: number, y: number, text: string, color: number): void {
    const label = this.add
      .text(x, y, text, displayStyle(24, color))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    this.tweens.add({
      targets: label,
      y: y - 48,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
