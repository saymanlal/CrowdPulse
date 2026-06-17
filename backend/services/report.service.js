/**
 * report.service.js — CrowdPulse Unified Report Processing Service
 *
 * Phase 7:  processReport   — AI + IPFS in parallel
 * Phase 8:  createFullReport — AI + IPFS + Blockchain (full pipeline)
 * Phase 9:  Fraud gate       — AI → Fraud Check → (IPFS + Blockchain) or Reject
 */

import { analyzeImage }  from './ai.service.js';
import { uploadToIPFS }  from './ipfs.service.js';
import { createReport as createBlockchainReport } from './blockchain.service.js';
import { calculateFraudScore } from './fraud.service.js';
import { awardForReport }      from './reward.service.js';
import { increaseForReport }   from './reputation.service.js';

// ─── Phase 7 — AI + IPFS ─────────────────────────────────────────────────────

/**
 * Process a report image: run Gemini Vision + pin to IPFS in parallel.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {object} [meta]  { reporter, location }
 */
export async function processReport(buffer, mimeType, filename, meta = {}) {
  const [aiResult, ipfsResult] = await Promise.allSettled([
    analyzeImage(buffer, mimeType),
    uploadToIPFS(buffer, mimeType, filename, {
      source:   'CrowdPulse-report',
      reporter: meta.reporter || 'unknown',
      location: meta.location || 'unknown',
    }),
  ]);

  const analysis = aiResult.status === 'fulfilled'
    ? aiResult.value
    : {
        isCivicIssue: false,
        category:     'OTHER',
        severity:     'LOW',
        confidence:   0,
        reason:       `AI analysis failed: ${aiResult.reason?.message || 'unknown error'}`,
      };

  const evidence = ipfsResult.status === 'fulfilled' ? ipfsResult.value : null;

  const errors = {
    ai:   aiResult.status   === 'rejected' ? (aiResult.reason?.message   || 'AI error')   : null,
    ipfs: ipfsResult.status === 'rejected' ? (ipfsResult.reason?.message || 'IPFS error') : null,
  };

  if (!evidence) {
    const err = new Error(errors.ipfs || 'IPFS upload failed');
    err.analysis = analysis;
    throw err;
  }

  return { analysis, evidence, errors };
}

// ─── Phase 8 + 9 — AI → Fraud Gate → IPFS → Blockchain ──────────────────────

/**
 * Full pipeline with fraud detection:
 *
 *   1. Gemini Vision analysis
 *   2. Fraud detection (Phase 9) — blocks non-civic images
 *   3. IPFS upload              — only if fraud check passes
 *   4. Blockchain tx            — only if fraud check passes
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {object} [meta]  { reporter, location, description }
 *
 * @returns {Promise<{
 *   reportId:   string,
 *   analysis:   object,
 *   fraud:      object,
 *   evidence?:  object,
 *   blockchain?: object,
 *   blocked?:   boolean,
 * }>}
 */
export async function createFullReport(buffer, mimeType, filename, meta = {}) {
  const reportId = `RP-${Date.now()}`;

  // ── Step 1: AI Analysis ────────────────────────────────────────────────────
  let analysis;
  try {
    analysis = await analyzeImage(buffer, mimeType);
  } catch (e) {
    analysis = {
      isCivicIssue: false,
      category:     'OTHER',
      severity:     'LOW',
      confidence:   0,
      reason:       `AI failed: ${e.message || 'unknown'}`,
    };
  }

  // ── Step 2: Fraud Detection (Phase 9) ──────────────────────────────────────
  const fraud = calculateFraudScore(analysis);

  if (!fraud.allowed) {
    // BLOCKED — do NOT upload to IPFS, do NOT send to blockchain
    return {
      success:    false,
      reportId,
      blocked:    true,
      fraudScore: fraud.fraudScore,
      riskLevel:  fraud.riskLevel,
      reason:     fraud.reason,
      analysis,
      fraud,
    };
  }

  // ── Step 3: IPFS Upload (only if fraud check passed) ───────────────────────
  let evidence;
  try {
    evidence = await uploadToIPFS(buffer, mimeType, filename, {
      source:   'CrowdPulse-report',
      reportId,
      reporter: meta.reporter || 'unknown',
      location: meta.location || 'unknown',
    });
  } catch (e) {
    const err = new Error(`IPFS upload failed: ${e.message || 'unknown'}`);
    err.analysis = analysis;
    err.fraud    = fraud;
    throw err;
  }

  // ── Step 4: Blockchain Transaction ─────────────────────────────────────────
  const blockchain = await createBlockchainReport({
    reportId,
    category:    analysis.category,
    severity:    analysis.severity,
    confidence:  analysis.confidence,
    cid:         evidence.cid,
    description: meta.description
      || analysis.reason
      || `AI-detected civic issue: ${analysis.category}`,
    location:    meta.location || 'Unknown',
  });

  // ── Step 5: Reward + Reputation (Phase 10) ──────────────────────────────────
  let rewards = null;
  let reputation = null;

  try {
    rewards = await awardForReport(blockchain.sender, analysis);
    console.log('[REWARD_AWARDED] Points earned:', rewards.earned, 'Reasons:', rewards.reason);
  } catch (e) {
    console.error('[REWARD_AWARDED] Failed:', e.message);
    rewards = { earned: 0, reason: [] };
  }

  try {
    reputation = await increaseForReport(blockchain.sender, analysis);
    console.log('[REPUTATION_UPDATED] Reputation earned:', reputation.earned);
  } catch (e) {
    console.error('[REPUTATION_UPDATED] Failed:', e.message);
    reputation = { earned: 0 };
  }

  return {
    reportId,
    analysis,
    fraud,
    evidence,
    blockchain,
    rewards,
    reputation,
  };
}
