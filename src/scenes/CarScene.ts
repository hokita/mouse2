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
import { WIDTH } from '../gameConfig';
import { PALETTE } from '../ui/theme';
import {
  BOOST_SIZE,
  CAR_ART_HEIGHT,
  CAR_LENGTH,
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
import { CAMERA, LANE_COUNT, PLAYER_Y, ROAD_LEFT, ROAD_WIDTH, createRoad } from './car/road';
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

/**
 * How far up the road traffic first appears, in metres.
 *
 * Not a picture-making number but the game's oldest tuning one: the flat road
 * this grew out of dropped a car a length above the top of the screen and
 * scrolled a pixel a metre, which handed the player exactly this much warning
 * before a bumper. Everything about how the road is drawn has changed twice
 * since; how long you get to read it has not.
 */
const SPAWN_DEPTH = 838;

/**
 * A lane counts as blocked (and so is off-limits for a new arrival) while it
 * still holds something within this many metres of the spawn line — four car
 * lengths, so two cars in a lane never arrive nose-to-tail. It is also what
 * sets how often a spawn is refused, and so how thick the traffic gets.
 */
const LANE_BLOCKED_ZONE = CAR_LENGTH * 4;

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
// down the road the moment it resumes. Collision is swept (see update()), so
// this bound is about fairness — the player gets no chance to react to motion
// that happened while the tab was hidden — not about tunnelling.
const MAX_DELTA_MS = 100;

/** How far apart the distance chimes are. */
const MILESTONE_METRES = 500;

/** Behind the player and off the bottom of the screen; nothing to keep. */
const PASSED_DEPTH = -100;

/**
 * How hard a bend throws the car toward the outside of it, in pixels per
 * second at full tilt.
 *
 * The one place the corners reach into the driving rather than just the
 * picture. Kept gentle, and capped well below the speeds a good run reaches,
 * because steering here is a finger held at an absolute position: any drag at
 * all takes the car straight back, so the drift has to be something the player
 * corrects rather than something that takes the car away from them.
 */
const CENTRIFUGAL = 150;
/** The speed at which the drift is at full strength. */
const CENTRIFUGAL_FULL_SPEED = 300;

/** The shadow every car casts, with the sun dead ahead on the horizon. */
const SHADOW_COLOR = 0x2a1b3a;

/** Above every other thing on the road: nothing is nearer than the player. */
const PLAYER_DEPTH = DEPTH.world + 8;

type GameState = 'playing' | 'gameOver';

/**
 * Something standing on the road: traffic, or a pickup.
 *
 * It knows two things about where it is — how far up the road, and how far
 * from the road's centre line — and the road turns that into a place on
 * screen. Neither number changes when the road bends or climbs, which is the
 * point: a car in the middle lane stays in the middle lane through a corner
 * without anything having to think about the corner.
 *
 * Its art is a container so that a body and its shadow scale, fade and sort as
 * the one object they represent.
 */
interface RoadThing {
  art: Phaser.GameObjects.Container;
  lane: number;
  /** Metres of road between it and the player's front bumper. */
  z: number;
  /** Footprint: what it is hit at, in lateral units by metres. */
  width: number;
  length: number;
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
    this.palms = createPalmAvenue(this, this.road);

    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);

    // The car's own shadow, which is all that is left of what used to be a
    // headlight cone: the sun is up, and a beam thrown down a lit road reads
    // as a smear rather than as light.
    this.playerShadow = this.add
      .image(startX, PLAYER_Y, TEX.glow)
      .setDisplaySize(CAR_WIDTH * 1.5, CAR_ART_HEIGHT * 0.42)
      .setTint(SHADOW_COLOR)
      .setAlpha(0.42)
      .setDepth(PLAYER_DEPTH - 0.05);

    // Standing on the road at depth zero, seen from behind — which is the one
    // view of it the player ever has.
    this.player = this.add
      .image(startX, PLAYER_Y, ensureCarTexture(this, PLAYER_CAR_COLOR, { stripe: true }))
      .setOrigin(0.5, 1)
      .setDisplaySize(CAR_WIDTH, CAR_ART_HEIGHT)
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
    this.sky.update(this.road.sway(), 0);
    this.tweens.killTweensOf(this.speedPill.container);
    this.speedPill.container.setScale(1);
    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);
    // The crash spin-out is a tween on the player; kill it before replacing
    // the rotation it is still driving.
    this.tweens.killTweensOf(this.player);
    this.player.setVisible(true).setRotation(0);
    this.playerShadow.setVisible(true);
    this.steerTo(startX, { lean: false });
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
    const seconds = safeDelta / 1000;

    // One quantity now, not two: metres of road. The distance readout counts
    // them, the traffic closes them, and how many pixels of screen a metre is
    // worth is the projection's business rather than the game's.
    const speed = SPEED_BASE + SPEED_PER_GEAR * this.gears;
    const travel = speed * seconds;

    // The road moves first, before anything is stood on it: everything below
    // asks it where a given depth has ended up, and asking a road that is
    // still a frame behind would leave the traffic sliding about on it.
    this.road.advance(travel);

    this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, Math.min(1, safeDelta / 110));

    // A bend throws the car toward the outside of it. The road's own curve is
    // the only input: no bend, no drift.
    const lean = this.road.curveHere() * Math.min(1, speed / CENTRIFUGAL_FULL_SPEED);
    if (lean !== 0) {
      this.steerTo(this.player.x - lean * CENTRIFUGAL * seconds, { lean: false });
    }

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

    // Everything below is in road space: lateral offsets across the road, and
    // metres along it. Not screen space — the road bends and climbs, and a
    // crash that depended on where the picture happened to put a car would
    // change its mind on every corner. The player sits at depth zero and the
    // lanes are where they have always been, so these are the same numbers,
    // and the same swept tests, the flat road used.
    //
    // The car is steered by pointer events, which all fired before update()
    // ran — while every traffic car was still at its pre-travel depth. So
    // check the steer's swept path against where traffic WAS, then check
    // traffic's swept approach against where the car ended up. Splitting it
    // this way preserves the real order of the two movements; a single check
    // against the union of both spans would report phantom hits on a car the
    // player had already cleared.
    const playerRect = rectAt(this.player.x, 0, CAR_WIDTH, CAR_LENGTH);
    const steerPath = sweepX(playerRect, this.prevPlayerX - CAR_WIDTH / 2);
    let crashed = this.traffic.some((car) => intersects(steerPath, this.footprint(car)));

    for (const car of this.traffic) {
      car.z -= travel;
      this.place(car);
    }

    if (!crashed) {
      crashed = this.traffic.some((car) => {
        const rect = this.footprint(car);
        return intersects(playerRect, sweepY(rect, rect.y + travel));
      });
    }

    this.updateBoosts(travel, playerRect, steerPath, crashed);

    this.palms.advance(travel);
    this.sky.update(this.road.sway(), travel);

    if (crashed) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.traffic = this.traffic.filter((car) => {
      if (car.z < PASSED_DEPTH) {
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

  /**
   * Puts the car at `x`, or as near to it as the road allows. The player's own
   * row is the one the road is full width at, so these are its edges as drawn,
   * with no projection needed.
   */
  private steerTo(x: number, options: { lean?: boolean } = {}): void {
    const half = CAR_WIDTH / 2;
    const next = Phaser.Math.Clamp(x, ROAD_LEFT + half, ROAD_LEFT + ROAD_WIDTH - half);
    if (options.lean !== false) {
      // Lean into the lane change. Cosmetic — the collision box stays square
      // on. Drifting on a bend does not get one: the car is being carried
      // sideways, not turned.
      this.player.setRotation(Phaser.Math.Clamp((next - this.player.x) * 0.022, -0.2, 0.2));
    }
    this.player.x = next;
    this.playerShadow.x = next;
  }

  /**
   * Stands a thing on the road where it now is: leant into whatever bend it is
   * standing in, lifted over whatever hill, shrunk to its distance, faded into
   * the haze, and sorted so that nearer traffic draws over farther traffic.
   */
  private place(thing: RoadThing): void {
    const at = this.road.place(thing.z, laneCenterX(thing.lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH) - CAMERA.centerX);
    thing.art
      .setPosition(at.x, at.y)
      .setScale(at.scale)
      .setAlpha(1 - at.fog)
      .setDepth(DEPTH.world + Math.min(at.scale, 6))
      // Out of sight over a crest. It is still coming — the run does not care
      // what the player can see — but drawing it would put a distant car on
      // top of the road in front of the bonnet.
      .setVisible(at.visible);
  }

  private spawnTraffic(): void {
    const lane = pickSpawnLane(this.busyLanes(), LANE_COUNT);
    if (lane === null) {
      return;
    }

    const color = TRAFFIC_COLORS[Phaser.Math.Between(0, TRAFFIC_COLORS.length - 1)];

    // The shadow pools under the car rather than trailing off to one side:
    // the only light worth drawing for is the sun on the vanishing point
    // straight ahead, and it is directly behind everything on this road.
    const shadow = this.add
      .image(0, 0, TEX.glow)
      .setDisplaySize(CAR_WIDTH * 1.5, CAR_ART_HEIGHT * 0.42)
      .setTint(SHADOW_COLOR)
      .setAlpha(0.42);

    const body = this.add
      .image(0, 0, ensureCarTexture(this, color))
      .setOrigin(0.5, 1)
      .setDisplaySize(CAR_WIDTH, CAR_ART_HEIGHT);

    const car: RoadThing = {
      // The container's own origin is where the car meets the road, which is
      // what `place` positions and what the shadow sits on.
      art: this.add.container(0, 0, [shadow, body]),
      lane,
      z: SPAWN_DEPTH,
      width: CAR_WIDTH,
      length: CAR_LENGTH,
    };
    this.place(car);
    this.traffic.push(car);
  }

  /**
   * Brings every pickup down the road, banks the ones the car reached, and
   * drops the ones that got past it. Collection uses the same two-phase swept
   * test the traffic gets, for the same reason: the steer and the road's
   * movement happened at different moments in the frame, and a pickup taken
   * at speed is one the car would otherwise pass straight through.
   */
  private updateBoosts(travel: number, playerRect: Rect, steerPath: Rect, crashed: boolean): void {
    let collected = 0;

    this.boosts = this.boosts.filter((boost) => {
      const before = this.footprint(boost);
      boost.z -= travel;
      this.place(boost);
      const after = this.footprint(boost);

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

      if (boost.z < PASSED_DEPTH) {
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

    // Mint bloom behind the disc, so it reads as a prize. It pulses inside the
    // container rather than on it: the container's own alpha belongs to the
    // haze, and two things writing one alpha would leave the pickup flickering
    // in and out of the distance.
    const glow = this.add
      .image(0, -BOOST_SIZE * 0.5, TEX.glow)
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

    // Standing up off the road like a sign rather than lying on it: a disc
    // painted flat on the tarmac would be a sliver at any distance worth
    // seeing it from.
    const disc = this.add.image(0, 0, TEX.boost).setOrigin(0.5, 1);

    const boost: RoadThing = {
      art: this.add.container(0, 0, [glow, disc]),
      lane,
      z: SPAWN_DEPTH,
      width: BOOST_SIZE,
      length: BOOST_SIZE,
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
   * Lanes that already hold something close enough to the spawn line that a
   * new arrival would land alongside it.
   *
   * Traffic and pickups count the same, in both directions. Everything on the
   * road closes at one rate, so whatever gap two objects arrive with is the
   * gap they keep for the rest of their lives: a disc dropped a half-car
   * behind a bumper stays a half-car behind that bumper all the way down the
   * road. Grabbing it would mean entering the lane with no room to leave — a
   * trap dressed as a reward.
   */
  private busyLanes(): number[] {
    const blockedBeyond = SPAWN_DEPTH - LANE_BLOCKED_ZONE;
    return [...this.traffic, ...this.boosts]
      .filter((thing) => thing.z > blockedBeyond)
      .map((thing) => thing.lane);
  }

  /**
   * The patch of road a thing covers: across the road by its width, along it
   * by its length. Lateral offsets are read at the player's row, where the
   * road is full width, so a lane centre is the same number here as it is on
   * screen when the car reaches it.
   */
  private footprint(thing: RoadThing): Rect {
    const x = laneCenterX(thing.lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);
    return rectAt(x, thing.z, thing.width, thing.length);
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

    const debris = this.add.particles(this.player.x, PLAYER_Y - CAR_ART_HEIGHT / 2, TEX.spark, {
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
    // The wreck slews rather than freezing mid-lane.
    this.tweens.add({
      targets: this.player,
      rotation: Phaser.Math.FloatBetween(-0.35, 0.35),
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
