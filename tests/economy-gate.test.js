import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, evaluateForPlayer, sanitizeConfig, liveBlockers } from '../src/economy/gate.js';

const shipped = JSON.parse(readFileSync(new URL('../data/compliance.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-19';
const liveCfg = (over = {}) => ({
  mode: 'live', features: { wallet: true, nft: true, earn: false, wager: true },
  licence: { reference: 'NA-GEC-0001', issuer: 'Gaming Board (example)', approvedBy: 'Owner', approvedOn: '2026-11-01', expiresOn: '2027-11-01', scope: ['wallet', 'nft', 'wager'] },
  jurisdictions: { allow: ['NA'] }, chains: { sandbox: [11155111], live: [8453] }, ...over,
});

test('the SHIPPED compliance.json is closed: mode off, every feature off, no licence, nothing allowed', () => {
  const s = evaluate(shipped, {}, TODAY);
  assert.equal(s.mode, 'off'); assert.equal(s.realValue, false); assert.equal(s.currency, null);
  assert.ok(Object.values(s.features).every((v) => v === false));
  assert.equal(shipped.licence.reference, ''); assert.deepEqual(shipped.jurisdictions.allow, []); assert.deepEqual(shipped.chains.live, []);
});

test('garbage, missing and hostile config falls back to closed', () => {
  for (const bad of [null, undefined, 42, 'live', [], { mode: 'LIVE' }, { mode: 'yes' }, { mode: { toString: () => 'live' } }]) assert.equal(evaluate(bad, { NIGHTHAWK_ECONOMY_LIVE: '1' }, TODAY).mode, 'off');
  const c = sanitizeConfig({ players: { minAge: 5, requireKyc: 'no' }, limits: { rakeBps: 99999, maxPlayers: 1 } });
  assert.equal(c.players.minAge, 18, 'the minimum age can never be lowered below 18'); assert.equal(c.players.requireKyc, true); assert.equal(c.limits.rakeBps, 0); assert.equal(c.limits.maxPlayers, 8);
});

test('sandbox: play money only, test chains only, features follow the flags, never real value', () => {
  const s = evaluate({ mode: 'sandbox', features: { wallet: true, wager: true }, chains: { sandbox: [11155111], live: [8453] } }, {}, TODAY);
  assert.equal(s.mode, 'sandbox'); assert.equal(s.currency, 'PLAY'); assert.equal(s.realValue, false);
  assert.deepEqual(s.chains, [11155111]); assert.equal(s.features.wallet, true); assert.equal(s.features.earn, false);
});

test('live is blocked until EVERY condition holds, and a blocked live request fails CLOSED (not into sandbox)', () => {
  const env = { NIGHTHAWK_ECONOMY_LIVE: '1' };
  assert.equal(evaluate(liveCfg(), env, TODAY).mode, 'live');
  const cases = [
    ['no server env flag', liveCfg(), {}, TODAY],
    ['no licence reference', liveCfg({ licence: { ...liveCfg().licence, reference: '' } }), env, TODAY],
    ['no issuer', liveCfg({ licence: { ...liveCfg().licence, issuer: '' } }), env, TODAY],
    ['no approver', liveCfg({ licence: { ...liveCfg().licence, approvedBy: '' } }), env, TODAY],
    ['bad approvedOn', liveCfg({ licence: { ...liveCfg().licence, approvedOn: 'yesterday' } }), env, TODAY],
    ['expired licence', liveCfg(), env, '2027-11-02'],
    ['scope covers nothing enabled', liveCfg({ licence: { ...liveCfg().licence, scope: ['earn'] } }), env, TODAY],
    ['no allowed jurisdictions', liveCfg({ jurisdictions: { allow: [] } }), env, TODAY],
    ['no live chain', liveCfg({ chains: { live: [] } }), env, TODAY],
  ];
  for (const [name, cfg, e, day] of cases) { const s = evaluate(cfg, e, day); assert.equal(s.mode, 'off', name); assert.ok(Object.values(s.features).every((v) => !v), name); assert.ok(liveBlockers(sanitizeConfig(cfg), e, day).length > 0, name); }
});

test('live only turns on the features the licence scope names', () => {
  const s = evaluate(liveCfg(), { NIGHTHAWK_ECONOMY_LIVE: '1' }, TODAY);
  assert.deepEqual(s.features, { wallet: true, nft: true, earn: false, wager: true });
  const s2 = evaluate(liveCfg({ features: { wallet: true, nft: true, earn: true, wager: true } }), { NIGHTHAWK_ECONOMY_LIVE: '1' }, TODAY);
  assert.equal(s2.features.earn, false, 'earn is enabled in features but not in the licence scope');
});

test('the licence expiring closes live on the very next evaluation', () => {
  const env = { NIGHTHAWK_ECONOMY_LIVE: '1' };
  assert.equal(evaluate(liveCfg(), env, '2027-11-01').mode, 'live');
  assert.equal(evaluate(liveCfg(), env, '2027-11-02').mode, 'off');
});

test('per player in live: allowed country, verified age and KYC are all required; sandbox only needs not-self-excluded', () => {
  const env = { NIGHTHAWK_ECONOMY_LIVE: '1' }, cfg = liveCfg(), s = evaluate(cfg, env, TODAY);
  const ok = { country: 'na', verifiedAge: 21, kycVerified: true };
  assert.equal(evaluateForPlayer(s, cfg, ok).ok, true);
  for (const [name, p] of [['unknown country', { ...ok, country: '' }], ['blocked country', { ...ok, country: 'US' }], ['age unverified', { ...ok, verifiedAge: undefined }], ['under age', { ...ok, verifiedAge: 17 }], ['no kyc', { ...ok, kycVerified: false }], ['self-excluded', { ...ok, selfExcluded: true }]]) assert.equal(evaluateForPlayer(s, cfg, p).ok, false, name);
  const sb = evaluate({ mode: 'sandbox', features: { wager: true } }, {}, TODAY);
  assert.equal(evaluateForPlayer(sb, {}, {}).ok, true); assert.equal(evaluateForPlayer(sb, {}, { selfExcluded: true }).ok, false);
  assert.equal(evaluateForPlayer(evaluate(shipped, {}, TODAY), shipped, ok).ok, false, 'off is off for everyone');
});
