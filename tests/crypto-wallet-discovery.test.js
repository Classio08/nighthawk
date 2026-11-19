import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverWalletProviders, subscribeWalletProviders } from '../src/net/crypto-checkout.js';

class FakeEvent {
  constructor(type) { this.type = type; }
}
class FakeCustomEvent extends FakeEvent {
  constructor(type, detail) { super(type); this.detail = detail; }
}
class FakeWindow {
  constructor() { this.listeners = new Map(); this.Event = FakeEvent; this.CustomEvent = FakeCustomEvent; }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener); this.listeners.set(type, list);
  }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

test('EIP-6963 request discovers multiple injected wallets and ignores malformed announcements', async () => {
  const win = new FakeWindow();
  const providerA = { request: async () => [] };
  const providerB = { request: async () => [] };
  win.addEventListener('eip6963:requestProvider', () => {
    win.dispatchEvent(new FakeCustomEvent('eip6963:announceProvider', {
      info: { uuid: '350670db-19fa-4704-a166-e52e178b59d2', name: 'Wallet A', rdns: 'com.example.a' },
      provider: providerA,
    }));
    win.dispatchEvent(new FakeCustomEvent('eip6963:announceProvider', {
      info: { uuid: 'f17d9c41-71bd-4e9e-9c8b-2c5f8b2c0e19', name: 'Wallet B', rdns: 'com.example.b' },
      provider: providerB,
    }));
    win.dispatchEvent(new FakeCustomEvent('eip6963:announceProvider', {
      info: { uuid: 'not-a-uuid', name: 'Fake', rdns: 'invalid' },
      provider: providerA,
    }));
  });
  const wallets = await discoverWalletProviders({ windowObject: win, globalObject: {}, timeoutMs: 0 });
  assert.equal(wallets.length, 2);
  assert.deepEqual(wallets.map((wallet) => wallet.name), ['Wallet A', 'Wallet B']);
  assert.equal(wallets[0].provider, providerA);
  assert.equal(wallets[1].provider, providerB);
});

test('EIP-6963 registry keeps its page-lifetime listener and notifies subscribed views', async () => {
  const win = new FakeWindow();
  const provider = { request: async () => [] };
  const seen = [];
  const unsubscribe = subscribeWalletProviders((wallets) => seen.push(wallets.length), { windowObject: win });
  win.dispatchEvent(new FakeCustomEvent('eip6963:announceProvider', {
    info: { uuid: '350670db-19fa-4704-a166-e52e178b59d2', name: 'Wallet A', rdns: 'com.example.a' },
    provider,
  }));
  unsubscribe();
  assert.deepEqual(seen, [1]);
  assert.equal(win.listeners.get('eip6963:announceProvider').length, 1);
});
