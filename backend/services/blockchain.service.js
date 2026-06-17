/**
 * blockchain.service.js — CrowdPulse Blockchain Service  (Phase 8)
 *
 * Signs and broadcasts REPORT_CREATE transactions to the SAYMAN blockchain.
 *
 * Matches frontend/src/utils/crypto.js buildReportTx() exactly:
 *   type       = 'REPORT_CREATE'
 *   data       = { from, category, location, severity, evidenceHash, description, timestamp }
 *   hash       = SHA256( JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce }) )
 *   signature  = { r: hex, s: hex }
 *   gasLimit   = 10  (gasUsed=6 on chain)
 */

import crypto              from 'crypto';
import { createRequire }   from 'module';
import { blockchainConfig } from '../config/blockchain.config.js';

// ─── Elliptic (secp256k1) ─────────────────────────────────────────────────────
const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const ec       = new elliptic.ec('secp256k1');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive SAYMAN address from a secp256k1 public key (hex) */
function deriveAddress(publicKeyHex) {
  return crypto.createHash('sha256').update(publicKeyHex).digest('hex').slice(0, 40);
}

/**
 * Hash a transaction payload exactly as the frontend does:
 *   SHA256( JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce }) )
 */
function hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce }) {
  const payload = JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Return the deployer key pair, loading from env. Throws clearly if not set. */
function getDeployerKeyPair() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey || privateKey.length < 60) {
    throw new Error('DEPLOYER_PRIVATE_KEY is missing or invalid in .env');
  }
  return ec.keyFromPrivate(privateKey, 'hex');
}

// ─── RPC client ───────────────────────────────────────────────────────────────

async function rpc(endpoint, method = 'GET', body = null, retries = 2) {
  const url = `${blockchainConfig.rpcUrl}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    body ? JSON.stringify(body) : undefined,
        signal:  ctrl.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`SAYMAN non-JSON at ${url}: ${text.slice(0, 120)}`); }
      if (!res.ok) throw new Error(data.error || data.message || `RPC ${res.status}`);
      return data;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Fetch current nonce for a SAYMAN address */
async function getNonce(address) {
  try {
    const data = await rpc(`/api/address/${address}`);
    return typeof data.nonce === 'number' ? data.nonce : 0;
  } catch {
    try {
      const data = await rpc(`/api/balance/${address}`);
      return data.nonce ?? 0;
    } catch {
      return 0;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast a REPORT_CREATE transaction to the SAYMAN blockchain.
 *
 * Matches frontend buildReportTx() exactly:
 *   type:      'REPORT_CREATE'
 *   data:      { from, category, location, severity, evidenceHash, description, timestamp }
 *   signature: { r, s }
 *   gasLimit:  10
 *   gasPrice:  1
 */
export async function createReport({
  reportId,
  category,
  severity,
  cid,
  confidence,
  description,
  location,
}) {
  const LOG = '[PHASE8]';

  // ── 1. Derive sender identity ──────────────────────────────────────────────
  const keyPair   = getDeployerKeyPair();
  const publicKey = keyPair.getPublic('hex');
  const sender    = deriveAddress(publicKey);

  console.log(`${LOG} ─── PRE-BROADCAST ───`);
  console.log(`${LOG} Sender:  ${sender}`);
  console.log(`${LOG} RPC:     ${blockchainConfig.rpcUrl}`);

  // ── 2. Fetch current nonce ─────────────────────────────────────────────────
  const nonce = await getNonce(sender);
  console.log(`${LOG} Nonce:   ${nonce}`);

  // Snapshot address state before broadcast
  let stateBefore;
  try {
    stateBefore = await rpc(`/api/address/${sender}`);
    console.log(`${LOG} Balance: ${stateBefore.balance}`);
    console.log(`${LOG} Tx count: ${stateBefore.transactions?.length ?? 0}`);
  } catch (e) {
    console.warn(`${LOG} Could not fetch state before:`, e.message);
    stateBefore = null;
  }

  // ── 3. Build REPORT_CREATE payload — EXACTLY like frontend buildReportTx ──
  const type      = 'REPORT_CREATE';
  const timestamp = Date.now();
  const gasLimit  = 10;    // frontend default — gasUsed=6 on chain
  const gasPrice  = 1;

  // Normalise location to string
  const locationStr = typeof location === 'string'
    ? location
    : (location ? JSON.stringify(location) : '');

  // Flat data — mirrors frontend/src/utils/crypto.js:46-53
  const data = {
    from:         sender,
    category:     category    || 'OTHER',
    location:     locationStr || {},
    severity:     severity    || 'MEDIUM',
    evidenceHash: cid         || null,
    description:  description || `AI-detected civic issue: ${category}`,
    timestamp,
  };

  // ── 4. Hash + sign — same algorithm as frontend ────────────────────────────
  const txHash    = hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce });
  const sig       = keyPair.sign(txHash);
  const signature = { r: sig.r.toString('hex'), s: sig.s.toString('hex') };

  // ── 5. Broadcast payload — exact shape frontend sends ──────────────────────
  const broadcastPayload = {
    type,
    timestamp,
    data,
    signature,
    publicKey,
    gasLimit,
    gasPrice,
    nonce,
  };

  console.log(`${LOG} ─── PAYLOAD ───`);
  console.log(`${LOG} TX_TYPE:   ${type}`);
  console.log(`${LOG} gasLimit:  ${gasLimit} (frontend default)`);
  console.log(`${LOG} sig type:  {r,s} object (matches frontend)`);
  console.log(`${LOG} PAYLOAD:`, JSON.stringify(broadcastPayload, null, 2));

  // ── 6. Broadcast ───────────────────────────────────────────────────────────
  let result;
  try {
    result = await rpc('/api/broadcast', 'POST', broadcastPayload);
  } catch (e) {
    console.error(`${LOG} ❌ Broadcast FAILED:`, e.message);
    throw e;
  }

  console.log(`${LOG} ─── RAW_RESPONSE ───`);
  console.log(`${LOG}`, JSON.stringify(result, null, 2));

  const txId     = result.txId ?? result.id ?? result.hash ?? null;
  const blockNum = result.blockIndex ?? result.blockNumber ?? null;

  console.log(`${LOG} txId:       ${txId}`);
  console.log(`${LOG} blockNum:   ${blockNum}`);
  console.log(`${LOG} error?:     ${result.error ?? 'none'}`);
  console.log(`${LOG} keys:       ${Object.keys(result).join(', ')}`);

  // ── 7. Post-broadcast verification (wait 3s for mining) ────────────────────
  console.log(`${LOG} ─── VERIFICATION (waiting 3s) ───`);
  await new Promise(r => setTimeout(r, 3000));

  let stateAfter;
  try {
    stateAfter = await rpc(`/api/address/${sender}`);
  } catch (e) {
    console.error(`${LOG} Could not fetch state after:`, e.message);
    stateAfter = null;
  }

  const balanceBefore = stateBefore?.balance ?? 'unknown';
  const balanceAfter  = stateAfter?.balance  ?? 'unknown';
  const nonceBfr      = stateBefore?.nonce   ?? 'unknown';
  const nonceAft      = stateAfter?.nonce    ?? 'unknown';
  const txCountBefore = stateBefore?.transactions?.length ?? 0;
  const txCountAfter  = stateAfter?.transactions?.length  ?? 0;

  const nonceChanged      = nonceBfr !== nonceAft;
  const balanceChanged    = balanceBefore !== balanceAfter;
  const txVisibleInHistory = stateAfter?.transactions?.some(
    t => t.id === txId || t.hash === txId
  ) ?? false;

  // Check for REPORT_CREATE txs in history
  const reportTxs = (stateAfter?.transactions ?? []).filter(
    t => t.type === 'REPORT_CREATE'
  );

  const broadcastAccepted = !!txId;
  const mined             = nonceChanged || txVisibleInHistory || txCountAfter > txCountBefore;

  console.log(`${LOG} Nonce:    ${nonceBfr} → ${nonceAft} (changed: ${nonceChanged})`);
  console.log(`${LOG} Balance:  ${balanceBefore} → ${balanceAfter} (changed: ${balanceChanged})`);
  console.log(`${LOG} Tx count: ${txCountBefore} → ${txCountAfter}`);
  console.log(`${LOG} txId in history: ${txVisibleInHistory}`);
  console.log(`${LOG} REPORT_CREATE txs: ${reportTxs.length}`);
  console.log(`${LOG} ═══════════════════════════════════════`);
  console.log(`${LOG}  Broadcast Accepted? ${broadcastAccepted ? 'YES ✅' : 'NO ❌'}`);
  console.log(`${LOG}  Mined?              ${mined ? 'YES ✅' : 'NO ❌'}`);
  console.log(`${LOG}  Tx in history?      ${txVisibleInHistory ? 'YES ✅' : 'NO ❌'}`);
  console.log(`${LOG} ═══════════════════════════════════════`);

  // ── 8. Return ──────────────────────────────────────────────────────────────
  return {
    success:  true,
    reportId,
    txHash:   txId,
    blockNumber: blockNum,
    sender,
    PHASE_8_STATUS: {
      broadcastAccepted,
      mined,
      txVisibleInHistory,
      balanceChanged,
      nonceChanged,
      evidence: {
        nonceBefore: nonceBfr,
        nonceAfter:  nonceAft,
        balanceBefore,
        balanceAfter,
        txCountBefore,
        txCountAfter,
        reportCreateTxCount: reportTxs.length,
        signatureFormat: '{r,s}',
        txType: type,
        rawResponse: result,
      },
    },
  };
}
