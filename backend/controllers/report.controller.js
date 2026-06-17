/**
 * report.controller.js — CrowdPulse Report Controller  (Phase 7 + Phase 8)
 *
 * Phase 7: processReportController  → POST /api/report/process
 * Phase 8: createReportController   → POST /api/report/create
 */

import { processReport, createFullReport } from '../services/report.service.js';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/report/process
 *
 * Body (multipart/form-data):
 *   image      File    required   The civic evidence image
 *   reporter   string  optional   Wallet address of the reporter
 *   location   string  optional   Location string / GPS coords
 *
 * Returns:
 * {
 *   success:  true,
 *   filename: "pothole.jpg",
 *   sizeKb:   248,
 *   analysis: {
 *     isCivicIssue: true,
 *     category:     "ROAD_DAMAGE",
 *     severity:     "HIGH",
 *     confidence:   96,
 *     reason:       "Visible pothole detected."
 *   },
 *   evidence: {
 *     cid:        "bafybeig...",
 *     gatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeig...",
 *     ipfsUrl:    "ipfs://bafybeig...",
 *     publicUrl:  "https://ipfs.io/ipfs/bafybeig..."
 *   },
 *   warnings: { ai: null, ipfs: null }   // populated if a service had a non-fatal issue
 * }
 */
export async function processReportController(req, res) {
  try {
    // ── 1. File check ──────────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send multipart/form-data with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // ── 2. MIME validation ─────────────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // ── 3. Size validation ─────────────────────────────────────────────────────
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`,
      });
    }

    // ── 4. Optional metadata from form fields ──────────────────────────────────
    const meta = {
      reporter: req.body?.reporter || null,
      location: req.body?.location || null,
    };

    // ── 5. Run unified pipeline (AI + IPFS in parallel) ───────────────────────
    const { analysis, evidence, errors } = await processReport(
      buffer, mimetype, originalname, meta
    );

    // ── 6. Respond ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      success:  true,
      filename: originalname,
      sizeKb:   Math.round(size / 1024),
      analysis,
      evidence,
      // Only include warnings object if at least one service had a partial error
      ...(errors.ai || errors.ipfs ? { warnings: errors } : {}),
    });

  } catch (err) {
    console.error('[Report Controller] Pipeline error:', err.message);

    // ── Map known error types ──────────────────────────────────────────────────
    if (err.message?.includes('PINATA_JWT') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Service not configured. Check GEMINI_API_KEY and PINATA_JWT in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({ error: 'API authentication failed. Check your API keys.' });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded on an upstream service. Try again shortly.' });
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Pipeline timed out. Try a smaller image.' });
    }

    return res.status(500).json({
      error: err.message || 'Report processing pipeline failed.',
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}

// ─── Phase 8 — POST /api/report/create ────────────────────────────────────────

/**
 * POST /api/report/create
 *
 * Full pipeline: Gemini Vision → IPFS → ReportRegistry.createReport() on SAYMAN.
 *
 * Body (multipart/form-data):
 *   image        File    required
 *   reporter     string  optional   Reporter wallet address
 *   location     string  optional   Location / GPS string
 *   description  string  optional   Custom description (falls back to AI reason)
 *
 * Returns:
 * {
 *   success:    true,
 *   reportId:   "RP-1718601234",
 *   filename:   "pothole.jpg",
 *   sizeKb:     248,
 *   analysis:   { isCivicIssue, category, severity, confidence, reason },
 *   evidence:   { cid, gatewayUrl, ipfsUrl, publicUrl },
 *   blockchain: { txHash, blockNumber, contractAddress, sender }
 * }
 */
export async function createReportController(req, res) {
  try {
    // ── 1. File check ──────────────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded. Send multipart/form-data with an "image" field.',
      });
    }

    const { buffer, mimetype, originalname, size } = req.file;

    // ── 2. MIME validation ─────────────────────────────────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    // ── 3. Size validation ─────────────────────────────────────────────────────
    if (size > MAX_SIZE_BYTES) {
      return res.status(400).json({
        error: `File too large (${(size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`,
      });
    }

    // ── 4. Metadata from form fields ───────────────────────────────────────────
    const meta = {
      reporter:    req.body?.reporter    || null,
      location:    req.body?.location    || null,
      description: req.body?.description || null,
    };

    // ── 5. Full pipeline: AI → Fraud Gate → IPFS → Blockchain ────────────────
    const result = await createFullReport(buffer, mimetype, originalname, meta);

    // ── 6. Fraud gate blocked? ────────────────────────────────────────────────
    if (result.blocked) {
      return res.status(403).json({
        success:    false,
        blocked:    true,
        reportId:   result.reportId,
        fraudScore: result.fraudScore,
        riskLevel:  result.riskLevel,
        reason:     result.reason,
        analysis:   result.analysis,
      });
    }

    // ── 7. Success — report created on chain ──────────────────────────────────
    return res.status(200).json({
      success:    true,
      reportId:   result.reportId,
      filename:   originalname,
      sizeKb:     Math.round(size / 1024),
      fraudScore: result.fraud?.fraudScore ?? 0,
      riskLevel:  result.fraud?.riskLevel  ?? 'LOW',
      analysis:   result.analysis,
      evidence:   result.evidence,
      blockchain: result.blockchain,
      rewards:    result.rewards    || null,
      reputation: result.reputation || null,
    });

  } catch (err) {
    console.error('[Report/Create] Pipeline error:', err.message);

    if (err.message?.includes('PINATA_JWT') || err.message?.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Service not configured. Check GEMINI_API_KEY and PINATA_JWT in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.message?.includes('DEPLOYER_PRIVATE_KEY')) {
      return res.status(500).json({
        error: 'Blockchain signer not configured. Check DEPLOYER_PRIVATE_KEY in .env',
        ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
      });
    }

    if (err.message?.includes('ReportRegistry contract address')) {
      return res.status(500).json({
        error: 'Contracts not deployed. Run: npm run deploy:testnet',
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({ error: 'Upstream API authentication failed.' });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Pipeline timed out. Try a smaller image.' });
    }

    return res.status(500).json({
      error: err.message || 'Report creation pipeline failed.',
      ...(err.analysis ? { partialAnalysis: err.analysis } : {}),
    });
  }
}
