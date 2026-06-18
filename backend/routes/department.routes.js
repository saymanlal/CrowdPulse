/**
 * department.routes.js — CrowdPulse Department Routes  (Phase 14B + 14C)
 *
 * GET  /api/departments                →  list all departments + stats       (public)
 * GET  /api/departments/me             →  calling user's department + city   (authenticated)
 * GET  /api/departments/me/reports     →  dept+city filtered reports         (authenticated)
 * GET  /api/departments/users          →  all user jurisdiction assignments  (ADMIN)
 * POST /api/departments/assign-user    →  assign/reassign user dept+city     (ADMIN)
 * GET  /api/departments/analytics      →  per-dept report counts             (public)
 *
 * Phase 14C additions:
 * GET  /api/cities                     →  list of supported cities           (public)
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import {
  listCitiesController,
  listDepartmentsController,
  getMyDepartmentController,
  getMyReportsController,
  getUserDepartmentsController,
  assignUserController,
  deptAnalyticsController,
} from '../controllers/department.controller.js';

const router = Router();

// NOTE: specific paths must come before /:id-style routes
router.get('/analytics',    deptAnalyticsController);
router.get('/me',           authenticate, getMyDepartmentController);
router.get('/me/reports',   authenticate, getMyReportsController);
router.get('/users',        authenticate, requireRole('ADMIN'), getUserDepartmentsController);
router.post('/assign-user', authenticate, requireRole('ADMIN'), assignUserController);
router.get('/',             listDepartmentsController);

export default router;
