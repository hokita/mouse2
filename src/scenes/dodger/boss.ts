import Phaser from 'phaser';
import { WIDTH } from '../../gameConfig';
import { PALETTE, shade } from '../../ui/theme';
import { DEPTH } from '../../ui/widgets';
import { TEX, ensureBossTexture, ensureFxTextures } from '../../ui/textures';
import { createSpawner, tickSpawner } from '../../core/spawner';
import type { SpawnerState } from '../../core/spawner';
import { fanVelocities } from '../../core/spread';
import { rectAt } from '../../core/collision';
import type { Rect } from '../../core/collision';
import {
  BOSS_ARRIVAL_MS,
  BOSS_HEIGHT,
  BOSS_MAX_HP,
  BOSS_PHASES,
  BOSS_SPAWN_Y,
  BOSS_WIDTH,
  arrivalY,
  phaseAt,
  slideBounds,
  slideX,
} from '../../core/boss';
import type { BossPhase } from '../../core/boss';

// The final boss's Phaser side: the hull, its halo, its health bar, and the
// decision of when to fire. GameScene never touches these objects directly.
//
// The boss does NOT own its bullets. It returns shot descriptors and the
// scene turns them into ordinary entries in its enemyBullets array, which
// already carries an arbitrary heading and already has a swept player
// collision pass and a four-edge cull. Boss bullets are enemy bullets.

/** Speed matches ENEMY_BULLET_SPEED — the speed the player already reads. */
const BULLET_SPEED = 150;

const BAR_MARGIN = 18;
const BAR_Y = 82;
const BAR_HEIGHT = 14;
const BAR_WIDTH = WIDTH - BAR_MARGIN * 2;

const FLASH_MS = 90;

/**
 * Each phase brightens the hull toward white. Rose throughout: the boss is
 * the tank's big sibling, and the escalation should read as "hotter", not as
 * a different object.
 */
const PHASE_TINT: Record<BossPhase, number> = {
  1: shade(PALETTE.rose, -0.15),
  2: PALETTE.rose,
  3: shade(PALETTE.rose, 0.35),
};

export interface BossShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Boss {
  hull: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  barFill: Phaser.GameObjects.Rectangle;
  barFrame: Phaser.GameObjects.Graphics;
  hp: number;
  phase: BossPhase;
  /** Time on station, driving the slide. Not advanced during the descent. */
  elapsedMs: number;
  /** Time since the descent began, capped at BOSS_ARRIVAL_MS. */
  arrivalMs: number;
  fireState: SpawnerState;
  aimedState: SpawnerState;
  flashTimer?: Phaser.Time.TimerEvent;
}

export function spawnBoss(scene: Phaser.Scene): Boss {
  // Idempotent — define() returns early if the texture already exists — so
  // this costs nothing on the second run and removes any dependence on
  // GameScene having called it first.
  ensureFxTextures(scene);
  const { minX } = slideBounds(WIDTH);

  const halo = scene.add
    .image(minX, BOSS_SPAWN_Y, TEX.glow)
    .setDisplaySize(BOSS_WIDTH * 1.5, BOSS_HEIGHT * 1.6)
    .setTint(PHASE_TINT[1])
    .setAlpha(0.34)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(DEPTH.world - 1);

  const hull = scene.add
    .image(minX, BOSS_SPAWN_Y, ensureBossTexture(scene))
    .setTint(PHASE_TINT[1])
    .setDepth(DEPTH.world);

  // Bar frame and fill sit in the band between the HUD pills (which end at
  // y 72) and the hull's top edge on station (y 140).
  const barFrame = scene.add.graphics().setDepth(DEPTH.hud);
  barFrame.fillStyle(PALETTE.skyTop, 0.55);
  barFrame.fillRoundedRect(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
  barFrame.lineStyle(1.5, PALETTE.surfaceEdge, 0.8);
  barFrame.strokeRoundedRect(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);

  const barFill = scene.add
    .rectangle(BAR_MARGIN, BAR_Y, BAR_WIDTH, BAR_HEIGHT, PALETTE.rose)
    .setOrigin(0, 0)
    .setDepth(DEPTH.hud);

  const phase1 = BOSS_PHASES[1];
  return {
    hull,
    halo,
    barFill,
    barFrame,
    hp: BOSS_MAX_HP,
    phase: 1,
    elapsedMs: 0,
    arrivalMs: 0,
    fireState: createSpawner(phase1.fireIntervalMs, phase1.fireIntervalMs),
    aimedState: createSpawner(2200, 2200),
  };
}

export function bossArrivalProgress(boss: Boss): number {
  return Math.min(1, boss.arrivalMs / BOSS_ARRIVAL_MS);
}

export function bossArrived(boss: Boss): boolean {
  return boss.arrivalMs >= BOSS_ARRIVAL_MS;
}

export function bossCenter(boss: Boss): { x: number; y: number } {
  return { x: boss.hull.x, y: boss.hull.y };
}

export function bossRect(boss: Boss): Rect {
  return rectAt(boss.hull.x, boss.hull.y, BOSS_WIDTH, BOSS_HEIGHT);
}

/**
 * Advances the boss a frame and returns any shots it fired.
 *
 * During the descent it neither slides nor fires — the arrival is a beat the
 * player gets to watch, not an ambush.
 */
export function updateBoss(
  _scene: Phaser.Scene,
  boss: Boss,
  dtMs: number,
  targetX: number,
  targetY: number
): BossShot[] {
  if (!bossArrived(boss)) {
    boss.arrivalMs = Math.min(BOSS_ARRIVAL_MS, boss.arrivalMs + dtMs);
    boss.hull.y = arrivalY(bossArrivalProgress(boss));
    boss.halo.x = boss.hull.x;
    boss.halo.y = boss.hull.y;
    return [];
  }

  boss.elapsedMs += dtMs;
  const { minX, maxX } = slideBounds(WIDTH);
  boss.hull.x = slideX(boss.elapsedMs, boss.phase, minX, maxX);
  boss.halo.x = boss.hull.x;
  boss.halo.y = boss.hull.y;

  const spec = BOSS_PHASES[boss.phase];
  const muzzleY = boss.hull.y + BOSS_HEIGHT / 2;
  const shots: BossShot[] = [];

  const fire = tickSpawner(boss.fireState, dtMs);
  boss.fireState = fire.state;
  if (fire.shouldSpawn) {
    for (const { vx, vy } of fanVelocities(spec.fanCount, spec.fanSpreadRadians, BULLET_SPEED)) {
      shots.push({ x: boss.hull.x, y: muzzleY, vx, vy });
    }
  }

  if (spec.aimedIntervalMs !== null) {
    const aimed = tickSpawner(boss.aimedState, dtMs);
    boss.aimedState = aimed.state;
    if (aimed.shouldSpawn) {
      // Two-line normalise, deliberately not a core module — see the design
      // doc's "deliberately not extracted".
      const dx = targetX - boss.hull.x;
      const dy = targetY - muzzleY;
      const length = Math.hypot(dx, dy) || 1;
      shots.push({
        x: boss.hull.x,
        y: muzzleY,
        vx: (dx / length) * BULLET_SPEED,
        vy: (dy / length) * BULLET_SPEED,
      });
    }
  }

  return shots;
}

/** Applies damage. Returns true if this was the killing blow. */
export function damageBoss(scene: Phaser.Scene, boss: Boss, amount: number): boolean {
  boss.hp = Math.max(0, boss.hp - amount);
  boss.barFill.width = (BAR_WIDTH * boss.hp) / BOSS_MAX_HP;

  if (boss.hp <= 0) {
    return true;
  }

  const nextPhase = phaseAt(boss.hp);
  if (nextPhase !== boss.phase) {
    boss.phase = nextPhase;
    const spec = BOSS_PHASES[nextPhase];
    boss.fireState = createSpawner(spec.fireIntervalMs, spec.fireIntervalMs);
    boss.hull.setTint(PHASE_TINT[nextPhase]);
    boss.halo.setTint(PHASE_TINT[nextPhase]);
    scene.cameras.main.shake(180, 0.008);
  }

  // Each flash owns its timer and cancels the one before it, so a fast
  // sequence of hits cannot let an early timer clear a later hit's tint —
  // the same reasoning as flashEnemy in GameScene.
  boss.flashTimer?.remove();
  boss.hull.setTintFill(PALETTE.text);
  boss.flashTimer = scene.time.delayedCall(FLASH_MS, () => {
    if (boss.hull.active) {
      boss.hull.setTint(PHASE_TINT[boss.phase]);
    }
  });

  return false;
}

export function destroyBoss(boss: Boss): void {
  boss.flashTimer?.remove();
  boss.hull.destroy();
  boss.halo.destroy();
  boss.barFill.destroy();
  boss.barFrame.destroy();
}
