import 'dotenv/config';
import express   from 'express';
import cors      from 'cors';
import rateLimit from 'express-rate-limit';
import helmet    from 'helmet';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
import aiRouter        from './routes/ai.routes.js';
import ipfsRouter      from './routes/ipfs.routes.js';
import reportRouter    from './routes/report.routes.js';
import profileRouter   from './routes/profile.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import workflowRouter    from './routes/workflow.routes.js';
import authRouter        from './routes/auth.routes.js';
import rbacRouter        from './routes/rbac.routes.js';
import departmentRouter  from './routes/department.routes.js';
import assignmentRouter  from './routes/assignment.routes.js';
import { getCache, setCache, invalidateCache, getReports } from './services/reportCache.js';
import { getPoints } from './services/reward.service.js';
import { getReputation } from './services/reputation.service.js';
import { ensureAssigned, enrichReports } from './services/assignment.service.js';
import { listCitiesController } from './controllers/department.controller.js'; // Phase 14C

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const isProd    = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '512kb' }));
app.use('/api/', rateLimit({
  windowMs: 60_000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
}));

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
    throw new Error(`SAYMAN returned HTML at ${url} (${res.status})`);
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

const CACHE_TTL   = 15_000; // 15s

async function scanReports() {
  const now = Date.now();
  if (now - getCache().updatedAt < CACHE_TTL) return getReports();

  try {
    const stats      = await rpc('/api/stats');
    const latest     = stats.blocks || 0;
    const scanFrom   = Math.max(1, getCache().lastBlock + 1);
    const scanTo     = latest;
    const newReports = [];

    let start;
    if (getCache().lastBlock === 0) {
      start = 1;
    } else {
      const limit = Math.min(scanTo - scanFrom + 1, 50);
      start = Math.max(scanFrom, scanTo - limit + 1);
    }

    const batchSize = 30;
    for (let i = start; i <= scanTo; i += batchSize) {
      const batchStart = i;
      const batchEnd = Math.min(scanTo, i + batchSize - 1);
      const promises = [];
      for (let j = batchStart; j <= batchEnd; j++) {
        promises.push(
          rpc(`/api/blocks/${j}`).catch(err => {
            if (!isProd) console.warn(`Error fetching block ${j}:`, err.message);
            return null;
          })
        );
      }
      const blocks = await Promise.all(promises);
      for (const block of blocks) {
        if (!block) continue;
        const txs = block.transactions || block.data?.transactions || [];
        for (const tx of txs) {
          if (tx.type === 'REPORT_CREATE' && tx.data) {
            // Phase 14C: parse city from structured location JSON
            let city = null;
            try {
              const loc = typeof tx.data.location === 'string'
                ? JSON.parse(tx.data.location)
                : tx.data.location;
              city = loc?.city || null;
            } catch { city = null; }

            newReports.push({
              id:          tx.id,
              reporter:    tx.data.from,
              category:    tx.data.category   || 'OTHER',
              description: tx.data.description || '',
              location:    tx.data.location   || '',
              city,                                     // Phase 14C
              severity:    tx.data.severity   || 'MEDIUM',
              status:      'OPEN',
              createdAt:   tx.timestamp,
              blockIndex:  block.index ?? block.height ?? block.index,
              txId:        tx.id,
            });
          }
        }
      }
    }

    // Merge new with existing, dedupe by id, sort newest first
    const all     = [...getCache().reports, ...newReports];
    const deduped = Object.values(Object.fromEntries(all.map(r => [r.id, r])));
    deduped.sort((a, b) => b.createdAt - a.createdAt);

    setCache(deduped, scanTo, now);
    // Phase 14B: auto-assign departments for newly scanned reports
    if (newReports.length > 0) ensureAssigned(newReports);
  } catch (e) {
    if (!isProd) console.warn('scanReports error:', e.message);
  }

  return getReports();
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
    if (kws.some(k => text.includes(k))) { detected = cat; conf = 82 + Math.floor(Math.random() * 13); break; }
  }
  return { aiCategory: detected, confidence: conf, isValid: conf > 60, isDuplicate: false };
}

// ─── Tx validator ─────────────────────────────────────────────────────────────
function validateTx(tx) {
  const required = ['type', 'timestamp', 'data', 'signature', 'publicKey', 'gasLimit', 'gasPrice', 'nonce'];
  for (const f of required) {
    if (tx[f] === undefined || tx[f] === null)
      throw new Error(`Transaction missing field: ${f}`);
  }
  if (typeof tx.signature !== 'object' || !tx.signature.r || !tx.signature.s)
    throw new Error('Invalid signature — expected { r, s }');
  if (typeof tx.nonce !== 'number')
    throw new Error('nonce must be a number');
  if (!tx.data?.from)
    throw new Error('tx.data.from required');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Gemini Vision AI routes  (POST /api/ai/analyze)
app.use('/api/ai',     aiRouter);

// IPFS / Pinata routes      (POST /api/ipfs/upload)
app.use('/api/ipfs',   ipfsRouter);

// Unified pipeline          (POST /api/report/process)  ← Phase 7
app.use('/api/report', reportRouter);

// Profile endpoints          (GET /api/profile/:address/*)  ← Phase 10
app.use('/api/profile', profileRouter);

// Analytics dashboard         (GET /api/analytics/*)         ← Phase 12
app.use('/api/analytics', analyticsRouter);

// Authority workflow           (POST /api/workflow/:id/*)     ← Phase 13
app.use('/api/workflow', workflowRouter);

// Wallet authentication        (GET/POST /api/auth/*)         ← Phase 14A
app.use('/api/auth', authRouter);

// Role management              (GET/POST /api/rbac/*)         ← Phase 14A
app.use('/api/rbac', rbacRouter);

// Phase 14C: City list (public)
app.get('/api/cities', listCitiesController);

// Department routing           (GET/POST /api/departments/*)  ← Phase 14B
app.use('/api/departments', departmentRouter);

// Assignment management        (GET/POST /api/assignments/*)  ← Phase 14B
app.use('/api/assignments', assignmentRouter);

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
    const result = await rpc('/api/broadcast', 'POST', tx);
    // Invalidate report cache so next feed load rescans
    invalidateCache();
    let ai = null;
    if (tx.type === 'REPORT_CREATE')
      ai = aiVerify(tx.data?.description, tx.data?.category);
    res.json({ success: true, txId: result.txId || result.id || null, result, ai });
  } catch (e) {
    console.error('broadcast error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// Reports — scanned from blocks (contract /state endpoint is 404 on public testnet)
app.get('/api/reports', async (req, res) => {
  try {
    let reports = await scanReports();
    ensureAssigned(reports);          // Phase 14B: auto-assign any missed reports
    reports = enrichReports(reports); // Phase 14B: add department field

    if (req.query.category)   reports = reports.filter(r => r.category   === req.query.category);
    if (req.query.status)     reports = reports.filter(r => r.status     === req.query.status);
    if (req.query.reporter)   reports = reports.filter(r => r.reporter   === req.query.reporter);
    if (req.query.department) reports = reports.filter(r => r.department === req.query.department);
    if (req.query.city)       reports = reports.filter(r => r.city       === req.query.city);  // Phase 14C

    const page     = parseInt(req.query.page     || '1');
    const pageSize = parseInt(req.query.pageSize || '20');
    const start    = (page - 1) * pageSize;
    const slice    = reports.slice(start, start + pageSize);

    res.json({ reports: slice, total: reports.length });
  } catch (e) {
    res.status(500).json({ error: e.message, reports: [], total: 0 });
  }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    const reports = enrichReports(await scanReports());
    const report  = reports.find(r => r.id === req.params.id || r.txId === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Reputation + rewards — derived from scanned reports (contract state unavailable)
app.get('/api/reputation/:address', async (req, res) => {
  try {
    await scanReports();
    const result = await getReputation(req.params.address);
    res.json({ address: req.params.address, reputation: result.score, level: result.level });
  } catch (e) {
    res.status(500).json({ error: e.message, reputation: 0, level: 'NEW' });
  }
});

app.get('/api/rewards/:address', async (req, res) => {
  try {
    await scanReports();
    const result = await getPoints(req.params.address);
    res.json({ address: req.params.address, points: result.points });
  } catch (e) {
    res.status(500).json({ error: e.message, points: 0 });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const reports = await scanReports();
    const counts  = {};
    for (const r of reports) counts[r.reporter] = (counts[r.reporter] || 0) + 1;
    const leaderboard = [];
    for (const address of Object.keys(counts)) {
      const { points } = await getPoints(address);
      leaderboard.push({ address, score: points });
    }
    leaderboard.sort((a, b) => b.score - a.score);
    res.json({ leaderboard: leaderboard.slice(0, 20) });
  } catch (e) {
    res.status(500).json({ error: e.message, leaderboard: [] });
  }
});

app.get('/api/blocks', async (req, res) => {
  try {
    const stats  = await rpc('/api/stats');
    const latest = stats.blocks || 0;
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

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  if (!isProd) console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   CrowdPulse Backend  v2.7 (Juris) ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  API    → http://localhost:${PORT}`);
  console.log(`  SAYMAN → ${SAYMAN_RPC}`);
  console.log('  Keys   → user-signed (never stored here)\n');
});