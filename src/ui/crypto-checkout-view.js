// Optional crypto cosmetic-store view. Mount this inside the existing NIGHTHAWK Economy tab.
// It is deliberately separate from play-money credits: crypto checkout is a direct token transfer for cosmetics only.
import { ensureGuestSession, getAccount, getStoreCatalog } from '../net/account-session.js';
import {
  checkoutCosmetic, discoverWalletProviders, fetchCryptoCheckoutConfig, formatTokenUnits,
  pendingCryptoPayments, retryCryptoConfirmation, subscribeWalletProviders,
} from '../net/crypto-checkout.js';

const el = (tag, text, cls) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (cls) item.className = cls;
  return item;
};
const safeStorage = (name) => {
  try { return globalThis[name] ?? null; } catch { return null; }
};

export function mountCryptoCheckout(container, serverUrl, {
  provider,
  fetchImpl = globalThis.fetch,
  storage = safeStorage('sessionStorage'),
  walletStorage = safeStorage('localStorage'),
} = {}) {
  if (!container) throw new TypeError('Crypto checkout container is required');
  let busy = false;
  let account = null;
  let config = null;
  let walletProviders = [];
  let selectedWalletId = '';
  let disposed = false;
  let walletSubscribed = false;
  let unsubscribeWallets = () => {};
  container.replaceChildren();

  const heading = el('h2', 'CRYPTO COSMETIC CHECKOUT');
  const status = el('p', 'LOADING MERCHANT CONFIGURATION…', 'nh-crypto-status');
  const note = el('p', 'ERC-20 MERCHANT PAYMENT · COSMETIC ENTITLEMENT ONLY · NO CUSTODY OR NFT MINT', 'nh-crypto-note');
  const walletChoice = el('select', undefined, 'nh-crypto-wallet-select');
  walletChoice.setAttribute('aria-label', 'Choose a crypto wallet');
  walletChoice.hidden = true;
  walletChoice.addEventListener('change', () => { selectedWalletId = walletChoice.value; });
  const list = el('div', undefined, 'nh-crypto-grid');
  const pending = el('div', undefined, 'nh-crypto-pending');
  container.append(heading, status, note, walletChoice, list, pending);

  const action = (label, handler, disabled = false, requiresWallet = false) => {
    const button = el('button', label, 'nh-economy-action');
    button.type = 'button'; button.dataset.locked = disabled ? 'true' : 'false';
    button.dataset.walletRequired = requiresWallet ? 'true' : 'false';
    button.disabled = disabled || busy || (requiresWallet && walletProviders.length === 0);
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; redrawDisabled();
      try { await handler(); }
      catch (error) { status.textContent = error.message; }
      finally { busy = false; redrawDisabled(); }
    });
    return button;
  };

  function redrawDisabled() {
    for (const button of container.querySelectorAll('button')) {
      button.disabled = busy || button.dataset.locked === 'true' ||
        (button.dataset.walletRequired === 'true' && walletProviders.length === 0);
    }
  }


  function renderWalletChoices(choices) {
    walletProviders = choices;
    if (!walletProviders.some((wallet) => wallet.id === selectedWalletId)) {
      selectedWalletId = walletProviders[0]?.id ?? '';
    }
    walletChoice.replaceChildren();
    for (const wallet of walletProviders) {
      const option = el('option', wallet.name);
      option.value = wallet.id;
      walletChoice.appendChild(option);
    }
    walletChoice.value = selectedWalletId;
    walletChoice.hidden = walletProviders.length < 2;
    redrawDisabled();
    if (walletProviders.length && config?.enabled && account && status.textContent.includes('NO COMPATIBLE BROWSER WALLET')) {
      status.textContent = `MERCHANT CHECKOUT · ${config.tokenSymbol} ON CHAIN ${config.chainId} · GUEST ${account.displayName}`;
    }
  }

  async function refreshWalletChoices() {
    if (provider) {
      renderWalletChoices([{ id: 'provided-wallet', name: 'Connected wallet', provider, legacy: false }]);
      return;
    }
    if (!walletSubscribed) {
      unsubscribeWallets = subscribeWalletProviders((choices) => {
        if (!disposed) renderWalletChoices(choices);
      });
      walletSubscribed = true;
    }
    const choices = await discoverWalletProviders({ windowObject: globalThis.window, globalObject: globalThis });
    if (!disposed) renderWalletChoices(choices);
  }

  async function refreshPending() {
    pending.replaceChildren();
    const entries = pendingCryptoPayments(storage);
    if (!entries.length) return;
    pending.appendChild(el('h3', 'PAYMENTS AWAITING CONFIRMATION'));
    for (const entry of entries) {
      const row = el('article', undefined, 'nh-crypto-pending-item');
      row.appendChild(el('span', `${entry.cosmeticId.toUpperCase()} · ${entry.txHash.slice(0, 10)}…`));
      row.appendChild(action('CHECK PAYMENT', async () => {
        const result = await retryCryptoConfirmation(serverUrl, entry, { fetchImpl, storage: walletStorage });
        if (result.pending) {
          status.textContent = `PAYMENT FOUND · ${result.confirmations ?? 0}/${result.confirmationsRequired ?? '?'} CONFIRMATIONS`;
        } else {
          const current = pendingCryptoPayments(storage).filter((item) => item.intentId !== entry.intentId);
          try { storage?.setItem('nh_crypto_checkout_pending_v1', JSON.stringify(current)); } catch { /* ignore */ }
          account = await getAccount(serverUrl, { fetchImpl, storage: walletStorage });
          status.textContent = 'PAYMENT VERIFIED · COSMETIC ADDED TO YOUR ACCOUNT';
          await refreshPending();
        }
      }));
      pending.appendChild(row);
    }
  }

  async function refresh() {
    status.textContent = 'CHECKING THE SERVER’S CRYPTO PAYMENT GATE…';
    config = await fetchCryptoCheckoutConfig(serverUrl, { fetchImpl });
    if (config.enabled !== true) {
      status.textContent = `CRYPTO CHECKOUT UNAVAILABLE · ${config.reason ?? 'DISABLED'}`;
      list.replaceChildren();
      return;
    }
    await refreshWalletChoices();
    await ensureGuestSession(serverUrl, { fetchImpl, storage: walletStorage });
    account = await getAccount(serverUrl, { fetchImpl, storage: walletStorage });
    const cosmetics = await getStoreCatalog(serverUrl, { fetchImpl, storage: walletStorage });
    status.textContent = walletProviders.length
      ? `MERCHANT CHECKOUT · ${config.tokenSymbol} ON CHAIN ${config.chainId} · GUEST ${account.displayName}`
      : 'MERCHANT CHECKOUT IS CONFIGURED, BUT NO COMPATIBLE BROWSER WALLET WAS DETECTED';
    list.replaceChildren();

    const enabledItems = config.catalog ?? [];
    if (!enabledItems.length) list.appendChild(el('p', 'No cosmetic items are currently configured for token checkout.'));
    for (const item of enabledItems) {
      const card = el('article', undefined, 'nh-economy-card');
      const owned = account.cosmetics.includes(item.id);
      const details = cosmetics.find((cosmetic) => cosmetic.id === item.id);
      card.appendChild(el('strong', details?.name ?? item.name ?? item.id));
      const amount = formatTokenUnits(item.tokenUnits, item.decimals);
      card.appendChild(el('p', `${amount} ${item.symbol} · COSMETIC ONLY`));
      card.appendChild(el('small', 'Your wallet will show the recipient, token and exact amount before you confirm.'));
      card.appendChild(action(owned ? 'OWNED' : 'PAY WITH WALLET', async () => {
        status.textContent = 'OPENING YOUR WALLET…';
        const selected = walletProviders.find((wallet) => wallet.id === selectedWalletId);
        if (!selected?.provider) throw new Error('Choose an installed browser wallet before paying.');
        const result = await checkoutCosmetic(serverUrl, item.id, { provider: selected.provider, fetchImpl, storage: walletStorage, pendingStorage: storage });
        if (result.pending) {
          status.textContent = `TRANSFER SUBMITTED · WAITING FOR ${result.confirmationsRequired} CONFIRMATIONS`;
          await refreshPending();
        } else {
          status.textContent = 'PAYMENT VERIFIED · COSMETIC ADDED TO YOUR ACCOUNT';
          account = result.account;
          await refresh();
        }
      }, owned, true));
      list.appendChild(card);
    }
    await refreshPending();
  }

  refresh().catch((error) => { status.textContent = error.message; });
  return { refresh, close: () => { disposed = true; unsubscribeWallets(); container.replaceChildren(); }, get account() { return account; }, get config() { return config; }, get wallets() { return walletProviders.map(({ id, name, rdns, legacy }) => ({ id, name, rdns, legacy })); } };
}
