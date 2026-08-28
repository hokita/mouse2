import Phaser from 'phaser';
import { MUSIC, musicLengthSec, renderMusic } from './music';
import type { MusicName } from './music';
import { readMuted, writeMuted } from './preference';
import type { MuteStorage } from './preference';
import { SFX } from './sfx';
import type { SfxName } from './sfx';
import { renderBuffer } from './synth';

// The only part of the audio system a scene ever sees. Two rules hold
// everywhere in this file: nothing here throws into a scene, and every entry
// point is a no-op when audio is unavailable.

const MUSIC_VOLUME = 0.35;
const MUSIC_FADE_MS = 250;
const GAME_OVER_FADE_MS = 400;

let game: Phaser.Game | null = null;
/** False until buffers are rendering: no WebAudio, no sound, no complaints. */
let enabled = false;
let muted = false;
/** Set once in initAudio when enabled; read by lazy music rendering. */
let sampleRate = 0;

const listeners = new Set<(muted: boolean) => void>();
let current: { name: MusicName; sound: Phaser.Sound.BaseSound } | null = null;
// A music buffer renders off an async chain kicked off by the first
// playMusic call for it, but that call's own scene.sound.add needs the
// buffer to already be in the cache — so the very first request for any
// given track always arrives before its buffer exists. Remember it here and
// replay it once rendering catches up, rather than let that request vanish.
let pending: { scene: Phaser.Scene; name: MusicName } | null = null;
// Names currently rendering, so a second playMusic for the same still-
// rendering track doesn't kick off a redundant OfflineAudioContext render.
const musicRendering = new Set<MusicName>();

function storage(): MuteStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function initAudio(target: Phaser.Game): void {
  game = target;

  // Read the preference before the capability check: even with no audio to
  // mute, the chip should show what the player last chose.
  muted = readMuted(storage());
  target.sound.mute = muted;

  if (
    !(target.sound instanceof Phaser.Sound.WebAudioSoundManager) ||
    typeof OfflineAudioContext === 'undefined'
  ) {
    return;
  }

  enabled = true;
  sampleRate = target.sound.context.sampleRate;
  void renderSfx(target, sampleRate);
}

async function renderSfx(target: Phaser.Game, rate: number): Promise<void> {
  // Rendered one at a time and each in its own try: a single bad sound costs
  // that sound, not the soundtrack.
  //
  // Effects render at boot because they must be ready the instant a scene
  // starts. Music does not carry that requirement — a loop can start a beat
  // late without anyone noticing — so it renders lazily instead (see
  // renderMusicTrack below). A boot measurement on this branch found eight
  // ~8-10s music loops costing ~1.5s at boot; deferring them to first
  // playMusic keeps the effects-only boot cost small.
  for (const [name, spec] of Object.entries(SFX)) {
    try {
      const buffer = await renderBuffer(rate, spec.durationSec, spec.render);
      target.cache.audio.add(`sfx-${name}`, buffer);
    } catch (error) {
      console.warn(`[audio] could not render sfx "${name}"`, error);
    }
  }
}

/** Renders one music loop and adds it to the cache, then flushes whatever
 * playMusic call is waiting on it. Guarded by musicRendering so a second
 * playMusic for a track already in flight doesn't start a redundant render. */
function renderMusicTrack(target: Phaser.Game, rate: number, name: MusicName): void {
  if (musicRendering.has(name)) {
    return;
  }
  musicRendering.add(name);
  const spec = MUSIC[name];
  renderBuffer(rate, musicLengthSec(spec), (ctx, dest) => renderMusic(spec, ctx, dest))
    .then((buffer) => {
      target.cache.audio.add(`music-${name}`, buffer);
      flushPendingMusic();
    })
    .catch((error) => {
      console.warn(`[audio] could not render music "${name}"`, error);
    })
    .finally(() => {
      musicRendering.delete(name);
    });
}

/** Replays a playMusic call that arrived before its buffer was ready. The
 * player may already be somewhere else by the time rendering catches up, so
 * a scene that is no longer active just drops the request. */
function flushPendingMusic(): void {
  if (pending === null) {
    return;
  }
  const { scene, name } = pending;
  pending = null;
  if (!scene.scene.isActive()) {
    return;
  }
  playMusic(scene, name);
}

function ready(key: string): boolean {
  return enabled && game !== null && game.cache.audio.exists(key);
}

export function playSfx(
  scene: Phaser.Scene,
  name: SfxName,
  config: { detune?: number } = {}
): void {
  const key = `sfx-${name}`;
  if (!ready(key)) {
    return;
  }
  scene.sound.play(key, { volume: SFX[name].volume, detune: config.detune ?? 0 });
}

export function playMusic(scene: Phaser.Scene, name: MusicName): void {
  const key = `music-${name}`;
  if (!ready(key)) {
    // Only worth remembering (and rendering) if audio is actually available;
    // with none at all there's nothing to catch up to.
    if (enabled && game !== null) {
      pending = { scene, name };
      renderMusicTrack(game, sampleRate, name);
    } else {
      pending = null;
    }
    return;
  }
  // This call is now the freshest request, so it supersedes anything still
  // waiting to be flushed.
  pending = null;
  if (current !== null && current.name === name && current.sound.isPlaying) {
    return;
  }

  // The outgoing loop is cut rather than faded. A fade would be owned by the
  // tween manager of a scene that is already shutting down, which is how a
  // loop survives a scene change and plays over the next one.
  stopMusicNow();

  const sound = scene.sound.add(key, { loop: true, volume: 0 });
  sound.play();
  scene.tweens.add({ targets: sound, volume: MUSIC_VOLUME, duration: MUSIC_FADE_MS });
  current = { name, sound };
}

/** Fades the loop out and forgets it, so a later playMusic starts it again. */
export function fadeOutMusic(scene: Phaser.Scene, durationMs: number = GAME_OVER_FADE_MS): void {
  if (current === null) {
    return;
  }
  const { sound } = current;
  current = null;

  // A scene change mid-fade would strand the sound at whatever volume the
  // tween had reached, still looping. This is only a fallback for that case:
  // once the fade actually finishes on its own, onComplete below removes it,
  // so a normal die-then-restart cycle doesn't leave one stale listener
  // behind on the scene's event emitter per run.
  const onShutdown = (): void => {
    if (sound.isPlaying) {
      sound.stop();
    }
    sound.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);

  scene.tweens.add({
    targets: sound,
    volume: 0,
    duration: durationMs,
    onComplete: () => {
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
      sound.stop();
      sound.destroy();
    },
  });
}

function stopMusicNow(): void {
  if (current === null) {
    return;
  }
  current.sound.stop();
  current.sound.destroy();
  current = null;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (game !== null) {
    game.sound.mute = next;
  }
  writeMuted(storage(), next);
  for (const listener of listeners) {
    listener(next);
  }
}

/** Subscribes to mute changes; returns the unsubscribe. */
export function onMuteChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
