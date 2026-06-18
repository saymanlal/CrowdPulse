/**
 * assignment.service.js — CrowdPulse Report-Department Assignment  (Phase 14B + 14C)
 *
 * Auto-assigns reports to departments AND cities based on report content.
 * Persists assignments to backend/data/assignments.json.
 *
 * Assignment record shape (Phase 14C):
 * {
 *   reportId:     string,
 *   department:   string,   // e.g. "ROAD_DEPARTMENT"
 *   city:         string|null,  // e.g. "BHOPAL"  ← Phase 14C
 *   category:     string,   // e.g. "ROAD_DAMAGE"
 *   reporter:     string,   // wallet address
 *   assignedAt:   number,   // ms timestamp
 *   status:       "ASSIGNED",
 *   overriddenBy: string | null
 * }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDepartmentForCategory } from './department.service.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ASSIGN_PATH = path.join(__dirname, '..', 'data', 'assignments.json');
const LOG         = '[ASSIGN]';

// ─── In-Memory Store ──────────────────────────────────────────────────────────
let assignments = {}; // reportId → assignment record

function loadAssignments() {
  try {
    if (fs.existsSync(ASSIGN_PATH)) {
      assignments = JSON.parse(fs.readFileSync(ASSIGN_PATH, 'utf8'));
      console.log(`${LOG} Loaded ${Object.keys(assignments).length} report assignments from disk`);
    }
  } catch (e) {
    console.warn(`${LOG} Failed to load assignments.json:`, e.message);
    assignments = {};
  }
}

function saveAssignments() {
  try {
    const dir = path.dirname(ASSIGN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ASSIGN_PATH, JSON.stringify(assignments, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save assignments.json:`, e.message);
  }
}

// ─── City Extraction Helper ───────────────────────────────────────────────────

/**
 * Extract city code from a report's location field.
 * location may be:
 *   - JSON string: '{"address":"MP Nagar","city":"BHOPAL"}'
 *   - plain string: "MG Road, Bangalore" (pre-14C reports)
 *   - null/undefined
 */
function extractCity(location) {
  if (!location) return null;
  try {
    const parsed = typeof location === 'string' ? JSON.parse(location) : location;
    return parsed?.city || null;
  } catch {
    return null; // plain string — no city info
  }
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Auto-assign every report that doesn't yet have an assignment.
 * Idempotent — already-assigned reports are skipped.
 * Phase 14C: also extracts city from report.location.
 *
 * @param {Array} reports — array of report objects from reportCache
 */
export function ensureAssigned(reports) {
  let changed = false;
  for (const r of reports) {
    if (!r?.id || assignments[r.id]) continue;
    const department = getDepartmentForCategory(r.category);
    const city       = extractCity(r.location);  // Phase 14C
    assignments[r.id] = {
      reportId:     r.id,
      department,
      city,                                       // Phase 14C
      category:     r.category || 'OTHER',
      reporter:     r.reporter || null,
      assignedAt:   Date.now(),
      status:       'ASSIGNED',
      overriddenBy: null,
    };
    console.log(`${LOG} Auto-assigned ${r.id.slice(0, 12)}… [${r.category}|${city || 'no-city'}] → ${department}`);
    changed = true;
  }
  if (changed) saveAssignments();
}

/**
 * Manually override a report's department (and optionally city) assignment.
 *
 * @param {string}      reportId
 * @param {string}      department
 * @param {string|null} overriddenBy — admin address
 * @param {string|null} city         — Phase 14C: optional city override
 */
export function assignReport(reportId, department, overriddenBy = null, city = undefined) {
  const existing = assignments[reportId] || {};
  assignments[reportId] = {
    ...existing,
    reportId,
    department,
    city: city !== undefined ? city : (existing.city || null),
    overriddenBy,
    assignedAt: Date.now(),
    status:     'ASSIGNED',
  };
  saveAssignments();
  console.log(`${LOG} Manually assigned ${reportId.slice(0, 12)}… → ${department} (by ${overriddenBy})`);
  return { ...assignments[reportId] };
}

/**
 * Get the assignment record for a specific report.
 */
export function getAssignment(reportId) {
  return assignments[reportId] ? { ...assignments[reportId] } : null;
}

/**
 * Get all assignment records.
 */
export function getAssignments() {
  return { ...assignments };
}

/**
 * Enrich reports with department AND city fields from assignments.
 * Falls back to getDepartmentForCategory if no assignment exists.
 *
 * @param {Array} reports
 * @returns {Array} reports with .department and .city added
 */
export function enrichReports(reports) {
  return reports.map(r => {
    const a = assignments[r.id];
    return {
      ...r,
      department: a?.department ?? getDepartmentForCategory(r.category),
      city:       a?.city       ?? extractCity(r.location) ?? null,  // Phase 14C
    };
  });
}

/**
 * Filter reports by department only.
 */
export function getReportsByDepartment(department, reports) {
  return reports.filter(r => r.department === department);
}

/**
 * Filter reports by BOTH department AND city (Phase 14C).
 * Both must match — null city means no match (strict).
 */
export function getReportsByJurisdiction(department, city, reports) {
  return reports.filter(r =>
    r.department === department &&
    r.city       === city
  );
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadAssignments();
