import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Users, BarChart3, ShieldCheck, Hammer, Building2,
  Loader2, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, UserPlus, TrendingUp,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { useWallet } from '../hooks/useWallet.jsx';

const TABS        = ['Users', 'Metrics'];
const VALID_ROLES = ['CITIZEN', 'AUTHORITY', 'MUNICIPAL_TEAM', 'ADMIN'];

const DEPT_LIST = [
  'ROAD_DEPARTMENT', 'SANITATION_DEPARTMENT', 'ELECTRICITY_DEPARTMENT',
  'DRAINAGE_DEPARTMENT', 'FIRE_DEPARTMENT', 'WATER_DEPARTMENT',
  'URBAN_DEPARTMENT', 'GENERAL_DEPARTMENT',
];

const DEPT_DISPLAY = {
  ROAD_DEPARTMENT:        'Road Dept',
  SANITATION_DEPARTMENT:  'Sanitation',
  ELECTRICITY_DEPARTMENT: 'Electricity',
  DRAINAGE_DEPARTMENT:    'Drainage',
  FIRE_DEPARTMENT:        'Fire Dept',
  WATER_DEPARTMENT:       'Water Supply',
  URBAN_DEPARTMENT:       'Urban Planning',
  GENERAL_DEPARTMENT:     'General Affairs',
};

const DEPT_COLOR = {
  ROAD_DEPARTMENT:        '#3b82f6',
  SANITATION_DEPARTMENT:  '#22c55e',
  ELECTRICITY_DEPARTMENT: '#f59e0b',
  DRAINAGE_DEPARTMENT:    '#06b6d4',
  FIRE_DEPARTMENT:        '#ef4444',
  WATER_DEPARTMENT:       '#6366f1',
  URBAN_DEPARTMENT:       '#ec4899',
  GENERAL_DEPARTMENT:     '#6b7280',
};

const ROLE_META = {
  CITIZEN:        { color: 'var(--muted)', bg: 'var(--surface2)' },
  AUTHORITY:      { color: '#f59e0b',      bg: '#f59e0b15' },
  MUNICIPAL_TEAM: { color: '#3b82f6',      bg: '#3b82f615' },
  ADMIN:          { color: '#a855f7',      bg: '#a855f715' },
};

const short = a => a ? `${a.slice(0, 10)}…${a.slice(-8)}` : '—';

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [roles,     setRoles]     = useState({});
  const [userDepts, setUserDepts] = useState({});
  const [cities,    setCities]    = useState([]);  // Phase 14C
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [newAddr,   setNewAddr]   = useState('');
  const [newRole,   setNewRole]   = useState('AUTHORITY');
  const [newDept,   setNewDept]   = useState('');
  const [newCity,   setNewCity]   = useState('');  // Phase 14C
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rv, dv, cv] = await Promise.allSettled([api.rbacRoles(), api.deptUsers(), api.cities()]);
      if (rv.status === 'fulfilled') setRoles(rv.value.roles || {});
      if (dv.status === 'fulfilled') setUserDepts(dv.value.userDepartments || {});
      if (cv.status === 'fulfilled') setCities(cv.value.cities || []);  // Phase 14C
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAssign(e) {
    e.preventDefault();
    if (!newAddr.trim()) return;
    setAssigning(true); setAssignMsg(null);
    try {
      // Role + optional department + city in one call
      await api.rbacAssign({
        address:    newAddr.trim().toLowerCase(),
        role:       newRole,
        department: newDept || undefined,
        city:       newCity || undefined,  // Phase 14C
      });
      const deptLabel = newDept ? (DEPT_DISPLAY[newDept] || newDept) : '';
      const cityLabel = newCity ? cities.find(c => c.code === newCity)?.name : '';
      const suffix    = [deptLabel, cityLabel].filter(Boolean).join(' · ');
      setAssignMsg({ ok: true, msg: `Assigned ${newRole}${suffix ? ' + ' + suffix : ''} to ${newAddr.slice(0, 12)}…` });
      setNewAddr(''); setNewDept(''); setNewCity('');
      await loadData();
    } catch (err) {
      setAssignMsg({ ok: false, msg: err.message });
    } finally { setAssigning(false); }
  }

  const entries = Object.entries(roles);

  return (
    <div className="admin-users-tab">
      {/* Assign Form */}
      <div className="admin-assign-card">
        <div className="admin-assign-title"><UserPlus size={16} /> Assign Role + Department + City</div>
        <form className="admin-assign-form" onSubmit={handleAssign}>
          <input
            type="text" className="admin-assign-input"
            placeholder="Wallet address (40-char hex)"
            value={newAddr} onChange={e => setNewAddr(e.target.value)} maxLength={40}
          />
          <select className="admin-assign-select" value={newRole} onChange={e => setNewRole(e.target.value)}>
            {VALID_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="admin-assign-select" value={newDept} onChange={e => setNewDept(e.target.value)}>
            <option value="">— No Department —</option>
            {DEPT_LIST.map(d => <option key={d} value={d}>{DEPT_DISPLAY[d]}</option>)}
          </select>
          {/* Phase 14C: City dropdown */}
          <select className="admin-assign-select" value={newCity} onChange={e => setNewCity(e.target.value)}>
            <option value="">— No City —</option>
            {cities.map(c => <option key={c.code} value={c.code}>{c.name}, {c.state}</option>)}
          </select>
          <button className="admin-assign-btn" type="submit" disabled={assigning || !newAddr.trim()}>
            {assigning ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </form>
        {assignMsg && (
          <div className={`gov-result ${assignMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: '0.5rem' }}>
            {assignMsg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {assignMsg.msg}
          </div>
        )}
      </div>

      {/* Role + Department + City table */}
      <div className="admin-table-wrap">
        <div className="admin-table-header" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
          <span>Wallet Address</span>
          <span>Role</span>
          <span>Department</span>
          <span>City</span>
        </div>
        {loading ? (
          <div className="center-loader" style={{ padding: '2rem 0' }}><Loader2 size={22} className="spin" /></div>
        ) : error ? (
          <div className="gov-error"><AlertTriangle size={14} /> {error}</div>
        ) : entries.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 0' }}><p>No role assignments yet</p></div>
        ) : (
          <div className="admin-table-body">
            {entries.map(([addr, role]) => {
              const meta  = ROLE_META[role] || ROLE_META.CITIZEN;
              const juris = userDepts[addr];  // may be string (old) or { department, city }
              const dept  = typeof juris === 'string' ? juris : (juris?.department || null);
              const city  = typeof juris === 'string' ? null  : (juris?.city || null);
              const dc    = DEPT_COLOR[dept] || null;
              return (
                <motion.div
                  key={addr}
                  className="admin-table-row"
                  style={{ gridTemplateColumns: '1fr auto auto auto' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                >
                  <code className="admin-addr">{short(addr)}</code>
                  <span className="admin-role-chip" style={{ color: meta.color, background: meta.bg }}>
                    {role === 'AUTHORITY'      && <ShieldCheck size={11} />}
                    {role === 'MUNICIPAL_TEAM' && <Hammer size={11} />}
                    {role === 'ADMIN'          && <Crown size={11} />}
                    {role.replace(/_/g, ' ')}
                  </span>
                  {dept ? (
                    <span className="admin-role-chip" style={{ color: dc, background: dc + '15' }}>
                      <Building2 size={11} /> {DEPT_DISPLAY[dept] || dept}
                    </span>
                  ) : (
                    <span className="admin-no-dept">—</span>
                  )}
                  {/* Phase 14C: city column */}
                  {city ? (
                    <span className="city-badge" style={{ fontSize: '0.7rem' }}>{city}</span>
                  ) : (
                    <span className="admin-no-dept">—</span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metrics Tab ───────────────────────────────────────────────────────────────

function MetricsTab() {
  const [overview,  setOverview]  = useState(null);
  const [deptStats, setDeptStats] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ov, da] = await Promise.allSettled([
        api.analyticsOverview(),
        api.deptAnalytics(),
      ]);
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (da.status === 'fulfilled') setDeptStats(da.value.analytics);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="center-loader"><Loader2 size={28} className="spin" /><span>Loading metrics…</span></div>;
  }

  const deptEntries = deptStats ? Object.entries(deptStats).filter(([, v]) => v.total > 0) : [];
  const maxCount    = deptEntries.reduce((m, [, v]) => Math.max(m, v.total), 1);

  return (
    <div className="admin-metrics">
      {/* Overview */}
      <h3 className="admin-section-title">Report Overview</h3>
      <div className="gov-metrics-grid">
        {[
          { label: 'Total',    val: overview?.totalReports    ?? 0, color: '#3b82f6' },
          { label: 'Open',     val: overview?.openReports     ?? 0, color: '#f59e0b' },
          { label: 'Verified', val: overview?.verifiedReports ?? 0, color: '#6366f1' },
          { label: 'Resolved', val: overview?.resolvedReports ?? 0, color: '#22c55e' },
          { label: 'Rate',     val: (overview?.resolutionRate ?? 0) + '%', color: '#06b6d4' },
        ].map(s => (
          <div key={s.label} className="gov-metric-card">
            <span className="gov-metric-val" style={{ color: s.color }}>{s.val}</span>
            <span className="gov-metric-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Department Distribution */}
      <h3 className="admin-section-title" style={{ marginTop: '1.75rem' }}>
        <TrendingUp size={13} style={{ display: 'inline', marginRight: '0.35rem' }} />
        Department Report Distribution
      </h3>
      {deptEntries.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No department-assigned reports yet.</p>
      ) : (
        <div className="admin-role-dist">
          {deptEntries.map(([dept, stats]) => {
            const dc = DEPT_COLOR[dept] || '#6b7280';
            return (
              <div key={dept} className="admin-role-row">
                <span className="admin-role-chip" style={{ color: dc, background: dc + '15', minWidth: '105px' }}>
                  <Building2 size={10} /> {DEPT_DISPLAY[dept] || dept}
                </span>
                <div className="admin-role-bar-wrap">
                  <div className="admin-role-bar" style={{ width: `${Math.max(4, (stats.total / maxCount) * 100)}%`, background: dc }} />
                </div>
                <span className="admin-role-count">
                  {stats.total} ({stats.resolved} ✓)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { isAuthenticated, role } = useWallet();
  const [activeTab, setActiveTab] = useState('Users');

  if (!isAuthenticated || role !== 'ADMIN') {
    return (
      <div className="center-page">
        <div className="gov-access-denied">
          <Crown size={48} className="gov-denied-icon" />
          <h2>Admin Access Required</h2>
          <p>This dashboard is only accessible to users with the <b>ADMIN</b> role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page gov-page">
      <div className="gov-header">
        <div className="gov-header-left">
          <div className="gov-title-row">
            <Crown size={22} className="gov-title-icon admin" />
            <h1 className="gov-title">Admin Dashboard</h1>
          </div>
          <p className="gov-sub">Manage user roles, department assignments, and system health</p>
        </div>
      </div>

      <div className="gov-tabs">
        {TABS.map(t => (
          <button key={t} className={`gov-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'Users'   && <Users size={13} />}
            {t === 'Metrics' && <BarChart3 size={13} />}
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Users'   && <UsersTab />}
      {activeTab === 'Metrics' && <MetricsTab />}
    </div>
  );
}
