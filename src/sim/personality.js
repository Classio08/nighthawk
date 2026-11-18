// Every bot gets a personality: a handful of numbers (0..1) that bend the utility scores in bot.js.
// Same engine, different people: a Rusher dives into fights, a Sniper holds a nest and shoots from afar, etc.
// Add a personality = add one entry here. (Vehicle Thief and Loot Goblin get their desires when vehicles / airdrops exist.)
export const PERSONALITIES = {
  rusher:    { label: 'Rusher',    aggr: 0.95, caution: 0.15, camper: 0,    curiosity: 0.9, social: 0.3, tact: 0.2, skillBonus: 0,     weapons: ['smg', 'shotgun'], noCover: true },
  sniper:    { label: 'Sniper',    aggr: 0.3,  caution: 0.7,  camper: 0.95, curiosity: 0.2, social: 0.2, tact: 0.3, skillBonus: 0.12,  weapons: ['dmr'],            ads: true },
  tactician: { label: 'Tactician', aggr: 0.6,  caution: 0.55, camper: 0.1,  curiosity: 0.5, social: 0.9, tact: 0.95, skillBonus: 0.08, weapons: ['ar', 'lmg'] },
  survivor:  { label: 'Survivor',  aggr: 0.35, caution: 0.95, camper: 0.35, curiosity: 0.3, social: 0.5, tact: 0.4, skillBonus: 0,     weapons: ['ar'] },
  brawler:   { label: 'Brawler',   aggr: 0.75, caution: 0.35, camper: 0.05, curiosity: 0.6, social: 0.4, tact: 0.5, skillBonus: 0,     weapons: ['ar', 'lmg', 'shotgun'] },
  // NPC third faction: defends a post, never leaves it (see Simulation guards)
  guard:     { label: 'Guard',     aggr: 0.8,  caution: 0.3,  camper: 0,    curiosity: 0.1, social: 0.1, tact: 0.2, skillBonus: 0.1,   weapons: ['smg'],            guard: true },
};
export const PERSONALITY_IDS = ['rusher', 'sniper', 'tactician', 'survivor', 'brawler'];

/** deterministic pick (uses the match rng) with a fixed ratio so every match has a mix */
export function pickPersonality(rng, i) {
  const order = ['tactician', 'rusher', 'brawler', 'sniper', 'survivor'];
  return rng() < 0.55 ? order[i % order.length] : PERSONALITY_IDS[Math.floor(rng() * PERSONALITY_IDS.length)];
}
