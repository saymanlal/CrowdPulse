/**
 * profile.controller.js — CrowdPulse Profile Controller  (Phase 10)
 *
 * GET /api/profile/:address/points      → reward points
 * GET /api/profile/:address/reputation  → reputation score + level
 * GET /api/profile/:address/badges      → earned badges
 */

import { getPoints }                         from '../services/reward.service.js';
import { getReputation, getBadges as getBadgesService } from '../services/reputation.service.js';

/**
 * GET /api/profile/:address/points
 *
 * Response: { "points": 120 }
 */
export async function getPointsController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length < 10) {
      return res.status(400).json({ error: 'Valid address required' });
    }

    const result = await getPoints(address);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Profile] getPoints error:', err.message);
    return res.status(500).json({ error: err.message, points: 0 });
  }
}

/**
 * GET /api/profile/:address/reputation
 *
 * Response: { "score": 80, "level": "VERIFIED" }
 */
export async function getReputationController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length < 10) {
      return res.status(400).json({ error: 'Valid address required' });
    }

    const result = await getReputation(address);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Profile] getReputation error:', err.message);
    return res.status(500).json({ error: err.message, score: 0, level: 'NEW' });
  }
}

/**
 * GET /api/profile/:address/badges
 *
 * Response: [{ "name": "First Report" }, { "name": "Active Citizen" }]
 */
export async function getBadgesController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length < 10) {
      return res.status(400).json({ error: 'Valid address required' });
    }

    const badges = await getBadgesService(address);
    return res.status(200).json(badges);
  } catch (err) {
    console.error('[Profile] getBadges error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
