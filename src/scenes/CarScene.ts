import Phaser from 'phaser';
import { fadeOutMusic, playMusic, playSfx } from '../audio/bus';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { createDistance, getDistanceValue, tickDistance } from '../core/distance';
import type { DistanceState } from '../core/distance';
import { laneCenterX, pickSpawnLane } from '../core/lanes';
import { projectX, scaleAt } from '../core/perspective';
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
  ensureBoostTexture,
  ensureCarTexture,
  ensureFxTextures,
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
import { createPalmAvenue } from './car/palms';
import type { PalmAvenue } from './car/palms';
import {
  HORIZON_Y,
  LANE_COUNT,
  PERSPECTIVE,
  PLAYER_Y,
  ROAD_LEFT,
  ROAD_PX_PER_METRE,
  ROAD_WIDTH,
  createRoad,
} from './car/road';
import type { Road } from './car/road';
import { createSky } from './car/sky';
import type { Sky } from './car/sky';

const ACCENT = PALETTE.amber;

/** The player's car — exported so the menu can show the real thing. */
export const PLAYER_CAR_COLOR = PALETTE.amber;

// Deliberately no amber here: that is the player's own paint job, and traffic
// that shares it is traffic you stop seeing. No mint either — that belongs to
// the speed pickups, and a pickup you read as a car is one you swerve around.
// Each of these also stays clear of the white lane markings and of the warm
// grey asphalt behind them.
const TRAFFIC_COLORS = [PALETTE.rose, PALETTE.violet, PALETTE.cyan];

const MIN_SPAWN_INTERVAL_MS = 550;
const MAX_SPAWN_INTERVAL_MS = 1100;

// Everything arrives at the horizon, which is where the road begins.
const SPAWN_Y = HORIZON_Y;

// A lane counts as blocked (and so is off-limits for a new car) while it still
// holds traffic within this many pixels of the spawn line. Sized well above
// CAR_HEIGHT so two cars in the same lane never arrive nose-to-tail: every
// object moves down the screen at one rate, so the gap two of them are given
// here is the gap they keep all the way to the player.
//
// Four car-lengths where the flat road said three, and converted into road
// pixels rather than left as a screen distance, because both of those keep one
// number the same: how long a lane stays shut. That is what sets how often a
// spawn is refused, and so how thick the traffic gets and how often a pickup
// finds room to appear — the game is tuned around it. (The fourth length is
// not new strictness: traffic used to be spawned a full car above the top of
// the screen while the zone was measured from the screen edge, so a lane was
// always really shut for four lengths' worth of road.)
const LANE_BLOCKED_ZONE = CAR_HEIGHT * 4 * ROAD_PX_PER_METRE;

// Speed is a function of pickups collected, not of time survived, and it has
// no ceiling: every disc is another 10 km/h on the pill, for as long as you
// can keep taking them. Sit out every pickup and you crawl at SPEED_BASE
// forever. What ends a run is not topping out, it is that traffic covers the
// road from the horizon to your bumper in less and less time — a second of
// warning at 175 km/h, half that at 350.
const SPEED_BASE = 120;
const SPEED_PER_GEAR = 20;

const MIN_BOOST_INTERVAL_MS = 2_000;
const MAX_BOOST_INTERVAL_MS = 3_500;

// Caps how much sim time a single frame advances the road by, so a stalled
// frame (a backgrounded tab, say) doesn't teleport the whole field of traffic
// down the screen the moment it resumes. Collision is swept (see update()),
// so this bound is about fairness — the player gets no chance to react to
// motion that happened while the tab was hidden — not about tunnelling.
const MAX_DELTA_MS = 100;

/** How far apart the distance chimes are. */
const MILESTONE_METRES = 500;

// Scale is honest perspective right up to the point where honesty costs more
// than it buys: a car exactly on the horizon is a fraction of a pixel across,
// which is a flicker rather than a warning. Everything on the road is drawn at
// least this big. It only ever bites in the first few pixels of the journey,
// under the thickest of the haze.
const MIN_DRAW_SCALE = 0.2;

/** How far down the road something takes to fade up out of the haze. */
const HAZE_FADE_PX = 80;

/** The shadow every car casts, with the sun dead ahead on the horizon. */
const SHADOW_COLOR = 0x2a1b3a;

// Traffic is depth-sorted by how far down the road it is, so a nearer car
// always draws over a farther one — the lanes converge, and without this two
// cars that overlap near the horizon would take turns being in front. The step
// is small enough that the whole road, bumper to horizon, still fits in the gap
// between DEPTH.world and DEPTH.effects rather than climbing into the HUD.
const DEPTH_PER_PX = 0.005;
/** Above every other thing on the road: nothing is nearer than the player. */
const PLAYER_DEPTH = DEPTH.world + HEIGHT * DEPTH_PER_PX + 0.1;

type GameState = 'playing' | 'gameOver';

/**
 * Something standing on the road: traffic, or a pickup.
 *
 * Its art is a container so that a body, its shadow and any bloom are scaled,
 * faded and depth-sorted as the single object they represent — and so that the
 * one `place` below can handle both kinds.
 */
interface RoadThing {
  art: Phaser.GameObjects.Container;
  lane: number;
  /**
   * Footprint at 1:1, i.e. at the player's row. What it is drawn at and hit at
   * anywhere else is this scaled by its distance, which is the whole reason
   * the projection lives in core: art and hitbox cannot be allowed to
   * disagree about how much road a car takes up.
   */
  width: number;
  height: number;
}

export class CarScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private prevPlayerX!: number;
  private traffic: RoadThing[] = [];
  private boosts: RoadThing[] = [];
  private road!: Road;
  private sky!: Sky;
  private palms!: PalmAvenue;
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
    ensureBoostTexture(this);

    this.road = createRoad(this);
    this.sky = createSky(this);
    this.palms = createPalmAvenue(this);

    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);

    // The car's own shadow, which is all that is left of what used to be a
    // headlight cone: the sun is up, and a beam thrown down a lit road reads
    // as a smear rather than as light.
    this.playerShadow = this.add
      .image(startX, PLAYER_Y + CAR_HEIGHT * 0.4, TEX.glow)
      .setDisplaySize(CAR_WIDTH * 1.5, CAR_HEIGHT * 0.5)
      .setTint(SHADOW_COLOR)
      .setAlpha(0.38)
      .setDepth(PLAYER_DEPTH - 0.05);

    this.player = this.add
      .image(startX, PLAYER_Y, ensureCarTexture(this, PLAYER_CAR_COLOR, { stripe: true }))
      .setDepth(PLAYER_DEPTH);

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
      car.art.destroy();
    }
    this.traffic = [];
    for (const boost of this.boosts) {
      this.destroyBoost(boost);
    }
    this.boosts = [];
    this.road.reset();
    this.palms.reset();
    this.tweens.killTweensOf(this.speedPill.container);
    this.speedPill.container.setScale(1);
    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);
    // The crash spin-out is a tween on the player; kill it before replacing
    // the rotation it is still driving.
    this.tweens.killTweensOf(this.player);
    this.player.x = startX;
    this.player.setVisible(true).setRotation(0);
    this.playerShadow.setVisible(true).setX(startX);
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

    // Two different quantities, and the run depends on not confusing them:
    // `speed` is metres per second, which is what the readouts and the
    // distance count are in, and `travel` is the pixels of road that buys.
    const speed = SPEED_BASE + SPEED_PER_GEAR * this.gears;
    const travel = speed * (safeDelta / 1000) * ROAD_PX_PER_METRE;

    this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, Math.min(1, safeDelta / 110));
    this.playerShadow.x = this.player.x;

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
    let crashed = this.traffic.some((car) => intersects(steerPath, this.thingRect(car)));

    for (const car of this.traffic) {
      car.art.y += travel;
      this.place(car);
    }

    if (!crashed) {
      crashed = this.traffic.some((car) => {
        const rect = this.thingRect(car);
        return intersects(playerRect, sweepY(rect, rect.y - travel));
      });
    }

    this.updateBoosts(travel, playerRect, steerPath, crashed);

    this.road.scroll(travel);
    this.palms.scroll(travel);
    this.sky.drift(travel);

    if (crashed) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.traffic = this.traffic.filter((car) => {
      if (car.art.y > HEIGHT + CAR_HEIGHT) {
        car.art.destroy();
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
    // The player's own row is the one the road is full width at, so these are
    // the road's edges as drawn, with no projection needed.
    const next = Phaser.Math.Clamp(x, ROAD_LEFT + half, ROAD_LEFT + ROAD_WIDTH - half);
    // Lean into the lane change. Cosmetic — the collision box stays square on.
    const lean = Phaser.Math.Clamp((next - this.player.x) * 0.022, -0.2, 0.2);
    this.player.x = next;
    this.player.setRotation(lean);
  }

  /**
   * Stands a thing on the road at the row its art has reached: scaled to its
   * distance, slid onto its lane's projected centre, faded up out of the haze,
   * and given a depth that keeps nearer traffic in front of farther traffic.
   */
  private place(thing: RoadThing): void {
    const y = thing.art.y;
    const scale = Math.max(MIN_DRAW_SCALE, scaleAt(PERSPECTIVE, y));
    thing.art
      .setX(projectX(PERSPECTIVE, laneCenterX(thing.lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH), y))
      .setScale(scale)
      .setAlpha(Phaser.Math.Clamp((y - HORIZON_Y) / HAZE_FADE_PX, 0, 1))
      .setDepth(DEPTH.world + y * DEPTH_PER_PX);
  }

  private spawnTraffic(): void {
    const lane = pickSpawnLane(this.busyLanes(), LANE_COUNT);
    if (lane === null) {
      return;
    }

    const color = TRAFFIC_COLORS[Phaser.Math.Between(0, TRAFFIC_COLORS.length - 1)];

    // The shadow falls toward the camera, because the only light worth drawing
    // for is the sun sitting on the vanishing point straight ahead.
    const shadow = this.add
      .image(0, CAR_HEIGHT * 0.4, TEX.glow)
      .setDisplaySize(CAR_WIDTH * 1.5, CAR_HEIGHT * 0.5)
      .setTint(SHADOW_COLOR)
      .setAlpha(0.38);

    const body = this.add.image(0, 0, ensureCarTexture(this, color));

    const car: RoadThing = {
      art: this.add.container(0, SPAWN_Y, [shadow, body]),
      lane,
      width: CAR_WIDTH,
      height: CAR_HEIGHT,
    };
    this.place(car);
    this.traffic.push(car);
  }

  /**
   * Falls every pickup down the road, banks the ones the car reached, and
   * drops the ones that got past it. Collection uses the same two-phase swept
   * test the traffic gets, for the same reason: the steer and the road's
   * movement happened at different moments in the frame, and a pickup taken
   * at speed is one the car would otherwise tunnel straight through.
   */
  private updateBoosts(travel: number, playerRect: Rect, steerPath: Rect, crashed: boolean): void {
    let collected = 0;

    this.boosts = this.boosts.filter((boost) => {
      const before = this.thingRect(boost);
      boost.art.y += travel;
      this.place(boost);
      const after = this.thingRect(boost);

      // A crash ends the run this frame; a pickup chimed alongside it would
      // only muddy the moment.
      const taken =
        !crashed &&
        (intersects(steerPath, before) || intersects(playerRect, sweepY(after, before.y)));
      if (taken) {
        collected += 1;
        this.burstAt(boost.art.x, boost.art.y);
        this.destroyBoost(boost);
        return false;
      }

      if (boost.art.y > HEIGHT + BOOST_SIZE) {
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

    // Mint bloom under the disc, so it reads as a prize. It pulses inside the
    // container rather than on it: the container's own alpha belongs to the
    // haze, and two things writing one alpha would leave the pickup flickering
    // in and out of the distance.
    const glow = this.add
      .image(0, 0, TEX.glow)
      .setDisplaySize(BOOST_SIZE * 2.4, BOOST_SIZE * 2.4)
      .setTint(PALETTE.mint)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: glow,
      alpha: 0.16,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const disc = this.add.image(0, 0, TEX.boost);

    const boost: RoadThing = {
      art: this.add.container(0, SPAWN_Y, [glow, disc]),
      lane,
      width: BOOST_SIZE,
      height: BOOST_SIZE,
    };
    this.place(boost);
    this.boosts.push(boost);
  }

  private destroyBoost(boost: RoadThing): void {
    // The bloom carries a looping tween; kill it before the target goes away.
    for (const child of boost.art.list) {
      this.tweens.killTweensOf(child);
    }
    boost.art.destroy();
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

  /**
   * Lanes that already hold something close enough to the horizon that a new
   * arrival would land alongside it.
   *
   * Traffic and pickups count the same, in both directions. Everything on the
   * road moves at one rate, so whatever gap two objects arrive with is the gap
   * they keep for the rest of their lives: a disc dropped a half-car behind a
   * bumper stays a half-car behind that bumper all the way down the road.
   * Grabbing it would mean entering the lane with no room to leave — a trap
   * dressed as a reward.
   */
  private busyLanes(): number[] {
    const blockedBelow = SPAWN_Y + LANE_BLOCKED_ZONE;
    return [...this.traffic, ...this.boosts]
      .filter((thing) => thing.art.y < blockedBelow)
      .map((thing) => thing.lane);
  }

  /**
   * The box a thing occupies, taken from the size it is actually drawn at.
   * Read from the art rather than recomputed so that nothing the player can
   * see can ever be out of step with what the collision test believes.
   */
  private thingRect(thing: RoadThing): Rect {
    const scale = thing.art.scaleX;
    return rectAt(thing.art.x, thing.art.y, thing.width * scale, thing.height * scale);
  }

  /** Cosmetic readout only — the metres-per-second scaled into km/h. */
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
