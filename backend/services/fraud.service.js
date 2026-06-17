/**
 * fraud.service.js — CrowdPulse Fraud Detection Service  (Phase 9)
 *
 * Evaluates AI analysis results against fraud rules.
 * Returns a decision: allow / warning / block.
 *
 * Does NOT modify any external state — pure evaluation layer.
 */

import { ALL_RULES, FRAUD_THRESHOLDS } from '../utils/fraudRules.js';

/**
 * Calculate fraud score from an AI analysis result.
 *
 * @param {{ isCivicIssue: boolean, category: string, confidence: number, reason: string }} analysis
 *
 * @returns {{
 *   allowed:    boolean,
 *   fraudScore: number,
 *   riskLevel:  'LOW' | 'MEDIUM' | 'HIGH',
 *   reason:     string,
 *   details:    Array<{ rule: string, score: number, reason: string }>
 * }}
 */
export function calculateFraudScore(analysis) {
  const LOG = '[FRAUD_CHECK]';
  const details = [];
  let totalScore = 0;

  console.log(`${LOG} ─── Evaluating fraud rules ───`);
  console.log(`${LOG} Input: isCivicIssue=${analysis.isCivicIssue} category=${analysis.category} confidence=${analysis.confidence}`);

  for (const { name, fn } of ALL_RULES) {
    const { score, reason } = fn(analysis);
    if (score > 0) {
      totalScore += score;
      details.push({ rule: name, score, reason });
      console.log(`${LOG} ⚠ ${name}: +${score} — ${reason}`);
    } else {
      console.log(`${LOG} ✓ ${name}: passed`);
    }
  }

  // Cap at 100
  const fraudScore = Math.min(totalScore, 100);

  // Determine risk level and decision
  let riskLevel;
  let allowed;

  if (fraudScore <= FRAUD_THRESHOLDS.ALLOW) {
    riskLevel = 'LOW';
    allowed   = true;
  } else if (fraudScore <= FRAUD_THRESHOLDS.BLOCK) {
    riskLevel = 'MEDIUM';
    allowed   = true;   // warning but still allowed
  } else {
    riskLevel = 'HIGH';
    allowed   = false;  // blocked
  }

  // Build human-readable reason
  let reason;
  if (allowed && details.length === 0) {
    reason = 'Valid civic issue — no fraud indicators detected.';
  } else if (allowed) {
    reason = `Allowed with warnings: ${details.map(d => d.reason).join('; ')}`;
  } else {
    reason = `Blocked: ${details.map(d => d.reason).join('; ')}`;
  }

  console.log(`${LOG} ═══════════════════════════════`);
  console.log(`${LOG}  Fraud Score: ${fraudScore}/100`);
  console.log(`${LOG}  Risk Level:  ${riskLevel}`);
  console.log(`${LOG}  Decision:    ${allowed ? 'ALLOW ✅' : 'BLOCK ❌'}`);
  console.log(`${LOG} ═══════════════════════════════`);

  return { allowed, fraudScore, riskLevel, reason, details };
}
