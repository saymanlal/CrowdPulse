/**
 * fraudRules.js — CrowdPulse Fraud Scoring Rules  (Phase 9)
 *
 * Pure functions that evaluate an AI analysis result and return
 * a numeric fraud score with reasons. No side effects, no I/O.
 */

// ─── Thresholds ──────────────────────────────────────────────────────────────
export const FRAUD_THRESHOLDS = {
  ALLOW:   30,   // 0-30   → allow
  WARNING: 70,   // 31-70  → warning (still allowed)
  BLOCK:   70,   // >70    → reject
};

// ─── Spam keywords ───────────────────────────────────────────────────────────
const SPAM_KEYWORDS = [
  'floor', 'tiles', 'tile', 'room', 'bedroom', 'bathroom', 'kitchen',
  'laptop', 'computer', 'monitor', 'keyboard', 'mouse', 'phone',
  'selfie', 'portrait', 'face', 'person posing',
  'dog', 'cat', 'pet', 'animal', 'bird', 'fish',
  'food', 'meal', 'plate', 'pizza', 'burger', 'coffee',
  'meme', 'screenshot', 'text image', 'cartoon', 'anime',
  'desktop', 'wallpaper', 'logo', 'icon',
];

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Rule 1: Low AI confidence
 * If Gemini is unsure (< 50), likely not a clear civic issue.
 */
export function ruleLowConfidence(analysis) {
  if (typeof analysis.confidence === 'number' && analysis.confidence < 50) {
    return { score: 40, reason: `Low AI confidence (${analysis.confidence}%)` };
  }
  return { score: 0, reason: null };
}

/**
 * Rule 2: Category is OTHER (catch-all = suspicious)
 */
export function ruleCategoryOther(analysis) {
  if (analysis.category === 'OTHER') {
    return { score: 50, reason: 'Category is OTHER — no specific civic issue identified' };
  }
  return { score: 0, reason: null };
}

/**
 * Rule 3: isCivicIssue is false
 */
export function ruleNotCivicIssue(analysis) {
  if (analysis.isCivicIssue === false) {
    return { score: 50, reason: 'AI determined this is NOT a civic issue' };
  }
  return { score: 0, reason: null };
}

/**
 * Rule 4: Spam keyword detection in AI reason text
 */
export function ruleSpamKeywords(analysis) {
  const text = (analysis.reason || '').toLowerCase();
  const hits = SPAM_KEYWORDS.filter(kw => text.includes(kw));
  if (hits.length > 0) {
    return {
      score: 30,
      reason: `Spam keywords detected: ${hits.join(', ')}`,
    };
  }
  return { score: 0, reason: null };
}

// ─── All rules in evaluation order ───────────────────────────────────────────
export const ALL_RULES = [
  { name: 'LOW_CONFIDENCE',  fn: ruleLowConfidence },
  { name: 'CATEGORY_OTHER',  fn: ruleCategoryOther },
  { name: 'NOT_CIVIC_ISSUE', fn: ruleNotCivicIssue },
  { name: 'SPAM_KEYWORDS',   fn: ruleSpamKeywords },
];
