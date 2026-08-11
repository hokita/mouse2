import Phaser from 'phaser';
import { createScore, addPoints, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { sweepX, sweepY } from '../core/sweep';
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
import { DEPTH, createGameOverOverlay, createStarBackdrop, createStatPill, transitionTo } from '../ui/widgets';
import type { GameOverOverlay, Starfield, StatPill } from '../ui/widgets';

const ACCENT = PALETTE.cyan;

const PLAYER_SIZE = SHIP_SIZE;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
// The shard texture is 30×50, but the design calls for ~50px-wide targets
// that 3–5 year olds can actually hit — so enemies render the shard scaled
// up uniformly and the hitbox tracks the displayed size (art = hitbox).
const ENEMY_SCALE = 5 / 3;
const ENEMY_WIDTH = SHARD_WIDTH * ENEMY_SCALE;
const ENEMY_HEIGHT = SHARD_HEIGHT * ENEMY_SCALE;
const ENEMY_FALL_SPEED = 60;
const ENEMY_WOBBLE_AMPLITUDE = 60;
const ENEMY_WOBBLE_PERIOD_MS = 2000;
const ENEMY_MIN_SPAWN_INTERVAL_MS = 1500;
const ENEMY_MAX_SPAWN_INTERVAL_MS = 2500;
const ENEMY_MIN_FIRE_INTERVAL_MS = 2000;
const ENEMY_MAX_FIRE_INTERVAL_MS = 4000;

/** Enemies come in four flavours purely so the field never looks uniform. */
const HAZARD_COLORS = [PALETTE.rose, PALETTE.violet, PALETTE.amber, PALETTE.mint];

// Caps how much sim time a single frame advances timers and movement by, so
// a stalled frame (e.g. a backgrounded tab) can't teleport objects. At the
// cap, the fastest closing pair (a 500px/s player bullet vs. a 60px/s
// falling enemy) closes 56px in one step, well under the ~99px combined
// height of the bullet (16) and enemy (~83) — and the kill check sweeps
// both sides' frame motion anyway, so nothing can tunnel through a
// collision target.
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
}

export class GameScene extends Phaser.Scene {
  private stars!: Starfield;
  private player!: Phaser.GameObjects.Image;
  private thruster!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prevPlayerX!: number;
  private enemies: Enemy[] = [];
  private playerBullets: Phaser.GameObjects.Rectangle[] = [];
  private enemyBullets: Phaser.GameObjects.Rectangle[] = [];
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

    this.player = this.add
      .image(WIDTH / 2, PLAYER_Y, ensureShipTexture(this))
      .setDepth(DEPTH.world);
    this.thruster.startFollow(this.player, 0, PLAYER_SIZE / 2 - 6);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.scorePill = createStatPill(this, {
      x: 18,
      y: 18,
      width: 150,
      label: 'Score',
      accent: ACCENT,
    });

    this.livesPill = createStatPill(this, {
      x: WIDTH - 18,
      y: 18,
      width: 130,
      label: 'Hearts',
      align: 'right',
      accent: PALETTE.rose,
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
    this.spawnerState = createSpawner(ENEMY_MIN_SPAWN_INTERVAL_MS, ENEMY_MAX_SPAWN_INTERVAL_MS);
    this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    this.scorePill.setValue('0');
    this.livesState = createLives(STARTING_LIVES);
    this.updateLivesPill();
    for (const enemy of this.enemies) {
      enemy.sprite.destroy();
      enemy.halo.destroy();
    }
    this.enemies = [];
    for (const bullet of this.playerBullets) {
      bullet.destroy();
    }
    this.playerBullets = [];
    for (const bullet of this.enemyBullets) {
      bullet.destroy();
    }
    this.enemyBullets = [];
    this.player.x = WIDTH / 2;
    this.player.setVisible(true).setAlpha(1).setRotation(0);
    this.prevPlayerX = WIDTH / 2;
    this.dragging = false;
    this.thruster.start();
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);

    // The bank applied while steering (see movePlayerTo) relaxes back to level
    // as soon as the thumb stops moving. Cosmetic only — the collision box is
    // axis-aligned whatever the sprite is doing.
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, Math.min(1, safeDelta / 110));

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnEnemy();
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
    // pre-move position — so check the player's swept path against where
    // things WERE, not where they're about to land.
    const playerRect = rectAt(this.player.x, PLAYER_Y, PLAYER_SIZE, PLAYER_SIZE);
    const steerPath = sweepX(playerRect, this.prevPlayerX - PLAYER_SIZE / 2);
    let collided = this.enemies.some((enemy) => intersects(steerPath, this.enemyRect(enemy)));

    // Bullets fired this frame are collected separately and appended after
    // the enemy-bullet collision pass below: a brand-new bullet postdates the
    // player's drag (steerPath) and hasn't moved yet, so testing it against
    // that historical path could consume a heart the player never earned.
    const firedThisFrame: Phaser.GameObjects.Rectangle[] = [];
    for (const enemy of this.enemies) {
      enemy.prevX = enemy.sprite.x;
      enemy.elapsedMs += safeDelta;
      enemy.sprite.y += fallDistance;
      enemy.sprite.x = wobbleX(enemy.baseX, enemy.elapsedMs, ENEMY_WOBBLE_AMPLITUDE, ENEMY_WOBBLE_PERIOD_MS);
      enemy.halo.x = enemy.sprite.x;
      enemy.halo.y = enemy.sprite.y - ENEMY_HEIGHT * 0.15;

      const enemyFire = tickSpawner(enemy.fireState, safeDelta);
      enemy.fireState = enemyFire.state;
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const bullet = this.add.rectangle(
          enemy.sprite.x,
          enemy.sprite.y + ENEMY_HEIGHT / 2 + ENEMY_BULLET_SIZE / 2,
          ENEMY_BULLET_SIZE,
          ENEMY_BULLET_SIZE,
          PALETTE.amber
        );
        bullet.setDepth(DEPTH.world);
        firedThisFrame.push(bullet);
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
        const rect = this.enemyRect(enemy);
        return intersects(bulletSwept, sweepY(sweepX(rect, enemy.prevX - ENEMY_WIDTH / 2), rect.y - fallDistance));
      });
      if (target) {
        this.explodeEnemy(target);
        this.enemies = this.enemies.filter((enemy) => enemy !== target);
        this.scoreState = addPoints(this.scoreState, KILL_POINTS);
        this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);
        bullet.destroy();
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
      // bullet was still at its pre-fall position — so, as with the enemy
      // checks, test the player's swept path against where the bullet WAS
      // before also checking final rects after the fall.
      const sweptHit = intersects(steerPath, rectAt(bullet.x, bullet.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE));
      bullet.y += ENEMY_BULLET_SPEED * (safeDelta / 1000);
      if (bullet.y > HEIGHT + ENEMY_BULLET_SIZE) {
        bullet.destroy();
        return false;
      }
      if (sweptHit || intersects(rectAt(bullet.x, bullet.y, ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE), playerRect)) {
        bullet.destroy();
        shotByEnemy = true;
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

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + ENEMY_HEIGHT) {
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
      this.movePlayerTo(pointer.x);
      this.firePlayerBullet();
      this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !this.dragging || !pointer.isDown) {
      return;
    }
    this.movePlayerTo(pointer.x);
  }

  private movePlayerTo(x: number): void {
    const half = PLAYER_SIZE / 2;
    const next = Phaser.Math.Clamp(x, half, WIDTH - half);
    // Bank into the turn — the ship leans toward wherever the thumb pulls it.
    const lean = Phaser.Math.Clamp((next - this.player.x) * 0.03, -0.28, 0.28);
    this.player.x = next;
    this.player.setRotation(lean);
  }

  private firePlayerBullet(): void {
    const bullet = this.add.rectangle(
      this.player.x,
      PLAYER_Y - PLAYER_SIZE / 2 - PLAYER_BULLET_HEIGHT / 2,
      PLAYER_BULLET_WIDTH,
      PLAYER_BULLET_HEIGHT,
      ACCENT
    );
    bullet.setDepth(DEPTH.world);
    this.playerBullets.push(bullet);
  }

  private spawnEnemy(): void {
    // Spawning baseX inside the wobble margin keeps the whole wobble arc on
    // screen, so no per-frame clamping is needed.
    const margin = ENEMY_WIDTH / 2 + ENEMY_WOBBLE_AMPLITUDE;
    const baseX = Phaser.Math.Between(margin, WIDTH - margin);
    const color = HAZARD_COLORS[Phaser.Math.Between(0, HAZARD_COLORS.length - 1)];

    const halo = this.add
      .image(baseX, -ENEMY_HEIGHT, TEX.glow)
      .setDisplaySize(ENEMY_WIDTH * 2.6, ENEMY_HEIGHT * 2)
      .setTint(color)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add
      .image(baseX, -ENEMY_HEIGHT, ensureShardTexture(this, color))
      .setScale(ENEMY_SCALE)
      .setDepth(DEPTH.world);

    this.enemies.push({
      sprite,
      halo,
      color,
      baseX,
      prevX: baseX,
      elapsedMs: 0,
      fireState: createSpawner(ENEMY_MIN_FIRE_INTERVAL_MS, ENEMY_MAX_FIRE_INTERVAL_MS),
    });
  }

  private enemyRect(enemy: Enemy): Rect {
    return rectAt(enemy.sprite.x, enemy.sprite.y, ENEMY_WIDTH, ENEMY_HEIGHT);
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
    enemy.sprite.destroy();
    enemy.halo.destroy();
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
