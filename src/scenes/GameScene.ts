import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { WIDTH, HEIGHT } from '../gameConfig';

const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 50;
const OBSTACLE_SPEED = 300;
const MIN_SPAWN_INTERVAL_MS = 800;
const MAX_SPAWN_INTERVAL_MS = 1800;
// Caps how much sim time a single frame advances score/spawn timing by. This
// does NOT bound obstacle movement — Arcade Physics moves bodies during its
// own world step, which runs before this scene's update() and uses Phaser's
// own (already fps.smoothStep-clamped) delta, not this value. Collision
// tunneling past a fast-moving obstacle is instead handled by sweptRect()
// below, which is correct regardless of frame delta.
const MAX_DELTA_MS = 100;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
type Obstacle = PhysicsRect & { prevX: number };
type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: Obstacle[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private state: GameState = 'playing';

  constructor() {
    super('GameScene');
  }

  create(): void {
    const ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.handleAction());

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
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.handleAction();
    }

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

    // Collision check runs first, using each obstacle's swept path this frame
    // (prevX -> current x), so a large single-frame move can't let an
    // obstacle pass through the player without ever being tested — and
    // before cleanup, so an obstacle that also crossed the off-screen
    // threshold this frame is still checked.
    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.sweptRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }

    for (const obstacle of this.obstacles) {
      obstacle.prevX = obstacle.x;
    }

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });
  }

  private handleAction(): void {
    if (this.state === 'playing') {
      this.jump();
    } else {
      this.restart();
    }
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }

  private spawnObstacle(): void {
    const obstacle = this.physics.add.existing(
      this.add.rectangle(
        WIDTH + OBSTACLE_WIDTH,
        GROUND_Y - OBSTACLE_HEIGHT / 2,
        OBSTACLE_WIDTH,
        OBSTACLE_HEIGHT,
        0xff0000
      )
    ) as Obstacle;
    obstacle.body.setAllowGravity(false);
    obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    obstacle.prevX = obstacle.x;
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

  // Bounds of the horizontal span an obstacle swept through this frame
  // (from its position at the start of the frame to its position now),
  // so a large single-frame move can't tunnel through the player's hitbox
  // without ever overlapping it on a sampled frame. Only x is swept —
  // obstacles never move vertically (gravity is disabled on them).
  private sweptRect(obstacle: Obstacle): Rect {
    const currentX = obstacle.x;
    obstacle.x = obstacle.prevX;
    const prevBounds = obstacle.getBounds();
    obstacle.x = currentX;
    const currentBounds = obstacle.getBounds();

    const left = Math.min(prevBounds.x, currentBounds.x);
    const right = Math.max(prevBounds.x + prevBounds.width, currentBounds.x + currentBounds.width);

    return {
      x: left,
      y: currentBounds.y,
      width: right - left,
      height: currentBounds.height,
    };
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.physics.pause();
    this.gameOverText.setText(
      `Game Over\nScore: ${getScoreValue(this.scoreState)}\nTap to Restart`
    );
  }

  private restart(): void {
    this.state = 'playing';
    this.scoreState = createScore();
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.scoreText.setText('Score: 0');
    this.gameOverText.setText('');
    for (const obstacle of this.obstacles) {
      obstacle.destroy();
    }
    this.obstacles = [];
    this.player.setPosition(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2);
    this.player.body.setVelocity(0, 0);
    this.physics.resume();
  }
}
