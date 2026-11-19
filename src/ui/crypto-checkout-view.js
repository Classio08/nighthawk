// Optional crypto cosmetic-store view. Mount this inside the existing NIGHTHAWK Economy tab.
// It is deliberately separate from play-money credits: crypto checkout is a direct token transfer for cosmetics only.
import { ensureGuestSession, getAccount } from '../net/account-session.js';
import {
  checkoutCosmetic, fetchCryptoCheckoutConfig, formatTokenUnits, pendingCryptoPayments, retryCryptoConfirmation,
} from '../net/crypto-checkout.js';

const el = (tag, text, cls) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (cls) item.className = cls;
  return item;
};
const safeStorage = () => {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
};

export function mountCryptoCheckout(container, serverUrl, {
  provider,
  fetchImpl = globalThis.fetch,
  storage = safeStorage(),
  walletStorage = globalThis.localStorage,
} = {}) {
  if (!container) throw new TypeError('Crypto checkout container is required');
  let busy = false;
  let account = null;
  let config = null;
  container.replaceChildren();

  const heading = el('h2', 'ON-CHAIN COSMETIC STORE');
  const status = el('p', 'LOADING MERCHANT CONFIGURATION…', 'nh-crypto-status');
  const note = el('p', 'COSMETIC PURCHASES ONLY · DIRECT WALLET TRANSFER · NO CUSTODY', 'nh-crypto-note');
  const list = el('div', undefined, 'nh-crypto-grid');
  const pending = el('div', undefined, 'nh-crypto-pending');
  container.append(heading, status, note, list, pending);

  const action = (label, handler, disabled = false) => {
    const button = el('button', label, 'nh-economy-action');
    button.type = 'button'; button.dataset.locked = disabled ? 'true' : 'false'; button.disabled = disabled || busy;
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
    for (const button of container.querySelectorAll('button')) button.disabled = busy || button.dataset.locked === 'true';
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
    await ensureGuestSession(serverUrl, { fetchImpl, storage: walletStorage });
    account = await getAccount(serverUrl, { fetchImpl, storage: walletStorage });
    status.textContent = `MERCHANT CHECKOUT · ${config.tokenSymbol} ON CHAIN ${config.chainId} · GUEST ${account.displayName}`;
    list.replaceChildren();

    for (const item of config.catalog ?? []) {
      const card = el('article', undefined, 'nh-economy-card');
      const owned = account.cosmetics.includes(item.id);
      card.appendChild(el('strong', item.name));
      const amount = formatTokenUnits(item.tokenUnits, item.decimals);
      card.appendChild(el('p', `${amount} ${item.symbol} · COSMETIC ONLY`));
      card.appendChild(el('small', 'Your wallet will show the recipient, token and exact amount before you confirm.'));
      card.appendChild(action(owned ? 'OWNED' : 'PAY WITH WALLET', async () => {
        status.textContent = 'OPENING YOUR WALLET…';
        const result = await checkoutCosmetic(serverUrl, item.id, { provider, fetchImpl, storage: walletStorage });
        if (result.pending) {
          status.textContent = `TRANSFER SUBMITTED · WAITING FOR ${result.confirmationsRequired} CONFIRMATIONS`;
          await refreshPending();
        } else {
          status.textContent = 'PAYMENT VERIFIED · COSMETIC ADDED TO YOUR ACCOUNT';
          account = result.account;
          await refresh();
        }
      }, owned));
      list.appendChild(card);
    }
    await refreshPending();
  }

  refresh().catch((error) => { status.textContent = error.message; });
  return { refresh, close: () => container.replaceChildren(), get account() { return account; }, get config() { return config; } };
}
