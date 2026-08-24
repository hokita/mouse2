# Dodger Final Boss Design

**Date:** 2026-08-24
**Status:** Approved

## Overview

Dodger is endless: you dodge and shoot until three hearts are gone, and the
only outcome is a score. This adds a finish line. At 90 seconds the debris
field clears, a single large enemy descends, and killing it wins the run.

Everything before 90 seconds is unchanged — the same spawn ramp, tanks,
hearts and scoring the harder-dodger design set out.

## Gameplay

### Run structure

Two orthogonal fields, deliberately kept separate: `runPhase` says where in
the run you are, `state` says how it ended.

```
runPhase:  field ──90s──▶ clearing ──field empty──▶ incoming ──1.2s──▶ boss
             │              │                                          │
             │              │                          boss killed ────┴──▶ state = won
             └──────────────┴──── last heart lost ────────────────────────▶ state = gameOver
```

- **field** — today's game, untouched.
- **clearing** — the spawner stops, enemies already on screen stop firing,
  and their fall speed goes to 3×. They are worth no points on the way out.
- **incoming** — the boss descends, invulnerable and not firing.
- **boss** — the fight.

`runPhase` is `'field' | 'clearing' | 'incoming' | 'boss'`; `GameState`
becomes `'playing' | 'gameOver' | 'won'`. Keeping the outcome out of the
phase chain means the existing `state === 'gameOver'` checks — the overlay's
`isArmed`, the delayed-call guard in `triggerGameOver` — keep working
untouched, and a heart lost at any phase takes the same path it does today.

90 s is chosen against the existing ramp: the spawn interval reaches its
700–1000 ms floor at 60 s, so the player spends 30 s at full field pressure
before the boss. A time trigger rather than a score one means every run is
the same length and a child who survives always reaches the boss — skill
decides whether they beat it, not whether they ever see it.

### Why clearing accelerates the fall

An enemy lives `(HEIGHT + 2 * ENEMY_HEIGHT) / ENEMY_FALL_SPEED` seconds —
`(932 + 166.7) / 90`, about 12.2 s. An enemy that spawned just before the
90 s mark would hold the boss off for that entire time, which is a stall,
not a dramatic beat. Tripling the fall speed during `clearing` caps the wait
at about 4.1 s while still reading as the field falling away rather than
being deleted.

### The boss

**45 HP.** At the existing `PLAYER_FIRE_INTERVAL_MS` of 400 ms the player
lands 2.5 bullets a second, so 45 HP is 18 s of perfect uptime and 25–35 s
of realistic play. It divides into three phases of exactly 15 hits, each
roughly 10 s — long enough that every phase registers, short enough to hold
a small child's attention.

The hull is about 230×120, rose like the tank but darker-plated so it reads
as the same family of threat, one rank up. It hovers at `y = 200` (hull
spanning 140–260) and slides horizontally on a cosine ease, so it visibly
slows at each turn instead of ping-ponging.

| Phase | HP | Slide period | Attack | Interval |
| --- | --- | --- | --- | --- |
| 1 | 45–31 | 5000 ms | 3-way fan, 45° | 1800 ms |
| 2 | 30–16 | 3800 ms | 5-way fan, 80° | 1400 ms |
| 3 | 15–0 | 3000 ms | 5-way fan, 80° + aimed shot | 1400 / 2200 ms |

Phase boundaries are fractions of max HP — above 2/3 is phase 1, above 1/3
is phase 2, otherwise phase 3 — so changing `BOSS_MAX_HP` does not silently
break the split. A phase change flashes the hull, shifts its tint and plays
`milestone`.

The slide range is `x ∈ [131, 299]`: half the hull width plus a 16 px margin
at each edge of the 430 px screen, so the hull never clips off-screen.

Bullets travel at `ENEMY_BULLET_SPEED` (150), the speed the player has
already learned to read, and spawn from the hull's bottom edge at y = 260.
The fans reuse `fanVelocities()` from `core/spread.ts` unchanged. Only phase
3 aims: one shot per 2200 ms on the vector to the player's current position.

The ship's floor keeps it clear of the hull by 18px at all times (see "The
player's space during the fight" below), so ramming the hull cannot occur.
The swept test enemies use remains wired to the hull anyway, as a guard: if a
future change ever narrows that clearance, contact costs a heart immediately
instead of silently passing through.

### The player's space during the fight

`PLAYER_MIN_Y` is 110 today, derived from the HUD pills' geometry, which puts
the ship's top edge at y = 90. That is a problem twice over once a boss
exists: a health bar under the pills would sit flush against the ship, and a
hull hovering at 140–260 would leave a pocket above it where the player could
park out of the fans' reach and trivialise the fight.

So during the boss the ship's floor becomes **298** — the hull's bottom edge
plus half the ship plus the existing 18 px clearance. That leaves the ship
`y ∈ [298, 912]`, 614 px of a 932 px screen, which is ample, and removes the
pocket entirely.

The floor is not switched abruptly. Through the 1200 ms of `incoming` it
interpolates from 110 to 298 and the ship is clamped to it each frame, so the
descending boss appears to shove the player out of its space. A snap would
teleport the ship up to 188 px.

### HUD, hearts and winning

The boss's health bar spans the screen width below the score and hearts
pills, at `y = 82`, 14 px tall, rose, draining right to left. It is the only
thing on screen that tells a child who cannot read that they are winning, so
it is load-bearing rather than decoration. The band it occupies is clear:
the pills end at y = 72 and the hull's top edge is at y = 140.

**Hearts carry over into the fight and are not refilled.** The clearing beat
is already a breather; a refill would make surviving the preceding 90 s
mean nothing.

Killing the boss scores **+1000** — against a tank's 150 — and shows the
existing overlay with the title `YOU WIN` and the run's final score.
`createGameOverOverlay` already takes its title per call, so the win card
needs no new widget and its `PLAY AGAIN` and menu buttons work unchanged.

Losing to the boss is an ordinary `GAME OVER`; `PLAY AGAIN` restarts the run
from zero. There is no boss retry — it would need a second overlay path and
would cheapen the win.

Music stays on the `dodger` track. The arrival is marked with a camera flash,
a shake and the `levelup` sfx. A dedicated boss track is a reasonable
follow-up but is deliberately out of scope here.

## Architecture

Pure logic in `src/core/` with unit tests, Phaser rendering and wiring in the
scene — the existing split. The boss's Phaser half goes in
`src/scenes/dodger/`, following the precedent of `src/scenes/fish/`.

`GameScene.ts` is already 684 lines and its own comments warn about it doing
too much. Putting the boss's roughly 250 lines directly into it would push it
past 950 and mix "run a debris field" with "run a boss fight" in one update
loop, so the boss's sprites and bullets get their own module.

### New modules

- `core/boss.ts` — `phaseAt(hp, maxHp)` returning 1 | 2 | 3; `slideX(elapsedMs,
  phase, minX, maxX)`; `arrivalY(t)` and `playerFloorAt(t)`, both taking `t`
  as the descent's progress clamped to 0..1; and a `BOSS_PHASES`
  table holding the slide periods, fan counts, spreads and fire intervals from
  the table above. Anything that decides how hard the fight is lives here,
  where a test can read it — the same reasoning that put `difficulty.ts` and
  `spread.ts` in core.
- `scenes/dodger/boss.ts` — owns the hull, halo, health bar and boss bullets.
  Surface: `spawnBoss`, `updateBoss(dt)`, `damageBoss(n)`, `bossRect()`,
  `destroyBoss()`. The scene never touches the boss's Phaser objects directly.
- `ui/textures.ts` — `ensureBossTexture()`, beside `ensureShardTexture()`.

### GameScene changes

- A `runPhase` field and its transitions; `state` keeps its existing
  `playing` / `gameOver` meaning and gains `won`.
- The spawner is skipped outside `field`; enemies get a fall-speed multiplier
  during `clearing`.
- `movePlayerTo` clamps against a `playerFloor` field rather than the
  `PLAYER_MIN_Y` constant.
- The player-bullet pass tests against `bossRect()` when the boss is alive.
- `resetState()` must clear the run phase, the boss, the boss's bullets and
  the player floor, alongside what it already resets.

Net growth in `GameScene.ts` is about 80 lines rather than 250.

### Deliberately not extracted

The aimed shot's normalise is two lines in the scene, and the health bar's
width math is one. Neither earns a tested core module — the same call the
harder-dodger design made for the vertical clamp and tank hp.

## Error handling

No new failure modes. All state lives in the scene and the boss module and is
cleared by `resetState()`. Boss bullets are destroyed off-screen on all four
edges like enemy bullets. A phase change or a kill landing inside a tint-flash
window must not tint a destroyed sprite — the existing `sprite.active` guard
pattern applies.

`MAX_DELTA_MS` still holds. The fastest closing pair is unchanged, a 500 px/s
player bullet against the boss, whose hull is 120 px tall — far more margin
than the ordinary enemy the cap was set against.

## Testing

Red/green TDD for `core/boss.ts`: phase boundaries at exactly 2/3 and 1/3,
the slide staying inside its range and easing at the turns, arrival and floor
interpolation hitting their endpoints. Existing core tests stay green
unchanged.

Scene behaviour — the clearing beat, the boss's descent shoving the ship
down, the health bar draining, the win card — is verified by playing the game
in a visible browser window, as the previous Dodger work was.
