// PLANNED OPERATIONS: story text and ending conditions for operations that are NOT implemented yet. Pure data, nothing here runs.
// Source: the owner's story pack (19 Nov 2026), trimmed. The pack's stat-boost unlock rewards (+cloak, +damage...) were removed on purpose: progress in this game
// is cosmetic only (src/profile.js). Their mission ids (ghost_frequency, relay_uplink...) are kept so the plan stays traceable; when one is built it gets a real
// id in src/sim/missions.js and moves out of this file into story.js / endings.js with conditions that use real sim stats.
export const ACTS = [
 {
  "id": "act1",
  "name": "ACT I — DUST",
  "desc": "You arrive as rescuers. You leave as targets."
 },
 {
  "id": "act2",
  "name": "ACT II — NIGHT",
  "desc": "You learn who the Jackal is. He learns who you are."
 },
 {
  "id": "act3",
  "name": "ACT III — LIGHT",
  "desc": "Hold until dawn. Then turn the lights out on him, forever."
 }
];
export const PLANNED_MISSIONS = {
 "relay_uplink_coop": {
  "title": "RELAY UPLINK: CO-OP",
  "act": "act1",
  "briefing": "Same ridge, two hackers. 1.7x faster if you both stay in. If one falls, the other revives. Extraction needs BOTH.",
  "controlBrief": "CONTROL: \"Two on the ridge, two off it. No heroes. No one extracts alone.\"",
  "intro": "Two hackers, one circle. Dust: \"This is either genius or we both die together.\" Sable: \"Both. Probably both.\"",
  "mid": "One down. The other holds. That is the job.",
  "outroGood": "Both of you walk off that ridge. Sable: \"1.7x. Told you maths wins wars.\" Dust: \"Maths and me.\"",
  "outroBad": "You both make it — one carried, one limping. CONTROL: \"You left together. That is the only stat I care about.\"",
  "stakes": "Co-op is not a mode. It is the point of Nighthawk.",
  "endings": {
   "A": {
    "id": "two_as_one",
    "title": "TWO AS ONE",
    "subtitle": "Both Hack, Both Live",
    "condition": "Both hackers in circle for 50%+ of hack + both extract alive",
    "desc": "Two hackers, one circle, one rhythm. 1.7x and not a single second wasted. This is Nighthawk."
   },
   "B": {
    "id": "carried_home",
    "title": "CARRIED HOME",
    "subtitle": "One Carries the Other",
    "condition": "One player downed at least once + both extract",
    "desc": "One fell. The other carried. That is not failure. That is the job."
   },
   "fail": {
    "id": "left_behind",
    "title": "LEFT BEHIND",
    "subtitle": "Squad Wiped",
    "condition": "Both down / squad wiped",
    "desc": "No one extracts alone. And no one extracts at all, this time."
   }
  }
 },
 "nighthawk_down": {
  "title": "NIGHTHAWK DOWN",
  "act": "act2",
  "briefing": "Night. No HUD. No noise. Infiltrate the outpost, plant the charge, vanish. Cloak is king. If they see you, you are already dead.",
  "controlBrief": "CONTROL: \"You are a ghost tonight, Kestrel. Ghosts do not get seen. Ghosts do not get caught.\"",
  "intro": "Night air, cold sand. Your cloak hums. Echo: \"Three guards. Two lights. One way in. Take your time.\"",
  "mid": "A light sweeps. You freeze. It passes. Your heart does not.",
  "outroGood": "Charge planted. No one saw you. No one ever will. The outpost burns behind you and you are already gone. Ghost.",
  "outroBad": "Charge planted — loud. You ran, you fought, you vanished in smoke. Echo: \"Ghost? Tonight you were a firework. Still counts.\"",
  "stakes": "Stealth proves you can reach him anywhere. Noise proves you can survive anywhere.",
  "endings": {
   "A": {
    "id": "true_ghost",
    "title": "TRUE GHOST",
    "subtitle": "Never Seen",
    "condition": "Never spotted (alertMax = 0) + charge planted",
    "desc": "No one saw you. No one heard you. The charge goes off and the outpost burns for a ghost."
   },
   "B": {
    "id": "firework",
    "title": "FIREWORK",
    "subtitle": "Seen, Survived",
    "condition": "Spotted at least once + charge planted + extract",
    "desc": "They saw you. You ran. You fought. You vanished in smoke. Ghost? Tonight you were a firework. Still counts."
   },
   "fail": {
    "id": "caught",
    "title": "CAUGHT",
    "subtitle": "Seen and Stopped",
    "condition": "Killed / captured / time up before charge",
    "desc": "The outpost wakes up. The ghost gets caught. The night wins this one."
   }
  }
 },
 "convoy_ambush": {
  "title": "CONVOY AMBUSH",
  "act": "act2",
  "briefing": "The Jackal moves water like it is gold. Because here, it is. Ambush his convoy on Dry River road. Stop it. Loot it. Vanish before Viper arrives.",
  "controlBrief": "CONTROL: \"That convoy feeds his army. Stop it and his army goes hungry. Hungry armies make mistakes.\"",
  "intro": "Dust on the ridge, finger on the trigger. \"Convoy inbound. Three trucks. One chance. Wait for it… wait…\"",
  "mid": "First truck stops. Second swerves. Third tries to run. It does not.",
  "outroGood": "Three crates. Water, ammo, intel. The villages eat tonight. Viper arrives to an empty road and a note: \"Thanks for the delivery.\"",
  "outroBad": "You got the crates — but Viper got your scent. She is hunting you now. And she is good.",
  "stakes": "Water is power. Take his water, take his power.",
  "endings": {
   "A": {
    "id": "clean_ambush",
    "title": "CLEAN AMBUSH",
    "subtitle": "No One Escaped",
    "condition": "Convoy stopped in <120s + all 3 crates looted + no deaths",
    "desc": "Perfect ambush. No truck escapes. No one dies. Three crates, clean road, empty dust."
   },
   "B": {
    "id": "messy_ambush",
    "title": "MESSY AMBUSH",
    "subtitle": "Got the Crates, Lost the Quiet",
    "condition": "Convoy stopped + crates looted + 1+ deaths or >120s",
    "desc": "Messy. Loud. Alive. You got the crates and Viper got your scent. She is hunting you now."
   },
   "fail": {
    "id": "convoy_escaped",
    "title": "CONVOY ESCAPED",
    "subtitle": "Missed It",
    "condition": "Convoy escapes / squad wiped",
    "desc": "The convoy rolls on. The villages go hungry. The Jackal eats."
   }
  }
 },
 "ghost_frequency": {
  "title": "GHOST FREQUENCY",
  "act": "act2",
  "briefing": "Three transmitters. No markers. Follow the signal — sound, HUD ping, gut. Find them, jam them, blind Viper’s ears.",
  "controlBrief": "CONTROL: \"Viper listens to everything. Tonight, we make her deaf.\"",
  "intro": "A beep. Faint. Then stronger. Sable: \"Follow the beep, Kestrel. The beep is truth.\"",
  "mid": "Hot. Hotter. There — buried in sand, blinking. One down, two to go.",
  "outroGood": "All three dead. Viper’s radio is static. For the first time in this war, she cannot hear you coming.",
  "outroBad": "You found them — but one broadcast your position first. Viper knows where you were. She will know where you go.",
  "stakes": "If Viper hears you, she hunts you. If she is deaf, you hunt her.",
  "endings": {
   "A": {
    "id": "deaf_viper",
    "title": "DEAF VIPER",
    "subtitle": "All 3, Never Broadcast",
    "condition": "All 3 transmitters found + never detected (alertMax < 2)",
    "desc": "All three dead. Viper’s radio is static. For the first time, she cannot hear you coming."
   },
   "B": {
    "id": "heard",
    "title": "HEARD",
    "subtitle": "Found, But Broadcast",
    "condition": "All 3 found + detected at least once",
    "desc": "You found them — but one broadcast your position first. Viper knows where you were. She will know where you go."
   },
   "fail": {
    "id": "static",
    "title": "STATIC",
    "subtitle": "Transmitters Live",
    "condition": "Time up / squad wiped before all 3",
    "desc": "The transmitters keep humming. Viper keeps listening. The basin keeps whispering."
   }
  }
 },
 "last_light": {
  "title": "LAST LIGHT",
  "act": "act3",
  "briefing": "Hold Forward Outpost until dawn. 240 seconds. Limited ammo. Mortar every 90 seconds. The Jackal sends everything. You hold everything.",
  "controlBrief": "CONTROL: \"Dawn is in four minutes. Hold four minutes and the basin wakes up free. Fall and it wakes up his.\"",
  "intro": "Dawn is a thin line. Dust loads the LMG: \"Four minutes. I have held longer for worse reasons.\"",
  "mid": "Mortar. Reload. Mortar. Reload. The line holds. You hold.",
  "outroGood": "Dawn. Sun over Kavari. The outpost stands. Dust: \"Told you. Four minutes.\" Echo: \"Four minutes and twelve seconds.\" Dust: \"Details.\"",
  "outroBad": "Dawn — and you are still standing, but the outpost is burning. You held the line. The line did not hold you.",
  "stakes": "This is the last night. Hold it, and tomorrow is yours.",
  "endings": {
   "A": {
    "id": "dawn_stands",
    "title": "DAWN STANDS",
    "subtitle": "Outpost Holds",
    "condition": "Hold 240s + outpost HP > 50% + no deaths",
    "desc": "Dawn. Sun over Kavari. The outpost stands. You held four minutes and the basin wakes up free."
   },
   "B": {
    "id": "dawn_burns",
    "title": "DAWN BURNS",
    "subtitle": "Held, But Burning",
    "condition": "Hold 240s + outpost HP <= 50% or 1+ deaths",
    "desc": "Dawn — and you are still standing, but the outpost is burning. You held the line. The line did not hold you."
   },
   "fail": {
    "id": "night_wins",
    "title": "NIGHT WINS",
    "subtitle": "Outpost Falls",
    "condition": "Outpost falls / squad wiped before 240s",
    "desc": "Night wins this one. The outpost falls. The basin sleeps under the Jackal."
   }
  }
 },
 "blackout_ridge": {
  "title": "BLACKOUT RIDGE",
  "act": "act3",
  "briefing": "Kill the generator. Blackout the outpost. Steal the intel in the dark. Flashlight = seen. Then exfiltrate. End it.",
  "controlBrief": "CONTROL: \"One generator. One folder. One war. Turn his lights out, Kestrel. For good.\"",
  "intro": "Night. The outpost glows. One generator hums. One folder waits. One war ends tonight.",
  "mid": "Generator down. Black. Silence. Then — footsteps in the dark. Yours? Theirs? Both.",
  "outroGood": "Intel stolen. Generator dead. The Jackal’s lights go out across Kavari — and they do not come back on. You walk out in the dark, and the dark is yours.",
  "outroBad": "Intel stolen — but they saw your flashlight. They know your face now. The war is not over. It is personal.",
  "stakes": "This is the end. Or the beginning of the next war. You choose.",
  "endings": {
   "A": {
    "id": "lights_out_forever",
    "title": "LIGHTS OUT, FOREVER",
    "subtitle": "Unseen Blackout",
    "condition": "Generator killed + intel stolen + never seen (flashlight never on while enemies near)",
    "desc": "Intel stolen. Generator dead. The Jackal’s lights go out across Kavari — and they do not come back on. You walk out in the dark, and the dark is yours."
   },
   "B": {
    "id": "seen_in_dark",
    "title": "SEEN IN THE DARK",
    "subtitle": "Intel, But Seen",
    "condition": "Generator killed + intel stolen + seen at least once",
    "desc": "Intel stolen — but they saw your flashlight. They know your face now. The war is not over. It is personal."
   },
   "fail": {
    "id": "lights_stay_on",
    "title": "LIGHTS STAY ON",
    "subtitle": "Intel Lost",
    "condition": "Generator not killed / intel not stolen / squad wiped",
    "desc": "The lights stay on. The intel stays locked. The war stays."
   }
  }
 }
};
