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
  REEL_TEX,
  ROD_TIP_X,
  ROD_TIP_Y,
  ensureBoatTexture,
  ensureBobberTexture,
  ensureBubbleTexture,
  ensureHookTexture,
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
 * bounds keep them in the deep water, below the hint line and clear of the
 * screen edges.
 */
const SCHOOL: SchoolConfig = {
  bounds: { minX: 36, maxX: WIDTH - 36, minY: 540, maxY: 810 },
  fishCount: 5,
  respawnDelayMs: 1800,
  weights: { common: 46, fine: 28, big: 18, golden: 8 },
  speeds: { common: 46, fine: 62, big: 34, golden: 108 },
  speedJitter: 0.25,
  biteRadius: 64,
  catchRadius: 12,
  lungeSpeed: 175,
  attractAfterMs: 5000,
};

/** How each rarity reads underwater: colour, glow, and above all size. */
const LOOK: Record<CatchRarity, { color: number; rare: boolean; scale: number }> = {
  common: { color: PALETTE.cyan, rare: false, scale: 0.62 },
  fine: { color: PALETTE.mint, rare: false, scale: 0.85 },
  big: { color: PALETTE.amber, rare: false, scale: 1.2 },
  golden: { color: PALETTE.gold, rare: true, scale: 0.9 },
};

// The fights. Bigger fish reel in slower, load the line faster and thrash
// more of the time. Tuned so a common fish held straight through usually
// survives its one thrash — a small child's first catches must land — while
// the golden fish genuinely demands easing off, and easing off is cheap
// (tension falls fast) so the lesson is learnable without losing the fish.
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
    risePerSec: 0.3,
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
    risePerSec: 0.36,
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

type Phase = 'idle' | 'casting' | 'waiting' | 'fighting' | 'resolving' | 'done';

interface FightBars {
  container: Phaser.GameObjects.Container;
  draw(progress: number, tension: number): void;
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
  /** The depth the fish was hooked at; the fight lifts it from here. */
  private biteY = 0;

  private scorePill!: StatPill;
  private castsPill!: StatPill;
  private hint!: Phaser.GameObjects.Text;
  private overlay!: GameOverOverlay;
  private overlayShown = false;

  private boat!: Phaser.GameObjects.Image;
  private bobber!: Phaser.GameObjects.Image;
  private hook!: Phaser.GameObjects.Image;
  private line!: Phaser.GameObjects.Graphics;
  private biteCue!: Phaser.GameObjects.Text;
  private fighter!: Phaser.GameObjects.Image;
  private fishSprites = new Map<number, Phaser.GameObjects.Image>();
  private bars!: FightBars;
  /** Clock for the bobber's idle sway and the school's bobbing. */
  private swayMs = 0;

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
    this.tweens.add({
      targets: this.boat,
      angle: { from: -1.2, to: 1.2 },
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleTap(pointer));

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
   * The fight readout: a reel bar that must fill and a line bar that must
   * not. One panel, because during a fight the player's eyes are on the
   * fish — a single place to glance keeps the check cheap.
   */
  private createFightBars(): FightBars {
    const PANEL_W = 310;
    const PANEL_H = 88;
    const BAR_W = 216;
    const BAR_H = 12;
    const container = this.add
      .container(WIDTH / 2, HEIGHT - 132)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.skyTop, 0.62);
    bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, RADIUS.pill);
    bg.lineStyle(1.5, PALETTE.surfaceEdge, 0.7);
    bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, RADIUS.pill);

    const left = -PANEL_W / 2 + 18;
    const barX = left + 58;
    const reelLabel = this.add.text(left, -22, 'REEL', labelStyle(11, ACCENT)).setOrigin(0, 0.5);
    reelLabel.setLetterSpacing(2);
    const lineLabel = this.add.text(left, 14, 'LINE', labelStyle(11)).setOrigin(0, 0.5);
    lineLabel.setLetterSpacing(2);

    const troughs = this.add.graphics();
    for (const y of [-22, 14]) {
      troughs.fillStyle(0x000000, 0.45);
      troughs.fillRoundedRect(barX, y - BAR_H / 2, BAR_W, BAR_H, 6);
      troughs.lineStyle(1, PALETTE.surfaceEdge, 0.5);
      troughs.strokeRoundedRect(barX, y - BAR_H / 2, BAR_W, BAR_H, 6);
    }

    const fills = this.add.graphics();
    container.add([bg, reelLabel, lineLabel, troughs, fills]);

    return {
      container,
      draw(progress: number, tension: number): void {
        fills.clear();
        // The corner radius shrinks with a sliver-thin fill: a rounded rect
        // narrower than its own corners renders inside out.
        const reelW = Math.max(0, Math.min(1, progress)) * BAR_W;
        if (reelW > 1) {
          fills.fillStyle(ACCENT, 1);
          fills.fillRoundedRect(barX, -22 - BAR_H / 2, reelW, BAR_H, Math.min(6, reelW / 2));
        }
        // The line bar speaks in colour before it speaks in length: calm
        // mint, warning amber, about-to-snap rose.
        const lineColor = tension < 0.5 ? PALETTE.mint : tension < 0.8 ? PALETTE.amber : PALETTE.rose;
        const lineW = Math.max(0, Math.min(1, tension)) * BAR_W;
        if (lineW > 1) {
          fills.fillStyle(lineColor, 1);
          fills.fillRoundedRect(barX, 14 - BAR_H / 2, lineW, BAR_H, Math.min(6, lineW / 2));
        }
      },
    };
  }

  private resetState(): void {
    this.phase = 'idle';
    this.overlayShown = false;
    this.overlay.hide();
    this.scoreState = createScore();
    this.castsUsed = 0;
    this.tensionState = null;
    this.hookInWater = false;
    this.schoolState = createSchool(SCHOOL);
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
    this.parkBobber();
    this.setHint('DROP THE HOOK ON A FISH');
    playMusic(this, 'reel');
  }

  /** The bobber dangles off the rod tip between casts. */
  private parkBobber(): void {
    this.bobber.setPosition(this.rodTipX() + 10, this.rodTipY() + 30);
    this.bobber.setAngle(0);
    this.bobber.setAlpha(1);
  }

  private rodTipX(): number {
    return this.boat.x + ROD_TIP_X;
  }

  private rodTipY(): number {
    return this.boat.y + ROD_TIP_Y;
  }

  private setHint(text: string, color: number = PALETTE.muted): void {
    this.hint.setText(text);
    this.hint.setColor(`#${color.toString(16).padStart(6, '0')}`);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DELTA_MS);
    this.swayMs += dt;

    this.animateBobber();
    this.tickSchool(dt);
    this.drawLine();

    if (this.phase === 'fighting') {
      this.tickFighting(dt);
    }
  }

  /**
   * The school swims through every phase — a still tank would give the game
   * away as a screenshot. The hook only tempts it while a cast is actually
   * in the water.
   */
  private tickSchool(dt: number): void {
    const hook = this.hookInWater ? { x: this.hook.x, y: this.hook.y } : null;
    const result = tickSchool(this.schoolState, dt, hook, SCHOOL);
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

    // Slack while the line just hangs or drifts; taut the moment something
    // is pulling on the far end.
    const sag = this.phase === 'fighting' ? 2 : this.phase === 'casting' ? 6 : 14;
    const controlX = (tipX + endX) / 2;
    const controlY = (tipY + endY) / 2 + sag;

    this.line.clear();
    this.line.lineStyle(1.5, 0xbfd0f2, 0.55);
    this.line.beginPath();
    this.line.moveTo(tipX, tipY);
    const segments = 14;
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const inv = 1 - t;
      const x = inv * inv * tipX + 2 * inv * t * controlX + t * t * endX;
      const y = inv * inv * tipY + 2 * inv * t * controlY + t * t * endY;
      this.line.lineTo(x, y);
    }
    this.line.strokePath();

    // The leader under the surface, dimmer for the depth: bobber down to the
    // hook, or to the hooked fish once the hook has a mouth around it.
    let leaderEnd: { x: number; y: number } | null = null;
    if (this.hookInWater) {
      leaderEnd = { x: this.hook.x, y: this.hook.y - HOOK_HEIGHT / 2 };
    } else if (this.phase === 'fighting' && this.fighter.visible) {
      leaderEnd = { x: this.fighter.x, y: this.fighter.y };
    }
    if (leaderEnd !== null) {
      this.line.lineStyle(1.5, 0xbfd0f2, 0.28);
      this.line.beginPath();
      this.line.moveTo(this.bobber.x, this.bobber.y + BOBBER_HEIGHT * 0.2);
      this.line.lineTo(leaderEnd.x, leaderEnd.y);
      this.line.strokePath();
    }
  }

  private handleTap(pointer: Phaser.Input.Pointer): void {
    if (this.phase === 'idle' && pointer.y > WATERLINE + 8) {
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
    // The rod flicks forward — one quick dip of the boat sells the throw.
    this.tweens.add({
      targets: this.boat,
      angle: '+=3',
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
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
   * both. Fish may lunge at it on the way down; that is the good kind. */
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
    });
  }

  private beginFight(fish: Fish): void {
    this.phase = 'fighting';
    this.rarity = fish.rarity;
    this.biteY = fish.y;
    this.hookInWater = false;
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
    this.bars.draw(0, 0);
    this.setHint('HOLD TO REEL  ·  EASE OFF THE THRASH');
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
    const holding = this.input.activePointer.isDown;
    const result = tickTension(this.tensionState, dt, holding, FIGHTS[this.rarity]);
    this.tensionState = result.state;
    this.bars.draw(result.state.progress, result.state.tension);

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
