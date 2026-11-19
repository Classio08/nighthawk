// NIGHTHAWK asset intake rules. A candidate is not a shipped asset until its exact file and licence are verified.
export const ALLOWED_ASSET_LICENSES = new Set([
  'CC0 1.0',
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
]);

export const ASSET_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  APPROVED: 'approved',
  INTEGRATED: 'integrated',
});

const isHttpUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
};

export function validateAssetRecord(record = {}) {
  const errors = [];
  if (!record.id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(record.id)) errors.push('Asset id must be a lowercase slug');
  if (!record.kind || !['model', 'texture', 'audio', 'animation', 'font'].includes(record.kind)) errors.push('Unsupported asset kind');
  if (!record.source || !isHttpUrl(record.source)) errors.push('A valid source URL is required');
  if (!Object.values(ASSET_STATUS).includes(record.status)) errors.push('Unknown asset status');

  const licenseVerified = record.licenseVerified === true;
  if (record.status !== ASSET_STATUS.CANDIDATE) {
    if (!licenseVerified) errors.push('Approval requires a verified exact licence');
    if (!ALLOWED_ASSET_LICENSES.has(record.license)) errors.push('Licence is not on the project allowlist');
    if (!record.creator || typeof record.creator !== 'string') errors.push('Creator / publisher is required');
    if (!record.provenance || typeof record.provenance !== 'string') errors.push('Exact pack / file provenance is required');
  }
  if (record.status === ASSET_STATUS.INTEGRATED && (!record.path || typeof record.path !== 'string' || record.path.startsWith('/') || record.path.includes('..'))) {
    errors.push('Integrated assets need a safe project-relative path');
  }

  if (record.kind === 'texture') {
    const width = Number(record.width), height = Number(record.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) errors.push('Texture dimensions must be positive integers');
    else if (width > 2048 || height > 2048) errors.push('Web texture budget is 2048 px per dimension');
  }
  return { valid: errors.length === 0, errors, shippable: errors.length === 0 && record.status === ASSET_STATUS.INTEGRATED };
}

// Research candidates only. No files are downloaded or silently treated as approved.
export const ASSET_CANDIDATES = Object.freeze([
  { id: 'ground-087', kind: 'texture', source: 'https://ambientcg.com/view?id=Ground087', status: ASSET_STATUS.CANDIDATE, purpose: 'Kavari dry sand / compacted desert floor' },
  { id: 'ground-064', kind: 'texture', source: 'https://ambientcg.com/view?id=Ground064', status: ASSET_STATUS.CANDIDATE, purpose: 'Outpost gravel / hard-packed ground' },
  { id: 'rocks-ground-03', kind: 'texture', source: 'https://polyhaven.com/a/rocks_ground_03', status: ASSET_STATUS.CANDIDATE, purpose: 'Dry riverbed and rock cover' },
  { id: 'universal-base-characters', kind: 'model', source: 'https://quaternius.com/', status: ASSET_STATUS.CANDIDATE, purpose: 'Rig / animation pipeline evaluation; exact pack licence must be checked' },
  { id: 'kaykit-adventurers', kind: 'model', source: 'https://kaylousberg.com/', status: ASSET_STATUS.CANDIDATE, purpose: 'Fallback rig / animation pipeline evaluation; exact pack licence must be checked' },
]);
