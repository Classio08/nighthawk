// The start-screen dashboard: view-models are pure (unit-tested), the DOM code below them only places text with textContent (nothing is parsed as HTML).
import { MISSION_ORDER, operationList } from '../campaign/story.js';
import { ACTS } from '../campaign/planned-data.js';

const GRADE_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1 };

/** the four stat cards across the top */
export function kpiCards({ progress, level = 1, rank = 'RECRUIT' }) {
  const done = MISSION_ORDER.filter((id) => progress?.missions?.[id]?.wins > 0).length;
  const grades = MISSION_ORDER.map((id) => progress?.missions?.[id]?.bestGrade).filter((g) => GRADE_RANK[g]);
  const best = grades.sort((a, b) => GRADE_RANK[b] - GRADE_RANK[a])[0] ?? '-';
  return [
    { id: 'ops', label: 'OPERATIONS', value: `${done}/${MISSION_ORDER.length}`, sub: 'completed' },
    { id: 'grade', label: 'BEST GRADE', value: best, sub: best === '-' ? 'not graded yet' : 'across operations' },
    { id: 'ribbons', label: 'RIBBONS', value: String(progress?.ribbons?.length ?? 0), sub: 'cosmetic' },
    { id: 'level', label: 'LEVEL', value: `LV ${level}`, sub: String(rank).toUpperCase() },
  ];
}

const fmtTime = (t) => (Number.isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : null);

/** one card per operation: playable ones first, then the planned ones, each labelled honestly */
export function opCards(progress) {
  return operationList().map((o) => {
    const m = progress?.missions?.[o.id];
    const act = ACTS.find((a) => a.id === o.act)?.name ?? '';
    const bits = [];
    if (o.status === 'playable') {
      if (m?.plays) bits.push(`${m.wins}/${m.plays} won`);
      if (m?.bestGrade && m.bestGrade !== '-') bits.push(`best ${m.bestGrade}`);
      if (fmtTime(m?.bestTime)) bits.push(fmtTime(m.bestTime));
    }
    return { id: o.id, title: o.title, act, blurb: o.blurb, status: o.status, record: bits.join(' · ') || (o.status === 'playable' ? 'not played yet' : 'planned: not playable yet') };
  });
}

/**
 * What the ECONOMY tab says, from the server's /economy/status (undefined = still loading, null = no server on this page).
 * tone: 'unavailable' | 'closed' | 'sandbox' | 'live'.  Never claims anything the status does not say.
 */
export function economyView(status) {
  if (status === undefined) return { tone: 'unavailable', headline: 'CHECKING FOR A GAME SERVER…', lines: [], wallet: false, faucet: false, staked: false, limits: null };      // still asking: never flash a verdict
  if (!status) return { tone: 'unavailable', headline: 'NO GAME SERVER ON THIS PAGE', lines: ['Wallets and the economy live on the game server. This page is a static build, so there is nothing to connect to here.', 'Everything else (solo, operations, campaign) works without it.'], wallet: false, faucet: false, staked: false, limits: null };
  const f = status.features ?? {};
  const base = { limits: status.limits ?? null };
  if (status.mode === 'off') return { ...base, tone: 'closed', headline: 'ECONOMY CLOSED', lines: ['Wallets, NFT cosmetics, play-to-earn and wagering are built but switched off. They stay closed until the owner records a valid licence and a real settlement rail exists.', ...(Array.isArray(status.reasons) ? status.reasons.slice(0, 2) : [])], wallet: false, faucet: false, staked: false };
  if (status.mode === 'sandbox') return { ...base, tone: 'sandbox', headline: 'SANDBOX · PLAY MONEY ONLY', lines: ['Test mode: balances are PLAY money with no cash value and cannot be withdrawn. Test networks only.', 'Prototype: unit-tested with fake wallets, not yet tried with a real wallet app.'], wallet: !!f.wallet, faucet: !!f.wallet, staked: !!f.wallet && !!f.wager };
  if (status.mode === 'live') return { ...base, tone: 'live', headline: 'LIVE (LICENSED)', lines: ['The server reports a recorded licence. Real-value play and cash-out are not built into this client: no settlement rail exists in this build.', ...(Array.isArray(status.reasons) ? status.reasons.slice(0, 2) : [])], wallet: !!f.wallet, faucet: false, staked: false };
  return { ...base, tone: 'closed', headline: 'ECONOMY CLOSED', lines: ['The server sent a status this client does not understand, so it is treated as closed.'], wallet: false, faucet: false, staked: false };
}

/** clamp a typed stake into the server's range (the server checks again: this only keeps the box sane) */
export function clampStake(raw, limits) {
  const lo = Math.trunc(limits?.minStake ?? 100), hi = Math.trunc(limits?.maxStake ?? 10000), n = Math.trunc(Number(raw));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

/* ------------------------------ DOM (textContent only) ------------------------------ */
const el = (doc, tag, cls, text, parent) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; };

export function renderKpis(doc, box, cards) {
  box.textContent = '';
  for (const c of cards) { const d = el(doc, 'div', 'kpi', undefined, box); el(doc, 'small', '', c.label, d); el(doc, 'b', '', c.value, d); el(doc, 'span', '', c.sub, d); }
}

/** `buttons` = { 'dust-lantern': <existing #operationbtn>, ... }: the real buttons are moved into their card, so their click handlers keep working */
export function renderOps(doc, box, cards, buttons = {}) {
  for (const b of Object.values(buttons)) if (b?.parentNode && box.contains(b)) doc.body.appendChild(b);          // rescue before wiping
  box.textContent = '';
  for (const c of cards) {
    const d = el(doc, 'article', `opcard ${c.status}`, undefined, box);
    const top = el(doc, 'div', 'optop', undefined, d); el(doc, 'small', '', c.act, top); el(doc, 'em', c.status, c.status === 'playable' ? 'PLAYABLE' : 'PLANNED', top);
    el(doc, 'h3', '', c.title, d); el(doc, 'p', '', c.blurb, d); el(doc, 'div', 'oprec', c.record, d);
    const b = buttons[c.id]; if (b && c.status === 'playable') d.appendChild(b);
  }
}

/**
 * ECONOMY tab. h = { connect(), faucet(), exclude(), staked(stake), refresh() }, session = { address } | null, me = { balance, currency, wager } | null
 */
export function renderEconomy(doc, box, view, { session = null, me = null, busy = false, note = '', stake = 100 } = {}, h = {}) {
  box.textContent = '';
  const head = el(doc, 'div', `ecohead ${view.tone}`, undefined, box); el(doc, 'b', '', view.headline, head);
  for (const l of view.lines) el(doc, 'p', 'econote', l, box);
  if (view.wallet) {
    if (!session) { const b = el(doc, 'button', 'btn small', 'CONNECT WALLET', box); b.type = 'button'; b.disabled = busy; b.onclick = () => h.connect?.(); }
    else {
      el(doc, 'p', 'econote', `Signed in as ${session.address.slice(0, 6)}…${session.address.slice(-4)}`, box);
      if (me) el(doc, 'p', 'econum', `${Number(me.balance) || 0} ${me.currency ?? 'PLAY'}`, box);
      const row = el(doc, 'div', 'ecorow', undefined, box);
      if (view.faucet) { const b = el(doc, 'button', 'btn small', 'CLAIM FREE PLAY MONEY', row); b.type = 'button'; b.disabled = busy; b.onclick = () => h.faucet?.(); }
      if (view.staked) {
        const inp = el(doc, 'input', 'stakebox', undefined, row); inp.type = 'number'; inp.value = String(stake); inp.min = String(view.limits?.minStake ?? 100); inp.max = String(view.limits?.maxStake ?? 10000); inp.setAttribute('aria-label', 'stake in play money');
        const b = el(doc, 'button', 'btn small', 'STAKED QUICK PLAY (PLAY MONEY)', row); b.type = 'button'; b.disabled = busy; b.onclick = () => h.staked?.(clampStake(inp.value, view.limits));
        const x = el(doc, 'button', 'btn small ghost', 'SELF-EXCLUDE 7 DAYS', row); x.type = 'button'; x.disabled = busy; x.onclick = () => h.exclude?.();
      }
    }
  }
  if (note) el(doc, 'p', 'econote warn', note, box);
}
