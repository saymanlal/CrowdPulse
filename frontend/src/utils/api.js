const BASE = import.meta.env.VITE_API_URL || '';

// ── Module-level auth token ──────────────────────────────────────────────────
// Set by useWallet after successful login. All requests automatically include it.
let _authToken = null;
export const setAuthToken   = (t) => { _authToken = t; };
export const clearAuthToken = ()  => { _authToken = null; };

// ── Core fetch wrapper ───────────────────────────────────────────────────────
async function req(path, opts = {}) {
  const headers = {};
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`;
  }
  const res  = await fetch(BASE + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json();
  if (!res.ok && !data.duplicate) throw new Error(data.error || data.reason || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // ── Core ─────────────────────────────────────────────────────────────────
  health:      ()       => req('/health'),
  stats:       ()       => req('/api/stats'),
  nonce:       (addr)   => req(`/api/nonce/${addr}`),
  balance:     (addr)   => req(`/api/balance/${addr}`),
  reports:     (params) => req('/api/reports?' + new URLSearchParams(params || {})),
  report:      (id)     => req(`/api/reports/${id}`),
  blocks:      (n = 10) => req(`/api/blocks?count=${n}`),
  contracts:   ()       => req('/api/contracts'),
  aiVerify:    (body)   => req('/api/ai/verify',  { method: 'POST', body: JSON.stringify(body) }),
  broadcast:   (tx)     => req('/api/broadcast',  { method: 'POST', body: JSON.stringify(tx) }),

  // ── Phase 10 — Profile APIs ──────────────────────────────────────────────
  profilePoints:     (addr) => req(`/api/profile/${addr}/points`),
  profileReputation: (addr) => req(`/api/profile/${addr}/reputation`),
  profileBadges:     (addr) => req(`/api/profile/${addr}/badges`),

  // ── Phase 12 — Analytics APIs ────────────────────────────────────────────
  analyticsOverview:     () => req('/api/analytics/overview'),
  analyticsCategories:   () => req('/api/analytics/categories'),
  analyticsSeverity:     () => req('/api/analytics/severity'),
  analyticsTopReporters: () => req('/api/analytics/top-reporters'),
  analyticsHotspots:     () => req('/api/analytics/hotspots'),
  analyticsTrends:       () => req('/api/analytics/trends'),
  analyticsInsights:     () => req('/api/analytics/insights'),

  // ── Phase 13 — Workflow APIs (protected — requires JWT via _authToken) ───
  workflowVerify:  (id, note = '') => req(`/api/workflow/${id}/verify`,  { method: 'POST', body: JSON.stringify({ note }) }),
  workflowStart:   (id, note = '') => req(`/api/workflow/${id}/start`,   { method: 'POST', body: JSON.stringify({ note }) }),
  workflowResolve: (id, note = '') => req(`/api/workflow/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),

  // ── Phase 14 — Image Upload ─────────────────────────────────────────
  submitReport: (file, city, address) => {
    const formData = new FormData();
    formData.append('image',   file);
    if (city)    formData.append('city',    city);    // Phase 14C
    if (address) formData.append('address', address); // Phase 14C
    return req('/api/report/create', { method: 'POST', body: formData });
  },

  // ── Phase 14A — Auth APIs (public) ───────────────────────────────────────
  authNonce: (address)       => req(`/api/auth/nonce/${address}`),
  authLogin: (body)          => req('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  authMe:    ()              => req('/api/auth/me'),

  // ── Phase 14A — RBAC APIs (protected) ────────────────────────────────────
  rbacRole:   (address)      => req(`/api/rbac/role/${address}`),
  rbacRoles:  ()             => req('/api/rbac/roles'),
  rbacAssign: (body)         => req('/api/rbac/assign', { method: 'POST', body: JSON.stringify(body) }),

  // ── Phase 14B — Department APIs ────────────────────────────────────
  departments:    ()     => req('/api/departments'),
  deptAnalytics:  ()     => req('/api/departments/analytics'),
  myDepartment:   ()     => req('/api/departments/me'),
  myDeptReports:  ()     => req('/api/departments/me/reports'),
  deptUsers:      ()     => req('/api/departments/users'),
  assignUserDept: (body) => req('/api/departments/assign-user', { method: 'POST', body: JSON.stringify(body) }),

  // ── Phase 14B — Assignment APIs ─────────────────────────────────────
  assignments:      ()       => req('/api/assignments'),
  assignment:       (id)     => req(`/api/assignments/${id}`),
  manualAssign:     (body)   => req('/api/assignments/assign', { method: 'POST', body: JSON.stringify(body) }),

  // ── Phase 14C — City APIs ───────────────────────────────────────────
  cities: () => req('/api/cities'),
};