// WEATHER / TIME OF DAY. Picked from the match seed (so server and browsers agree without sending anything), or forced with ?weather=rain.
// The simulation only uses the GAMEPLAY effects: how far sound carries and how far bots can see. The look (fog, rain, lightning) is render/atmosphere.js.
export const WEATHERS = {
  clear: { id: 'clear', label: 'CLEAR DAY',  hearing: 1,    sight: 1,    night: false, rain: 0,   fog: 0,    storm: false },
  rain:  { id: 'rain',  label: 'HEAVY RAIN', hearing: 0.6,  sight: 0.85, night: false, rain: 1,   fog: 0.3,  storm: false },
  fog:   { id: 'fog',   label: 'THICK FOG',  hearing: 0.9,  sight: 0.55, night: false, rain: 0,   fog: 1,    storm: false },
  night: { id: 'night', label: 'NIGHT',      hearing: 1,    sight: 0.75, night: true,  rain: 0,   fog: 0.1,  storm: false },
  storm: { id: 'storm', label: 'NIGHT STORM', hearing: 0.5, sight: 0.7,  night: true,  rain: 1.4, fog: 0.35, storm: true },
};
export const WEATHER_IDS = Object.keys(WEATHERS);

export function pickWeather(seed, forced) {
  if (forced && WEATHERS[forced]) return WEATHERS[forced];
  const h = ((Math.imul((seed | 0) ^ 0x9e3779b1, 2654435761) >>> 0) % 1000) / 1000;
  return h < 0.45 ? WEATHERS.clear : h < 0.65 ? WEATHERS.rain : h < 0.77 ? WEATHERS.fog : h < 0.92 ? WEATHERS.night : WEATHERS.storm;
}
