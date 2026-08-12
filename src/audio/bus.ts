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

const listeners = new Set<(muted: boolean) => void>();
let current: { name: MusicName; sound: Phaser.Sound.BaseSound } | null = null;

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
  void renderAll(target, target.sound.context.sampleRate);
}

async function renderAll(target: Phaser.Game, sampleRate: number): Promise<void> {
  // Rendered one at a time and each in its own try: a single bad sound costs
  // that sound, not the soundtrack.
  for (const [name, spec] of Object.entries(SFX)) {
    try {
      const buffer = await renderBuffer(sampleRate, spec.durationSec, spec.render);
      target.cache.audio.add(`sfx-${name}`, buffer);
    } catch (error) {
      console.warn(`[audio] could not render sfx "${name}"`, error);
    }
  }

  for (const [name, spec] of Object.entries(MUSIC)) {
    try {
      const buffer = await renderBuffer(sampleRate, musicLengthSec(spec), (ctx, dest) =>
        renderMusic(spec, ctx, dest)
      );
      target.cache.audio.add(`music-${name}`, buffer);
    } catch (error) {
      console.warn(`[audio] could not render music "${name}"`, error);
    }
  }
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
    return;
  }
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

  scene.tweens.add({
    targets: sound,
    volume: 0,
    duration: durationMs,
    onComplete: () => {
      sound.stop();
      sound.destroy();
    },
  });
  // A scene change mid-fade would strand the sound at whatever volume the
  // tween had reached, still looping.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (sound.isPlaying) {
      sound.stop();
    }
    sound.destroy();
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
