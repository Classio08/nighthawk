// NIGHTHAWK: KAVARI story for the operations that exist today. Tone: grounded, Southern African, professionals under pressure, funny when it is safe.
// DUST LANTERN text comes from the owner's story pack; SIGNAL BLACKOUT is written to continue it. Story never blocks play: it lives in the briefing card and the debrief.
// Operations that are only planned live in planned-data.js (pure data, not playable).
import { ACTS, PLANNED_MISSIONS } from './planned-data.js';

export const CAMPAIGN = {
  title: 'NIGHTHAWK: KAVARI',
  tagline: 'One basin. No one gets left behind.',
  logline: 'A fictional special-ops unit, NIGHTHAWK, is sent into Kavari Basin to stop a warlord from turning a drought into a weapon. It starts as a rescue. It ends as a reckoning.',
  acts: ACTS,
};

/** playable operations, in campaign order (ids are the real ones from src/sim/missions.js) */
export const MISSION_ORDER = ['dust-lantern', 'signal-blackout'];

export const MISSION_STORIES = {
  'dust-lantern': {
    title: 'DUST LANTERN', act: 'act1',
    briefing: 'Dr. Amara Okafor was taken from Basin Yard. The Jackal wants her water codes. We want her back. Find the clues, find her, get her out. Both of you alive. That is the mission.',
    controlBrief: 'CONTROL: "Kestrel, this is not a raid. This is a rescue. Quiet if you can. Loud if you must. But bring her home."',
    intro: 'Dust on your boots, sun in your eyes. Basin Yard is quiet. Too quiet. Sable is already on the radio: "Clues first. Then we find her."',
    outroGood: 'Amara walks out on her own feet. She looks at you and says: "You took your time." Then she smiles. That smile is why you came.',
    outroBad: 'Amara walks out, limping, alive. She squeezes your arm: "You came. That is enough." It is not enough. But it is alive.',
    outroFail: 'The operator went down before Amara could be reached. Kavari stays dark one more night.',
    stakes: 'If Amara dies, the Jackal gets the water. If she lives, Kavari has a chance.',
  },
  'signal-blackout': {
    title: 'SIGNAL BLACKOUT', act: 'act2',
    briefing: 'Since Basin Yard, the Jackal\'s people have been listening. A hostile trace is closing on our unit and it locks in eight minutes. Three relay nodes carry it. Jam all three, then reach the extraction pad before it finds us.',
    controlBrief: 'CONTROL: "Eight minutes, Kestrel. Every relay you jam is a minute they do not have. And do not stand still next to a guard."',
    intro: 'The first relay hums under a tarp. Sable, in your ear: "Hold the jammer on it. Do not move, do not get shot. Easy. Tell that to your hands."',
    outroGood: 'Three relays dark. The trace has nothing left to follow. Sable: "They are shouting at a dead channel. Beautiful."',
    outroBad: 'Three relays dark, but loudly. The garrison knows you were here. Sable: "We got the signal out. We did not get out quietly."',
    outroFail: 'The trace found its mark. Somewhere, the Jackal learns exactly where NIGHTHAWK sleeps.',
    stakes: 'If the trace locks, the Jackal knows where the unit sleeps.',
  },
};

export const getMissionStory = (id) => MISSION_STORIES[id] ?? null;
export const actOf = (id) => ACTS.find((a) => a.id === getMissionStory(id)?.act) ?? null;

/** everything the dashboard needs to draw the operations list: playable first, then the planned ones, each marked honestly */
export function operationList() {
  return [
    ...MISSION_ORDER.map((id) => ({ id, status: 'playable', title: MISSION_STORIES[id].title, act: MISSION_STORIES[id].act, blurb: MISSION_STORIES[id].briefing })),
    ...Object.entries(PLANNED_MISSIONS).map(([id, m]) => ({ id, status: 'planned', title: m.title, act: m.act, blurb: m.briefing })),
  ];
}
