import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, CheckCircle2, XCircle,
  Loader2, AlertTriangle, RefreshCw, MessageSquare, Building2,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { useWallet } from '../hooks/useWallet.jsx';

const TABS = ['Pending', 'Verified', 'Rejected'];

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
const SEV_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e', CRITICAL: '#a855f7' };
const CAT_COLOR = {
  ROAD_DAMAGE: '#3b82f6', FLOOD: '#06b6d4', FIRE: '#ef4444',
  STREETLIGHT: '#f59e0b', GARBAGE: '#22c55e', WATER_LEAK: '#6366f1',
  UNSAFE_BUILDING: '#ec4899', OTHER: '#6b7280',
};

function timeAgo(ms) {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
const short = a => a ? `${a.slice(0, 8)}…${a.slice(-6)}` : '—';

function AuthReportCard({ report, onAction, actionLabel, actionColor, actionable }) {
  const [note,     setNote]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [result,   setResult]   = useState(null);
  const [showNote, setShowNote] = useState(false);

  async function handleAction() {
    setBusy(true); setResult(null);
    try {
      await onAction(report.id, note || `${actionLabel} via Authority Dashboard`);
      setResult({ ok: true, msg: `${actionLabel} successful` });
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally { setBusy(false); }
  }

  const catColor = CAT_COLOR[report.category] || CAT_COLOR.OTHER;
  const sevColor = SEV_COLOR[report.severity]  || '#6b7280';

  return (
    <motion.div className="gov-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="gov-card-top">
        <span className="rc-category" style={{ background: catColor + '22', color: catColor }}>
          {report.category?.replace(/_/g, ' ')}
        </span>
        <span className="gov-card-sev" style={{ color: sevColor }}>● {report.severity}</span>
      </div>
      <p className="gov-card-desc">{report.description}</p>
      <div className="gov-card-meta">
        <span>📍 {report.location || 'Unknown'}</span>
        <span>👤 {short(report.reporter)}</span>
        <span>🕐 {timeAgo(report.createdAt)}</span>
      </div>
      <div className="gov-card-id">ID: {report.id?.slice(0, 12)}…</div>

      {actionable && !result?.ok && (
        <>
          <div className="gov-note-row">
            <button className="gov-note-toggle" onClick={() => setShowNote(v => !v)}>
              <MessageSquare size={12} /> {showNote ? 'Hide note' : 'Add note'}
            </button>
            <AnimatePresence>
              {showNote && (
                <motion.textarea
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 60, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }} className="gov-note-input"
                  placeholder="Optional note…" value={note} onChange={e => setNote(e.target.value)}
                />
              )}
            </AnimatePresence>
          </div>
          <button className={`gov-action-btn ${actionColor}`} onClick={handleAction} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            {busy ? 'Processing…' : actionLabel}
          </button>
        </>
      )}

      {result && (
        <div className={`gov-result ${result.ok ? 'ok' : 'err'}`}>
          {result.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {result.msg}
        </div>
      )}
    </motion.div>
  );
}

export default function AuthorityPage() {
  const { isAuthenticated, role, department, city } = useWallet();
  const [activeTab,   setActiveTab]   = useState('Pending');
  const [deptData,    setDeptData]    = useState({ reports: [], total: 0, displayName: null, cityName: null, noDepartment: false, noCity: false, message: null });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = role === 'ADMIN' ? await api.reports() : await api.myDeptReports();
      setDeptData({
        reports:      data.reports || [],
        total:        data.total   || 0,
        displayName:  data.displayName  || null,
        cityName:     data.cityName     || null,
        jurisdiction: data.jurisdiction || null,
        noDepartment: data.noDepartment || false,
        noCity:       data.noCity       || false,
        message:      data.message      || null,
      });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  // Access guard
  if (!isAuthenticated || !['AUTHORITY', 'ADMIN'].includes(role)) {
    return (
      <div className="center-page">
        <div className="gov-access-denied">
          <ShieldCheck size={48} className="gov-denied-icon" />
          <h2>Authority Access Required</h2>
          <p>This dashboard is only accessible to users with the <b>AUTHORITY</b> or <b>ADMIN</b> role.</p>
        </div>
      </div>
    );
  }

  const { reports, displayName, cityName, jurisdiction, noDepartment, noCity, message } = deptData;
  const pending  = reports.filter(r => r.status === 'OPEN');
  const verified = reports.filter(r => ['VERIFIED', 'IN_PROGRESS', 'RESOLVED'].includes(r.status));
  const current  = { Pending: pending, Verified: verified, Rejected: [] }[activeTab] || [];
  const deptColor = DEPT_COLOR[department] || '#6b7280';
  const isBlocked = noDepartment || noCity;

  return (
    <div className="page gov-page">
      {/* Header */}
      <div className="gov-header">
        <div className="gov-header-left">
          <div className="gov-title-row">
            <ShieldCheck size={22} className="gov-title-icon authority" />
            <h1 className="gov-title">Authority Dashboard</h1>
          </div>
          {(displayName || cityName) && (
            <div className="dept-badge-row">
              <Building2 size={12} />
              {displayName && (
                <span className="dept-badge" style={{ color: deptColor, background: deptColor + '15', borderColor: deptColor + '44' }}>
                  {displayName}
                </span>
              )}
              {cityName && (
                <span className="city-badge">{cityName}</span>
              )}
            </div>
          )}
          <p className="gov-sub">Review and verify civic reports for your jurisdiction</p>
        </div>
        <button className="gov-refresh-btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* No department / no city notice */}
      {isBlocked && (
        <div className="dept-no-dept-notice">
          <AlertTriangle size={16} />
          <span>{message}</span>
        </div>
      )}

      {/* Stats */}
      {!isBlocked && (
        <div className="gov-stats-row">
          <div className="gov-stat">
            <span className="gov-stat-val text-warn">{pending.length}</span>
            <span className="gov-stat-label">Pending</span>
          </div>
          <div className="gov-stat-divider" />
          <div className="gov-stat">
            <span className="gov-stat-val text-success">{verified.length}</span>
            <span className="gov-stat-label">Verified</span>
          </div>
          <div className="gov-stat-divider" />
          <div className="gov-stat">
            <span className="gov-stat-val text-muted">{reports.length}</span>
            <span className="gov-stat-label">Total</span>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="gov-tabs">
        {TABS.map(t => (
          <button key={t} className={`gov-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t}
            {t === 'Pending' && pending.length > 0 && (
              <span className="gov-tab-badge">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="center-loader"><Loader2 size={28} className="spin" /><span>Loading…</span></div>
      ) : error ? (
        <div className="gov-error"><AlertTriangle size={18} /> {error}</div>
      ) : noDepartment ? (
        <div className="empty-state">
          <Building2 size={36} style={{ color: 'var(--muted)' }} />
          <p>Awaiting department assignment</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Contact your administrator to be assigned to a department</p>
        </div>
      ) : noCity ? (
        <div className="empty-state">
          <Building2 size={36} style={{ color: 'var(--muted)' }} />
          <p>Department assigned but no city set</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Contact your administrator to assign your city jurisdiction</p>
        </div>
      ) : current.length === 0 ? (
        <div className="empty-state">
          {activeTab === 'Rejected'
            ? <><XCircle size={36} style={{ color: 'var(--muted)' }} /><p>No rejected reports</p></>
            : <><CheckCircle2 size={36} style={{ color: 'var(--success)' }} /><p>No {activeTab.toLowerCase()} reports in your jurisdiction</p></>
          }
        </div>
      ) : (
        <div className="gov-grid">
          {current.map(r => (
            <AuthReportCard
              key={r.id} report={r}
              actionLabel="Verify Report" actionColor="verify"
              actionable={activeTab === 'Pending'}
              onAction={(id, note) => api.workflowVerify(id, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
