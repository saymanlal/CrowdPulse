/**
 * jurisdiction.service.js — CrowdPulse Jurisdiction Layer  (Phase 14C)
 *
 * Manages the city layer and user jurisdiction assignments.
 * A jurisdiction = { department, city } pair.
 *
 * Replaces the user-dept functions that were in department.service.js.
 * Reads/writes backend/data/user-departments.json with backward-compat:
 *   Old format:  { "address": "ROAD_DEPARTMENT" }          → { department: "ROAD_DEPARTMENT", city: null }
 *   New format:  { "address": { department, city } }       → used as-is
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEPARTMENTS, DEPARTMENT_DISPLAY } from './department.service.js';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const USER_DEPT_PATH = path.join(__dirname, '..', 'data', 'user-departments.json');
const CITIES_PATH    = path.join(__dirname, '..', 'data', 'cities.json');
const LOG            = '[JURISDICTION]';

const DEPT_SET = new Set(DEPARTMENTS);

// ─── City Registry ────────────────────────────────────────────────────────────

let CITIES = [];
try {
  CITIES = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  console.log(`${LOG} Loaded ${CITIES.length} cities`);
} catch (e) {
  console.warn(`${LOG} Failed to load cities.json:`, e.message);
  CITIES = [];
}

const CITY_SET  = new Set(CITIES.map(c => c.code));
const CITY_MAP  = Object.fromEntries(CITIES.map(c => [c.code, c]));

export function getCities()          { return CITIES; }
export function isValidCity(code)    { return CITY_SET.has(code); }
export function getCityName(code)    { return CITY_MAP[code]?.name || code || null; }
export function getCityInfo(code)    { return CITY_MAP[code] || null; }

// ─── Normalize a raw entry from user-departments.json ─────────────────────────

function normalizeEntry(val) {
  if (!val) return { department: null, city: null };
  if (typeof val === 'string') return { department: val, city: null }; // backward compat
  return {
    department: val.department || null,
    city:       val.city       || null,
  };
}

// ─── User Jurisdiction Store ─────────────────────────────────────────────────

let jurisdictions = {}; // address (lowercase) → { department, city }

function loadJurisdictions() {
  try {
    if (fs.existsSync(USER_DEPT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(USER_DEPT_PATH, 'utf8'));
      jurisdictions = {};
      for (const [addr, val] of Object.entries(raw)) {
        jurisdictions[addr.toLowerCase()] = normalizeEntry(val);
      }
      console.log(`${LOG} Loaded ${Object.keys(jurisdictions).length} user jurisdictions`);
    }
  } catch (e) {
    console.warn(`${LOG} Failed to load user-departments.json:`, e.message);
    jurisdictions = {};
  }
}

function saveJurisdictions() {
  try {
    const dir = path.dirname(USER_DEPT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_DEPT_PATH, JSON.stringify(jurisdictions, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save user-departments.json:`, e.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get jurisdiction for a user address.
 * Returns { department, city } or null if not assigned.
 */
export function getUserJurisdiction(address) {
  if (!address) return null;
  const entry = jurisdictions[address.toLowerCase()];
  if (!entry) return null;
  return normalizeEntry(entry);
}

/**
 * Set (or update) jurisdiction for a user.
 * Pass null for city to clear it.
 * Validation: department must be in DEPARTMENTS, city must be in cities.json.
 */
export function setUserJurisdiction(address, department, city) {
  if (department && !DEPT_SET.has(department)) {
    throw new Error(`Invalid department: "${department}". Valid: ${DEPARTMENTS.join(', ')}`);
  }
  if (city && !isValidCity(city)) {
    throw new Error(`Invalid city: "${city}". Valid: ${[...CITY_SET].join(', ')}`);
  }

  const prev = jurisdictions[address.toLowerCase()] || {};
  jurisdictions[address.toLowerCase()] = {
    department: department !== undefined ? department : (prev.department || null),
    city:       city       !== undefined ? city       : (prev.city       || null),
  };
  saveJurisdictions();
  console.log(`${LOG} Set ${address.slice(0, 10)}… → dept=${department || 'unchanged'}, city=${city || 'unchanged'}`);
}

/**
 * Remove a user's jurisdiction entirely.
 */
export function removeUserJurisdiction(address) {
  delete jurisdictions[address.toLowerCase()];
  saveJurisdictions();
  console.log(`${LOG} Removed jurisdiction for ${address.slice(0, 10)}…`);
}

/**
 * Returns all user jurisdictions as { address: { department, city } }
 */
export function getAllJurisdictions() {
  const result = {};
  for (const [addr, val] of Object.entries(jurisdictions)) {
    result[addr] = normalizeEntry(val);
  }
  return result;
}

/**
 * Build a display string for a jurisdiction.
 * e.g. "Road Department · Bhopal"
 */
export function formatJurisdiction(department, city) {
  const deptName = DEPARTMENT_DISPLAY[department] || department || '—';
  const cityName = getCityName(city) || '—';
  if (!department && !city) return 'No jurisdiction';
  if (!city)       return deptName;
  if (!department) return cityName;
  return `${deptName} · ${cityName}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadJurisdictions();
