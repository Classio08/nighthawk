// NIGHTHAWK field equipment profiles. Geometry is baked into the existing soldier meshes,
// so each operator gains a recognisable loadout without adding draw calls.
const DARK = 0x20262d, WEBBING = 0x343d43, METAL = 0x69727a, RUBBER = 0x161b20, LIGHT = 0xb6aa8d;

export const OPERATOR_KITS = Object.freeze({
  roms: Object.freeze({ label: 'Heavy support', accent: 0xd4a017, pack: 'heavy', pouches: 4, radio: false, explosive: false, medic: false, tablet: false }),
  shadow: Object.freeze({ label: 'Low-profile infiltration', accent: 0x71849b, pack: 'slim', pouches: 2, radio: false, explosive: false, medic: false, tablet: false }),
  douglas: Object.freeze({ label: 'Combat medical', accent: 0x39d98a, pack: 'medic', pouches: 3, radio: true, explosive: false, medic: true, tablet: false }),
  cliffhanger: Object.freeze({ label: 'Demolitions', accent: 0xff8c42, pack: 'breach', pouches: 4, radio: true, explosive: true, medic: false, tablet: false }),
  'navy-blue': Object.freeze({ label: 'Precision reconnaissance', accent: 0x4aa3ff, pack: 'recon', pouches: 2, radio: true, explosive: false, medic: false, tablet: false }),
  rampol: Object.freeze({ label: 'Heavy breach', accent: 0xc0c6d0, pack: 'heavy', pouches: 4, radio: true, explosive: false, medic: false, tablet: false }),
  maetja: Object.freeze({ label: 'Signals and cyber', accent: 0x2bd4c4, pack: 'signals', pouches: 2, radio: true, explosive: false, medic: false, tablet: true }),
  cleiseis: Object.freeze({ label: 'Close protection', accent: 0xe5484d, pack: 'slim', pouches: 2, radio: false, explosive: false, medic: false, tablet: false }),
});

const PACKS = {
  heavy: [0.44, 0.5, 0.22],
  slim: [0.34, 0.42, 0.15],
  medic: [0.4, 0.44, 0.19],
  breach: [0.4, 0.46, 0.19],
  recon: [0.36, 0.44, 0.17],
  signals: [0.39, 0.46, 0.17],
};

export function operatorKitFor(operatorId) {
  return OPERATOR_KITS[operatorId] ?? OPERATOR_KITS.roms;
}

/** Body, vest, head, backpack and operator-specific kit. All positions are soldier-local metres. */
export function buildOperatorBodyParts(color, skin, operatorId) {
  const kit = operatorKitFor(operatorId);
  const parts = [
    [0.52, 0.6, 0.28, 0, 1.15, 0, color],                            // torso
    [0.54, 0.16, 0.3, 0, 0.9, 0, DARK],                              // belt
    [0.42, 0.36, 0.075, 0, 1.2, -0.165, WEBBING],                     // carrier outer shell
    [0.34, 0.27, 0.035, 0, 1.22, -0.215, DARK],                      // front plate
    [0.3, 0.3, 0.3, 0, 1.6, 0, skin],                                // head
    [0.34, 0.13, 0.34, 0, 1.74, 0, color],                            // helmet
    [0.26, 0.07, 0.03, 0, 1.62, -0.155, DARK],                       // visor
    [0.38, 0.44, 0.09, 0, 1.28, 0.19, DARK],                         // rear plate
    [0.12, 0.16, 0.28, -0.29, 1.43, -0.015, WEBBING, -0.12],         // shoulder pads
    [0.12, 0.16, 0.28, 0.29, 1.43, -0.015, WEBBING, 0.12],
    [0.3, 0.08, 0.06, 0, 0.9, -0.2, kit.accent],                     // callsign / unit strip
    [0.08, 0.09, 0.035, 0, 1.18, -0.239, kit.accent],                // centre plate mark
    [0.04, 0.04, 0.04, -0.18, 0.9, -0.205, METAL],                   // belt buckle / clips
    [0.04, 0.04, 0.04, 0.18, 0.9, -0.205, METAL],
  ];
  for (let i = 0; i < kit.pouches; i++) {
    const x = (i - (kit.pouches - 1) / 2) * 0.105;
    parts.push([0.085, 0.135, 0.075, x, 1.02, -0.225, i === 0 ? kit.accent : WEBBING]);
    parts.push([0.09, 0.025, 0.08, x, 1.09, -0.23, DARK]);
  }
  const [pw, ph, pd] = PACKS[kit.pack] ?? PACKS.slim;
  parts.push([pw, ph, pd, 0, 1.22, 0.24, kit.pack === 'medic' ? 0x33443e : DARK]); // pack
  parts.push([pw * 0.74, 0.07, 0.035, 0, 1.22 + ph * 0.24, 0.335, kit.accent]); // pack ID panel
  parts.push([0.07, 0.11, 0.075, -pw * 0.32, 1.03, 0.31, WEBBING]);              // side canister
  parts.push([0.07, 0.11, 0.075, pw * 0.32, 1.03, 0.31, WEBBING]);
  if (kit.radio) {
    parts.push([0.11, 0.17, 0.075, 0.24, 1.42, 0.17, DARK]);                    // shoulder radio
    parts.push([0.018, 0.22, 0.018, 0.24, 1.61, 0.17, METAL]);                 // antenna
    parts.push([0.08, 0.06, 0.02, 0.24, 1.42, 0.125, kit.accent]);
  }
  if (kit.explosive) {
    for (const x of [-0.26, 0.26]) parts.push([0.095, 0.17, 0.105, x, 1.28, 0.23, 0x59443b]); // demo charges
    parts.push([0.14, 0.07, 0.07, 0, 0.78, -0.18, 0x59443b]); // detonator pouch
  }
  if (kit.medic) {
    parts.push([0.16, 0.13, 0.035, -0.17, 1.27, -0.225, 0xf0eee7]); // medical panel
    parts.push([0.04, 0.13, 0.02, -0.17, 1.27, -0.25, 0xd13d3d]);
    parts.push([0.13, 0.04, 0.02, -0.17, 1.27, -0.25, 0xd13d3d]);
  }
  if (kit.tablet) {
    parts.push([0.17, 0.22, 0.045, -0.29, 1.06, -0.16, DARK]); // forearm terminal stowed on carrier
    parts.push([0.135, 0.17, 0.012, -0.29, 1.07, -0.188, 0x245d62]);
  }
  if (kit.pack === 'recon') {
    parts.push([0.19, 0.045, 0.045, 0, 1.86, -0.11, DARK]);  // low optic / NVG bridge
    parts.push([0.045, 0.075, 0.055, -0.07, 1.82, -0.16, METAL]);
    parts.push([0.045, 0.075, 0.055, 0.07, 1.82, -0.16, METAL]);
  } else if (kit.pack === 'signals') {
    parts.push([0.18, 0.06, 0.045, 0, 1.86, -0.1, DARK]);
    parts.push([0.018, 0.24, 0.018, -0.12, 1.94, 0.01, kit.accent]);
  } else if (kit.pack === 'heavy') {
    parts.push([0.12, 0.16, 0.1, -0.27, 1.16, 0.17, WEBBING]);
    parts.push([0.12, 0.16, 0.1, 0.27, 1.16, 0.17, WEBBING]);
  }
  parts.push([0.16, 0.05, 0.035, 0, 0.82, -0.2, METAL]); // belt hardware
  return parts;
}

/** Boots and kneepads share each operator's existing leg draw call. */
export function buildOperatorLegParts(operatorId) {
  const kit = operatorKitFor(operatorId);
  return [
    [0.19, 0.78, 0.2, 0, -0.39, 0, 0x2a2d33],
    [0.22, 0.16, 0.07, 0, -0.19, -0.12, 0x20262d],    // knee armour
    [0.21, 0.11, 0.32, 0, -0.72, -0.055, 0x191e23],   // boot
    [0.13, 0.025, 0.04, 0, -0.17, -0.16, kit.accent], // small ID stitch
  ];
}

/** Gloves and forearm armour remain in the existing single arm mesh. */
export function buildOperatorArmParts(color, operatorId) {
  const kit = operatorKitFor(operatorId);
  const parts = [
    [0.1, 0.1, 0.62, -0.27, -0.04, -0.3, color, 0.28],
    [0.1, 0.1, 0.62, 0.27, -0.04, -0.3, color, -0.28],
  ];
  for (const side of [-1, 1]) {
    parts.push([0.12, 0.12, 0.22, side * 0.27, -0.04, -0.44, 0x343d43, side * 0.28]); // forearm guard
    parts.push([0.12, 0.1, 0.13, side * 0.27, -0.09, -0.61, 0x171c21, side * 0.28]); // glove
  }
  if (kit.pack === 'heavy' || kit.pack === 'breach') {
    parts.push([0.14, 0.14, 0.16, -0.28, 0.06, -0.08, kit.accent, 0.28]);
  }
  return parts;
}

export function operatorKitSummary() {
  return Object.entries(OPERATOR_KITS).map(([id, kit]) => ({ id, label: kit.label, pack: kit.pack, accent: kit.accent }));
}
