/**
 * blockchain-probe.js — Phase 14C Pre-Audit
 * Probes SAYMAN blockchain for tx type support and CONTRACT_CALL behavior
 */
import crypto from 'crypto';
import { createRequire } from 'module';
const require  = createRequire(import.meta.url);
const elliptic = require('elliptic');
const ec       = new elliptic.ec('secp256k1');

const RPC = 'https://sayman.onrender.com';
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const DEPLOYER_PK = '78260da03d026d819f667cdddd632e6448f25bd58b86e5963e58e11a1a4f3e5d';
const kp   = ec.keyFromPrivate(DEPLOYER_PK, 'hex');
const pub  = kp.getPublic('hex');
const addr = sha256(pub).slice(0, 40);

async function rpc(endpoint, method='GET', body=null) {
  const r = await fetch(`${RPC}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, data: text }; }
}

function hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce }) {
  return sha256(JSON.stringify({ type, timestamp, data, gasLimit, gasPrice, nonce }));
}

function buildTx(type, data, nonce, gasLimit=10) {
  const timestamp = Date.now();
  const gasPrice  = 1;
  const txHash    = hashTx({ type, timestamp, data, gasLimit, gasPrice, nonce });
  const sig       = kp.sign(txHash);
  return { type, timestamp, data, signature: { r: sig.r.toString('hex'), s: sig.s.toString('hex') }, publicKey: pub, gasLimit, gasPrice, nonce };
}

console.log('=== SAYMAN BLOCKCHAIN CAPABILITY PROBE ===\n');
console.log('RPC:', RPC);
console.log('Deployer:', addr);

// 1. Chain info
console.log('\n─── 1. Chain Info ───');
const chain = await rpc('/api/chain');
console.log('GET /api/chain:', chain.status, JSON.stringify(chain.data).slice(0,200));

// 2. Get deployer state
console.log('\n─── 2. Deployer State ───');
const state = await rpc(`/api/address/${addr}`);
console.log(`GET /api/address/…: nonce=${state.data?.nonce}, balance=${state.data?.balance}, txCount=${state.data?.transactions?.length}`);
const currentNonce = state.data?.nonce ?? 0;

// 3. What does a recent REPORT_CREATE tx look like in the explorer?
console.log('\n─── 3. Recent TX Inspection ───');
const txList = await rpc(`/api/address/${addr}`);
const txs = txList.data?.transactions || [];
console.log(`Total txs on chain for deployer: ${txs.length}`);
if (txs.length > 0) {
  const last = txs[txs.length - 1];
  console.log('Last tx shape:', JSON.stringify(last).slice(0,300));
}

// 4. Try a custom tx type: REPORT_VERIFY — does SAYMAN accept unknown types?
console.log('\n─── 4. Custom TX Type: REPORT_VERIFY ───');
const verifyData = {
  from:     addr,
  reportId: 'probe-test-001',
  action:   'VERIFY',
  note:     'Authority verified this report',
  timestamp: Date.now(),
};
const verifyTx = buildTx('REPORT_VERIFY', verifyData, currentNonce + 100);
const verifyResult = await rpc('/api/broadcast', 'POST', verifyTx);
console.log('REPORT_VERIFY broadcast status:', verifyResult.status);
console.log('REPORT_VERIFY response:', JSON.stringify(verifyResult.data).slice(0,200));

// 5. Try REPORT_START_WORK
console.log('\n─── 5. Custom TX Type: REPORT_START_WORK ───');
const startData = {
  from:     addr,
  reportId: 'probe-test-001',
  action:   'START_WORK',
  department: 'ROAD_DEPARTMENT',
  timestamp: Date.now(),
};
const startTx = buildTx('REPORT_START_WORK', startData, currentNonce + 101);
const startResult = await rpc('/api/broadcast', 'POST', startTx);
console.log('REPORT_START_WORK broadcast status:', startResult.status);
console.log('REPORT_START_WORK response:', JSON.stringify(startResult.data).slice(0,200));

// 6. Try REPORT_RESOLVE
console.log('\n─── 6. Custom TX Type: REPORT_RESOLVE ───');
const resolveData = {
  from:      addr,
  reportId:  'probe-test-001',
  action:    'RESOLVE',
  resolution: 'Issue fixed by municipal team',
  timestamp: Date.now(),
};
const resolveTx = buildTx('REPORT_RESOLVE', resolveData, currentNonce + 102);
const resolveResult = await rpc('/api/broadcast', 'POST', resolveTx);
console.log('REPORT_RESOLVE broadcast status:', resolveResult.status);
console.log('REPORT_RESOLVE response:', JSON.stringify(resolveResult.data).slice(0,200));

// 7. After broadcast, check what appears in address history
console.log('\n─── 7. Post-Broadcast State (waiting 3s) ───');
await new Promise(r => setTimeout(r, 3000));
const stateAfter = await rpc(`/api/address/${addr}`);
const txsAfter = stateAfter.data?.transactions || [];
console.log(`Tx count after: ${txsAfter.length} (was ${txs.length})`);
const newTxs = txsAfter.slice(txs.length);
if (newTxs.length > 0) {
  for (const t of newTxs) {
    console.log('  NEW TX:', JSON.stringify(t).slice(0,200));
  }
} else {
  console.log('  No new txs visible in history (may not have mined yet)');
}

// 8. Check if CONTRACT_CALL to a real contract address captures arbitrary data
console.log('\n─── 8. CONTRACT_CALL Data Capture ───');
// The deployed ReportRegistry contract address (from deployed.json)
let registryAddr;
try {
  const dep = JSON.parse(await (await import('fs')).promises.readFile('deployed.json', 'utf8'));
  registryAddr = dep.contracts?.ReportRegistry;
  console.log('ReportRegistry address:', registryAddr);
} catch { console.log('deployed.json not found or unreadable'); }

// 9. Summary
console.log('\n═══════════════════════════════════════════════════');
console.log('  SAYMAN Capability Summary');
console.log('═══════════════════════════════════════════════════');
const verifyOk  = verifyResult.ok  && (verifyResult.data?.txId || verifyResult.data?.id || verifyResult.data?.success);
const startOk   = startResult.ok   && (startResult.data?.txId  || startResult.data?.id  || startResult.data?.success);
const resolveOk = resolveResult.ok && (resolveResult.data?.txId || resolveResult.data?.id || resolveResult.data?.success);
console.log('Accepts REPORT_VERIFY tx type:    ', verifyOk  ? 'YES ✅' : 'NO ❌  → ' + JSON.stringify(verifyResult.data).slice(0,60));
console.log('Accepts REPORT_START_WORK tx type:', startOk   ? 'YES ✅' : 'NO ❌  → ' + JSON.stringify(startResult.data).slice(0,60));
console.log('Accepts REPORT_RESOLVE tx type:   ', resolveOk ? 'YES ✅' : 'NO ❌  → ' + JSON.stringify(resolveResult.data).slice(0,60));
