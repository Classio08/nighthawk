import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_CANDIDATES, ASSET_STATUS, validateAssetRecord } from '../src/assets/catalog.js';

test('research candidates are explicitly not yet shippable', () => {
  for (const candidate of ASSET_CANDIDATES) {
    const result = validateAssetRecord(candidate);
    assert.equal(result.valid, true);
    assert.equal(result.shippable, false);
  }
});

test('integrated assets require exact allowlisted licence, provenance and a safe path', () => {
  const valid = validateAssetRecord({
    id: 'test-sand', kind: 'texture', source: 'https://example.com/sand',
    status: ASSET_STATUS.INTEGRATED, license: 'CC0 1.0', licenseVerified: true,
    creator: 'Example Artist', provenance: 'Example Pack / sand_01',
    path: 'public/assets/sand.webp', width: 1024, height: 1024,
  });
  assert.deepEqual(valid, { valid: true, errors: [], shippable: true });
  const unsafe = validateAssetRecord({
    id: 'test-sand', kind: 'texture', source: 'https://example.com/sand',
    status: ASSET_STATUS.INTEGRATED, license: 'GPL-3.0', licenseVerified: true,
    creator: 'Example Artist', provenance: 'Example Pack', path: '../secret.webp',
    width: 4096, height: 4096,
  });
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.shippable, false);
  assert.ok(unsafe.errors.length >= 3);
});

test('candidate and malformed asset records cannot bypass the licence gate', () => {
  assert.equal(validateAssetRecord({ id: 'bad', kind: 'model', source: 'javascript:alert(1)', status: 'integrated' }).valid, false);
  assert.equal(validateAssetRecord({
    id: 'bad-texture', kind: 'texture', source: 'https://example.com/a',
    status: 'approved', license: 'MIT', licenseVerified: false,
    creator: 'x', provenance: 'x', width: 2048, height: 2048,
  }).valid, false);
});
