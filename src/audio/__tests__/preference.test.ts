import { describe, expect, it, vi } from 'vitest';
import { MUTE_KEY, readMuted, writeMuted } from '../preference';
import type { MuteStorage } from '../preference';

function stub(value: string | null): MuteStorage {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

const throwing: MuteStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
};

describe('readMuted', () => {
  it('reads a stored true', () => {
    expect(readMuted(stub('true'))).toBe(true);
  });

  it('reads a stored false', () => {
    expect(readMuted(stub('false'))).toBe(false);
  });

  it('defaults to unmuted when nothing is stored', () => {
    expect(readMuted(stub(null))).toBe(false);
  });

  it('defaults to unmuted on a value it does not recognise', () => {
    expect(readMuted(stub('yes'))).toBe(false);
  });

  it('defaults to unmuted when there is no storage at all', () => {
    expect(readMuted(null)).toBe(false);
  });

  it('defaults to unmuted when the storage throws', () => {
    // Private-mode Safari throws on access. That should cost the preference,
    // not the game.
    expect(readMuted(throwing)).toBe(false);
  });

  it('reads the agreed key', () => {
    const storage = stub('true');
    readMuted(storage);
    expect(storage.getItem).toHaveBeenCalledWith('mouse2:muted');
    expect(MUTE_KEY).toBe('mouse2:muted');
  });
});

describe('writeMuted', () => {
  it('stores the flag as a string', () => {
    const storage = stub(null);
    writeMuted(storage, true);
    expect(storage.setItem).toHaveBeenCalledWith('mouse2:muted', 'true');
    writeMuted(storage, false);
    expect(storage.setItem).toHaveBeenCalledWith('mouse2:muted', 'false');
  });

  it('says nothing when there is no storage', () => {
    expect(() => writeMuted(null, true)).not.toThrow();
  });

  it('swallows a storage that throws', () => {
    expect(() => writeMuted(throwing, true)).not.toThrow();
  });
});
