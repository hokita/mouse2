import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects, rectAt } from '../core/collision';
import type { Rect } from '../core/collision';
import { sweepX, sweepY } from '../core/sweep';
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
const OBSTACLE_WIDTH = SHARD_WIDTH;
const OBSTACLE_HEIGHT = SHARD_HEIGHT;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;

/** Debris comes in four flavours purely so the field never looks uniform. */
const HAZARD_COLORS = [PALETTE.rose, PALETTE.violet, PALETTE.amber, PALETTE.mint];

// Caps how much sim time a single frame advances score/spawn/obstacle-fall
// timing by. At the cap, an obstacle falls OBSTACLE_SPEED * (MAX_DELTA_MS /
// 1000) = 30px in one step — well under the player/obstacle size, so a long
// stalled frame (e.g. a backgrounded tab) can't let an obstacle skip past
// the player without ever overlapping it. This bound only holds while
// OBSTACLE_SPEED * (MAX_DELTA_MS / 1000) <= PLAYER_SIZE + OBSTACLE_HEIGHT
// (currently 30 <= 90, i.e. safe up to OBSTACLE_SPEED = 900) — revisit this
// comment and MAX_DELTA_MS together if OBSTACLE_SPEED ever increases (e.g.
// a difficulty ramp).
const MAX_DELTA_MS = 100;

type GameState = 'playing' | 'gameOver';

interface Obstacle {
  sprite: Phaser.GameObjects.Image;
  /** Soft halo trailing the shard; purely decorative. */
  halo: Phaser.GameObjects.Image;
}

export class GameScene extends Phaser.Scene {
  private stars!: Starfield;
  private player!: Phaser.GameObjects.Image;
  private thruster!: Phaser.GameObjects.Particles.ParticleEmitter;
  private prevPlayerX!: number;
  private obstacles: Obstacle[] = [];
  private scoreState!: ScoreState;
  private spawnerState!: SpawnerState;
  private scorePill!: StatPill;
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

    this.overlay = createGameOverOverlay(this, {
      accent: ACCENT,
      onRestart: () => this.resetState(),
      onMenu: () => transitionTo(this, 'MenuScene'),
      // Gated on the overlay actually being on screen, not merely on the run
      // being over: the card animates in a beat after the crash, and Phaser
      // routes taps to hidden objects, so an early tap would otherwise hit a
      // button nobody can see yet.
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
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.scorePill.setValue('0');
    for (const obstacle of this.obstacles) {
      obstacle.sprite.destroy();
      obstacle.halo.destroy();
    }
    this.obstacles = [];
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

    this.scoreState = tickScore(this.scoreState, safeDelta);
    this.scorePill.setValue(`${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    const fallDistance = OBSTACLE_SPEED * (safeDelta / 1000);
    // The starfield drifts at a fraction of the debris speed, so the
    // background reads as far away rather than as part of the hazard layer.
    this.stars.scroll(fallDistance * 0.22);

    // All of this frame's player movement happens via pointer events fired
    // before update() runs, while every obstacle was still at its pre-fall
    // position — so check the player's swept path against where obstacles
    // WERE, not a blanket union with where they're about to land (which
    // would report a hit even if the player had already cleared an x
    // before the obstacle ever fell within reach).
    const playerRect = rectAt(this.player.x, PLAYER_Y, PLAYER_SIZE, PLAYER_SIZE);
    const steerPath = sweepX(playerRect, this.prevPlayerX - PLAYER_SIZE / 2);
    let collided = this.obstacles.some((obstacle) => intersects(steerPath, this.obstacleRect(obstacle)));

    for (const obstacle of this.obstacles) {
      obstacle.sprite.y += fallDistance;
      obstacle.halo.y = obstacle.sprite.y - OBSTACLE_HEIGHT * 0.15;
    }

    // The obstacle's fall happens after the player has already settled at
    // its final position for this frame (no further movement until the
    // next pointer event), so check the fall's swept path against the
    // player's resting position, not its full swept range.
    if (!collided) {
      collided = this.obstacles.some((obstacle) => {
        const rect = this.obstacleRect(obstacle);
        return intersects(playerRect, sweepY(rect, rect.y - fallDistance));
      });
    }

    if (collided) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.sprite.y > HEIGHT + OBSTACLE_HEIGHT) {
        obstacle.sprite.destroy();
        obstacle.halo.destroy();
        return false;
      }
      return true;
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.dragging = true;
      this.movePlayerTo(pointer.x);
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

  private spawnObstacle(): void {
    const half = OBSTACLE_WIDTH / 2;
    const x = Phaser.Math.Between(half, WIDTH - half);
    const color = HAZARD_COLORS[Phaser.Math.Between(0, HAZARD_COLORS.length - 1)];

    const halo = this.add
      .image(x, -OBSTACLE_HEIGHT, TEX.glow)
      .setDisplaySize(OBSTACLE_WIDTH * 2.6, OBSTACLE_HEIGHT * 2)
      .setTint(color)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.world - 1);

    const sprite = this.add
      .image(x, -OBSTACLE_HEIGHT, ensureShardTexture(this, color))
      .setDepth(DEPTH.world);

    this.obstacles.push({ sprite, halo });
  }

  private obstacleRect(obstacle: Obstacle): Rect {
    return rectAt(obstacle.sprite.x, obstacle.sprite.y, OBSTACLE_WIDTH, OBSTACLE_HEIGHT);
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
