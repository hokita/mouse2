import type { SfxName } from '../../audio/sfx';
import type { BattleEvent, Side } from './battle';
import type { CastableElement } from './elements';
import type { Skill, SkillTier } from './skills';

// Which sound a beat of a fight makes.
//
// This lives here rather than in BattleScene because it is a decision, not a
// drawing: it depends on the skill's tier, its element and whose turn it is,
// and all three of those are rules the scene should not be re-deriving. The
// scene's job is to know that a sound plays; this file's job is to know which.
//
// `null` is a real answer, not a failure. A hero's free swing makes no sound
// on the wind-up because it is heard as its impact a beat later, and a mapper
// that invented something for every event would be a mapper nobody could tell
// was wrong.

const CAST_BY_ELEMENT: Record<CastableElement, SfxName> = {
  fire: 'castFire',
  water: 'castWater',
  leaf: 'castLeaf',
};

// Weight, not steel. A spread *spell* lands on `sweep` too — the damage
// number already says which element caused it, so the sound is free to say
// the one thing the number cannot, which is how hard.
const IMPACT_BY_TIER: Record<SkillTier, SfxName> = {
  normal: 'slash',
  strong: 'heavy',
  spread: 'sweep',
};

/**
 * The wind-up, played as a turn begins. `skill` is null when the actor used
 * an item, which carries no skill.
 *
 * A hero's sword is silent here even when it costs MP: `stat === 'atk'` is
 * still steel, not colour, so `crush` and `cleave` get no more of a wind-up
 * than the free `strike` does — they are heard on the way down, through the
 * tiered slash/heavy/sweep, not on the way up. That silence is also what
 * keeps `cast` honest: it and its three coloured siblings are reserved for
 * the `mag` spells, so hearing one means magic is coming and nothing else.
 */
export function voiceForAct(skill: Skill | null, actorSide: Side): SfxName | null {
  // Heroes and monsters share the SKILLS table, which is right for the
  // resolver and wrong for the ear: without this, a salamander casting
  // `scorch` would play the party's own fire spell back at the player.
  if (actorSide === 'foes') {
    return 'growl';
  }
  if (skill === null || skill.mpCost === 0 || skill.stat === 'atk') {
    return null;
  }
  return skill.element === 'plain' ? 'cast' : CAST_BY_ELEMENT[skill.element];
}

/**
 * Everything that happens after the wind-up. `skill` is the one the acting
 * combatant is currently resolving — damage events do not carry it, so the
 * caller remembers the last `act`.
 *
 * `subjectSide` is the side of whoever the event is about: its target, or its
 * actor for the events that have no target.
 */
export function voiceForEvent(
  event: BattleEvent,
  skill: Skill | null,
  subjectSide: Side
): SfxName | null {
  switch (event.type) {
    case 'damage':
      // The weakness cue outranks everything. It is the only rule the game
      // teaches, it teaches it without text, and nothing added since is
      // allowed to blur it.
      if (event.band === 'weak') {
        return 'weak';
      }
      // A hero being hit is not graded by how hard: from the receiving end
      // there is no difference worth hearing between a bite and a gnash.
      return subjectSide === 'party' ? 'hurt' : IMPACT_BY_TIER[skill?.tier ?? 'normal'];
    case 'heal':
      return 'heal';
    case 'mp':
      return 'restore';
    case 'status':
      return 'afflict';
    case 'statusFailed':
      return 'guard';
    case 'cured':
      return event.cleared.length > 0 ? 'cure' : 'guard';
    case 'guard':
      return 'guard';
    case 'down':
      return subjectSide === 'foes' ? 'fell' : 'downed';
    default:
      return null;
  }
}
