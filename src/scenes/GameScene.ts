import Phaser from 'phaser';
import { createScore, tickScore, getScoreValue, ScoreState } from '../core/score';
import { createSpawner, tickSpawner, SpawnerState } from '../core/spawner';

const WIDTH = 800;
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

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private obstacles: PhysicsRect[] = [];
  private scoreState: ScoreState = createScore();
  private spawnerState: SpawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, WIDTH, GROUND_HEIGHT, 0x654321);
    this.physics.add.existing(this.ground, true);

    this.player = this.physics.add.existing(
      this.add.rectangle(PLAYER_START_X, GROUND_Y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x00ff00)
    ) as PhysicsRect;
    this.physics.add.collider(this.player, this.ground);

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', () => this.jump());

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#000000',
    });
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }

    this.scoreState = tickScore(this.scoreState, delta);
    this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);

    const spawnResult = tickSpawner(this.spawnerState, delta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnObstacle();
    }

    for (const obstacle of this.obstacles) {
      obstacle.body.setVelocityX(-OBSTACLE_SPEED);
    }
    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.x < -OBSTACLE_WIDTH) {
        obstacle.destroy();
        return false;
      }
      return true;
    });
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
    this.obstacles.push(obstacle);
  }
}
