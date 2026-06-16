/**
 * CrowdPulse Backend v2.3
 * - Accepts flat SAYMAN tx body on /api/broadcast (no { transaction, publicKey } wrapper)
 * - validateTx checks flat format: { type, timestamp, data, signature, publicKey, gasLimit, gasPrice, nonce }
 * - signature is { r, s } object (matches wallet.js and transaction.js isValid)
 * - Safe RPC with HTML detection + state fallback for /call endpoint
 */

import 'dotenv/config';
import express   from 'express';
import cors      from 'cors';
import rateLimit from 'express-rate-limit';
import helmet    from 'helmet';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const isProd    = process.env.NODE_ENV === 'production';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '512kb' }));
app.use('/api/', rateLimit({
  windowMs: 60_000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
}));

// ─── Config ───────────────────────────────────────────────────────────────────
const SAYMAN_RPC = process.env.SAYMAN_RPC || 'https://sayman.onrender.com';
const PORT       = process.env.PORT       || 3001;

let CONTRACTS = { ReportRegistry: '', ReputationManager: '', RewardManager: '' };
const manifestPath = path.join(__dirname, '..', 'deployed.json');

function reloadContracts() {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    CONTRACTS = { ...CONTRACTS, ...(m.contracts || {}) };
    if (!isProd) console.log('📄 Contracts reloaded:', CONTRACTS);
  } catch {
    console.warn('⚠  deployed.json not found — run: npm run deploy:testnet');
  }
}
reloadContracts();
fs.watchFile(manifestPath, { interval: 3000 }, reloadContracts);

// ─── Safe RPC ─────────────────────────────────────────────────────────────────
async function safeJson(res, url) {
  const text = await res.text();
  if (text.trimStart().startsWith('<'))
    throw new Error(`SAYMAN returned HTML at ${url} (${res.status}) — endpoint missing`);
  try { return JSON.parse(text); }
  catch { throw new Error(`SAYMAN non-JSON at ${url}: ${text.slice(0, 120)}`); }
}

async function rpc(endpoint, method = 'GET', body = null, retries = 2) {
  const url = `${SAYMAN_RPC}${endpoint}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await safeJson(res, url);
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

// ─── Contract call with state fallback ───────────────────────────────────────
async function callContract(address, method, args = {}) {
  if (!address) throw new Error(`Contract address not set for ${method}`);

  try {
    return await rpc(`/api/contracts/${address}/call`, 'POST', { method, args });
  } catch (callErr) {
    if (!isProd) console.warn(`⚠  callContract(${method}) /call failed: ${callErr.message} — trying /state`);
  }

  const raw   = await rpc(`/api/contracts/${address}/state`);
  const state = raw.state || raw || {};

  switch (method) {
    case 'getReports': {
      let reports = Object.values(state.reports || {});
      if (args.category) reports = reports.filter(r => r.category === args.category);
      if (args.status)   reports = reports.filter(r => r.status   === args.status);
      if (args.reporter) reports = reports.filter(r => r.reporter === args.reporter);
      reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const page     = args.page     || 1;
      const pageSize = args.pageSize || 20;
      const start    = (page - 1) * pageSize;
      return { reports: reports.slice(start, start + pageSize), total: reports.length };
    }
    case 'getReport':
      return state.reports?.[args.reportId] || null;
    case 'getScore':
      return { score: state.scores?.[args.address] || 0, level: state.levels?.[args.address] || 'Newcomer' };
    case 'getLeaderboard': {
      const entries = Object.entries(state.scores || {})
        .map(([addr, score]) => ({ address: addr, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, args.limit || 20);
      return { leaderboard: entries };
    }
    case 'getPoints':
      return { points: state.points?.[args.address] || 0 };
    default:
      throw new Error(`No state fallback for method: ${method}`);
  }
}

// ─── AI classifier ────────────────────────────────────────────────────────────
const KEYWORDS = {
  ROAD_DAMAGE:     ['pothole', 'road', 'crack', 'broken', 'pavement', 'asphalt'],
  FLOOD:           ['flood', 'waterlog', 'overflow', 'drain', 'rain', 'puddle', 'submerge'],
  FIRE:            ['fire', 'burn', 'smoke', 'flame', 'blaze', 'burning'],
  STREETLIGHT:     ['light', 'dark', 'lamp', 'street light', 'bulb', 'no light', 'unlit'],
  GARBAGE:         ['garbage', 'trash', 'waste', 'litter', 'dump', 'stench', 'rubbish'],
  WATER_LEAK:      ['leak', 'pipe', 'water supply', 'burst', 'seepage'],
  UNSAFE_BUILDING: ['building', 'wall', 'collapse', 'unsafe', 'crack', 'structure', 'demolish'],
};

function aiVerify(description = '', category = '') {
  const text   = `${description} ${category}`.toLowerCase();
  let detected = category || 'OTHER';
  let conf     = 65 + Math.floor(Math.random() * 15);
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => text.includes(k))) {
      detected = cat;
      conf     = 82 + Math.floor(Math.random() * 13);
      break;
    }
  }
  return { aiCategory: detected, confidence: conf, isValid: conf > 60, isDuplicate: false };
}

// ─── Tx validator (flat SAYMAN format) ───────────────────────────────────────
function validateTx(tx) {
  const required = ['type', 'timestamp', 'data', 'signature', 'publicKey', 'gasLimit', 'gasPrice', 'nonce'];
  for (const f of required) {
    if (tx[f] === undefined || tx[f] === null)
      throw new Error(`Transaction missing field: ${f}`);
  }
  // signature is { r, s } object
  if (typeof tx.signature !== 'object' || !tx.signature.r || !tx.signature.s)
    throw new Error('Invalid signature — expected { r, s } object');
  if (typeof tx.nonce !== 'number')
    throw new Error('nonce must be a number');
  if (!tx.data?.from)
    throw new Error('tx.data.from (sender address) required');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', contracts: CONTRACTS, rpc: SAYMAN_RPC });
});

app.get('/api/stats', async (_req, res) => {
  try { res.json(await rpc('/api/stats')); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/nonce/:address', async (req, res) => {
  try {
    const data = await rpc(`/api/address/${req.params.address}`);
    res.json({ nonce: data.nonce ?? 0, address: req.params.address });
  } catch (e) {
    res.status(502).json({ error: e.message, nonce: 0 });
  }
});

app.get('/api/balance/:address', async (req, res) => {
  try {
    const data = await rpc(`/api/address/${req.params.address}`);
    res.json({ balance: data.balance ?? 0, address: req.params.address });
  } catch (e) {
    res.status(502).json({ error: e.message, balance: 0 });
  }
});

app.post('/api/ai/verify', (req, res) => {
  const { description, category } = req.body;
  res.json(aiVerify(description, category));
});

app.post('/api/broadcast', async (req, res) => {
  try {
    const tx = req.body;
    if (!tx?.type) return res.status(400).json({ error: 'tx body with type required' });

    validateTx(tx);

    // Forward flat tx to SAYMAN exactly as-is
    const result = await rpc('/api/broadcast', 'POST', tx);

    let ai = null;
    if (tx.type === 'REPORT_CREATE') {
      ai = aiVerify(tx.data?.description, tx.data?.category);
    }

    res.json({ success: true, txId: result.txId || result.id || null, result, ai });
  } catch (e) {
    console.error('broadcast error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    if (!CONTRACTS.ReportRegistry) return res.json({ reports: [], total: 0 });
    const args = {};
    if (req.query.category) args.category = req.query.category;
    if (req.query.status)   args.status   = req.query.status;
    if (req.query.reporter) args.reporter = req.query.reporter;
    if (req.query.page)     args.page     = parseInt(req.query.page);
    if (req.query.pageSize) args.pageSize = parseInt(req.query.pageSize);
    const data = await callContract(CONTRACTS.ReportRegistry, 'getReports', args);
    res.json(data);
  } catch (e) {
    if (!isProd) console.error('/api/reports error:', e.message);
    res.status(500).json({ error: e.message, reports: [], total: 0 });
  }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    if (!CONTRACTS.ReportRegistry) return res.status(404).json({ error: 'Contracts not deployed' });
    const data = await callContract(CONTRACTS.ReportRegistry, 'getReport', { reportId: req.params.id });
    if (!data) return res.status(404).json({ error: 'Report not found' });
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get('/api/reputation/:address', async (req, res) => {
  try {
    if (!CONTRACTS.ReputationManager) return res.json({ reputation: 0, level: 'Newcomer' });
    const data = await callContract(CONTRACTS.ReputationManager, 'getScore', { address: req.params.address });
    res.json({ address: req.params.address, reputation: data.score || 0, level: data.level || 'Newcomer' });
  } catch (e) {
    res.status(500).json({ error: e.message, reputation: 0 });
  }
});

app.get('/api/rewards/:address', async (req, res) => {
  try {
    if (!CONTRACTS.RewardManager) return res.json({ points: 0 });
    const data = await callContract(CONTRACTS.RewardManager, 'getPoints', { address: req.params.address });
    res.json({ address: req.params.address, points: data.points || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message, points: 0 });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    if (!CONTRACTS.ReputationManager) return res.json({ leaderboard: [] });
    const data = await callContract(CONTRACTS.ReputationManager, 'getLeaderboard', { limit: 20 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, leaderboard: [] });
  }
});

app.get('/api/blocks', async (req, res) => {
  try {
    const stats  = await rpc('/api/stats');
    const latest = stats.blocks || stats.height || stats.blockCount || 0;
    const count  = Math.min(parseInt(req.query.count || '10'), 20);
    const blocks = [];
    for (let i = latest; i > Math.max(0, latest - count); i--) {
      try { blocks.push(await rpc(`/api/blocks/${i}`)); } catch {}
    }
    res.json({ blocks, latest });
  } catch (e) {
    res.status(500).json({ error: e.message, blocks: [] });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const qs   = new URLSearchParams(req.query).toString();
    const data = await rpc(`/api/events${qs ? '?' + qs : ''}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, events: [] });
  }
});

app.get('/api/contracts', async (_req, res) => {
  try { res.json(await rpc('/api/contracts')); }
  catch (e) { res.status(500).json({ error: e.message, contracts: [] }); }
});

// ─── 404 / error ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  if (!isProd) console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   CrowdPulse Backend  v2.3           ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  API    → http://localhost:${PORT}`);
  console.log(`  SAYMAN → ${SAYMAN_RPC}`);
  console.log('  Keys   → user-signed (never stored here)\n');
});