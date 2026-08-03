import Phaser from 'phaser';

const WIDTH = 800;
const GROUND_Y = 350;
const GROUND_HEIGHT = 50;
const PLAYER_SIZE = 40;
const PLAYER_START_X = 100;
const JUMP_VELOCITY = -500;

type PhysicsRect = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };

export class GameScene extends Phaser.Scene {
  private player!: PhysicsRect;
  private ground!: Phaser.GameObjects.Rectangle;
  private jumpKey!: Phaser.Input.Keyboard.Key;

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
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jump();
    }
  }

  private jump(): void {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }
}
