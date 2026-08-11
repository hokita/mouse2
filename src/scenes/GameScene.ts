import Phaser from 'phaser';
import { createScore, addPoints, getScoreValue } from '../core/score';
import type { ScoreState } from '../core/score';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { wobbleX } from '../core/wobble';
import { createLives, hit, tickLives, isInvincible } from '../core/lives';
import type { LivesState } from '../core/lives';
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
// cap, the fastest closing pair (a 500px/s player bullet vs. a 60px/s
// falling enemy) closes 56px in one step, less than the 66px combined
// height of the bullet (16) and enemy (50), so nothing can tunnel through
// a collision target.
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
  sprite: Phaser.GameObjects.Rectangle;
  baseX: number;
  elapsedMs: number;
  fireState: SpawnerState;
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private prevPlayerX!: number;
  private enemies: Enemy[] = [];
  private playerBullets: Phaser.GameObjects.Rectangle[] = [];
  private enemyBullets: Phaser.GameObjects.Rectangle[] = [];
  private fireState!: SpawnerState;
  private scoreState!: ScoreState;
  private spawnerState!: SpawnerState;
  private scoreText!: Phaser.GameObjects.Text;
  private livesState!: LivesState;
  private livesText!: Phaser.GameObjects.Text;
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

    this.livesText = this.add.text(WIDTH - 16, 16, '', {
      fontSize: '24px',
      color: '#ff0000',
    });
    this.livesText.setOrigin(1, 0);

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
    this.livesText.setDepth(10);
    this.gameOverText.setDepth(10);
    this.restartButton.setDepth(10);
    this.menuButton.setDepth(10);

    this.resetState();
  }

  private resetState(): void {
    this.state = 'playing';
    this.scoreState = createScore();
    this.spawnerState = createSpawner(ENEMY_MIN_SPAWN_INTERVAL_MS, ENEMY_MAX_SPAWN_INTERVAL_MS);
    this.fireState = createSpawner(PLAYER_FIRE_INTERVAL_MS, PLAYER_FIRE_INTERVAL_MS);
    this.scoreText.setText('Score: 0');
    this.livesState = createLives(STARTING_LIVES);
    this.updateLivesText();
    this.player.setAlpha(1);
    this.gameOverText.setText('');
    this.restartButton.setVisible(false);
    this.menuButton.setVisible(false);
    for (const enemy of this.enemies) {
      enemy.sprite.destroy();
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
    this.prevPlayerX = WIDTH / 2;
    this.dragging = false;
  }

  private updateLivesText(): void {
    this.livesText.setText('♥'.repeat(Math.max(0, this.livesState.lives)));
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

    if (this.dragging && this.input.activePointer.isDown) {
      const fireResult = tickSpawner(this.fireState, safeDelta);
      this.fireState = fireResult.state;
      if (fireResult.shouldSpawn) {
        this.firePlayerBullet();
      }
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

      const enemyFire = tickSpawner(enemy.fireState, safeDelta);
      enemy.fireState = enemyFire.state;
      if (enemyFire.shouldSpawn && enemy.sprite.y > 0) {
        const bullet = this.add.rectangle(
          enemy.sprite.x,
          enemy.sprite.y + ENEMY_SIZE / 2 + ENEMY_BULLET_SIZE / 2,
          ENEMY_BULLET_SIZE,
          ENEMY_BULLET_SIZE,
          0xff8800
        );
        this.enemyBullets.push(bullet);
      }
    }

    for (const bullet of this.playerBullets) {
      bullet.y -= PLAYER_BULLET_SPEED * (safeDelta / 1000);
    }

    // The callback below reassigns this.enemies mid-iteration; that's safe
    // because this filter iterates a snapshot of playerBullets and each
    // callback re-reads this.enemies fresh via find(), so a killed enemy is
    // immediately out of consideration for later bullets in the same frame.
    this.playerBullets = this.playerBullets.filter((bullet) => {
      if (bullet.y < -PLAYER_BULLET_HEIGHT) {
        bullet.destroy();
        return false;
      }
      const bulletRect = this.toRect(bullet);
      const target = this.enemies.find((enemy) => intersects(bulletRect, this.toRect(enemy.sprite)));
      if (target) {
        target.sprite.destroy();
        this.enemies = this.enemies.filter((enemy) => enemy !== target);
        this.scoreState = addPoints(this.scoreState, KILL_POINTS);
        this.scoreText.setText(`Score: ${getScoreValue(this.scoreState)}`);
        bullet.destroy();
        return false;
      }
      return true;
    });

    const playerHitRect = this.toRect(this.player);
    let shotByEnemy = false;
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      bullet.y += ENEMY_BULLET_SPEED * (safeDelta / 1000);
      if (bullet.y > HEIGHT + ENEMY_BULLET_SIZE) {
        bullet.destroy();
        return false;
      }
      if (intersects(this.toRect(bullet), playerHitRect)) {
        bullet.destroy();
        shotByEnemy = true;
        return false;
      }
      return true;
    });

    // Enemy speeds are low (≤ ~20px per capped frame, well under
    // ENEMY_SIZE), so a plain overlap check after the move can't miss a
    // pass-through; no enemy-side sweep needed.
    if (!collided) {
      const playerRect = this.toRect(this.player);
      collided = this.enemies.some((enemy) => intersects(playerRect, this.toRect(enemy.sprite)));
    }

    this.livesState = tickLives(this.livesState, safeDelta);
    if (collided || shotByEnemy) {
      const result = hit(this.livesState, INVINCIBILITY_MS);
      this.livesState = result.state;
      if (result.tookHit) {
        this.updateLivesText();
      }
      if (result.dead) {
        this.triggerGameOver();
      }
    }

    // Blink while invincible so kids can see the shield; solid otherwise.
    // Gated on 'playing' because triggerGameOver() (above, on this same
    // frame if the killing hit just landed) sets alpha back to 1 for the
    // corpse; without this gate the blink expression would run afterward
    // in the same call and could overwrite that back to 0.3, then update()
    // early-returns on every later frame, freezing the player translucent.
    if (this.state === 'playing') {
      this.player.setAlpha(isInvincible(this.livesState) && Math.floor(_time / 100) % 2 === 0 ? 0.3 : 1);
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
    this.player.x = Phaser.Math.Clamp(x, half, WIDTH - half);
  }

  private firePlayerBullet(): void {
    const bullet = this.add.rectangle(
      this.player.x,
      this.player.y - PLAYER_SIZE / 2 - PLAYER_BULLET_HEIGHT / 2,
      PLAYER_BULLET_WIDTH,
      PLAYER_BULLET_HEIGHT,
      0x0088ff
    );
    this.playerBullets.push(bullet);
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
    // The death frame's blink line (below, in update()) can run before this
    // and leave the player at alpha 0.3; since update() early-returns once
    // state is 'gameOver', that would otherwise never get corrected. Force
    // solid here so the corpse is never stuck semi-transparent.
    this.player.setAlpha(1);
    this.gameOverText.setText(`Game Over\nScore: ${getScoreValue(this.scoreState)}`);
    this.restartButton.setVisible(true);
    this.menuButton.setVisible(true);
  }
}
