// Wallet proof-of-control WITHOUT custody. A player proves they own an address by signing a short message with their own wallet (personal_sign,
// EIP-191). NIGHTHAWK never sees a seed phrase or private key, never moves funds and never gets any permission over the wallet.
//
// The message is built by the SERVER and stored with the challenge; the client only returns a signature. A challenge is bound to one address and one
// domain, expires quickly (default 5 minutes), allows a few attempts, and is consumed on first success so a captured signature cannot be replayed.
// Uses @noble/curves + @noble/hashes (audited, no dependencies; Node's crypto cannot recover an Ethereum signer or compute keccak-256).
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils.js';

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeAddress(a) {
  if (typeof a !== 'string' || !ADDRESS_RE.test(a)) throw new Error('not an Ethereum address');
  return a.toLowerCase();
}

/** EIP-55 mixed-case checksum form, for display */
export function toChecksumAddress(a) {
  const lower = normalizeAddress(a).slice(2), h = bytesToHex(keccak_256(utf8ToBytes(lower)));
  return '0x' + [...lower].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}

export function addressOfPublicKey(pub65) { return '0x' + bytesToHex(keccak_256(pub65.slice(1)).slice(-20)); }

const personalHash = (msg) => { const m = utf8ToBytes(msg); return keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${m.length}`), m)); };

/** the address that signed `message` with personal_sign, or null if the signature is malformed */
export function recoverSigner(message, sigHex) {
  try {
    if (typeof sigHex !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sigHex)) return null;
    const b = hexToBytes(sigHex.slice(2)); let v = b[64]; if (v >= 27) v -= 27; if (v !== 0 && v !== 1) return null;
    const sig = secp256k1.Signature.fromBytes(b.slice(0, 64), 'compact').addRecoveryBit(v);
    return addressOfPublicKey(sig.recoverPublicKey(personalHash(message)).toBytes(false));
  } catch { return null; }
}

/** sign like a wallet would (used by tests and by anybody scripting a test wallet; never by the game itself) */
export function signPersonal(message, privHex) {
  const s = secp256k1.sign(personalHash(message), hexToBytes(privHex), { prehash: false, format: 'recovered' });      // [recovery, r, s]
  return '0x' + bytesToHex(concatBytes(s.slice(1), Uint8Array.of(s[0] + 27)));
}

/** the exact text the wallet shows the player. Plain words first: what this does, and that it costs nothing and gives no access. */
export function buildMessage({ domain, address, chainId, nonce, issuedAt, expiresAt }) {
  return `${domain} wants you to prove you own this wallet:\n${address}\n\nSign in to NIGHTHAWK for cosmetics and play-money rewards. This is not a transaction, costs no gas, and gives NIGHTHAWK no access to your funds. NIGHTHAWK will never ask for your seed phrase or private key.\n\nURI: https://${domain}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;
}

export class WalletAuth {
  /** @param {{domains:string[], chainIds:number[], ttlSecs?:number, maxAttempts?:number, secret:Uint8Array}} o  secret: random server key for session tokens */
  constructor({ domains, chainIds, ttlSecs = 300, maxAttempts = 3, secret }) {
    if (!secret || secret.length < 16) throw new Error('WalletAuth needs a random server secret (16+ bytes)');
    this.domains = domains.map((d) => d.toLowerCase()); this.chainIds = chainIds; this.ttl = ttlSecs; this.maxAttempts = maxAttempts; this.secret = secret;
    this.pending = new Map();
  }

  /** @param nonce random hex from the caller (crypto.randomBytes on the server; injected so this stays testable) */
  challenge({ domain, address, chainId }, nonce, now) {
    const d = String(domain ?? '').toLowerCase();
    if (!this.domains.includes(d)) throw new Error('domain not allowed');
    if (!this.chainIds.includes(chainId)) throw new Error('chain not allowed');
    if (!/^[0-9a-f]{16,64}$/.test(nonce)) throw new Error('bad nonce');
    const addr = normalizeAddress(address);
    const issuedAt = new Date(now * 1000).toISOString(), expiresAt = new Date((now + this.ttl) * 1000).toISOString();
    const message = buildMessage({ domain: d, address: toChecksumAddress(addr), chainId, nonce, issuedAt, expiresAt });
    for (const [k, c] of this.pending) if (c.exp < now) this.pending.delete(k);       // tidy expired challenges
    if (this.pending.size > 5000) throw new Error('too many pending challenges');
    this.pending.set(nonce, { addr, message, exp: now + this.ttl, tries: 0 });
    return { nonce, message, expiresAt };
  }

  /** @returns {{ok:true, address:string, token:string, tokenExp:number}|{ok:false, why:string}} */
  verify({ nonce, signature }, now, sessionSecs = 3600) {
    const c = this.pending.get(nonce);
    if (!c) return { ok: false, why: 'unknown or already used challenge' };
    if (c.exp < now) { this.pending.delete(nonce); return { ok: false, why: 'challenge expired' }; }
    if (++c.tries > this.maxAttempts) { this.pending.delete(nonce); return { ok: false, why: 'too many attempts' }; }
    const signer = recoverSigner(c.message, signature);
    if (!signer || signer !== c.addr) return { ok: false, why: 'signature does not match the address' };
    this.pending.delete(nonce);                                                         // single use: a captured signature is worthless afterwards
    const tokenExp = Math.floor(now + sessionSecs);                                    // whole seconds: the token format has no decimals
    return { ok: true, address: c.addr, token: this.issueToken(c.addr, tokenExp), tokenExp };
  }

  /** a stateless session token: address.expiry.HMAC (the server can check it without storing anything) */
  issueToken(addr, exp) { const body = `${addr}.${exp}`; return `${body}.${bytesToHex(hmac(sha256, this.secret, utf8ToBytes(body)))}`; }

  /** @returns the address if the token is genuine and unexpired, else null */
  checkToken(token, now) {
    const m = /^(0x[0-9a-f]{40})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(String(token ?? '')); if (!m) return null;
    const want = bytesToHex(hmac(sha256, this.secret, utf8ToBytes(`${m[1]}.${m[2]}`)));
    let diff = 0; for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ m[3].charCodeAt(i);        // constant-time compare
    return diff === 0 && Number(m[2]) > now ? m[1] : null;
  }
}

/** A last line of defence for text boxes (name, chat): players sometimes paste a seed phrase or a private key. We refuse to keep or display it. */
export function looksLikeSecret(text) {
  const t = String(text ?? '').trim();
  if (/\b(0x)?[0-9a-fA-F]{64}\b/.test(t)) return true;                                        // a 32-byte private key
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  return [12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w));       // a 12/24-word recovery phrase shape
}
