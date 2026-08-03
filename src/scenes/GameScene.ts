import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';

const WIDTH = 800;
const HEIGHT = 400;
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

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
type GameState = 'playing' | 'gameOver';

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: PhysicsRect[] = [];
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

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, delta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });

    const playerRect = this.toRect(this.player);
    for (const obstacle of this.obstacles) {
      if (intersects(playerRect, this.toRect(obstacle))) {
        this.triggerGameOver();
        break;
      }
    }
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
    ) as PhysicsRect;
    obstacle.body.setAllowGravity(false);
    obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    this.obstacles.push(obstacle);
  }

  private toRect(obj: Phaser.GameObjects.Rectangle): Rect {
    return {
      x: obj.x - obj.width / 2,
      y: obj.y - obj.height / 2,
      width: obj.width,
      height: obj.height,
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
