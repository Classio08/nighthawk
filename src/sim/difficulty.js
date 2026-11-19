// Bot difficulty. Bots never cheat (no wall-hacks, no free damage); a harder level only makes them think, turn and aim better,
// and an easier one makes them slower, sloppier and less tricky. `normal` leaves every number exactly as the bots were tuned.
//   skill   added to the bot's skill (0.2..0.97 scale used by reaction time, turn speed and aim error)
//   react   multiplier on reaction time (lower = reacts faster)
//   aim     multiplier on aim error (lower = more accurate)
//   tricks  how often it uses abilities / grenades / mortar strikes (1 = as tuned, 0.4 = rarely)
export const DIFFICULTY = {
  easy:   { id: 'easy',   label: 'EASY',   skill: -0.22, react: 1.45, aim: 1.7,  tricks: 0.4 },
  normal: { id: 'normal', label: 'NORMAL', skill: 0,     react: 1,    aim: 1,    tricks: 1 },
  hard:   { id: 'hard',   label: 'HARD',   skill: 0.1,   react: 0.8,  aim: 0.75, tricks: 1.25 },
  brutal: { id: 'brutal', label: 'BRUTAL', skill: 0.2,   react: 0.62, aim: 0.55, tricks: 1.6 },
};
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY);
export const diffOf = (id) => DIFFICULTY[id] ?? DIFFICULTY.normal;
