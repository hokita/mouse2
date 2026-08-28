import { describe, expect, it } from 'vitest';
import { SFX } from '../../../audio/sfx';
import { SKILLS } from '../skills';
import { voiceForAct, voiceForEvent } from '../voice';
import type { BattleEvent } from '../battle';

const damage = (band: 'weak' | 'neutral' | 'resist'): BattleEvent => ({
  type: 'damage',
  target: 'foe:0',
  amount: 12,
  band,
  element: 'plain',
});

describe('voiceForAct', () => {
  it('gives every monster the same voice, whatever it is doing', () => {
    expect(voiceForAct(SKILLS.strike, 'foes')).toBe('growl');
    expect(voiceForAct(SKILLS.scorch, 'foes')).toBe('growl');
    expect(voiceForAct(null, 'foes')).toBe('growl');
  });

  it('names the element on a hero’s spell', () => {
    expect(voiceForAct(SKILLS.flare, 'party')).toBe('castFire');
    expect(voiceForAct(SKILLS.torrent, 'party')).toBe('castWater');
    expect(voiceForAct(SKILLS.thorn, 'party')).toBe('castLeaf');
  });

  it('keeps the colourless spells on the plain cast', () => {
    expect(voiceForAct(SKILLS.nova, 'party')).toBe('cast');
    expect(voiceForAct(SKILLS.mend, 'party')).toBe('cast');
  });

  it('stays silent on a hero’s free swing, which is heard as its impact', () => {
    expect(voiceForAct(SKILLS.strike, 'party')).toBeNull();
  });

  it('stays silent on a hero’s paid swing too — steel, not colour, whatever it costs', () => {
    expect(voiceForAct(SKILLS.crush, 'party')).toBeNull();
    expect(voiceForAct(SKILLS.hew, 'party')).toBeNull();
  });

  it('stays silent when a hero uses an item, which has no skill', () => {
    expect(voiceForAct(null, 'party')).toBeNull();
  });
});

describe('voiceForEvent', () => {
  it('keeps the weakness cue whatever the skill was', () => {
    expect(voiceForEvent(damage('weak'), SKILLS.crush, 'foes')).toBe('weak');
    expect(voiceForEvent(damage('weak'), SKILLS.bite, 'party')).toBe('weak');
  });

  it('weights a hit on a monster by the skill’s tier', () => {
    expect(voiceForEvent(damage('neutral'), SKILLS.hew, 'foes')).toBe('slash');
    expect(voiceForEvent(damage('neutral'), SKILLS.crush, 'foes')).toBe('heavy');
    expect(voiceForEvent(damage('neutral'), SKILLS.cleave, 'foes')).toBe('sweep');
  });

  it('falls back to the plain hit when no skill is known', () => {
    expect(voiceForEvent(damage('neutral'), null, 'foes')).toBe('slash');
  });

  it('does not weight a hit on a hero — being hurt is being hurt', () => {
    expect(voiceForEvent(damage('neutral'), SKILLS.gnash, 'party')).toBe('hurt');
  });

  it('tells a monster falling apart from a hero falling', () => {
    expect(voiceForEvent({ type: 'down', target: 'foe:0' }, null, 'foes')).toBe('fell');
    expect(voiceForEvent({ type: 'down', target: 'hero:mother' }, null, 'party')).toBe('downed');
  });

  it('separates healing, restoring and curing', () => {
    expect(voiceForEvent({ type: 'heal', target: 'hero:mother', amount: 20 }, null, 'party')).toBe(
      'heal'
    );
    expect(voiceForEvent({ type: 'mp', target: 'hero:mother', amount: 8 }, null, 'party')).toBe(
      'restore'
    );
    expect(
      voiceForEvent({ type: 'cured', target: 'hero:mother', cleared: ['poison'] }, null, 'party')
    ).toBe('cure');
  });

  it('reports a cure that found nothing as a nothing', () => {
    expect(
      voiceForEvent({ type: 'cured', target: 'hero:mother', cleared: [] }, null, 'party')
    ).toBe('guard');
  });

  it('says nothing about bookkeeping events', () => {
    expect(voiceForEvent({ type: 'outcome', outcome: 'won' }, null, 'foes')).toBeNull();
    expect(
      voiceForEvent({ type: 'statusExpired', target: 'foe:0', status: 'poison' }, null, 'foes')
    ).toBeNull();
  });
});

// The mapper returns names as strings; nothing in the type system stops it
// returning one that was never added to SFX. This is the check that would
// have caught a typo'd 'castfire' before it reached a player as silence.
describe('every skill resolves to a sound that exists', () => {
  it.each(Object.values(SKILLS))('$id', (skill) => {
    for (const side of ['party', 'foes'] as const) {
      const act = voiceForAct(skill, side);
      if (act !== null) {
        expect(SFX).toHaveProperty(act);
      }
      const hit = voiceForEvent(damage('neutral'), skill, side);
      if (hit !== null) {
        expect(SFX).toHaveProperty(hit);
      }
    }
  });
});
