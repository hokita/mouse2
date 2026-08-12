# Game Audio — Design

Date: 2026-08-12

## Goal

Give mouse2 sound: short effects for every meaningful game event, plus a looping
music bed on the menu and in each of the three games. Players can mute, and the
choice sticks between sessions.

## Constraints

- **The repo ships no binary assets.** Every sprite is drawn into a canvas
  texture at boot (`src/ui/textures.ts`). Audio follows the same rule: it is
  synthesized in code, not loaded from files. Sound is therefore chiptune by
  nature.
- **Portrait phone target.** Effects must stay short and quiet enough to survive
  a phone speaker held close to a child's face.
- **Audio is never load-bearing.** Any failure in the audio layer degrades to
  silence; no failure may break a run.

## Architecture

A new `src/audio/` module. Buffers are synthesized once at boot with
`OfflineAudioContext`, then registered in Phaser's audio cache so the rest of
the code treats them exactly like decoded MP3s.

| File | Responsibility |
|---|---|
| `audio/notes.ts` | Pure: note name → frequency, pattern spec → timed note events. Unit-tested. |
| `audio/preference.ts` | Pure: mute flag read/write over an injected storage. Unit-tested. |
| `audio/synth.ts` | Voice primitives — square/triangle/saw tone, noise burst, ADSR envelope — writing into an `OfflineAudioContext`. |
| `audio/sfx.ts` | The effect catalog: one render function per named effect. |
| `audio/music.ts` | The four loop definitions as pattern data, fed through `notes.ts` + `synth.ts`. |
| `audio/bus.ts` | Public API: boot-time render, Phaser registration, mute state, playback. |

Scenes only ever touch `bus.ts`:

```ts
playSfx(this, 'catch');
playMusic(this, 'fish');   // no-ops if that loop is already playing
```

### Boot flow

`main.ts` calls `initAudio(game)` immediately after `new Phaser.Game(...)`.
`OfflineAudioContext` needs no user gesture, so every buffer renders right away
at Phaser's own `sound.context.sampleRate`. Each finished buffer is added to
`game.cache.audio` under a key; from then on Phaser owns looping, per-sound
volume, tab-blur pausing, and the iOS unlock-on-first-tap.

### Music switching

Each scene calls `playMusic` in `create()`. The bus stops the outgoing loop with
a short fade and starts the new one, or does nothing when the requested key is
already playing — so bouncing between menu and game neither stutters nor stacks
loops.

## Sound catalog

Fourteen effects, each under 300 ms, and four loops.

**Shared UI**

| Name | Trigger | Character |
|---|---|---|
| `tap` | Menu card, back chip, overlay button | Short mid blip |
| `launch` | Game start | Rising sweep |
| `gameover` | Any run ends — one sting, shared by all three games | Three descending notes |

**Dodger** — cyan, driving arpeggio loop

| Name | Trigger | Character |
|---|---|---|
| `shoot` | Player auto-fire | 40 ms tick at ~25% volume — the ship fires on a timer, and anything meatier becomes a machine gun within seconds |
| `explode` | Enemy destroyed | Noise burst with falling filter |
| `hurt` | Heart lost | Low detuned buzz, over the existing shake |

**Car Racer** — amber, steady synth pulse loop

| Name | Trigger | Character |
|---|---|---|
| `crash` | Collision | Heavier noise thud than `explode` |
| `milestone` | Every 500 m | Soft two-note chime |

**Fish Catch** — mint, gentle night-pond loop

| Name | Trigger | Character |
|---|---|---|
| `catch` | Ordinary fish tapped | Rising blip, pitch stepping up through a streak so a good run sounds good |
| `rare` | Gold fish tapped | Brighter sparkle arpeggio |
| `trash` | Trash tapped | Dull descending thunk, over the existing shake |
| `plop` | Pop-up dives untapped | Quiet water drop |
| `levelup` | Level toast | Ascending three-note chime |
| `timeup` | Timer expires | End-of-run horn |

**Music.** Four loops of roughly eight seconds at 100–120 bpm, each a bass line,
an arpeggio and light percussion drawn from the same pattern engine. The menu is
calm, Dodger drives, Car Racer pulses, Fish Catch stays sparse and watery.

**Mix.** Music sits at 0.35 gain, effects at 0.6, so a game-over sting is never
buried. On game over the loop fades out over 400 ms and the sting plays;
restarting fades the loop back in.

## Mute control

`createSoundButton(scene, { accent })` in `ui/widgets.ts` — a compact round chip
in the back chip's visual language. In-game it sits directly under the back chip
at screen center, since the top row already holds two stat pills and the back
chip. On the menu, which has no stat pills, it sits in the top-right corner.

It swallows its own `pointerdown` with `stopPropagation()`, exactly as
`createBackButton` does, so tapping it never registers as a steer.

State is one boolean in `localStorage` under `mouse2:muted`, applied to
`game.sound.mute`. Reads and writes are wrapped in try/catch: private-mode Safari
throws on `localStorage`, and that should cost the preference, not the game.

## Testing

Red/green TDD on the pure layer:

- `audio/notes.ts` — `noteToFreq('A4') === 440`, octave math, and
  `sequence(pattern, bpm)` producing correctly-timed, non-overlapping events with
  the expected total loop length.
- `audio/preference.ts` — mute read/write against an injected storage stub,
  including the case where the storage throws.

The Web Audio glue (`synth.ts`, `sfx.ts`, `bus.ts`) is not meaningfully
unit-testable — no assertion tells you a sound is pleasant. That layer is
verified in the browser: play each game, confirm every effect fires and each loop
switches cleanly. The Chrome window stays visible during that check; a hidden
window throttles Phaser to about 1 fps and makes a working game look broken.

## Failure modes

All degrade silently:

| Condition | Behaviour |
|---|---|
| No WebAudio (Phaser falls back to `NoAudioSoundManager` or the HTML5 manager) | `initAudio` returns early; every `playSfx`/`playMusic` is a no-op |
| A buffer fails to render | That one sound becomes a no-op; the rest still play |
| `localStorage` unavailable | Defaults to unmuted; the preference simply is not remembered |

## Out of scope

- Tempo or intensity that reacts to difficulty.
- Shipped audio files of any kind.
- Per-sound volume sliders; the toggle is all-or-nothing.
