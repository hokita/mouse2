import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { WIDTH, HEIGHT } from '../gameConfig';

const PLAYER_SIZE = 40;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;
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

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private prevPlayerX!: number;
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private scoreState!: ScoreState;
  private spawnerState!: SpawnerState;
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private state!: GameState;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.player = this.add.rectangle(WIDTH / 2, PLAYER_Y, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });

    this.gameOverText = this.add.text(WIDTH / 2, HEIGHT / 2, '', {
      fontSize: '28px',
      color: '#000000',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5, 0.5);

    this.scoreText.setDepth(10);
    this.gameOverText.setDepth(10);

    this.resetState();
  }

  private resetState(): void {
    this.state = 'playing';
    this.scoreState = createScore();
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.scoreText.setText('Score: 0');
    this.gameOverText.setText('');
    for (const obstacle of this.obstacles) {
      obstacle.destroy();
    }
    this.obstacles = [];
    this.player.x = WIDTH / 2;
    this.prevPlayerX = WIDTH / 2;
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);

    this.scoreState = tickScore(this.scoreState, safeDelta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    const fallDistance = OBSTACLE_SPEED * (safeDelta / 1000);

    // All of this frame's player movement happens via pointer events fired
    // before update() runs, while every obstacle was still at its pre-fall
    // position — so check the player's swept path against where obstacles
    // WERE, not a blanket union with where they're about to land (which
    // would report a hit even if the player had already cleared an x
    // before the obstacle ever fell within reach).
    const playerSweptRect = this.playerSweptRect();
    let collided = this.obstacles.some((obstacle) => intersects(playerSweptRect, this.toRect(obstacle)));

    for (const obstacle of this.obstacles) {
      obstacle.y += fallDistance;
    }

    // The obstacle's fall happens after the player has already settled at
    // its final position for this frame (no further movement until the
    // next pointer event), so check the fall's swept path against the
    // player's resting position, not its full swept range.
    if (!collided) {
      const playerRect = this.toRect(this.player);
      collided = this.obstacles.some((obstacle) =>
        intersects(playerRect, this.obstacleSweptRect(obstacle, fallDistance))
      );
    }

    if (collided) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.y > HEIGHT + OBSTACLE_HEIGHT) {
        obstacle.destroy();
        return false;
      }
      return true;
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.movePlayerTo(pointer.x);
    } else {
      this.restart();
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !pointer.isDown) {
      return;
    }
    this.movePlayerTo(pointer.x);
  }

  private movePlayerTo(x: number): void {
    const half = PLAYER_SIZE / 2;
    this.player.x = Phaser.Math.Clamp(x, half, WIDTH - half);
  }

  private spawnObstacle(): void {
    const half = OBSTACLE_WIDTH / 2;
    const x = Phaser.Math.Between(half, WIDTH - half);
    const obstacle = this.add.rectangle(x, -OBSTACLE_HEIGHT, OBSTACLE_WIDTH, OBSTACLE_HEIGHT, 0xff0000);
    this.obstacles.push(obstacle);
  }

  private toRect(obj: Phaser.GameObjects.Rectangle): Rect {
    const bounds = obj.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }

  // Bounds of the horizontal span the player crossed this frame (from its
  // position at the end of the previous frame to its current position),
  // so a single fast drag/tap that jumps the player's x — pointer events
  // move it instantly, independent of update()'s per-frame delta — can't
  // pass through an obstacle without ever overlapping it on a sampled
  // frame. Only x is swept — the player never moves vertically. Checked
  // against each obstacle's PRE-fall position (see update()) since all of
  // this sweep happened before this frame's fall was applied.
  private playerSweptRect(): Rect {
    const currentX = this.player.x;
    this.player.x = this.prevPlayerX;
    const prevBounds = this.player.getBounds();
    this.player.x = currentX;
    const currentBounds = this.player.getBounds();

    const left = Math.min(prevBounds.x, currentBounds.x);
    const right = Math.max(prevBounds.x + prevBounds.width, currentBounds.x + currentBounds.width);

    return {
      x: left,
      y: currentBounds.y,
      width: right - left,
      height: currentBounds.height,
    };
  }

  // Bounds of the vertical span an obstacle fell through this frame (from
  // its position before this frame's fall to its position now). Checked
  // against the player's FINAL (unswept) rect in update(): the obstacle's
  // fall happens after the player has already settled at its position for
  // this frame, so there's nothing left of the player's own motion to
  // sweep at this point — only the obstacle's. Only y is swept — obstacles
  // never move horizontally.
  private obstacleSweptRect(obstacle: Phaser.GameObjects.Rectangle, fallDistance: number): Rect {
    const currentY = obstacle.y;
    obstacle.y = currentY - fallDistance;
    const prevBounds = obstacle.getBounds();
    obstacle.y = currentY;
    const currentBounds = obstacle.getBounds();

    const top = Math.min(prevBounds.y, currentBounds.y);
    const bottom = Math.max(prevBounds.y + prevBounds.height, currentBounds.y + currentBounds.height);

    return {
      x: currentBounds.x,
      y: top,
      width: currentBounds.width,
      height: bottom - top,
    };
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.gameOverText.setText(
      `Game Over\nScore: ${getScoreValue(this.scoreState)}\nTap to Restart`
    );
  }

  private restart(): void {
    this.resetState();
  }
}
