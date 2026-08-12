// The mute flag is the only thing the game remembers between visits, and it is
// deliberately the least important thing in the project: every path through
// here degrades to "unmuted" rather than throwing. Storage is injected so the
// rules above are testable without a browser.

export interface MuteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MUTE_KEY = 'mouse2:muted';

export function readMuted(storage: MuteStorage | null): boolean {
  if (storage === null) {
    return false;
  }
  try {
    return storage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeMuted(storage: MuteStorage | null, muted: boolean): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(MUTE_KEY, muted ? 'true' : 'false');
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}
