/**
 * department.controller.js — CrowdPulse Department Controllers  (Phase 14B + 14C)
 *
 * GET  /api/departments                →  listDepartmentsController
 * GET  /api/cities                     →  listCitiesController          (Phase 14C)
 * GET  /api/departments/me             →  getMyDepartmentController
 * GET  /api/departments/me/reports     →  getMyReportsController
 * GET  /api/departments/users          →  getUserDepartmentsController  (ADMIN)
 * POST /api/departments/assign-user    →  assignUserController          (ADMIN)
 * GET  /api/departments/analytics      →  deptAnalyticsController
 * GET  /api/assignments                →  listAssignmentsController     (ADMIN)
 * GET  /api/assignments/:reportId      →  getAssignmentController
 * POST /api/assignments/assign         →  manualAssignController        (ADMIN)
 */

import {
  DEPARTMENTS, DEPARTMENT_DISPLAY,
} from '../services/department.service.js';
import {
  getCities, isValidCity, getCityName, getUserJurisdiction,
  setUserJurisdiction, getAllJurisdictions, formatJurisdiction,
} from '../services/jurisdiction.service.js';
import {
  getAssignments, getAssignment, assignReport,
  enrichReports, getReportsByJurisdiction,
} from '../services/assignment.service.js';
import { getReports } from '../services/reportCache.js';

// ─── 0. City List ─────────────────────────────────────────────────────────────

/**
 * GET /api/cities
 * Public. Returns all supported cities.
 */
export function listCitiesController(_req, res) {
  try {
    return res.json({ cities: getCities(), count: getCities().length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 1. List Departments ───────────────────────────────────────────────────────

/**
 * GET /api/departments
 * Public. Returns departments with report + user counts.
 */
export function listDepartmentsController(_req, res) {
  try {
    const allReports  = enrichReports(getReports());
    const allJuris    = getAllJurisdictions();

    const departments = DEPARTMENTS.map(dept => {
      const deptReports = allReports.filter(r => r.department === dept);
      // Count users assigned to this department (any city)
      const userCount = Object.values(allJuris).filter(j => j.department === dept).length;
      return {
        code:          dept,
        displayName:   DEPARTMENT_DISPLAY[dept] || dept,
        reportCount:   deptReports.length,
        openCount:     deptReports.filter(r => r.status === 'OPEN').length,
        resolvedCount: deptReports.filter(r => r.status === 'RESOLVED').length,
        userCount,
      };
    });

    return res.json({ departments });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 2. My Jurisdiction ───────────────────────────────────────────────────────

/**
 * GET /api/departments/me
 * Authenticated. Returns calling user's department + city.
 */
export function getMyDepartmentController(req, res) {
  try {
    const { address, role } = req.user;
    const juris = getUserJurisdiction(address);
    const dept  = juris?.department || null;
    const city  = juris?.city       || null;
    return res.json({
      address,
      role,
      department:  dept,
      city,
      displayName: dept ? (DEPARTMENT_DISPLAY[dept] || dept) : null,
      cityName:    city ? getCityName(city) : null,
      jurisdiction: formatJurisdiction(dept, city),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 3. My Reports (Jurisdiction Filtered) ────────────────────────────────────

/**
 * GET /api/departments/me/reports
 * Authenticated. Returns reports filtered to caller's department AND city.
 *
 * Rules (Phase 14C):
 *   ADMIN                      → all reports
 *   AUTHORITY / MUNICIPAL_TEAM with dept+city → dept+city filtered
 *   AUTHORITY / MUNICIPAL_TEAM with dept only → empty + noCity flag
 *   AUTHORITY / MUNICIPAL_TEAM with no dept   → empty + noDepartment flag
 */
export function getMyReportsController(req, res) {
  try {
    const { address, role } = req.user;

    // ADMIN: full visibility, no filter
    if (role === 'ADMIN') {
      const all = enrichReports(getReports());
      return res.json({ reports: all, total: all.length, department: null, city: null, isAdmin: true });
    }

    const juris = getUserJurisdiction(address);
    const dept  = juris?.department || null;
    const city  = juris?.city       || null;

    // No department → strict empty (Phase 14B behaviour retained)
    if (!dept) {
      return res.json({
        reports:      [],
        total:        0,
        department:   null,
        city:         null,
        noDepartment: true,
        message:      'No department assigned to your account. Contact your administrator.',
      });
    }

    // Department but no city → empty + noCity flag (Phase 14C)
    if (!city) {
      return res.json({
        reports:    [],
        total:      0,
        department: dept,
        city:       null,
        noCity:     true,
        message:    `Department assigned (${DEPARTMENT_DISPLAY[dept] || dept}) but no city set. Contact your administrator.`,
      });
    }

    const allReports     = enrichReports(getReports());
    const filteredReports = getReportsByJurisdiction(dept, city, allReports);

    return res.json({
      reports:      filteredReports,
      total:        filteredReports.length,
      department:   dept,
      city,
      displayName:  DEPARTMENT_DISPLAY[dept] || dept,
      cityName:     getCityName(city),
      jurisdiction: formatJurisdiction(dept, city),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 4. List User Jurisdictions ──────────────────────────────────────────────

/**
 * GET /api/departments/users
 * ADMIN only. Returns all user → { department, city } assignments.
 */
export function getUserDepartmentsController(_req, res) {
  try {
    const allJuris = getAllJurisdictions();
    return res.json({ userDepartments: allJuris, count: Object.keys(allJuris).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 5. Assign User Jurisdiction ────────────────────────────────────────────

/**
 * POST /api/departments/assign-user
 * ADMIN only. Assigns (or updates) a user's department AND city.
 * body: { address, department, city }
 */
export function assignUserController(req, res) {
  try {
    const { address, department, city } = req.body || {};
    if (!address)    return res.status(400).json({ error: 'address is required.' });
    if (!department) return res.status(400).json({ error: 'department is required.' });
    if (!city)       return res.status(400).json({ error: 'city is required.' });

    setUserJurisdiction(address.toLowerCase(), department, city);
    console.log(`[DEPT] Admin ${req.user?.address} set ${address} → dept=${department}, city=${city}`);

    return res.json({
      success:     true,
      address:     address.toLowerCase(),
      department,
      city,
      displayName: DEPARTMENT_DISPLAY[department] || department,
      cityName:    getCityName(city),
      jurisdiction: formatJurisdiction(department, city),
      assignedBy:  req.user?.address,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

// ─── 6. Department Analytics ─────────────────────────────────────────────────

/**
 * GET /api/departments/analytics
 * Public. Per-department report counts by status.
 */
export function deptAnalyticsController(_req, res) {
  try {
    const allReports = enrichReports(getReports());

    const analytics = {};
    for (const dept of DEPARTMENTS) {
      const dr = allReports.filter(r => r.department === dept);
      analytics[dept] = {
        department:  dept,
        displayName: DEPARTMENT_DISPLAY[dept] || dept,
        total:       dr.length,
        open:        dr.filter(r => r.status === 'OPEN').length,
        verified:    dr.filter(r => r.status === 'VERIFIED').length,
        inProgress:  dr.filter(r => r.status === 'IN_PROGRESS').length,
        resolved:    dr.filter(r => r.status === 'RESOLVED').length,
      };
    }

    return res.json({ analytics });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 7. List All Assignments ─────────────────────────────────────────────────

/**
 * GET /api/assignments
 * ADMIN only.
 */
export function listAssignmentsController(_req, res) {
  try {
    const all = getAssignments();
    return res.json({ assignments: all, count: Object.keys(all).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 8. Get Single Assignment ────────────────────────────────────────────────

/**
 * GET /api/assignments/:reportId
 */
export function getAssignmentController(req, res) {
  try {
    const { reportId } = req.params;
    const assignment = getAssignment(reportId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found for this report.' });
    }
    return res.json(assignment);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 9. Manual Override Assignment ───────────────────────────────────────────

/**
 * POST /api/assignments/assign
 * ADMIN only. Manually override a report's department+city assignment.
 * body: { reportId, department, city? }
 */
export function manualAssignController(req, res) {
  try {
    const { reportId, department, city } = req.body || {};
    if (!reportId)   return res.status(400).json({ error: 'reportId is required.' });
    if (!department) return res.status(400).json({ error: 'department is required.' });

    if (city && !isValidCity(city)) {
      return res.status(400).json({ error: `Invalid city: "${city}"` });
    }

    const result = assignReport(reportId, department, req.user?.address, city);
    console.log(`[ASSIGN] Manual override by ${req.user?.address}: ${reportId.slice(0, 12)}… → ${department}|${city || 'no-city'}`);
    return res.json({ success: true, assignment: result });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
