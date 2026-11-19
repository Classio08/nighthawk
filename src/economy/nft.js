// NFT = a cosmetic ownership proof, nothing more. Owning token N of the NIGHTHAWK cosmetics contract (ERC-1155) unlocks skin X in the game.
// It gives no combat advantage, no currency and no rewards. The check is READ-ONLY: one `eth_call` to a public RPC asking `balanceOf(address,id)`.
// NIGHTHAWK never sends a transaction, never asks for approval of any token, and never needs the player's keys.
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeAddress } from './wallet.js';

/** token id -> the in-game cosmetic it unlocks. Ids are append-only: never reuse or repoint an id after tokens exist. */
export const COSMETIC_TOKENS = Object.freeze({
  1: { skin: 'gold', name: 'GOLD' },
  2: { skin: 'damascus', name: 'DAMASCUS' },
  3: { skin: 'reactive', name: 'REACTIVE' },
});

const SELECTOR_BALANCE_OF = bytesToHex(keccak_256(utf8ToBytes('balanceOf(address,uint256)')).slice(0, 4));      // 0x00fdd58e
const word = (hex) => hex.padStart(64, '0');

/** ABI-encode balanceOf(address,uint256) */
export function encodeBalanceOf(address, tokenId) {
  if (!Number.isSafeInteger(tokenId) || tokenId < 0) throw new Error('bad token id');
  return '0x' + SELECTOR_BALANCE_OF + word(normalizeAddress(address).slice(2)) + word(tokenId.toString(16));
}

/** parse an eth_call uint256 result to a safe integer count (huge or malformed answers are treated as 0 owned) */
export function parseUint(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(hex)) return 0;
  const n = BigInt(hex); return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : 0;
}

async function rpc(url, method, params, fetchFn) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res?.ok) throw new Error(`rpc http ${res?.status ?? 'unknown'}`);
  let j;
  try { j = await res.json(); } catch { throw new Error('rpc returned invalid JSON'); }
  if (!j || j.jsonrpc !== '2.0' || j.id !== 1 || j.error || !Object.prototype.hasOwnProperty.call(j, 'result')) {
    throw new Error('rpc returned an invalid JSON-RPC response');
  }
  return j.result;
}

/**
 * Which cosmetics does this address own on `contract`? Verifies the RPC is on the expected chain first (a wrong or hostile RPC cannot make us read the wrong network).
 * @returns {Promise<{skins:string[], tokens:number[]}>}
 */
export async function ownedCosmetics({ rpcUrl, chainId, contract, address }, fetchFn = globalThis.fetch) {
  const c = normalizeAddress(contract);
  const chainHex = await rpc(rpcUrl, 'eth_chainId', [], fetchFn);
  if (typeof chainHex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chainHex)) throw new Error('rpc returned an invalid chain id');
  const actualChain = Number(BigInt(chainHex));
  if (!Number.isSafeInteger(actualChain) || actualChain !== chainId) throw new Error('rpc is on a different chain than expected');
  const owned = [];
  for (const id of Object.keys(COSMETIC_TOKENS).map(Number)) {
    const out = await rpc(rpcUrl, 'eth_call', [{ to: c, data: encodeBalanceOf(address, id) }, 'latest'], fetchFn);
    // A malformed value must fail closed, not be mistaken for a valid zero balance.
    if (typeof out !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(out)) throw new Error('rpc returned an invalid balance result');
    if (BigInt(out) > 0n) owned.push(id);
  }
  return { tokens: owned, skins: owned.map((id) => COSMETIC_TOKENS[id].skin) };
}
