/**
 * profile.routes.js — CrowdPulse Profile Routes  (Phase 10)
 *
 * GET /api/profile/:address/points      → reward points
 * GET /api/profile/:address/reputation  → reputation score + level
 * GET /api/profile/:address/badges      → earned badges
 */

import { Router } from 'express';
import {
  getPointsController,
  getReputationController,
  getBadgesController,
} from '../controllers/profile.controller.js';

const router = Router();

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/:address/points',     getPointsController);
router.get('/:address/reputation', getReputationController);
router.get('/:address/badges',     getBadgesController);

export default router;
