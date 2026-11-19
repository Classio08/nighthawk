import test from 'node:test';
import assert from 'node:assert/strict';
import { kpiCards, opCards, economyView, clampStake } from '../src/ui/dashboard.js';
import { defaultProgress, recordRun } from '../src/campaign/progress.js';
import { buildDebrief } from '../src/campaign/debrief.js';

const win = { won: true, alertMax: 0, elapsed: 200, kills: 1, headshots: 1, damage: 100, found: 3, total: 3, taskFails: 0, traceLeft: 200 };

test('KPI cards: zero state, then real numbers after a recorded win', () => {
  const z = Object.fromEntries(kpiCards({ progress: defaultProgress(), level: 1, rank: 'Recruit' }).map((c) => [c.id, c.value]));
  assert.deepEqual(z, { ops: '0/3', grade: '-', ribbons: '0', level: 'LV 1' });
  const p = recordRun(defaultProgress(), buildDebrief('dust-lantern', win, null), 200);
  const k = Object.fromEntries(kpiCards({ progress: p, level: 7, rank: 'sergeant' }).map((c) => [c.id, c]));
  assert.equal(k.ops.value, '1/3'); assert.match(k.grade.value, /^[SABCD]$/); assert.equal(k.ribbons.value, '1'); assert.equal(k.level.value, 'LV 7'); assert.equal(k.level.sub, 'SERGEANT');
  assert.doesNotThrow(() => kpiCards({ progress: null }));
});

test('operation cards: playable first with real records, planned ones are labelled planned and carry no play record', () => {
  const p = recordRun(defaultProgress(), buildDebrief('signal-blackout', win, null), 200);
  const cards = opCards(p);
  assert.deepEqual(cards.slice(0, 3).map((c) => [c.id, c.status]), [['dust-lantern', 'playable'], ['relay-uplink', 'playable'], ['signal-blackout', 'playable']]);
  assert.equal(cards[0].record, 'not played yet'); assert.equal(cards[1].record, 'not played yet'); assert.match(cards[2].record, /1\/1 won · best [SABCD] · 3:20/);
  const planned = cards.filter((c) => c.status === 'planned'); assert.ok(planned.length >= 6);
  for (const c of planned) { assert.equal(c.record, 'planned: not playable yet'); assert.ok(c.title && c.blurb); }
});

test('economy view: closed by default, honest in every mode, unknown input is closed, wagering UI only in sandbox', () => {
  const loading = economyView(undefined); assert.match(loading.headline, /CHECKING/); assert.deepEqual([loading.wallet, loading.faucet, loading.staked], [false, false, false]);
  const none = economyView(null); assert.equal(none.tone, 'unavailable'); assert.equal(none.wallet, false);
  const off = economyView({ mode: 'off', features: { wallet: false }, reasons: ['compliance.json mode is "off"'], limits: {} });
  assert.equal(off.tone, 'closed'); assert.deepEqual([off.wallet, off.faucet, off.staked], [false, false, false]); assert.match(off.lines.join(' '), /closed|off/i);
  const sb = economyView({ mode: 'sandbox', features: { wallet: true, wager: true }, limits: { minStake: 100, maxStake: 10000 } });
  assert.equal(sb.tone, 'sandbox'); assert.deepEqual([sb.wallet, sb.faucet, sb.staked], [true, true, true]); assert.match(sb.lines.join(' '), /PLAY money/); assert.match(sb.lines.join(' '), /not yet tried with a real wallet/);
  const sbNoWager = economyView({ mode: 'sandbox', features: { wallet: true, wager: false } }); assert.equal(sbNoWager.staked, false);
  const live = economyView({ mode: 'live', features: { wallet: true, wager: true }, reasons: [] });
  assert.equal(live.tone, 'live'); assert.equal(live.faucet, false); assert.equal(live.staked, false, 'no real-value staking UI exists in this build, even when the server says live'); assert.match(live.lines.join(' '), /not built/);
  for (const junk of [{ mode: 'banana' }, { mode: 7 }, {}]) assert.equal(economyView(junk).tone, 'closed');
  assert.equal(economyView({ mode: 'banana' }).wallet, false);
});

test('stake box: always lands inside the server range, junk becomes the minimum', () => {
  const lim = { minStake: 100, maxStake: 10000 };
  assert.equal(clampStake('500', lim), 500); assert.equal(clampStake(5, lim), 100); assert.equal(clampStake(1e9, lim), 10000);
  assert.equal(clampStake('abc', lim), 100); assert.equal(clampStake(NaN, lim), 100); assert.equal(clampStake(undefined, lim), 100); assert.equal(clampStake(250.9, lim), 250);
  assert.equal(clampStake(1, null), 100);
});
