/**
 * rbac.controller.js — CrowdPulse RBAC Controllers  (Phase 14A + 14C)
 *
 * GET  /api/rbac/role/:address  →  { address, role }                    (authenticated)
 * GET  /api/rbac/roles          →  { roles: {...} }                     (ADMIN only)
 * POST /api/rbac/assign         →  { address, role, department, city }  (ADMIN only)
 *   body: { address, role, department?, city? }
 */

import { getRole, setRole, getAllRoles, VALID_ROLES } from '../services/rbac.service.js';
import { DEPARTMENTS } from '../services/department.service.js';
import {
  setUserJurisdiction, getUserJurisdiction,
  getCityName, isValidCity,
} from '../services/jurisdiction.service.js';

/**
 * GET /api/rbac/role/:address
 * Returns the role for a given address.
 */
export function getRoleController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length !== 40) {
      return res.status(400).json({ error: 'Invalid address.' });
    }
    const role  = getRole(address.toLowerCase());
    const juris = getUserJurisdiction(address.toLowerCase());
    return res.json({
      address:    address.toLowerCase(),
      role,
      department: juris?.department || null,
      city:       juris?.city       || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * GET /api/rbac/roles
 * Returns all role assignments. ADMIN only.
 */
export function getRolesController(req, res) {
  try {
    const roles = getAllRoles();
    return res.json({ roles, count: Object.keys(roles).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/rbac/assign
 * Assigns a role (and optionally department + city) to an address. ADMIN only.
 * body: { address: string, role: string, department?: string, city?: string }
 */
export function assignRoleController(req, res) {
  try {
    const { address, role, department, city } = req.body || {};

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'address is required.' });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    setRole(address.toLowerCase(), role);

    // Phase 14C: optionally assign department + city at the same time
    let assignedDept = null;
    let assignedCity = null;

    if (department) {
      if (!DEPARTMENTS.includes(department)) {
        return res.status(400).json({ error: `Invalid department: "${department}"` });
      }
      if (city && !isValidCity(city)) {
        return res.status(400).json({ error: `Invalid city: "${city}"` });
      }
      setUserJurisdiction(address.toLowerCase(), department, city || null);
      assignedDept = department;
      assignedCity = city || null;
    }

    console.log(`[RBAC] Admin ${req.user?.address} assigned ${role}${assignedDept ? ' + ' + assignedDept : ''}${assignedCity ? ' + ' + assignedCity : ''} → ${address}`);

    return res.json({
      success:    true,
      address:    address.toLowerCase(),
      role,
      department: assignedDept,
      city:       assignedCity,
      cityName:   assignedCity ? getCityName(assignedCity) : null,
      assignedBy: req.user?.address,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
