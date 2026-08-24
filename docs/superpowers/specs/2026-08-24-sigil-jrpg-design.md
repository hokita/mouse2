# Sigil — a wordless turn-based J-RPG for mouse2

## Context

mouse2 is a portrait (430×932) Phaser 3 collection of one-thumb iPhone arcade games — four
runs of 60 seconds or so, picked from `MenuScene`. This adds a fifth card that is
deliberately a different animal: a **mini-campaign J-RPG**, roughly 10–15 minutes per run.

Decisions made during brainstorming:

| Question | Decision |
|---|---|
| Scope | Mini-campaign — node map between fights, boss at the end |
| Exploration | Branching **node map** you tap through (no walking, no d-pad) |
| Battle | **Pure classic turn-based** — pick a command, watch it resolve. No timed hits |
| Party | Fixed party of 3, gains EXP and levels within a run |
| Defeat | Run over → back to menu. No save file, no persistence |
| Presentation | **Wordless.** Icons and colour only; numbers allowed |
| Depth | Elements **and** status effects |

The wordless constraint is the spine of the design, not a skin. It follows the repo's existing
direction — commit e50501b was literally *"Big Bite: say the line's state without words"*. With
no text, **colour and glyph carry every rule**: which element an enemy is weak to, which
character is poisoned, what a command does. It also means the tutorial is the art.

## Constraints inherited from the repo

- **Glyphs are drawn with `Phaser.GameObjects.Graphics`, never emoji.** `widgets.ts:379`
  documents why: *"a speaker emoji renders differently on every platform and arrives as a
  hollow box on some."* In a wordless UI a hollow box is an unreadable game.
- Pure rules live in `src/core/`, vitest-tested; Phaser never appears there.
- Textures are generated at runtime into the texture cache (`ensureXTexture(scene)` pattern,
  see `src/ui/pondTextures.ts`).
- TDD per the user's global CLAUDE.md — but per stored preference, do **not** extract
  genuinely trivial logic (a 2-line clamp) into its own tested module.
- Scenes are reused across visits: reset all instance state in `create()`
  (`MenuScene.ts:45` shows the failure mode).

## Architecture

Two scenes, run state as a plain object handed between them.

```
MenuScene ──▶ QuestScene (node map) ──▶ BattleScene ──▶ back to QuestScene
                    │                                        │
             rest / treasure / shrine                  defeat → game over
             resolved in place as cards
```

### New files

**Rules — `src/core/rpg/` (no Phaser, all vitest-tested)**

`src/core/` is flat with 20 modules today; a subdirectory keeps this set from swamping it.
Tests in `src/core/rpg/__tests__/`, matching the existing `src/core/__tests__/` convention.

| Module | Responsibility |
|---|---|
| `rng.ts` | Seeded PRNG. Load-bearing: makes battles reproducible in tests |
| `elements.ts` | `fire` / `ice` / `spark` / `plain`; weakness & resist multipliers |
| `stats.ts` | Stat blocks, level curve, per-level growth, EXP thresholds |
| `damage.ts` | Damage formula — element multiplier, guard, defence, variance |
| `status.ts` | poison / sleep / atk-down / regen — apply, tick, expire |
| `turnOrder.ts` | Speed-sorted queue, recomputed each round |
| `skills.ts` | Skill table: id, glyph, MP cost, element, power, target shape |
| `enemies.ts` | Enemy table + per-tier encounter groups |
| `items.ts` | Small consumable table |
| `party.ts` | Party creation, EXP award, level-up, skill unlock |
| `battle.ts` | Battle state machine: apply a command, run enemy AI, detect win/lose |
| `nodeMap.ts` | Procedural branching map generation |
| `run.ts` | Run state: party, map, position, inventory — the object passed between scenes |

**Presentation**

- `src/scenes/QuestScene.ts` — node map; rest/treasure/shrine resolved as in-place cards.
- `src/scenes/BattleScene.ts` — the fight.
- `src/scenes/quest/partyBar.ts`, `src/scenes/quest/enemyRow.ts` — battle HUD pieces, so
  `BattleScene` does not become another 1283-line file. Mirrors `src/scenes/fish/*`.
- `src/ui/questTextures.ts` — every glyph, party sigil, enemy silhouette and node icon.

### Reused as-is (do not reimplement)

`createGameOverOverlay`, `createBackButton`, `createSoundButton`, `createStarBackdrop`,
`createButton`, `containerHitArea`, `transitionTo`, `DEPTH` — all `src/ui/widgets.ts`.
`PALETTE`, `displayStyle`, `RADIUS`, `shade` — `src/ui/theme.ts`. `playMusic`, `playSfx`,
`fadeOutMusic` — `src/audio/bus.ts`.

### Touched files

- `src/games.ts` — 5th `GameEntry`: title `Sigil`, accent `PALETTE.rose` (the one unused
  accent), new `GameIcon` `'sigil'`.
- `src/scenes/MenuScene.ts` — `createIcon()` branch for the new icon; the copy
  *"Four small games. One thumb."* (line 77) and `CARD_HEIGHT`/`FIRST_CARD_Y` need retuning
  for a fifth card.
- `src/main.ts` — register both scenes.
- `src/audio/music.ts` — two `MusicName` entries: `quest` (map) and `battle`. Each spec's
  three arrays **must** be exactly 32 steps; the file warns a short bass truncates silently.
- `src/audio/sfx.ts` — `slash`, `cast`, `guard`, `heal`, `afflict`, `victory`. `levelup`
  already exists and should be reused.

## The wordless vocabulary

This table is the spec. Everything below is drawn, not typed.

| Meaning | Sign |
|---|---|
| Attack / Skill / Guard / Item | ⚔ · ✦ · ◑ · ⚗ — four command buttons, bottom third, thumb-reachable |
| Fire / Ice / Spark / Plain | Amber ▲ · cyan ▼ · violet ◈ · grey ● (colour **and** shape, so it survives colour-blindness) |
| Enemy element | The enemy's own palette — a fire enemy *is* amber |
| Weakness hit | Damage number renders large and tinted with the element, plus a screen-shake |
| Resisted hit | Damage number small and muted, with a dull thud |
| HP | Bar + numeric readout |
| MP | Discrete pips (a spell costs a countable number of pips) |
| Statuses | Small pips orbiting the portrait: poison ☠ green, sleep ᶻ blue, atk-down ▼ grey, regen ✚ mint |
| Turn order | A queue strip of sigils along the top; the acting one grows |
| Node types | ⚔ battle · ⚔⚔ elite · ⚑ rest · ◆ treasure · ✧ shrine · ☠ boss |
| Level up | `levelup` sfx + an upward burst on the portrait; new skill glyph flies into the tray |

**Shrine replaces the shop.** A shop needs currency, prices and a purchase UI — three
word-shaped problems, and with no cross-run persistence gold has nowhere to go. A shrine
offers **1-of-3 boon cards**, each a single glyph. Same decision, no economy.

## Content

- **Party of 3** — ♦ Vanguard (high HP/ATK, fire, cleave + cover), ✺ Caster (low HP, high
  MAG, ice/spark, single + all-target), ✚ Warden (heal, cure, regen, atk-down).
  Skills unlock at fixed levels.
- **Map** — 3 tiers, ~12 nodes over 8 rows, branch width 1–3, boss at the top. ~15–20 fights.
- **Enemies** — ~8 types across the tiers plus one boss; each weak to one element, some
  inflicting statuses.

## Phases

Each phase ends green and, from phase 2, playable.

1. **Rules.** All of `src/core/rpg/` under TDD. No Phaser, no rendering. Ends with a vitest
   simulation that plays a full battle from a seed.
2. **One battle.** `questTextures.ts` + `BattleScene` + the HUD helpers. A hardcoded
   encounter, playable end to end. This is where the wordless vocabulary gets proven — if a
   glyph does not read here, fix the vocabulary before building more on it.
3. **The map.** `nodeMap.ts` wired to `QuestScene`; rest / treasure / shrine cards; travel
   between the two scenes carrying `run.ts` state.
4. **A whole run.** EXP and levelling, skill unlocks, boss, victory and defeat cards,
   `games.ts` + `MenuScene` entry, five-card menu retune.
5. **Audio and polish.** Two music tracks, the sfx set, tweens and screen shake.

## Verification

- `pnpm test` — unit tests per core module.
- **Balance simulation** (`src/core/rpg/__tests__/run.test.ts`): drive ~200 seeded runs
  through the rules headlessly with a simple policy and assert the win rate falls in a sane
  band, and that no battle can stalemate (every fight terminates). This is the safety net a
  turn-based game needs and an arcade game does not — it is why `rng.ts` exists.
- `pnpm build` — `tsc --noEmit` then the Vite build.
- `pnpm dev`, then drive it in Chrome via the MCP browser tools: full run from menu → map →
  battles → boss, plus a deliberate wipe to confirm the game-over path.
  **Check `document.visibilityState` first** — a hidden Chrome window throttles Phaser's RAF
  to ~1fps and the game looks frozen when it is fine.
- Screenshot the map and a battle into `docs/screenshots/`, as the existing games do.
- Read the battle screen with the sound off and no prior knowledge: if you cannot tell which
  enemy is weak to what, the vocabulary has failed and phase 2 is not done.
