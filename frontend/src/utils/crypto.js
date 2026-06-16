/**
 * CrowdPulse Crypto — browser-side signing
 *
 * Hash payload matches transaction.js calculateHash() EXACTLY:
 *   JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce })
 *
 * Gas: chain deploy txs used gasLimit=90, gasPrice=1, gasUsed=39-54
 *      Use gasLimit=100, gasPrice=1 — safe headroom, won't exceed balance
 *
 * Signature: { r, s } object — matches wallet.js sign() and isValid()
 * Address:   sha256(publicKey).slice(0, 40)
 */

import Elliptic from 'elliptic';
const EC = Elliptic.ec;
const ec = new EC('secp256k1');

// ─── SHA-256 via Web Crypto ───────────────────────────────────────────────────
async function sha256Hex(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Address: sha256(publicKey).slice(0, 40) ─────────────────────────────────
export async function deriveAddress(publicKey) {
  return (await sha256Hex(publicKey)).slice(0, 40);
}

// ─── Generate fresh wallet ────────────────────────────────────────────────────
export async function generateWallet() {
  const kp         = ec.genKeyPair();
  const privateKey = kp.getPrivate('hex').padStart(64, '0');
  const publicKey  = kp.getPublic('hex');
  const address    = await deriveAddress(publicKey);
  return { privateKey, publicKey, address };
}

// ─── Import wallet from private key hex ──────────────────────────────────────
export async function importWallet(privateKey) {
  if (!privateKey || privateKey.trim().length < 60)
    throw new Error('Invalid private key — must be 64-char hex');
  const kp        = ec.keyFromPrivate(privateKey.trim(), 'hex');
  const publicKey = kp.getPublic('hex');
  const address   = await deriveAddress(publicKey);
  return { privateKey: privateKey.trim(), publicKey, address };
}

// ─── Hash — EXACT field order from transaction.js calculateHash() ─────────────
async function hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce }) {
  const payload = JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce });
  return sha256Hex(payload);
}

// ─── Build + sign a REPORT_CREATE transaction ─────────────────────────────────
// gasLimit=100 matches what deploy.js used (gasUsed was 39-54, so 100 is safe)
export async function buildReportTx({
  wallet,
  nonce,
  category,
  description,
  location,
  severity     = 'MEDIUM',
  evidenceHash = null,
  gasLimit     = 100,
  gasPrice     = 1,
}) {
  const type      = 'REPORT_CREATE';
  const timestamp = Date.now();

  const data = {
    from:         wallet.address,
    category:     category    || 'OTHER',
    location:     location    || {},
    severity,
    evidenceHash,
    description:  description || '',
    timestamp,
  };

  const hash = await hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce });
  const kp   = ec.keyFromPrivate(wallet.privateKey, 'hex');
  const sig  = kp.sign(hash);

  return {
    type,
    timestamp,
    data,
    signature: { r: sig.r.toString('hex'), s: sig.s.toString('hex') },
    publicKey: wallet.publicKey,
    gasLimit,
    gasPrice,
    nonce,
  };
}

// ─── Build + sign a CONTRACT_CALL transaction ─────────────────────────────────
export async function buildContractCallTx({
  wallet,
  nonce,
  contractAddress,
  method,
  args     = {},
  gasLimit = 100,
  gasPrice = 1,
}) {
  const type      = 'CONTRACT_CALL';
  const timestamp = Date.now();

  const data = {
    from: wallet.address,
    contractAddress,
    method,
    args,
  };

  const hash = await hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce });
  const kp   = ec.keyFromPrivate(wallet.privateKey, 'hex');
  const sig  = kp.sign(hash);

  return {
    type,
    timestamp,
    data,
    signature: { r: sig.r.toString('hex'), s: sig.s.toString('hex') },
    publicKey: wallet.publicKey,
    gasLimit,
    gasPrice,
    nonce,
  };
}