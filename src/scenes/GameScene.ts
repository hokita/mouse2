import Phaser from 'phaser';
import { createScore, addPoints, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { spawnRange } from '../core/difficulty';
import { fanVelocities } from '../core/spread';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { sweepX, sweepY } from '../core/sweep';
import { movingRectHitsRect } from '../core/sweptRect';
import { wobbleX } from '../core/wobble';
import { createLives, hit, tickLives, isInvincible } from '../core/lives';
import type { LivesState } from '../core/lives';
import { WIDTH, HEIGHT } from '../gameConfig';
import { PALETTE } from '../ui/theme';
import {
  SHARD_HEIGHT,
  SHARD_WIDTH,
  SHIP_SIZE,
  TEX,
  ensureFxTextures,
  ensureShardTexture,
  ensureShipTexture,
} from '../ui/textures';
import {
  DEPTH,
  STAT_PILL_HEIGHT,
  createGameOverOverlay,
  createStarBackdrop,
  createStatPill,
  transitionTo,
} from '../ui/widgets';
import type { GameOverOverlay, Starfield, StatPill } from '../ui/widgets';

const ACCENT = PALETTE.cyan;

const PLAYER_SIZE = SHIP_SIZE;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_START_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
// The ship flies almost the whole screen, but stops short of the score and
// hearts pills so it can never hide the HUD. Derived from the pills' own
// geometry rather than eyeballed, so growing the ship or the pills keeps the
// clearance instead of silently eating it.
const HUD_TOP = 18;
const HUD_CLEARANCE = 18;
const PLAYER_MIN_Y = HUD_TOP + STAT_PILL_HEIGHT + PLAYER_SIZE / 2 + HUD_CLEARANCE;
// The shard texture is 30×50, but the design calls for ~50px-wide targets
// that 3–5 year olds can actually hit — so enemies render the shard scaled
// up uniformly and the hitbox tracks the displayed size (art = hitbox).
const ENEMY_SCALE = 5 / 3;
const ENEMY_WIDTH = SHARD_WIDTH * ENEMY_SCALE;
const ENEMY_HEIGHT = SHARD_HEIGHT * ENEMY_SCALE;
// Faster than the old 60: it makes the game harder from the first second
// (the spawn ramp alone only bites late in a run) and it shortens each
// enemy's time on screen, which is what keeps the spawn floor from piling up
// into an impassable wall. See the population note in core/difficulty.ts.
const ENEMY_FALL_SPEED = 90;
const ENEMY_WOBBLE_AMPLITUDE = 60;
const ENEMY_WOBBLE_PERIOD_MS = 2000;
const ENEMY_MIN_FIRE_INTERVAL_MS = 2000;
const ENEMY_MAX_FIRE_INTERVAL_MS = 4000;

/** Enemies come in three flavours purely so the field never looks uniform. */
const HAZARD_COLORS = [PALETTE.violet, PALETTE.amber, PALETTE.mint];

// The tank is the same shard at 1.6x, so it reads as "the big one" rather
// than a different creature. Rose is genuinely reserved for it — it is absent
// from HAZARD_COLORS above and the HUD pills use the ship's cyan — so the only
// red thing on screen is the one that takes five shots.
const TANK_SCALE = ENEMY_SCALE * 1.6;
const TANK_WIDTH = SHARD_WIDTH * TANK_SCALE;
const TANK_HEIGHT = SHARD_HEIGHT * TANK_SCALE;
const TANK_COLOR = PALETTE.rose;
const TANK_CHANCE = 0.1;
const TANK_HP = 5;
// 30 points a bullet against an ordinary enemy's 10. At 50 the tank paid the
// same per bullet as a normal while having 2.6x the body to stand near, so
// the correct play was to never shoot one — which would have made the
// headline enemy a tax rather than a choice.
const TANK_KILL_POINTS = 150;
const TANK_FLASH_MS = 120;
const TANK_MIN_FIRE_INTERVAL_MS = 2500;
const TANK_MAX_FIRE_INTERVAL_MS = 4000;
const TANK_SPREAD_COUNT = 5;
const TANK_SPREAD_RADIANS = Phaser.Math.DegToRad(80);

// Caps how much sim time a single frame advances timers and movement by, so
// a stalled frame (e.g. a backgrounded tab) can't teleport objects. At the
// cap, the fastest closing pair (a 500px/s player bullet vs. a 90px/s
// falling enemy) closes 59px in one step, under the ~99px combined height of
// the bullet (16) and an ordinary enemy (~83); a tank is taller still, so it
// has more margin, not less. The kill check sweeps both sides' frame motion
// anyway, and the player's own path is swept exactly (core/sweptRect), so
// nothing can tunnel through a collision target.
const MAX_DELTA_MS = 100;
const PLAYER_FIRE_INTERVAL_MS = 400;
const PLAYER_BULLET_SPEED = 500;
const PLAYER_BULLET_WIDTH = 8;
const PLAYER_BULLET_HEIGHT = 16;
const KILL_POINTS = 10;
const ENEMY_BULLET_SPEED = 150;
const ENEMY_BULLET_SIZE = 10;
const STARTING_LIVES = 3;
const INVINCIBILITY_MS = 1500;

type GameState = 'playing' | 'gameOver';

/** Enemy bullets travel on an arbitrary heading so tanks can fire a fan. */
interface EnemyBullet {
  rect: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
}

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  /** Soft halo trailing the shard; purely decorative. */
  halo: Phaser.GameObjects.Image;
  color: number;
  baseX: number;
  /** x before this frame's wobble step — the bullet kill check sweeps it. */
  prevX: number;
  elapsedMs: number;
  fireState: SpawnerState;
  kind: 'normal' | 'tank';
  /** Player bullets still needed to destroy it. */
  hp: number;
  /** Displayed size, which is also the hitbox — see ENEMY_SCALE. */
  width: number;
  height: number;
  /** Pending clear of a damage flash, so a later hit can cancel it. */
  flashTimer?: Phaser.Time.TimerEvent;
}

export class GameScene extends Phaser.Scene {
  private stars!: Starfield;
  private player!: Phaser.GameObjects.Image;
  private thruster!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prevPlayerX!: number;
  private prevPlayerY!: number;
  private enemies: Enemy[] = [];
  private playerBullets: Phaser.GameObjects.Rectangle[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private fireState!: SpawnerState;
  private scoreState!: ScoreState;
  private spawnerState!: SpawnerState;
  private scorePill!: StatPill;
  private livesState!: LivesState;
  private livesPill!: StatPill;
  private overlay!: GameOverOverlay;
  private overlayShown = false;
  private state!: GameState;
  private dragging = false;
  private elapsedMs!: number;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.stars = createStarBackdrop(this);
    ensureFxTextures(this);

    this.add
      .image(WIDTH / 2, 0, TEX.topFade)
      .setOrigin(0.5, 0)
      .setDisplaySize(WIDTH, 200)
      .setAlpha(0.9)
      .setDepth(DEPTH.effects);

    this.thruster = this.add.particles(0, 0, TEX.spark, {
      speedY: { min: 70, max: 190 },
      speedX: { min: -22, max: 22 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 420,
      frequency: 26,
      tint: [ACCENT, PALETTE.violet],
      blendMode: 'ADD',
    });
    this.thruster.setDepth(DEPTH.world - 1);

    // Above the top fade, not merely above the world: the ship can now fly
    // into that vignette, and it is there to soften incoming hazards, not to
    // wash out the thing the child is steering.
    this.player = this.add
      .image(WIDTH / 2, PLAYER_START_Y, ensureShipTexture(this))
      .setDepth(DEPTH.effects + 1);
    this.thruster.startFollow(this.player, 0, PLAYER_SIZE / 2 - 6);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.scorePill = createStatPill(this, {
      x: HUD_TOP,
      y: HUD_TOP,
      width: 150,
      label: 'Score',
      accent: ACCENT,
    });

    this.livesPill = createStatPill(this, {
      x: WIDTH - HUD_TOP,
      y: HUD_TOP,
      width: 130,
      label: 'Hearts',
      align: 'right',
      // The ship's own cyan, not rose: the hearts belong to the player, and
      // rose has to mean "tank" and nothing else.
      accent: ACCENT,
    });

    this.overlay = createGameOverOverlay(this, {
      accent: ACCENT,
      onRestart: () => this.resetState(),
      onMenu: () => transitionTo(this, 'MenuScene'),
      // Tracks the card rather than just the run being over: the card animates
      // in a beat after the crash, and these buttons should mean nothing until
      // it is up. Phaser will not hit-test them while the overlay is hidden
      // anyway, so this is a statement of intent, not the thing holding the
      // line.
      isArmed: () => this.state === 'gameOver' && this.overlayShown,
    });

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.resetState();
  }

  private resetState(): void {
    this.state = 'playing';
    this.overlayShown = false;
    this.overlay.hide();
    this.scoreState = createScore();
    this.elapsedMs = 0;
    const opening = spawnRange(0);
    this.spawnerState = createSpawner(opening.min, opening.max);
    this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    this.scorePill.setValue('0');
    this.livesState = createLives(STARTING_LIVES);
    this.updateLivesPill();
    for (const enemy of this.enemies) {
      enemy.flashTimer?.remove();
      enemy.sprite.destroy();
      enemy.halo.destroy();
    }
    this.enemies = [];
    for (const bullet of this.playerBullets) {
      bullet.destroy();
    }
    this.playerBullets = [];
    for (const bullet of this.enemyBullets) {
      bullet.rect.destroy();
    }
    this.enemyBullets = [];
    this.player.x = WIDTH / 2;
    this.player.y = PLAYER_START_Y;
    this.player.setVisible(true).setAlpha(1).setRotation(0);
    this.prevPlayerX = WIDTH / 2;
    this.prevPlayerY = PLAYER_START_Y;
    this.dragging = false;
    this.thruster.start();
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);
    this.elapsedMs += safeDelta;

    // The bank applied while steering (see movePlayerTo) relaxes back to level
    // as soon as the thumb stops moving. Cosmetic only — the collision box is
    // axis-aligned whatever the sprite is doing.
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, Math.min(1, safeDelta / 110));

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnEnemy();
      // Redraw the next wait from the range the run has reached. Rebuilding
      // discards the spawner's sub-frame carryover, which is far smaller than
      // the interval it is folded into.
      const range = spawnRange(this.elapsedMs);
      this.spawnerState = createSpawner(range.min, range.max);
    }

    if (this.dragging && this.input.activePointer.isDown) {
      const fireResult = tickSpawner(this.fireState, safeDelta);
      this.fireState = fireResult.state;
      if (fireResult.shouldSpawn) {
        this.firePlayerBullet();
      }
    }

    const fallDistance = ENEMY_FALL_SPEED * (safeDelta / 1000);
    // The starfield drifts at a fraction of the enemy speed, so the
    // background reads as far away rather than as part of the hazard layer.
    this.stars.scroll(fallDistance * 0.22);

    // All of this frame's player movement happens via pointer events fired
    // before update() runs, while every enemy and bullet was still at its
    // pre-move position — so check the player's path against where things
    // WERE, not where they're about to land.
    //
    // The path is swept exactly rather than as the union of its endpoints: a
    // tap teleports the ship the length of the screen, and an axis-aligned
    // union of those two rects would sweep up everything in the box between
    // them, costing hearts for collisions that never happened.
    const playerRect = rectAt(this.player.x, this.player.y, PLAYER_SIZE, PLAYER_SIZE);
    const prevPlayerRect = rectAt(this.prevPlayerX, this.prevPlayerY, PLAYER_SIZE, PLAYER_SIZE);
    let collided = this.enemies.some((enemy) =>
      movingRectHitsRect(prevPlayerRect, playerRect, this.enemyRect(enemy))
    );

    // Bullets fired this frame are collected separately and appended after
    // the enemy-bullet collision pass below: a brand-new bullet postdates the
    // player's drag and hasn't moved yet, so testing it against that
    // historical path could consume a heart the player never earned.
    const firedThisFrame: EnemyBullet[] = [];
    for (const enemy of this.enemies) {
      enemy.prevX = enemy.sprite.x;
      enemy.elapsedMs += safeDelta;
      enemy.sprite.y += fallDistance;
      enemy.sprite.x = wobbleX(enemy.baseX, enemy.elapsedMs, ENEMY_WOBBLE_AMPLITUDE, ENEMY_WOBBLE_PERIOD_MS);
      enemy.halo.x = enemy.sprite.x;
      enemy.halo.y = enemy.sprite.y - enemy.height * 0.15;

      const enemyFire = tickSpawner(enemy.fireState, safeDelta);
      enemy.fireState = enemyFire.state;
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const shots =
          enemy.kind === 'tank'
            ? fanVelocities(TANK_SPREAD_COUNT, TANK_SPREAD_RADIANS, ENEMY_BULLET_SPEED)
            : fanVelocities(1, 0, ENEMY_BULLET_SPEED);
        for (const { vx, vy } of shots) {
          const rect = this.add.rectangle(
            enemy.sprite.x,
            enemy.sprite.y + enemy.height / 2 + ENEMY_BULLET_SIZE / 2,
            ENEMY_BULLET_SIZE,
            ENEMY_BULLET_SIZE,
            PALETTE.amber
          );
          rect.setDepth(DEPTH.world);
          firedThisFrame.push({ rect, vx, vy });
        }
      }
    }

    for (const bullet of this.playerBullets) {
      bullet.y -= PLAYER_BULLET_SPEED * (safeDelta / 1000);
    }

    // The callback below reassigns this.enemies mid-iteration; that's safe
    // because this filter iterates a snapshot of playerBullets and each
    // callback re-reads this.enemies fresh via find(), so a killed enemy is
    // immediately out of consideration for later bullets in the same frame.
    const bulletTravel = PLAYER_BULLET_SPEED * (safeDelta / 1000);
    this.playerBullets = this.playerBullets.filter((bullet) => {
      // Both bullet and enemy moved this frame, so endpoint rects alone can
      // let a grazing shot cross an enemy's corner without either endpoint
      // overlapping. Sweep each over its own frame motion instead; the AABB
      // union is slightly generous at the corners, which errs toward
      // awarding the kid their kill — the right direction here.
      const bulletSwept = sweepY(
        rectAt(bullet.x, bullet.y, PLAYER_BULLET_WIDTH, PLAYER_BULLET_HEIGHT),
        bullet.y + bulletTravel - PLAYER_BULLET_HEIGHT / 2
      );
      const target = this.enemies.find((enemy) => {
        // Nothing dies before it has been seen. Without this the player can
        // park under the spawn line and clear enemies while they are still
        // above the canvas: the score climbs with no on-screen event to
        // explain it, and camping up there becomes strictly safe.
        if (enemy.sprite.y + enemy.height / 2 <= 0) {
          return false;
        }
        const rect = this.enemyRect(enemy);
        return intersects(bulletSwept, sweepY(sweepX(rect, enemy.prevX - enemy.width / 2), rect.y - fallDistance));
      });
      if (target) {
        bullet.destroy();
        target.hp -= 1;
        if (target.hp > 0) {
          this.flashEnemy(target);
          return false;
        }
        this.explodeEnemy(target);
        this.enemies = this.enemies.filter((enemy) => enemy !== target);
        this.scoreState = addPoints(
          this.scoreState,
          target.kind === 'tank' ? TANK_KILL_POINTS : KILL_POINTS
        );
        this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);
        return false;
      }
      // Only discard an off-screen bullet AFTER the swept check: a capped
      // frame can carry a bullet past the top edge while crossing an enemy
      // that has just peeked in, and that crossing must still award the kill.
      if (bullet.y < -PLAYER_BULLET_HEIGHT) {
        bullet.destroy();
        return false;
      }
      return true;
    });

    let shotByEnemy = false;
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      // The player's drag movement happened before update(), while this
      // bullet was still at its pre-move position — so, as with the enemy
      // checks, test the player's swept path against where the bullet WAS
      // before also checking final rects after the move.
      const sweptHit = movingRectHitsRect(
        prevPlayerRect,
        playerRect,
        rectAt(bullet.rect.x, bullet.rect.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE)
      );
      bullet.rect.x += bullet.vx * (safeDelta / 1000);
      bullet.rect.y += bullet.vy * (safeDelta / 1000);
      // The hit is settled BEFORE the off-screen cull: a bullet that touched
      // the player on its way out — reachable now that the ship can sit at
      // the bottom edge, and that fan bullets carry sideways speed — has
      // already earned its damage and must not be thrown away undelivered.
      if (
        sweptHit ||
        intersects(rectAt(bullet.rect.x, bullet.rect.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE), playerRect)
      ) {
        bullet.rect.destroy();
        shotByEnemy = true;
        return false;
      }
      if (
        bullet.rect.y > HEIGHT + ENEMY_BULLET_SIZE ||
        bullet.rect.y < -ENEMY_BULLET_SIZE ||
        bullet.rect.x < -ENEMY_BULLET_SIZE ||
        bullet.rect.x > WIDTH + ENEMY_BULLET_SIZE
      ) {
        bullet.rect.destroy();
        return false;
      }
      return true;
    });
    // Only now do this frame's fresh bullets join the pool — see the note at
    // the spawn site.
    this.enemyBullets.push(...firedThisFrame);

    // The enemy's fall happens after the player has already settled at its
    // final position for this frame, so check the fall's swept path against
    // the player's resting position, not its full swept range.
    if (!collided) {
      collided = this.enemies.some((enemy) => {
        const rect = this.enemyRect(enemy);
        return intersects(playerRect, sweepY(rect, rect.y - fallDistance));
      });
    }

    this.prevPlayerX = this.player.x;
    this.prevPlayerY = this.player.y;

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + enemy.height) {
        enemy.sprite.destroy();
        enemy.halo.destroy();
        return false;
      }
      return true;
    });

    this.livesState = tickLives(this.livesState, safeDelta);
    if (collided || shotByEnemy) {
      const result = hit(this.livesState, INVINCIBILITY_MS);
      this.livesState = result.state;
      if (result.tookHit) {
        this.updateLivesPill();
        this.cameras.main.shake(140, 0.006);
      }
      if (result.dead) {
        this.triggerGameOver();
      }
    }

    // Blink while invincible so kids can see the shield; solid otherwise.
    // Gated on 'playing' because triggerGameOver() (above, on this same
    // frame if the killing hit just landed) hides the player for the crash
    // sequence; without this gate the blink expression would run afterward
    // in the same call and fight that.
    if (this.state === 'playing') {
      this.player.setAlpha(isInvincible(this.livesState) && Math.floor(_time / 100) % 2 === 0 ? 0.3 : 1);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.dragging = true;
      this.movePlayerTo(pointer.x, pointer.y);
      this.firePlayerBullet();
      this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !this.dragging || !pointer.isDown) {
      return;
    }
    this.movePlayerTo(pointer.x, pointer.y);
  }

  private movePlayerTo(x: number, y: number): void {
    const half = PLAYER_SIZE / 2;
    const next = Phaser.Math.Clamp(x, half, WIDTH - half);
    const nextY = Phaser.Math.Clamp(y, PLAYER_MIN_Y, HEIGHT - half);
    // Bank into the turn — the ship leans toward wherever the thumb pulls it.
    // Horizontal only: a climb or dive should not roll the ship.
    const lean = Phaser.Math.Clamp((next - this.player.x) * 0.03, -0.28, 0.28);
    this.player.x = next;
    this.player.y = nextY;
    this.player.setRotation(lean);
  }

  private firePlayerBullet(): void {
    const bullet = this.add.rectangle(
      this.player.x,
      this.player.y - PLAYER_SIZE / 2 - PLAYER_BULLET_HEIGHT / 2,
      PLAYER_BULLET_WIDTH,
      PLAYER_BULLET_HEIGHT,
      ACCENT
    );
    bullet.setDepth(DEPTH.world);
    this.playerBullets.push(bullet);
  }

  private spawnEnemy(): void {
    const isTank = Phaser.Math.FloatBetween(0, 1) < TANK_CHANCE;
    const width = isTank ? TANK_WIDTH : ENEMY_WIDTH;
    const height = isTank ? TANK_HEIGHT : ENEMY_HEIGHT;
    const color = isTank
      ? TANK_COLOR
      : HAZARD_COLORS[Phaser.Math.Between(0, HAZARD_COLORS.length - 1)];

    // Spawning baseX inside the wobble margin keeps the whole wobble arc on
    // screen, so no per-frame clamping is needed.
    const margin = width / 2 + ENEMY_WOBBLE_AMPLITUDE;
    const baseX = Phaser.Math.Between(margin, WIDTH - margin);

    // Kept close to the body and faint. An additive glow 2.6x the sprite's
    // width stops being a highlight once a dozen of them share the screen —
    // it becomes a wash that hides the very hitboxes the child is reading,
    // and oversells the tank's size relative to what actually hurts.
    const halo = this.add
      .image(baseX, -height, TEX.glow)
      .setDisplaySize(width * 1.6, height * 1.3)
      .setTint(color)
      .setAlpha(isTank ? 0.32 : 0.22)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add
      .image(baseX, -height, ensureShardTexture(this, color))
      .setScale(isTank ? TANK_SCALE : ENEMY_SCALE)
      .setDepth(DEPTH.world);

    this.enemies.push({
      sprite,
      halo,
      color,
      baseX,
      prevX: baseX,
      elapsedMs: 0,
      fireState: createSpawner(
        isTank ? TANK_MIN_FIRE_INTERVAL_MS : ENEMY_MIN_FIRE_INTERVAL_MS,
        isTank ? TANK_MAX_FIRE_INTERVAL_MS : ENEMY_MAX_FIRE_INTERVAL_MS
      ),
      kind: isTank ? 'tank' : 'normal',
      hp: isTank ? TANK_HP : 1,
      width,
      height,
    });
  }

  private enemyRect(enemy: Enemy): Rect {
    return rectAt(enemy.sprite.x, enemy.sprite.y, enemy.width, enemy.height);
  }

  /** Destroys a shot-down enemy with a short burst in its own colour. */
  private explodeEnemy(enemy: Enemy): void {
    const burst = this.add.particles(enemy.sprite.x, enemy.sprite.y, TEX.spark, {
      speed: { min: 60, max: 220 },
      lifespan: { min: 200, max: 450 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [enemy.color, PALETTE.text],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(DEPTH.effects);
    burst.explode(12);
    this.time.delayedCall(600, () => burst.destroy());
    enemy.flashTimer?.remove();
    enemy.sprite.destroy();
    enemy.halo.destroy();
  }

  /** White pop on a hit that did not kill, so the tank reads as damaged. */
  private flashEnemy(enemy: Enemy): void {
    // Each flash owns its timer and cancels the one before it. Without this,
    // two hits in quick succession — easy, since tapping fires outside the
    // auto-fire cadence — let the first hit's timer clear the second hit's
    // tint early, dimming the feedback exactly when the tank is being shot
    // fastest.
    enemy.flashTimer?.remove();
    enemy.sprite.setTintFill(PALETTE.text);
    enemy.flashTimer = this.time.delayedCall(TANK_FLASH_MS, () => {
      // The enemy may have died — or the whole run been reset — inside the
      // flash window, and a destroyed sprite must not be tinted.
      if (enemy.sprite.active) {
        enemy.sprite.clearTint();
      }
    });
  }

  private updateLivesPill(): void {
    this.livesPill.setValue('♥'.repeat(Math.max(0, this.livesState.lives)));
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.thruster.stop();

    const burst = this.add.particles(this.player.x, this.player.y, TEX.spark, {
      speed: { min: 90, max: 340 },
      lifespan: { min: 300, max: 700 },
      scale: { start: 0.95, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [ACCENT, PALETTE.text, PALETTE.violet],
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(DEPTH.effects);
    burst.explode(30);
    this.time.delayedCall(1000, () => burst.destroy());

    this.player.setVisible(false);
    this.cameras.main.shake(240, 0.012);
    this.cameras.main.flash(160, 69, 224, 255);

    // Let the explosion read before the card covers it.
    this.time.delayedCall(320, () => {
      if (this.state !== 'gameOver') {
        return;
      }
      this.overlayShown = true;
      this.overlay.show('GAME OVER', 'Score', `${getScoreValue(this.scoreState)}`);
    });
  }
}
