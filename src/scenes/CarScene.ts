import Phaser from 'phaser';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { createDistance, getDistanceValue, tickDistance } from '../core/distance';
import type { DistanceState } from '../core/distance';
import { laneCenterX, pickSpawnLane } from '../core/lanes';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { sweepX, sweepY } from '../core/sweep';
import { WIDTH, HEIGHT } from '../gameConfig';
import { PALETTE } from '../ui/theme';
import {
  BOOST_SIZE,
  CAR_HEIGHT,
  CAR_WIDTH,
  TEX,
  ensureBeamTexture,
  ensureBoostTexture,
  ensureCarTexture,
  ensureFxTextures,
  ensureGradient,
  ensureRoadTextures,
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

const ACCENT = PALETTE.amber;

const ROAD_MARGIN = 30;
const ROAD_LEFT = ROAD_MARGIN;
const ROAD_WIDTH = WIDTH - ROAD_MARGIN * 2;
const LANE_COUNT = 3;

const PLAYER_MARGIN_BOTTOM = 170;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;

/** The player's car — exported so the menu can show the real thing. */
export const PLAYER_CAR_COLOR = PALETTE.amber;

// Deliberately no amber here: that is the player's own paint job, and traffic
// that shares it is traffic you stop seeing. No mint either — that belongs to
// the speed pickups, and a pickup you read as a car is one you swerve around.
// Each of these also stays clear of the white lane markings and the
// washed-out asphalt behind them.
const TRAFFIC_COLORS = [PALETTE.rose, PALETTE.violet, PALETTE.cyan];

const MIN_SPAWN_INTERVAL_MS = 550;
const MAX_SPAWN_INTERVAL_MS = 1100;

// A lane counts as blocked (and so is off-limits for a new car) while it
// still holds traffic within this many pixels of the top of the screen —
// i.e. roughly where a freshly spawned car would appear. Sized well above
// CAR_HEIGHT so two cars in the same lane never spawn nose-to-tail.
const LANE_BLOCKED_ZONE = CAR_HEIGHT * 3;

// Speed is a function of pickups collected, not of time survived, and it has
// no ceiling: every disc is another 10 km/h on the pill, for as long as you
// can keep taking them. Sit out every pickup and you crawl at SPEED_BASE
// forever. What ends a run is not topping out, it is that traffic covers the
// ~800 px from the horizon to your bumper in less and less time — a second of
// warning at 175 km/h, half that at 350.
const SPEED_BASE = 120;
const SPEED_PER_GEAR = 20;

const MIN_BOOST_INTERVAL_MS = 2_000;
const MAX_BOOST_INTERVAL_MS = 3_500;

const KERB_WIDTH = 8;
const LANE_LINE_WIDTH = 8;

// Caps how much sim time a single frame advances the road by, so a stalled
// frame (a backgrounded tab, say) doesn't teleport the whole field of traffic
// down the screen the moment it resumes. Collision is swept (see update()),
// so this bound is about fairness — the player gets no chance to react to
// motion that happened while the tab was hidden — not about tunnelling.
const MAX_DELTA_MS = 100;

/** How far apart the distance chimes are. */
const MILESTONE_METRES = 500;

type GameState = 'playing' | 'gameOver';

/** A speed pickup falling down the road. Collect it to gain a gear. */
interface BoostItem {
  sprite: Phaser.GameObjects.Image;
  /** Mint bloom that pulses under the disc, so it reads as a prize. */
  glow: Phaser.GameObjects.Image;
  lane: number;
}

interface TrafficCar {
  sprite: Phaser.GameObjects.Image;
  /** Tail-light bloom that follows the car down the road. */
  glow: Phaser.GameObjects.Image;
  lane: number;
}

export class CarScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private headlights!: Phaser.GameObjects.Image;
  private prevPlayerX!: number;
  private traffic: TrafficCar[] = [];
  private boosts: BoostItem[] = [];
  /** Every surface that scrolls with the road: verges, asphalt, markings. */
  private scrollLayers: Phaser.GameObjects.TileSprite[] = [];
  private distanceState!: DistanceState;
  private spawnerState!: SpawnerState;
  private boostSpawnerState!: SpawnerState;
  /** Pickups collected this run — the only thing that sets the car's speed. */
  private gears!: number;
  /** Metres at the last chime, so each 500 m boundary is announced once. */
  private lastMilestone = 0;
  private distancePill!: StatPill;
  private speedPill!: StatPill;
  private overlay!: GameOverOverlay;
  private overlayShown = false;
  private state!: GameState;
  private dragging = false;

  constructor() {
    super('CarScene');
  }

  create(): void {
    ensureFxTextures(this);
    ensureRoadTextures(this);
    ensureBoostTexture(this);
    this.buildRoad();

    this.player = this.add
      .image(laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH), PLAYER_Y, ensureCarTexture(this, PLAYER_CAR_COLOR, { stripe: true }))
      .setDepth(DEPTH.world + 1);

    // A warm cone thrown ahead of the player's bonnet. It is what makes the
    // scene read as a night drive rather than a grey rectangle. Anchored at
    // its bottom edge so the narrow end stays pinned to the car's nose.
    this.headlights = this.add
      .image(this.player.x, PLAYER_Y - CAR_HEIGHT * 0.4, ensureBeamTexture(this))
      .setOrigin(0.5, 1)
      .setDisplaySize(CAR_WIDTH * 3, CAR_HEIGHT * 2.6)
      .setTint(0xffe6a8)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.distancePill = createStatPill(this, {
      x: 18,
      y: 18,
      width: 150,
      label: 'Distance',
      accent: PALETTE.text,
    });
    this.speedPill = createStatPill(this, {
      x: WIDTH - 18,
      y: 18,
      width: 150,
      label: 'Speed km/h',
      align: 'right',
      accent: ACCENT,
    });

    createBackButton(this, {
      accent: ACCENT,
      onTap: () => transitionTo(this, 'MenuScene'),
      // See GameScene: live runs only, the card owns the exit after a crash.
      isArmed: () => this.state === 'playing',
    });

    createSoundButton(this, { accent: ACCENT, depth: DEPTH.overlay + 1 });

    this.overlay = createGameOverOverlay(this, {
      accent: ACCENT,
      onRestart: () => this.resetState(),
      onMenu: () => transitionTo(this, 'MenuScene'),
      // See GameScene: armed only once the card is actually on screen.
      isArmed: () => this.state === 'gameOver' && this.overlayShown,
    });

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.resetState();
  }

  /**
   * The road is built from tiling strips rather than individual objects: one
   * texture per surface, scrolled by its tile offset. Nothing to spawn,
   * nothing to wrap by hand, and the markings stay pixel-stable at any speed.
   */
  private buildRoad(): void {
    // A Scene instance outlives a restart but its display list does not, so
    // start from an empty layer list rather than appending to dead objects.
    this.scrollLayers = [];

    // Night sky over the verge, so the horizon end of the road is darker.
    this.add
      .image(WIDTH / 2, HEIGHT / 2, ensureGradient(this, PALETTE.skyTop, PALETTE.grassDark))
      .setDisplaySize(WIDTH, HEIGHT)
      .setDepth(DEPTH.backdrop);

    const grass = this.add
      .tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, TEX.grass)
      .setAlpha(0.7)
      .setDepth(DEPTH.backdrop);

    const asphalt = this.add
      .tileSprite(ROAD_LEFT + ROAD_WIDTH / 2, HEIGHT / 2, ROAD_WIDTH, HEIGHT, TEX.asphalt)
      .setDepth(DEPTH.backdrop + 1);

    this.scrollLayers.push(grass, asphalt);

    for (const edge of [ROAD_LEFT, ROAD_LEFT + ROAD_WIDTH]) {
      this.scrollLayers.push(
        this.add.tileSprite(edge, HEIGHT / 2, KERB_WIDTH, HEIGHT, TEX.kerb).setDepth(DEPTH.backdrop + 2)
      );
    }

    for (let boundary = 1; boundary < LANE_COUNT; boundary += 1) {
      const x = ROAD_LEFT + (ROAD_WIDTH * boundary) / LANE_COUNT;
      this.scrollLayers.push(
        this.add
          .tileSprite(x, HEIGHT / 2, LANE_LINE_WIDTH, HEIGHT, TEX.laneDash)
          .setDepth(DEPTH.backdrop + 2)
      );
    }

    // Darkness at the top of the screen: traffic fades up out of it instead of
    // popping into existence at the screen edge.
    this.add
      .image(WIDTH / 2, 0, TEX.topFade)
      .setOrigin(0.5, 0)
      .setDisplaySize(WIDTH, 200)
      .setAlpha(0.9)
      .setDepth(DEPTH.effects);
  }

  private resetState(): void {
    this.state = 'playing';
    this.overlayShown = false;
    this.overlay.hide();
    this.distanceState = createDistance();
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.boostSpawnerState = createSpawner(MIN_BOOST_INTERVAL_MS, MAX_BOOST_INTERVAL_MS);
    this.gears = 0;
    this.distancePill.setValue('0 m');
    this.speedPill.setValue(`${this.displaySpeed(SPEED_BASE)}`);
    for (const car of this.traffic) {
      car.sprite.destroy();
      car.glow.destroy();
    }
    this.traffic = [];
    for (const boost of this.boosts) {
      this.destroyBoost(boost);
    }
    this.boosts = [];
    this.tweens.killTweensOf(this.speedPill.container);
    this.speedPill.container.setScale(1);
    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);
    // The crash spin-out is a tween on the player; kill it before replacing
    // the rotation it is still driving.
    this.tweens.killTweensOf(this.player);
    this.player.x = startX;
    this.player.setVisible(true).setRotation(0);
    this.headlights.setVisible(true).setX(startX);
    this.prevPlayerX = startX;
    this.dragging = false;
    this.lastMilestone = 0;
    playMusic(this, 'car');
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);

    const speed = SPEED_BASE + SPEED_PER_GEAR * this.gears;
    const travel = speed * (safeDelta / 1000);

    this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, Math.min(1, safeDelta / 110));
    this.headlights.x = this.player.x;

    this.distanceState = tickDistance(this.distanceState, speed, safeDelta);
    this.distancePill.setValue(`${getDistanceValue(this.distanceState)} m`);
    this.speedPill.setValue(`${this.displaySpeed(speed)}`);

    // Floored to the boundary rather than incremented by 500, so a single
    // frame that crosses two boundaries still leaves the counter honest.
    const metres = getDistanceValue(this.distanceState);
    if (metres >= this.lastMilestone + MILESTONE_METRES) {
      this.lastMilestone = Math.floor(metres / MILESTONE_METRES) * MILESTONE_METRES;
      playSfx(this, 'milestone');
    }

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnTraffic();
    }

    const boostSpawn = tickSpawner(this.boostSpawnerState, safeDelta);
    this.boostSpawnerState = boostSpawn.state;
    if (boostSpawn.shouldSpawn) {
      this.spawnBoost();
    }

    // The car is steered by pointer events, which all fired before update()
    // ran — while every traffic car was still at its pre-travel position. So
    // check the steer's swept path against where traffic WAS, then check
    // traffic's swept fall against where the car ended up. Splitting it this
    // way preserves the real order of the two movements; a single check
    // against the union of both spans would report phantom hits on a car the
    // player had already cleared.
    const playerRect = rectAt(this.player.x, PLAYER_Y, CAR_WIDTH, CAR_HEIGHT);
    const steerPath = sweepX(playerRect, this.prevPlayerX - CAR_WIDTH / 2);
    let crashed = this.traffic.some((car) => intersects(steerPath, this.carRect(car)));

    for (const car of this.traffic) {
      car.sprite.y += travel;
      car.glow.y = car.sprite.y + CAR_HEIGHT * 0.42;
    }

    if (!crashed) {
      crashed = this.traffic.some((car) => {
        const rect = this.carRect(car);
        return intersects(playerRect, sweepY(rect, rect.y - travel));
      });
    }

    this.updateBoosts(travel, playerRect, steerPath, crashed);

    // Scrolling the tile offset the other way moves the drawn road *down* the
    // screen, which is what makes the player look like the one moving.
    for (const layer of this.scrollLayers) {
      layer.tilePositionY -= travel;
    }

    if (crashed) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.traffic = this.traffic.filter((car) => {
      if (car.sprite.y > HEIGHT + CAR_HEIGHT) {
        car.sprite.destroy();
        car.glow.destroy();
        return false;
      }
      return true;
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.dragging = true;
      this.steerTo(pointer.x);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !this.dragging || !pointer.isDown) {
      return;
    }
    this.steerTo(pointer.x);
  }

  private steerTo(x: number): void {
    const half = CAR_WIDTH / 2;
    const next = Phaser.Math.Clamp(x, ROAD_LEFT + half, ROAD_LEFT + ROAD_WIDTH - half);
    // Lean into the lane change. Cosmetic — the collision box stays square on.
    const lean = Phaser.Math.Clamp((next - this.player.x) * 0.022, -0.2, 0.2);
    this.player.x = next;
    this.player.setRotation(lean);
  }

  private spawnTraffic(): void {
    const lane = pickSpawnLane(this.busyLanes(), LANE_COUNT);
    if (lane === null) {
      return;
    }

    const color = TRAFFIC_COLORS[Phaser.Math.Between(0, TRAFFIC_COLORS.length - 1)];
    const x = laneCenterX(lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);

    const glow = this.add
      .image(x, -CAR_HEIGHT, TEX.glow)
      .setDisplaySize(CAR_WIDTH * 2.2, CAR_HEIGHT * 0.9)
      .setTint(0xff4d4d)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add.image(x, -CAR_HEIGHT, ensureCarTexture(this, color)).setDepth(DEPTH.world);

    this.traffic.push({ sprite, glow, lane });
  }

  /**
   * Falls every pickup down the road, banks the ones the car reached, and
   * drops the ones that got past it. Collection uses the same two-phase swept
   * test the traffic gets, for the same reason: the steer and the road's
   * movement happened at different moments in the frame, and a pickup taken
   * at 700 px/s is one the car would otherwise tunnel straight through.
   */
  private updateBoosts(travel: number, playerRect: Rect, steerPath: Rect, crashed: boolean): void {
    let collected = 0;

    this.boosts = this.boosts.filter((boost) => {
      const before = this.boostRect(boost);
      boost.sprite.y += travel;
      boost.glow.y = boost.sprite.y;
      const after = this.boostRect(boost);

      // A crash ends the run this frame; a pickup chimed alongside it would
      // only muddy the moment.
      const taken =
        !crashed &&
        (intersects(steerPath, before) || intersects(playerRect, sweepY(after, before.y)));
      if (taken) {
        collected += 1;
        this.burstAt(boost.sprite.x, boost.sprite.y);
        this.destroyBoost(boost);
        return false;
      }

      if (boost.sprite.y > HEIGHT + BOOST_SIZE) {
        this.destroyBoost(boost);
        return false;
      }
      return true;
    });

    if (collected === 0) {
      return;
    }

    this.gears += collected;
    playSfx(this, 'levelup');
    // The pill is where the gain shows up as a number, so that is where the
    // eye is sent.
    this.tweens.killTweensOf(this.speedPill.container);
    this.speedPill.container.setScale(1);
    this.tweens.add({
      targets: this.speedPill.container,
      scale: 1.09,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private spawnBoost(): void {
    // Borrowing the traffic rule means pickups arrive in the calmer moments —
    // the ones where the detour is a real choice rather than a death sentence.
    const lane = pickSpawnLane(this.busyLanes(), LANE_COUNT);
    if (lane === null) {
      return;
    }

    const x = laneCenterX(lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);

    const glow = this.add
      .image(x, -BOOST_SIZE, TEX.glow)
      .setDisplaySize(BOOST_SIZE * 2.4, BOOST_SIZE * 2.4)
      .setTint(PALETTE.mint)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add.image(x, -BOOST_SIZE, TEX.boost).setDepth(DEPTH.world);

    this.tweens.add({
      targets: glow,
      alpha: 0.16,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.boosts.push({ sprite, glow, lane });
  }

  private destroyBoost(boost: BoostItem): void {
    // The glow carries a looping tween; kill it before the target goes away.
    this.tweens.killTweensOf(boost.glow);
    boost.glow.destroy();
    boost.sprite.destroy();
  }

  /** Mint sparks where a pickup was taken. */
  private burstAt(x: number, y: number): void {
    const sparks = this.add.particles(x, y, TEX.spark, {
      speed: { min: 60, max: 190 },
      lifespan: { min: 220, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [PALETTE.mint, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    });
    sparks.setDepth(DEPTH.effects);
    sparks.explode(14);
    this.time.delayedCall(700, () => sparks.destroy());
  }

  private boostRect(boost: BoostItem): Rect {
    return rectAt(boost.sprite.x, boost.sprite.y, BOOST_SIZE, BOOST_SIZE);
  }

  /**
   * Lanes that already hold something close enough to the top of the road
   * that a new arrival would land alongside it.
   *
   * Traffic and pickups count the same, in both directions. Everything on
   * the road falls at one speed, so whatever gap two objects spawn with is
   * the gap they keep for the rest of their lives: a disc dropped a
   * half-car behind a bumper stays a half-car behind that bumper all the way
   * down the screen. Grabbing it would mean entering the lane with no room
   * to leave — a trap dressed as a reward.
   */
  private busyLanes(): number[] {
    return [
      ...this.traffic.filter((car) => car.sprite.y < LANE_BLOCKED_ZONE).map((car) => car.lane),
      ...this.boosts.filter((boost) => boost.sprite.y < LANE_BLOCKED_ZONE).map((boost) => boost.lane),
    ];
  }

  private carRect(car: TrafficCar): Rect {
    return rectAt(car.sprite.x, car.sprite.y, CAR_WIDTH, CAR_HEIGHT);
  }

  /** Cosmetic readout only — the px/s speed scaled into believable km/h. */
  private displaySpeed(speed: number): number {
    return Math.round(speed / 2);
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    fadeOutMusic(this);
    playSfx(this, 'crash');
    // A beat behind the impact, so the two do not smear into one noise.
    this.time.delayedCall(260, () => playSfx(this, 'gameover'));

    const debris = this.add.particles(this.player.x, this.player.y, TEX.spark, {
      speed: { min: 80, max: 300 },
      lifespan: { min: 300, max: 800 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [ACCENT, 0xffffff, PALETTE.rose],
      blendMode: 'ADD',
      emitting: false,
    });
    debris.setDepth(DEPTH.effects);
    debris.explode(26);
    this.time.delayedCall(1100, () => debris.destroy());

    this.headlights.setVisible(false);
    this.cameras.main.shake(300, 0.016);
    this.cameras.main.flash(180, 255, 179, 71);
    // The wreck spins out rather than freezing mid-lane.
    this.tweens.add({
      targets: this.player,
      rotation: Phaser.Math.FloatBetween(-0.5, 0.5),
      duration: 380,
      ease: 'Quad.easeOut',
    });

    this.time.delayedCall(360, () => {
      if (this.state !== 'gameOver') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('CRASHED', 'Distance', `${getDistanceValue(this.distanceState)} m`);
    });
  }
}
