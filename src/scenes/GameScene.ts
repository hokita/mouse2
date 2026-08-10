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
// the player without ever overlapping it.
const MAX_DELTA_MS = 100;

type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private state: GameState = 'playing';

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
    for (const obstacle of this.obstacles) {
      obstacle.y += fallDistance;
    }

    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.toRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }

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

  private triggerGameOver(): void {
    this.state = 'gameOver';
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
    this.player.x = WIDTH / 2;
  }
}
