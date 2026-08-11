import Phaser from 'phaser';
import { createScore, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { wobbleX } from '../core/wobble';
import { WIDTH, HEIGHT } from '../gameConfig';

const PLAYER_SIZE = 40;
const PLAYER_MARGIN_BOTTOM = 120;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;
const ENEMY_SIZE = 50;
const ENEMY_FALL_SPEED = 60;
const ENEMY_WOBBLE_AMPLITUDE = 60;
const ENEMY_WOBBLE_PERIOD_MS = 2000;
const ENEMY_MIN_SPAWN_INTERVAL_MS = 1500;
const ENEMY_MAX_SPAWN_INTERVAL_MS = 2500;
const ENEMY_MIN_FIRE_INTERVAL_MS = 2000;
const ENEMY_MAX_FIRE_INTERVAL_MS = 4000;
// Caps how much sim time a single frame advances timers and movement by, so
// a stalled frame (e.g. a backgrounded tab) can't teleport objects. At the
// cap the fastest object (a 500px/s player bullet) moves 50px in one step,
// less than ENEMY_SIZE, so nothing can tunnel through a collision target.
const MAX_DELTA_MS = 100;

type GameState = 'playing' | 'gameOver';

interface Enemy {
  sprite: Phaser.GameObjects.Rectangle;
  baseX: number;
  elapsedMs: number;
  fireState: SpawnerState;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private prevPlayerX!: number;
  private enemies: Enemy[] = [];
  private scoreState!: ScoreState;
  private spawnerState!: SpawnerState;
  private scoreText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Text;
  private state!: GameState;
  private dragging = false;

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

    this.gameOverText = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, '', {
      fontSize: '28px',
      color: '#000000',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5, 0.5);

    // Text is set to its final non-empty label here, BEFORE setInteractive(),
    // because setInteractive({ useHandCursor: true }) with no explicit hitArea
    // calls setHitAreaFromTexture(), which snapshots the object's width/height
    // ONCE at call time into a fixed hitArea. setText() later (in
    // triggerGameOver()) recomputes width/height but never touches hitArea,
    // so if the label started as '' the hitArea would stay frozen at ~0px
    // wide forever — only a hairline sliver would be tappable. Visibility is
    // toggled instead of the text, so the hitArea never goes stale.
    this.restartButton = this.add.text(WIDTH / 2, HEIGHT / 2 + 20, 'Tap to Restart', {
      fontSize: '22px',
      color: '#0000ff',
    });
    this.restartButton.setOrigin(0.5, 0.5);
    this.restartButton.setInteractive({ useHandCursor: true });
    this.restartButton.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        // Defense in depth: the button is only meant to act during Game Over.
        // Visibility already gates this in normal operation, but Phaser does
        // not itself skip input processing for invisible objects, so this
        // guard keeps the handler inert during "playing" independent of that.
        if (this.state !== 'gameOver') {
          return;
        }
        // Stop this tap from also reaching the scene-wide pointerdown handler
        // (handlePointerDown): without this, resetState() below flips state
        // to 'playing' synchronously, and the same tap's coordinates would
        // then be read by handlePointerDown as a drag-move command, snapping
        // the just-centered player to wherever on this button was tapped.
        event.stopPropagation();
        this.resetState();
      }
    );

    this.menuButton = this.add.text(WIDTH / 2, HEIGHT / 2 + 70, 'Back to Menu', {
      fontSize: '22px',
      color: '#0000ff',
    });
    this.menuButton.setOrigin(0.5, 0.5);
    this.menuButton.setInteractive({ useHandCursor: true });
    this.menuButton.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        if (this.state !== 'gameOver') {
          return;
        }
        // Same defensive stopPropagation() as restartButton — see its comment.
        event.stopPropagation();
        this.scene.start('MenuScene');
      }
    );

    this.scoreText.setDepth(10);
    this.gameOverText.setDepth(10);
    this.restartButton.setDepth(10);
    this.menuButton.setDepth(10);

    this.resetState();
  }

  private resetState(): void {
    this.state = 'playing';
    this.scoreState = createScore();
    this.spawnerState = createSpawner(ENEMY_MIN_SPAWN_INTERVAL_MS, ENEMY_MAX_SPAWN_INTERVAL_MS);
    this.scoreText.setText('Score: 0');
    this.gameOverText.setText('');
    this.restartButton.setVisible(false);
    this.menuButton.setVisible(false);
    for (const enemy of this.enemies) {
      enemy.sprite.destroy();
    }
    this.enemies = [];
    this.player.x = WIDTH / 2;
    this.prevPlayerX = WIDTH / 2;
    this.dragging = false;
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnEnemy();
    }

    const fallDistance = ENEMY_FALL_SPEED * (safeDelta / 1000);

    // Player movement happened via pointer events before update(), while
    // enemies were still at their pre-move positions — sweep the player's
    // path against where enemies WERE.
    const playerSweptRect = this.playerSweptRect();
    let collided = this.enemies.some((enemy) => intersects(playerSweptRect, this.toRect(enemy.sprite)));

    for (const enemy of this.enemies) {
      enemy.elapsedMs += safeDelta;
      enemy.sprite.y += fallDistance;
      enemy.sprite.x = wobbleX(enemy.baseX, enemy.elapsedMs, ENEMY_WOBBLE_AMPLITUDE, ENEMY_WOBBLE_PERIOD_MS);
    }

    // Enemy speeds are low (≤ ~20px per capped frame, well under
    // ENEMY_SIZE), so a plain overlap check after the move can't miss a
    // pass-through; no enemy-side sweep needed.
    if (!collided) {
      const playerRect = this.toRect(this.player);
      collided = this.enemies.some((enemy) => intersects(playerRect, this.toRect(enemy.sprite)));
    }

    if (collided) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.sprite.y > HEIGHT + ENEMY_SIZE) {
        enemy.sprite.destroy();
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
    this.player.x = Phaser.Math.Clamp(x, half, WIDTH - half);
  }

  private spawnEnemy(): void {
    const half = ENEMY_SIZE / 2;
    const margin = half + ENEMY_WOBBLE_AMPLITUDE;
    const baseX = Phaser.Math.Between(margin, WIDTH - margin);
    const sprite = this.add.rectangle(baseX, -ENEMY_SIZE, ENEMY_SIZE, ENEMY_SIZE, 0xff0000);
    this.enemies.push({
      sprite,
      baseX,
      elapsedMs: 0,
      fireState: createSpawner(ENEMY_MIN_FIRE_INTERVAL_MS, ENEMY_MAX_FIRE_INTERVAL_MS),
    });
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
  // pass through an enemy without ever overlapping it on a sampled
  // frame. Only x is swept — the player never moves vertically. Checked
  // against each enemy's PRE-move position (see update()) since all of
  // this sweep happened before this frame's fall/wobble was applied.
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

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.gameOverText.setText(`Game Over\nScore: ${getScoreValue(this.scoreState)}`);
    this.restartButton.setVisible(true);
    this.menuButton.setVisible(true);
  }
}
