// Reusable account / store / safehouse panel. The caller supplies a server URL and mounts it from a menu.
import { accountRequest, getAccount, getStoreCatalog, buyCosmetic, getSafehouseCatalog, buySafehouse, getCommunityServers } from '../net/account-session.js';

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `nh-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function mountEconomyPanel(container, serverUrl) {
  if (!container) throw new TypeError('Economy panel container is required');
  let account = null;
  container.replaceChildren();
  const heading = node('h2', 'NIGHTHAWK QUARTERMASTER');
  const status = node('p', 'LOADING GUEST ACCOUNT…', 'nh-economy-status');
  const balance = node('p', '', 'nh-economy-balance');
  const sections = node('div', undefined, 'nh-economy-sections');
  container.append(heading, status, balance, sections);

  const buttonFor = (label, disabled, onClick) => {
    const button = node('button', label, 'nh-economy-action');
    button.type = 'button'; button.disabled = disabled;
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = 'PROCESSING…';
      try { await onClick(); await refresh(); } catch (error) { status.textContent = error.message; }
      button.disabled = false;
    });
    return button;
  };

  async function refresh() {
    account = await getAccount(serverUrl);
    status.textContent = `GUEST ACCOUNT · ${account.displayName}`;
    balance.textContent = `INTEL CREDITS: ${account.intelCredits}`;
    sections.replaceChildren();

    const cosmeticsTitle = node('h3', 'COSMETICS');
    const cosmetics = node('div', undefined, 'nh-economy-grid');
    for (const item of await getStoreCatalog(serverUrl)) {
      const card = node('article', undefined, 'nh-economy-card');
      card.append(node('strong', item.name), node('p', `${item.cost} INTEL CREDITS · COSMETIC ONLY`));
      const owned = account.cosmetics.includes(item.id);
      card.append(buttonFor(owned ? 'OWNED' : 'UNLOCK', owned || account.intelCredits < item.cost, async () => {
        await buyCosmetic(serverUrl, item.id, requestId());
      }));
      cosmetics.appendChild(card);
    }

    const basesTitle = node('h3', 'SAFEHOUSES');
    const bases = node('div', undefined, 'nh-economy-grid');
    for (const base of await getSafehouseCatalog(serverUrl)) {
      const owned = account.safehouses.some((item) => item.id === base.id);
      const card = node('article', undefined, 'nh-economy-card');
      card.append(node('strong', base.name), node('p', `${base.district} · ${base.cost} INTEL CREDITS`));
      card.append(buttonFor(owned ? 'OWNED' : 'PURCHASE DEED', owned || account.safehouses.length > 0 || account.intelCredits < base.cost, async () => {
        await buySafehouse(serverUrl, base.id, requestId());
      }));
      bases.appendChild(card);
    }

    const communityTitle = node('h3', 'COMMUNITY SERVERS');
    const community = node('div', undefined, 'nh-economy-grid');
    for (const server of await getCommunityServers(serverUrl)) {
      const card = node('article', undefined, 'nh-economy-card');
      card.append(node('strong', server.name), node('p', `${server.region} · ${server.mode} · ${server.players}/${server.maxPlayers}`));
      community.appendChild(card);
    }
    if (!community.childElementCount) community.append(node('p', 'No public community servers are listed yet.'));
    sections.append(cosmeticsTitle, cosmetics, basesTitle, bases, communityTitle, community);
  }

  const close = () => { sections.replaceChildren(); container.replaceChildren(); };
  refresh().catch((error) => { status.textContent = error.message; });
  return { refresh, close, get account() { return account; } };
}
