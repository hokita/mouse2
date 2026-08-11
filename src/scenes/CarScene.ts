import Phaser from 'phaser';
import { intersects } from '../core/collision';
import type { Rect } from '../core/collision';
import { createDistance, getDistanceValue, tickDistance } from '../core/distance';
import type { DistanceState } from '../core/distance';
import { laneCenterX, pickSpawnLane } from '../core/lanes';
import { createSpawner, tickSpawner } from '../core/spawner';
import type { SpawnerState } from '../core/spawner';
import { speedAt } from '../core/speed';
import type { SpeedRamp } from '../core/speed';
import { sweepX, sweepY } from '../core/sweep';
import { WIDTH, HEIGHT } from '../gameConfig';

const ROAD_MARGIN = 30;
const ROAD_LEFT = ROAD_MARGIN;
const ROAD_WIDTH = WIDTH - ROAD_MARGIN * 2;
const LANE_COUNT = 3;

const CAR_WIDTH = 44;
const CAR_HEIGHT = 76;
const PLAYER_MARGIN_BOTTOM = 170;
const PLAYER_Y = HEIGHT - PLAYER_MARGIN_BOTTOM;

// Deliberately no white and no blue here: white would vanish into the lane
// dashes and the white HUD text it drives past, and blue is the player's car.
const TRAFFIC_COLORS = [0xff4444, 0xffaa00, 0xaa44ff, 0xffd600];

const MIN_SPAWN_INTERVAL_MS = 550;
const MAX_SPAWN_INTERVAL_MS = 1100;

// A lane counts as blocked (and so is off-limits for a new car) while it
// still holds traffic within this many pixels of the top of the screen —
// i.e. roughly where a freshly spawned car would appear. Sized well above
// CAR_HEIGHT so two cars in the same lane never spawn nose-to-tail.
const LANE_BLOCKED_ZONE = CAR_HEIGHT * 3;

const SPEED: SpeedRamp = { base: 260, max: 700, rampMs: 60_000 };

const DASH_HEIGHT = 44;
const DASH_GAP = 40;
const DASH_WIDTH = 6;

const GRASS_COLOR = 0x2e7d32;
const ROAD_COLOR = 0x424242;
const DASH_COLOR = 0xf5f5f5;
const PLAYER_COLOR = 0x1e88e5;

// Caps how much sim time a single frame advances the road by, so a stalled
// frame (a backgrounded tab, say) doesn't teleport the whole field of traffic
// down the screen the moment it resumes. Collision is swept (see update()),
// so this bound is about fairness — the player gets no chance to react to
// motion that happened while the tab was hidden — not about tunnelling.
const MAX_DELTA_MS = 100;

type GameState = 'playing' | 'gameOver';

interface TrafficCar {
  rect: Phaser.GameObjects.Rectangle;
  lane: number;
}

export class CarScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private prevPlayerX!: number;
  private traffic: TrafficCar[] = [];
  private dashes: Phaser.GameObjects.Rectangle[] = [];
  /** Height of the repeating dash pattern — how far a dash wraps back up by. */
  private dashCycle = 0;
  private distanceState!: DistanceState;
  private spawnerState!: SpawnerState;
  private elapsedMs!: number;
  private distanceText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Text;
  private state!: GameState;
  private dragging = false;

  constructor() {
    super('CarScene');
  }

  create(): void {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, GRASS_COLOR);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, ROAD_WIDTH, HEIGHT, ROAD_COLOR);
    this.createDashes();

    this.player = this.add.rectangle(
      laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH),
      PLAYER_Y,
      CAR_WIDTH,
      CAR_HEIGHT,
      PLAYER_COLOR
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));

    this.distanceText = this.add.text(16, 16, '0 m', {
      fontSize: '20px',
      color: '#ffffff',
    });

    this.speedText = this.add.text(WIDTH - 16, 16, '0 km/h', {
      fontSize: '20px',
      color: '#ffffff',
    });
    this.speedText.setOrigin(1, 0);

    this.gameOverText = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, '', {
      fontSize: '28px',
      color: '#ffffff',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5, 0.5);

    // Both buttons are created with their final label BEFORE setInteractive(),
    // and hidden via setVisible() rather than by blanking the text: an
    // interactive Text with no explicit hitArea snapshots its size once, at
    // setInteractive() time, and never refreshes it on setText(). Starting
    // from '' would freeze the hit area at zero width. Same reasoning as
    // GameScene's Game Over buttons.
    this.restartButton = this.makeGameOverButton(HEIGHT / 2 + 20, 'Tap to Restart', () => this.resetState());
    this.menuButton = this.makeGameOverButton(HEIGHT / 2 + 70, 'Back to Menu', () => this.scene.start('MenuScene'));

    this.distanceText.setDepth(10);
    this.speedText.setDepth(10);
    this.gameOverText.setDepth(10);
    this.restartButton.setDepth(10);
    this.menuButton.setDepth(10);

    this.resetState();
  }

  private makeGameOverButton(y: number, label: string, onTap: () => void): Phaser.GameObjects.Text {
    const button = this.add.text(WIDTH / 2, y, label, {
      fontSize: '22px',
      color: '#8ecbff',
    });
    button.setOrigin(0.5, 0.5);
    button.setInteractive({ useHandCursor: true });
    button.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        // Phaser still routes input to invisible objects, so gate on state
        // rather than trusting the button to be hidden while playing.
        if (this.state !== 'gameOver') {
          return;
        }
        // Keep this tap from also reaching the scene-wide pointerdown
        // handler: restarting flips state to 'playing' synchronously, and the
        // same tap would then be read as a steer command, yanking the
        // just-recentred car over to wherever the button was tapped.
        event.stopPropagation();
        onTap();
      }
    );
    return button;
  }

  private createDashes(): void {
    // The Scene instance outlives a scene restart, but its display list does
    // not — every Rectangle from a previous visit was destroyed on shutdown.
    // Drop the stale references instead of appending fresh dashes to them.
    this.dashes = [];

    const spacing = DASH_HEIGHT + DASH_GAP;
    // One extra dash beyond the screen height so the column stays unbroken
    // while the topmost dash is still wrapping back up above the view.
    const perLine = Math.ceil(HEIGHT / spacing) + 1;
    this.dashCycle = perLine * spacing;

    for (let boundary = 1; boundary < LANE_COUNT; boundary += 1) {
      const x = ROAD_LEFT + (ROAD_WIDTH * boundary) / LANE_COUNT;
      for (let i = 0; i < perLine; i += 1) {
        this.dashes.push(this.add.rectangle(x, i * spacing, DASH_WIDTH, DASH_HEIGHT, DASH_COLOR));
      }
    }
  }

  private resetState(): void {
    this.state = 'playing';
    this.distanceState = createDistance();
    this.spawnerState = createSpawner(MIN_SPAWN_INTERVAL_MS, MAX_SPAWN_INTERVAL_MS);
    this.elapsedMs = 0;
    this.distanceText.setText('0 m');
    this.speedText.setText(`${this.displaySpeed(SPEED.base)} km/h`);
    this.gameOverText.setText('');
    this.restartButton.setVisible(false);
    this.menuButton.setVisible(false);
    for (const car of this.traffic) {
      car.rect.destroy();
    }
    this.traffic = [];
    const startX = laneCenterX(1, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH);
    this.player.x = startX;
    this.prevPlayerX = startX;
    this.dragging = false;
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }

    const safeDelta = Math.min(delta, MAX_DELTA_MS);
    this.elapsedMs += safeDelta;

    const speed = speedAt(this.elapsedMs, SPEED);
    const travel = speed * (safeDelta / 1000);

    this.distanceState = tickDistance(this.distanceState, speed, safeDelta);
    this.distanceText.setText(`${getDistanceValue(this.distanceState)} m`);
    this.speedText.setText(`${this.displaySpeed(speed)} km/h`);

    const spawnResult = tickSpawner(this.spawnerState, safeDelta);
    this.spawnerState = spawnResult.state;
    if (spawnResult.shouldSpawn) {
      this.spawnTraffic();
    }

    // The car is steered by pointer events, which all fired before update()
    // ran — while every traffic car was still at its pre-travel position. So
    // check the steer's swept path against where traffic WAS, then check
    // traffic's swept fall against where the car ended up. Splitting it this
    // way preserves the real order of the two movements; a single check
    // against the union of both spans would report phantom hits on a car the
    // player had already cleared.
    const playerBounds = this.toRect(this.player);
    const prevLeft = this.prevPlayerX - playerBounds.width / 2;
    const steerPath = sweepX(playerBounds, prevLeft);
    let crashed = this.traffic.some((car) => intersects(steerPath, this.toRect(car.rect)));

    for (const car of this.traffic) {
      car.rect.y += travel;
    }

    if (!crashed) {
      crashed = this.traffic.some((car) => {
        const bounds = this.toRect(car.rect);
        return intersects(playerBounds, sweepY(bounds, bounds.y - travel));
      });
    }

    for (const dash of this.dashes) {
      dash.y += travel;
      if (dash.y - DASH_HEIGHT / 2 > HEIGHT) {
        dash.y -= this.dashCycle;
      }
    }

    if (crashed) {
      this.triggerGameOver();
    }
    this.prevPlayerX = this.player.x;

    this.traffic = this.traffic.filter((car) => {
      if (car.rect.y > HEIGHT + CAR_HEIGHT) {
        car.rect.destroy();
        return false;
      }
      return true;
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state === 'playing') {
      this.dragging = true;
      this.steerTo(pointer.x);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || !this.dragging || !pointer.isDown) {
      return;
    }
    this.steerTo(pointer.x);
  }

  private steerTo(x: number): void {
    const half = CAR_WIDTH / 2;
    this.player.x = Phaser.Math.Clamp(x, ROAD_LEFT + half, ROAD_LEFT + ROAD_WIDTH - half);
  }

  private spawnTraffic(): void {
    const blocked = this.traffic.filter((car) => car.rect.y < LANE_BLOCKED_ZONE).map((car) => car.lane);
    const lane = pickSpawnLane(blocked, LANE_COUNT);
    if (lane === null) {
      return;
    }

    const color = TRAFFIC_COLORS[Phaser.Math.Between(0, TRAFFIC_COLORS.length - 1)];
    const rect = this.add.rectangle(
      laneCenterX(lane, LANE_COUNT, ROAD_LEFT, ROAD_WIDTH),
      -CAR_HEIGHT,
      CAR_WIDTH,
      CAR_HEIGHT,
      color
    );
    this.traffic.push({ rect, lane });
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

  /** Cosmetic readout only — the px/s speed scaled into believable km/h. */
  private displaySpeed(speed: number): number {
    return Math.round(speed / 2);
  }

  private triggerGameOver(): void {
    this.state = 'gameOver';
    this.gameOverText.setText(`Crash!\n${getDistanceValue(this.distanceState)} m`);
    this.restartButton.setVisible(true);
    this.menuButton.setVisible(true);
  }
}
