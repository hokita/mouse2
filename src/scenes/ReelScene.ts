import Phaser from 'phaser';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import { intersects, rectAt } from '../core/collision';
import { createCountdown, elapsed, isFinished, secondsLeft, tickCountdown } from '../core/countdown';
import type { CountdownState } from '../core/countdown';
import { BAND_COUNT, BAND_POINTS, JUNK_POINTS, RARE_POINTS, bandCenterY } from '../core/depth';
import { levelIndexAt } from '../core/levels';
import { pickKind } from '../core/popups';
import type { KindOdds, PopupKind } from '../core/popups';
import { addPoints, createScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, retuneSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { WIDTH, HEIGHT } from '../gameConfig';
import { FISH_HEIGHT, FISH_WIDTH, ensureFishTexture } from '../ui/pondTextures';
import {
  BOAT_HEIGHT,
  BOAT_WIDTH,
  BOOT_HEIGHT,
  BOOT_WIDTH,
  HOOK_HEIGHT,
  HOOK_WIDTH,
  REEL_TEX,
  ROD_TIP_X,
  ROD_TIP_Y,
  ensureBoatTexture,
  ensureBootTexture,
  ensureBubbleTexture,
  ensureHookTexture,
  ensureRayTexture,
} from '../ui/reelTextures';
import { PALETTE, displayStyle, labelStyle, shade } from '../ui/theme';
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
import { FISH_COLORS } from './FishScene';

const ACCENT = PALETTE.violet;

/** Same run length and gear-change cadence as Fish Catch, deliberately: the
 * two water games should feel like siblings, not rivals with house rules. */
const RUN_MS = 60_000;
const LEVEL_STEP_MS = 12_000;

/** Where the night sky ends and the water begins. */
const WATERLINE = 168;

/** The column fish swim in. It starts well under the waterline so a shallow
 * fish still reads as underwater, and stops short of the screen edge so the
 * deepest fish never clips the bezel. */
const AREA_TOP = WATERLINE + 56;
const AREA_BOTTOM = HEIGHT - 40;

/** The hook's leash. It can chase the shallowest fish right up near the
 * surface and the deepest to the floor, but never leaves the water. */
const HOOK_MIN_Y = WATERLINE + 30;
const HOOK_MARGIN_X = 26;

/**
 * How much bigger than the hook its catch test is against fish, per side.
 * Junk gets none, for Fish Catch's reason exactly: forgiveness belongs on
 * the near-misses at the things worth catching, never on the thing that
 * costs points.
 */
const CATCH_PAD = 12;

/** Fish grow with depth — the visible promise that the deep pays more. */
const BAND_SCALE = [0.78, 1, 1.2] as const;

/** How far the catch blip climbs per catch, and where the climb stops. */
const STREAK_DETUNE_CENTS = 100;
const STREAK_DETUNE_MAX = 6;

// Caps how much sim time one frame advances. Swimmers move under their own
// steam here, so unlike Fish Catch this is also a tunnelling guard: a stalled
// tab must not let a fish teleport through the hook untested.
const MAX_DELTA_MS = 100;

interface Level {
  /** Shortest and longest gap between two arrivals. */
  minSpawnMs: number;
  maxSpawnMs: number;
  /** Most swimmers allowed in the water at once. */
  maxActive: number;
  /** Cruise speed of a shallow fish, px/s — depth and kind scale off it. */
  speed: number;
  odds: KindOdds;
}

// The ladder the run climbs, a rung every LEVEL_STEP_MS. It opens with slow,
// junk-free water so the first casts always land something, then the traffic
// thickens and quickens and the boots start turning up among the fish.
const LEVELS: Level[] = [
  { minSpawnMs: 1000, maxSpawnMs: 1400, maxActive: 3, speed: 72, odds: { rare: 0.05, trash: 0 } },
  { minSpawnMs: 850, maxSpawnMs: 1200, maxActive: 4, speed: 88, odds: { rare: 0.07, trash: 0.12 } },
  { minSpawnMs: 700, maxSpawnMs: 1000, maxActive: 5, speed: 104, odds: { rare: 0.09, trash: 0.17 } },
  { minSpawnMs: 590, maxSpawnMs: 860, maxActive: 6, speed: 120, odds: { rare: 0.11, trash: 0.21 } },
  { minSpawnMs: 500, maxSpawnMs: 750, maxActive: 7, speed: 136, odds: { rare: 0.13, trash: 0.25 } },
];

type GameState = 'playing' | 'timeUp';

interface Swimmer {
  kind: PopupKind;
  band: number;
  sprite: Phaser.GameObjects.Image;
  /** Aura behind the golden fish; null for everything else. */
  glow: Phaser.GameObjects.Image | null;
  /** px/s; sign is direction of travel. */
  vx: number;
  /** The depth it cruises at — sprite.y bobs around this. */
  baseY: number;
  elapsedMs: number;
  bobAmplitude: number;
  bobPeriodMs: number;
  /** Display size, which is also exactly the catch box. */
  width: number;
  height: number;
  /** True once hooked or fading out: it can't be caught twice. */
  leaving: boolean;
}

export class ReelScene extends Phaser.Scene {
  private swimmers: Swimmer[] = [];
  private spawner!: SpawnerState;
  private countdown!: CountdownState;
  private levelIndex!: number;
  /** Consecutive clean catches — walks the catch blip upward, boots reset it. */
  private streak = 0;
  private scoreState!: ScoreState;
  private scorePill!: StatPill;
  private timePill!: StatPill;
  private levelToast!: Phaser.GameObjects.Text;
  private overlay!: GameOverOverlay;
  private overlayShown = false;
  private state!: GameState;

  private boat!: Phaser.GameObjects.Image;
  private hook!: Phaser.GameObjects.Image;
  private line!: Phaser.GameObjects.Graphics;
  /** The hook's simulated position; the sprite adds an idle bob on top. */
  private hookX = WIDTH / 2;
  private hookY = (AREA_TOP + AREA_BOTTOM) / 2;
  private targetX = WIDTH / 2;
  private targetY = (AREA_TOP + AREA_BOTTOM) / 2;
  private bobMs = 0;
  /** Which way the boat faces — flips with hysteresis, see updateBoat(). */
  private boatFlipped = false;

  constructor() {
    super('ReelScene');
  }

  create(): void {
    ensureFxTextures(this);
    ensureStarTextures(this);
    ensureBoatTexture(this);
    ensureHookTexture(this);
    ensureBootTexture(this);
    ensureBubbleTexture(this);
    ensureRayTexture(this);
    for (const color of FISH_COLORS) {
      // Not submerged: these fish are entirely underwater, so the waterline
      // wash the pond bakes onto a surfacing fish would be a lie here.
      ensureFishTexture(this, color, { submerged: false });
    }
    ensureFishTexture(this, PALETTE.gold, { rare: true, submerged: false });

    this.createBackdrop();

    this.boat = this.add
      .image(WIDTH / 2, WATERLINE - 26, REEL_TEX.boat)
      .setDisplaySize(BOAT_WIDTH, BOAT_HEIGHT)
      .setDepth(DEPTH.world + 1);
    // The bob rides on top of the follow logic: the tweens own y and angle,
    // update() owns x, and the two never touch the same property.
    this.tweens.add({
      targets: this.boat,
      y: this.boat.y + 4,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: this.boat,
      angle: { from: -1.4, to: 1.4 },
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Above the waterline band, so the line visibly crosses into the water
    // instead of being cut off for the band's height.
    this.line = this.add.graphics().setDepth(DEPTH.world + 3);

    this.hook = this.add
      .image(this.hookX, this.hookY, REEL_TEX.hook)
      .setDisplaySize(HOOK_WIDTH, HOOK_HEIGHT)
      .setDepth(DEPTH.world + 0.5);

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

    // Just under the waterline, where no fish ever swims — the column starts
    // lower — so the one line of instructions never hides a catch.
    const hint = this.add
      .text(WIDTH / 2, WATERLINE + 30, 'DRAG THE HOOK  ·  DEEP FISH PAY MORE', labelStyle(12))
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.hud);
    hint.setLetterSpacing(3);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.steer(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.steer(pointer);
      }
    });

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
      isArmed: () => this.state === 'timeUp' && this.overlayShown,
    });

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.resetState();
  }

  private createBackdrop(): void {
    // The sky: the shared gradient, a strip of stars, and a low moon whose
    // light is what every ray and rim below claims to be.
    this.add
      .image(WIDTH / 2, WATERLINE / 2, ensureGradient(this, PALETTE.skyTop, PALETTE.skyBottom))
      .setDisplaySize(WIDTH, WATERLINE)
      .setDepth(DEPTH.backdrop);
    this.add
      .tileSprite(WIDTH / 2, WATERLINE / 2, WIDTH, WATERLINE, TEX.starsFar)
      .setAlpha(0.8)
      .setDepth(DEPTH.backdrop);

    // Low over the water, in the strip between the HUD pills (which end at
    // y = 72) and the waterline — higher and the TIME pill sits on top of it.
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

    // The water: darkening with depth, because that is what depth is.
    const waterTop = shade(PALETTE.seaDeep, -0.05);
    this.add
      .image(WIDTH / 2, WATERLINE + (HEIGHT - WATERLINE) / 2, ensureGradient(this, waterTop, 0x02040a))
      .setDisplaySize(WIDTH, HEIGHT - WATERLINE)
      .setDepth(DEPTH.backdrop);

    // Moonlight falling into the water. Each shaft leans and breathes on its
    // own clock so the group reads as light through water, not wallpaper.
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

    // Depth guide: what each band pays, and a hairline where bands meet.
    // Quiet enough to ignore, present enough to teach the one rule the game
    // has without a word of tutorial.
    const guide = this.add.graphics().setDepth(DEPTH.backdrop);
    for (let band = 1; band < BAND_COUNT; band += 1) {
      const y = AREA_TOP + ((AREA_BOTTOM - AREA_TOP) / BAND_COUNT) * band;
      guide.lineStyle(1, PALETTE.moon, 0.06);
      guide.beginPath();
      guide.moveTo(14, y);
      guide.lineTo(WIDTH - 14, y);
      guide.strokePath();
    }
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.add
        .text(WIDTH - 14, bandCenterY(band, AREA_TOP, AREA_BOTTOM), `+${BAND_POINTS[band]}`, labelStyle(13))
        .setOrigin(1, 0.5)
        .setAlpha(0.3)
        .setDepth(DEPTH.backdrop);
    }

    // A slow column of ambient bubbles, so still water never reads as paused.
    this.add
      .particles(0, 0, REEL_TEX.bubble, {
        x: { min: 20, max: WIDTH - 20 },
        y: AREA_BOTTOM + 20,
        speedY: { min: -34, max: -16 },
        speedX: { min: -6, max: 6 },
        lifespan: { min: 2800, max: 5200 },
        scale: { start: 0.45, end: 0.9 },
        alpha: { start: 0.26, end: 0 },
        frequency: 650,
        quantity: 1,
      })
      .setDepth(DEPTH.world - 1);

    // The waterline, in front of the boat's hull so it sits IN the water
    // rather than on it: a band of surface water, then the moonlit seam.
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

    for (const swimmer of this.swimmers) {
      this.destroySprites(swimmer);
    }
    this.swimmers = [];

    this.hookX = WIDTH / 2;
    this.hookY = AREA_TOP + 60;
    this.targetX = this.hookX;
    this.targetY = this.hookY;
    this.streak = 0;
    playMusic(this, 'reel');
  }

  private steer(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing') {
      return;
    }
    this.targetX = Phaser.Math.Clamp(pointer.x, HOOK_MARGIN_X, WIDTH - HOOK_MARGIN_X);
    this.targetY = Phaser.Math.Clamp(pointer.y, HOOK_MIN_Y, AREA_BOTTOM);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DELTA_MS);

    // The boat, line and hook keep living through the time-up card — frozen
    // rigging against a still-bobbing boat would visibly tear apart.
    this.updateHook(dt);
    this.updateBoat(dt);
    this.drawLine();

    if (this.state !== 'playing') {
      return;
    }

    this.countdown = tickCountdown(this.countdown, dt);
    this.timePill.setValue(`${secondsLeft(this.countdown)}`);

    const level = this.applyLevel(elapsed(this.countdown, RUN_MS));

    const spawn = tickSpawner(this.spawner, dt);
    this.spawner = spawn.state;
    if (spawn.shouldSpawn) {
      this.launchSwimmer(level);
    }

    this.updateSwimmers(dt);
    this.checkCatches();

    if (isFinished(this.countdown)) {
      this.triggerTimeUp();
    }
  }

  /**
   * The hook chases the finger through water, not air: an exponential lag
   * rather than a teleport, so it arrives with the little overshoot-free
   * drag that makes it feel weighted.
   */
  private updateHook(dt: number): void {
    const follow = 1 - Math.exp(-dt / 110);
    this.hookX += (this.targetX - this.hookX) * follow;
    this.hookY += (this.targetY - this.hookY) * follow;

    this.bobMs += dt;
    this.hook.setPosition(this.hookX, this.hookY + Math.sin(this.bobMs * 0.0035) * 2.5);
    // A slight heel in the direction of travel sells the water resistance.
    this.hook.setAngle(Phaser.Math.Clamp((this.targetX - this.hookX) * 0.12, -14, 14));
  }

  /**
   * The boat idles after the hook so the line never has to reach across the
   * whole screen, flipping to face it only once it is decisively on the other
   * side — the 40px dead zone stops it shivering when the hook hangs
   * directly below.
   */
  private updateBoat(dt: number): void {
    const target = Phaser.Math.Clamp(this.hookX, BOAT_WIDTH / 2 + 20, WIDTH - BOAT_WIDTH / 2 - 20);
    this.boat.x += (target - this.boat.x) * (1 - Math.exp(-dt / 420));

    if (this.hookX < this.boat.x - 40) {
      this.boatFlipped = true;
    } else if (this.hookX > this.boat.x + 40) {
      this.boatFlipped = false;
    }
    this.boat.setFlipX(this.boatFlipped);
  }

  /** Rod tip to hook eye, sagging a touch at the middle like real line. */
  private drawLine(): void {
    const tipX = this.boat.x + (this.boatFlipped ? -ROD_TIP_X : ROD_TIP_X);
    const tipY = this.boat.y + ROD_TIP_Y;
    const endX = this.hook.x;
    const endY = this.hook.y - HOOK_HEIGHT / 2 + 4;

    const controlX = (tipX + endX) / 2;
    const controlY = (tipY + endY) / 2 + 16;

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
  }

  /** See FishScene.applyLevel — same ladder, same retune-on-change. */
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

  /** Sends one fish, golden fish or boot in from a screen edge. */
  private launchSwimmer(level: Level): void {
    const active = this.swimmers.filter((swimmer) => !swimmer.leaving).length;
    if (active >= level.maxActive) {
      return;
    }

    const kind = pickKind(level.odds);
    const band = Phaser.Math.Between(0, BAND_COUNT - 1);
    const bandHeight = (AREA_BOTTOM - AREA_TOP) / BAND_COUNT;
    // Inside the band with a margin, so a swimmer's bob never crosses into
    // the neighbouring band's payout.
    const baseY = AREA_TOP + bandHeight * (band + 0.2 + Math.random() * 0.6);

    const scale = kind === 'trash' ? 1 : kind === 'rare' ? 1.05 : BAND_SCALE[band];
    const width = (kind === 'trash' ? BOOT_WIDTH : FISH_WIDTH) * scale;
    const height = (kind === 'trash' ? BOOT_HEIGHT : FISH_HEIGHT) * scale;

    // Deeper is faster, the golden fish is faster still, and a boot just
    // wallows — speed is how each thing telegraphs what it is worth.
    const kindFactor = kind === 'rare' ? 1.55 : kind === 'trash' ? 0.55 : 1;
    const speed = level.speed * (1 + band * 0.35) * kindFactor * Phaser.Math.FloatBetween(0.9, 1.1);
    const fromLeft = Math.random() < 0.5;
    const vx = fromLeft ? speed : -speed;
    const x = fromLeft ? -width / 2 - 12 : WIDTH + width / 2 + 12;

    let glow: Phaser.GameObjects.Image | null = null;
    if (kind === 'rare') {
      glow = this.add
        .image(x, baseY, TEX.glow)
        .setDisplaySize(width * 2, height * 2.4)
        .setTint(PALETTE.gold)
        .setAlpha(0.4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.world - 0.5);
    }

    const sprite = this.add
      .image(x, baseY, this.textureFor(kind))
      .setDisplaySize(width, height)
      .setDepth(DEPTH.world);
    // The fish nose points right in the texture; swim nose-first. The boot
    // just tumbles in whichever way up it fell.
    sprite.setFlipX(!fromLeft);
    if (kind === 'trash') {
      sprite.setAngle(fromLeft ? -14 : 14);
    }

    this.swimmers.push({
      kind,
      band,
      sprite,
      glow,
      vx,
      baseY,
      elapsedMs: Math.random() * 2000,
      bobAmplitude: kind === 'trash' ? 8 : 5,
      bobPeriodMs: kind === 'trash' ? 2600 : Phaser.Math.Between(1400, 2200),
      width,
      height,
      leaving: false,
    });
  }

  private textureFor(kind: PopupKind): string {
    if (kind === 'trash') {
      return REEL_TEX.boot;
    }
    if (kind === 'rare') {
      return ensureFishTexture(this, PALETTE.gold, { rare: true, submerged: false });
    }
    const color = FISH_COLORS[Phaser.Math.Between(0, FISH_COLORS.length - 1)];
    return ensureFishTexture(this, color, { submerged: false });
  }

  private updateSwimmers(dt: number): void {
    // Walked over a copy of nothing — removal happens after the walk, so the
    // list is never edited mid-iteration.
    const gone: Swimmer[] = [];
    for (const swimmer of this.swimmers) {
      if (swimmer.leaving) {
        continue;
      }
      swimmer.elapsedMs += dt;
      swimmer.sprite.x += (swimmer.vx * dt) / 1000;
      swimmer.sprite.y =
        swimmer.baseY + swimmer.bobAmplitude * Math.sin((2 * Math.PI * swimmer.elapsedMs) / swimmer.bobPeriodMs);
      if (swimmer.glow) {
        swimmer.glow.setPosition(swimmer.sprite.x, swimmer.sprite.y);
      }

      const margin = swimmer.width / 2 + 40;
      if (swimmer.sprite.x < -margin || swimmer.sprite.x > WIDTH + margin) {
        gone.push(swimmer);
      }
    }
    // Swimming off the far side costs nothing — the miss is its own lesson.
    for (const swimmer of gone) {
      this.removeSwimmer(swimmer);
    }
  }

  private checkCatches(): void {
    // The hook can only take one thing per frame: one catch mutates nothing
    // mid-walk, and two fish crossing the hook at once should not both leap
    // out of the water for one bite.
    let best: Swimmer | null = null;
    let bestDistance = Infinity;
    for (const swimmer of this.swimmers) {
      if (swimmer.leaving) {
        continue;
      }
      const pad = swimmer.kind === 'trash' ? 0 : CATCH_PAD;
      const hookRect = rectAt(this.hook.x, this.hook.y, HOOK_WIDTH + pad * 2, HOOK_HEIGHT + pad * 2);
      const swimmerRect = rectAt(swimmer.sprite.x, swimmer.sprite.y, swimmer.width, swimmer.height);
      if (!intersects(hookRect, swimmerRect)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(this.hook.x, this.hook.y, swimmer.sprite.x, swimmer.sprite.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = swimmer;
      }
    }
    if (best !== null) {
      this.catchSwimmer(best);
    }
  }

  private catchSwimmer(swimmer: Swimmer): void {
    const points =
      swimmer.kind === 'trash' ? JUNK_POINTS : swimmer.kind === 'rare' ? RARE_POINTS : BAND_POINTS[swimmer.band];
    // Floored at zero, exactly as Fish Catch: a negative total reads as
    // "you are losing", which is not a thing this game says.
    this.scoreState = addPoints(this.scoreState, points, 0);
    this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);

    const color = swimmer.kind === 'trash' ? PALETTE.rose : swimmer.kind === 'rare' ? PALETTE.gold : ACCENT;
    if (swimmer.kind === 'trash') {
      // A boot breaks the run: the next fish starts the climb over.
      this.streak = 0;
      playSfx(this, 'trash');
      this.cameras.main.shake(140, 0.005);
    } else {
      const detune = Math.min(this.streak, STREAK_DETUNE_MAX) * STREAK_DETUNE_CENTS;
      this.streak += 1;
      playSfx(this, swimmer.kind === 'rare' ? 'rare' : 'catch', { detune });
      if (swimmer.kind === 'rare') {
        this.cameras.main.flash(120, 255, 209, 102);
      }
    }

    this.floatPoints(swimmer.sprite.x, swimmer.sprite.y - 20, points, color);
    this.burst(swimmer.sprite.x, swimmer.sprite.y, color);

    swimmer.leaving = true;
    this.tweens.killTweensOf(swimmer.sprite);

    if (swimmer.kind === 'trash') {
      // The boot slips the hook and sinks back into the dark.
      this.tweens.add({
        targets: swimmer.sprite,
        y: swimmer.sprite.y + 70,
        angle: swimmer.sprite.angle + 40,
        alpha: 0,
        duration: 320,
        ease: 'Quad.easeIn',
        onComplete: () => this.removeSwimmer(swimmer),
      });
    } else {
      // Yanked up the line and out at the surface, nose skyward, with the
      // splash arriving as it crosses the waterline rather than on the bite.
      const surfaceX = this.hookX;
      this.tweens.add({
        targets: swimmer.sprite,
        x: surfaceX,
        y: WATERLINE - 10,
        angle: swimmer.vx < 0 ? 80 : -80,
        scale: swimmer.sprite.scaleX * 0.4,
        alpha: 0,
        duration: 340,
        ease: 'Cubic.easeIn',
        onComplete: () => this.removeSwimmer(swimmer),
      });
      this.time.delayedCall(300, () => this.splash(surfaceX));
    }
    if (swimmer.glow) {
      this.tweens.add({ targets: swimmer.glow, alpha: 0, duration: 240 });
    }
  }

  private removeSwimmer(swimmer: Swimmer): void {
    this.swimmers = this.swimmers.filter((other) => other !== swimmer);
    this.destroySprites(swimmer);
  }

  /** See FishScene.destroySprites: nothing dies while a tween points at it. */
  private destroySprites(swimmer: Swimmer): void {
    this.tweens.killTweensOf(swimmer.sprite);
    swimmer.sprite.destroy();
    if (swimmer.glow) {
      this.tweens.killTweensOf(swimmer.glow);
      swimmer.glow.destroy();
    }
  }

  /** A burst of droplets and a plop where a catch breaks the surface. */
  private splash(x: number): void {
    playSfx(this, 'plop');
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
    drops.explode(7);
    this.time.delayedCall(700, () => drops.destroy());
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

    // Everything still swimming slips away into the dark, so the card lands
    // on empty water. Silent, like Fish Catch's mass dive, and for the same
    // reason: several plops summed on one frame would clip.
    for (const swimmer of this.swimmers) {
      if (!swimmer.leaving) {
        swimmer.leaving = true;
        this.tweens.killTweensOf(swimmer.sprite);
        this.tweens.add({
          targets: swimmer.sprite,
          alpha: 0,
          scale: swimmer.sprite.scaleX * 0.6,
          duration: 300,
          ease: 'Quad.easeIn',
          onComplete: () => this.removeSwimmer(swimmer),
        });
        if (swimmer.glow) {
          this.tweens.add({ targets: swimmer.glow, alpha: 0, duration: 300 });
        }
      }
    }

    this.cameras.main.flash(200, 157, 123, 255);

    this.time.delayedCall(420, () => {
      if (this.state !== 'timeUp') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('TIME UP!', 'Score', `${getScoreValue(this.scoreState)}`);
    });
  }
}
