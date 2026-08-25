# Sound Pack — Design

**Date:** 2026-08-25
**Status:** Approved

## Goal

Twelve new effects and one new music loop, plus a mapping layer that decides
which of them plays. Three things drive it:

1. **Nothing marks the end of a run.** Beating Dodger's boss plays `explode`
   + `milestone`; winning a Sigil run plays `levelup`. Both borrow sounds
   that mean something smaller elsewhere, so the biggest moment in either
   game is the one with no sound of its own.
2. **A boss sounds like ordinary play.** Sigil's boss node keeps the same
   `battle` loop as every other fight; Dodger's boss arrives over the
   unchanged `dodger` loop, announced by a borrowed `levelup`.
3. **Sigil's combat vocabulary is too coarse.** One `slash` for every
   physical hit at any weight, one `cast` for all three elements, no sound
   at all for a monster taking its turn, and — the worst of them —
   `gameover`, the run-is-over sting, firing every time a single blob dies.

This extends `2026-08-12-game-audio-design.md`; every constraint there still
holds. In particular: no binary assets, everything synthesized in code at
boot, and audio never load-bearing — any failure degrades to silence.

## Non-goals

- No change to `battle.ts`, the event types, or any game rule. This is
  presentation only.
- No elemental impact sounds. Elements are announced on the wind-up and
  nowhere else (see "Where the elements live").
- No group-heal sound. `playEvents` already spaces events a full `BEAT`
  apart, so `chorus` on three allies arpeggiates `heal` across three beats
  rather than machine-gunning it.

## The catalog

Twelve entries added to `SFX`. Volumes are playback levels, not render
levels, and follow the existing rule that a sound's loudness tracks how much
it wants noticing.

### Shared

| Name | Length | Shape |
|---|---|---|
| `allclear` | 1.7 s | Rising staccato triad D5–F#5–A5 (square + triangle octave, ~0.13 s each, 0.12 s apart), then from 0.42 s a held D6 + A5 + D4 chord for ~1.1 s over a short filtered noise swell. |
| `warning` | 1.0 s | Two tones alternating three times — a siren, not a melody. Deliberately not pretty; it is the only sound in the game that means "something is coming". |

`allclear` is the loudest thing in the game at `volume: 0.65`. It plays at
most once per run, so it can take the room. `weak`'s comment claiming that
title is corrected to "the loudest thing in a fight".

### Sigil — magic wind-ups

One per castable element, played when a **party** member spends MP:

| Name | Shape |
|---|---|
| `castFire` | A crackle: noise rising through an opening filter over a sawtooth. |
| `castWater` | A wash: a filtered noise swell with a sine falling under it. |
| `castLeaf` | Growth: a triangle climbing in three discrete steps. |

`cast` is kept and narrowed. It is now specifically the *colourless* magic —
`force`, `nova`, `pulse`, `mend`, `chorus` — which is the daughter's entire
kit, so it stops being a default and starts being a character.

### Sigil — impact weight

One family at three weights, keyed off `SkillTier`:

| Tier | Name | Shape |
|---|---|---|
| `normal` | `slash` | Unchanged. |
| `strong` | `heavy` | `slash`'s noise sweep with a low tone thudding under it. |
| `spread` | `sweep` | Shorter and brighter than `slash`, and wider in the filter. |

They stay in one family on purpose. Weight is the axis, not physicality — a
spread *spell* landing must not sound like a sword, and the damage number
already says which element caused it.

### Sigil — the monster's voice

| Name | Shape |
|---|---|
| `growl` | A low, dirty sawtooth with noise over it. |

Plays on every foe action, including the free `strike` and `bite` that make
no sound at all today. Heroes and monsters share the `SKILLS` table, which
is right for the resolver and wrong for the ear: without this, a salamander
casting `scorch` plays the party's own spell sound back at the player.

### Sigil — the misused stings

| Name | Length | Replaces | Shape |
|---|---|---|---|
| `fell` | 0.5 s | `gameover` on a foe's `down` | A short descending figure with a thud under it. |
| `downed` | 0.7 s | `gameover` on a hero's `down` | Lower and sagging: clearly worse news than a monster dropping. |
| `restore` | 0.25 s | `heal` on `mp` | A light upward blip, thinner than `heal`. |
| `cure` | 0.4 s | `heal` on a successful `cured` | A short bell ring. A cure that found nothing keeps `guard`. |

After this, `gameover` means only "the run is over" — which is what it
sounds like.

## Boss music

One `boss` entry in `MUSIC`, bringing it to eight loops. It obeys every
existing invariant: 32 steps in each of bass, lead and drums, and a loop
length inside the documented 8–10 s window.

- **bpm 118** — 32 eighth notes at 118 bpm is 8.14 s.
- **`leadType: 'sawtooth'`** — no other track uses a saw lead, so the switch
  is identifiable within a bar.
- **Bass** — a pedal on D1 with an Eb1 leaning against it. The minor second
  is the whole point: it never resolves.
- **Lead** — a minor arpeggio built around the tritone.
- **Drums** — kick on every beat rather than every other one.

### Where it engages

**Dodger** — `startBossArrival()` (`GameScene.ts:782`) plays `warning` in
place of the borrowed `levelup` and calls `playMusic(this, 'boss')`.
`playMusic` cuts the outgoing loop and fades the new one in over
`MUSIC_FADE_MS`; the cut is right here, because the arrival already flashes
and shakes the camera.

**Sigil** — `BattleSceneData` gains `boss?: boolean`, passed from
`QuestScene.ts:349` as `node.id === run.map.bossId`. A boss fight plays
`warning` in `create()` and `playMusic(this, 'boss')` instead of `'battle'`.

The flag is passed rather than derived because `BattleScene` is playable
standalone (`returnTo` absent) and has no access to `RunState`. A boolean on
the scene data keeps the map as the single owner of what a node means.

## Where the elements live

Elemental character goes on the wind-up and nowhere else.

`weak` is the loudest sound in a fight because hitting a weakness is the one
thing the game has to teach, and it teaches it with no text. Giving each
element its own impact would put three new sounds in exactly the band where
that cue has to stay unmistakable. On the wind-up there is nothing to blur:
the element is announced before the number lands, and the number's colour
confirms it.

## The mapper — `src/core/rpg/voice.ts`

Two pure functions, no Phaser import, unit-tested like the rest of `core/`:

```ts
voiceForAct(skill: Skill, actorSide: Side): SfxName | null
voiceForEvent(event: BattleEvent, skill: Skill | null, targetSide: Side): SfxName | null
```

`voiceForAct`:

- foe actor → `growl`, always.
- party actor, `mpCost > 0` → `castFire` / `castWater` / `castLeaf` by
  element, or `cast` when the element is `plain`.
- party actor, `mpCost === 0` → `null`. The swing is heard as its impact,
  as it is today.

`voiceForEvent`:

- `damage`, `band === 'weak'` → `weak` (unchanged, either side).
- `damage` on a foe → `slash` / `heavy` / `sweep` by the acting skill's tier.
- `damage` on a hero → `hurt` (unchanged).
- `down` → `fell` for a foe, `downed` for a hero.
- `mp` → `restore`.
- `cured` → `cure` when something came off, `guard` when nothing did.
- everything else → its current sound.

`damage` events carry no skill reference, and they are not being given one —
`act` always precedes its damage events inside the same `playEvents` walk,
so `BattleScene` remembers the last `act`'s skill and passes it in. That
keeps `battle.ts` and the event union untouched.

The functions return `SfxName | null` rather than throwing or defaulting.
Silence is a legitimate answer for `act` on a free swing, and a mapper that
invented a sound for an unrecognised event would be harder to notice than
one that stays quiet.

## Scene wiring

| Site | Change |
|---|---|
| `GameScene.startBossArrival` (`:782`) | `levelup` → `warning`; add `playMusic(this, 'boss')`. |
| `GameScene.triggerWin` (`:794`) | Keep `explode`; `milestone` → `allclear` on a `delayedCall(180)` so the fanfare reads as the consequence of the explosion, not a layer of it. |
| `QuestScene.endRun` (`:472`) | `won ? 'allclear' : 'gameover'`. |
| `QuestScene` battle launch (`:349`) | Pass `boss: node.id === run.map.bossId`. |
| `BattleScene.create` (`:159`) | Boss fights play `warning` + `playMusic('boss')`. |
| `BattleScene.playEvent` (`:424`) | Track the last `act` skill; route every sound through `voice.ts`. |
| `BattleScene.finish` (`:661`) | Unchanged — a single fight ending is not an all-clear. |

Sigil's music is otherwise left alone. `QuestScene.endRun` does not fade the
loop today, and changing that is a separate decision from this one.

## File organisation

`sfx.ts` is 581 lines and would pass 950 with twelve more entries. It
becomes a directory:

```
src/audio/sfx/
  index.ts     type SfxName, interface SfxSpec, the composed SFX record
  shared.ts    tap, launch, gameover, allclear, warning
  dodger.ts    shoot, explode, hurt
  car.ts       crash, milestone
  fishing.ts   catch, rare, trash, plop, bite, snap, levelup, timeup
  sigil.ts     slash, heavy, sweep, cast, castFire, castWater, castLeaf,
               growl, weak, guard, heal, restore, cure, afflict, fell, downed
```

A pure move: no render function changes, and `bus.ts` keeps importing `SFX`
and `SfxName` from `./sfx`. Two stale comments are corrected on the way —
the header claiming "sixteen sounds" (there are 22 today, 34 after) and
`weak`'s claim to be the loudest sound in the game.

## Testing

**`src/core/rpg/__tests__/voice.test.ts`** — the mapper is pure, so it is
tested directly:

- Table-driven over every entry in `SKILLS`: each resolves to a defined
  `SfxName` or `null` for both sides, never to a name absent from `SFX`.
- The specific rules: a foe's `act` is `growl` whatever the skill; `flare`
  is `castFire`; `nova` is `cast`; `crush` lands as `heavy` and `cleave` as
  `sweep`; a foe's `down` is `fell` and a hero's is `downed`; a `cured` that
  cleared nothing is `guard`.

**`src/audio/__tests__/sfx.test.ts`** — a minimal fake `BaseAudioContext`
recording only the calls `synth.ts` makes, then table-driven over `SFX`:

- Every entry's last scheduled voice ends within its `durationSec`. This is
  the invariant the file header has always stated and nothing has ever
  checked; a truncated tail is inaudible until someone listens for it.
- Every `volume` is within 0–1.

**`src/audio/__tests__/music.test.ts`** — no change needed. It is already
`describe.each` over `MUSIC`, so the boss loop inherits the 32-step, bpm and
loop-length assertions the moment it is added.

## Risks

- **The pack is large.** Fourteen new things at once is more than any
  previous audio change. The mapper is the mitigation: adding a sound is a
  data change and choosing when it plays is a tested function, so a bad
  choice is a one-line fix rather than an archaeology exercise.
- **Boot cost.** Every buffer renders at boot in an `OfflineAudioContext`.
  Twelve short effects plus one 8 s loop is a real increase, and the loop
  is the expensive one. Worth measuring once the loop exists; if boot
  regresses noticeably, the fallback is rendering music lazily on first
  `playMusic`, which is a change to `bus.ts` alone.
- **`warning` fires twice in Sigil** if the boss node is re-entered after a
  loss. That is correct — it is a fresh fight — but worth confirming it
  does not stack with the music fade-in.
