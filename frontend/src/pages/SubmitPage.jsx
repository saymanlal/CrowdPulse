import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Cpu, CheckCircle2, AlertCircle, Loader2, Upload, Image, X, Shield, Coins, Star, MapPin, Building2 } from 'lucide-react';
import { api } from '../utils/api.js';

const STEPS = ['Uploading', 'AI Analysis', 'Fraud Check', 'IPFS Upload', 'Blockchain', 'Rewards'];

function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {STEPS.map((step, i) => (
        <div key={step} className={`step-item ${i < current ? 'done' : i === current ? 'active' : ''}`}>
          {i < current ? <CheckCircle2 size={14} /> : i === current ? <Loader2 size={14} className="spin" /> : <span className="step-dot" />}
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

export default function SubmitPage() {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [location, setLocation] = useState('');   // address text
  const [city, setCity]         = useState('');   // city code
  const [cities, setCities]     = useState([]);   // from /api/cities
  const [status, setStatus]     = useState(null);
  const [step, setStep]         = useState(0);
  const [result, setResult]     = useState(null);
  const [errMsg, setErrMsg]     = useState('');
  const fileRef                 = useRef(null);

  // Load city list on mount
  useEffect(() => {
    api.cities().then(d => setCities(d.cities || [])).catch(() => {});
  }, []);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus(null);
    setResult(null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setStatus(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit() {
    if (!file)  return;
    if (!city) { setErrMsg('Please select a city.'); setStatus('error'); return; }
    setStatus('loading');
    setErrMsg('');
    setStep(0);

    const stepTimer = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 2800);

    try {
      const data = await api.submitReport(file, city, location);
      clearInterval(stepTimer);
      setStep(STEPS.length);

      if (data.duplicate) {
        setStatus('duplicate');
        setErrMsg(data.reason || 'This image has already been reported.');
        setResult(data);
        return;
      }

      setResult(data);
      setStatus('success');
    } catch (e) {
      clearInterval(stepTimer);
      setErrMsg(e.message || 'Report submission failed');
      setStatus('error');
    }
  }

  const canSubmit = file && city && status !== 'loading';

  return (
    <div className="page">
      <motion.div className="form-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

        <h2 className="form-title">Submit a Civic Report</h2>
        <p className="form-sub">Upload an image → AI analysis → IPFS → Blockchain → Rewards. Fully automated.</p>

        {/* Image Upload */}
        <div className="field">
          <label>Civic Issue Image</label>
          {!preview ? (
            <div className="upload-zone" onClick={() => fileRef.current?.click()}>
              <Upload size={32} />
              <span>Click to upload or drag an image</span>
              <span className="hint">JPEG, PNG, WebP — max 10 MB</span>
            </div>
          ) : (
            <div className="preview-zone">
              <img src={preview} alt="Preview" className="preview-img" />
              <button className="preview-clear" onClick={clearFile}><X size={16} /></button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {/* City — Phase 14C */}
        <div className="field">
          <label><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />City <span className="field-required">*</span></label>
          <select
            className="field-select"
            value={city}
            onChange={e => { setCity(e.target.value); setStatus(null); setErrMsg(''); }}
          >
            <option value="">Select city…</option>
            {cities.map(c => (
              <option key={c.code} value={c.code}>{c.name}, {c.state}</option>
            ))}
          </select>
        </div>

        {/* Location Address — Phase 14C */}
        <div className="field">
          <label><MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Address / Landmark <span className="field-optional">(optional)</span></label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. MP Nagar Zone 2, Near DB Mall"
            maxLength={200}
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
          <span className="field-hint">{location.length}/200</span>
        </div>

        {/* Pipeline progress */}
        <AnimatePresence>
          {status === 'loading' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <StepIndicator current={step} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success result */}
        <AnimatePresence>
          {status === 'success' && result && (
            <motion.div className="result-card success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="result-header">
                <CheckCircle2 size={20} />
                <span>Report Created Successfully!</span>
              </div>
              {/* City badge in result */}
              {result.cityName && (
                <div className="dept-badge-row" style={{ marginBottom: '0.5rem' }}>
                  <Building2 size={12} />
                  <span>{result.cityName}</span>
                  {result.address && <span style={{ color: 'var(--muted)' }}>· {result.address}</span>}
                </div>
              )}
              <div className="result-grid">
                <div className="result-item">
                  <Cpu size={14} />
                  <span>{result.analysis?.category?.replace(/_/g, ' ')}</span>
                  <span className="result-tag">{result.analysis?.confidence}%</span>
                </div>
                <div className="result-item">
                  <Shield size={14} />
                  <span>Severity: {result.analysis?.severity}</span>
                </div>
                <div className="result-item">
                  <Coins size={14} />
                  <span>+{result.rewards?.earned || 0} points</span>
                </div>
                <div className="result-item">
                  <Star size={14} />
                  <span>+{result.reputation?.earned || 0} reputation</span>
                </div>
              </div>
              {result.blockchain?.txHash && (
                <div className="result-tx">
                  Tx: <code>{result.blockchain.txHash.slice(0, 20)}…</code>
                </div>
              )}
              {result.evidence?.publicUrl && (
                <a href={result.evidence.publicUrl} target="_blank" rel="noreferrer" className="result-link">
                  <Image size={12} /> View on IPFS
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Duplicate warning */}
        <AnimatePresence>
          {status === 'duplicate' && (
            <motion.div className="alert error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AlertCircle size={14} />
              &nbsp;{errMsg}
              {result?.existingReportId && <> (Report: <code>{result.existingReportId}</code>)</>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {status === 'error' && (
            <motion.div className="alert error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AlertCircle size={14} />
              &nbsp;{errMsg || 'Submission failed — please try again.'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit button */}
        <button className="btn-primary full" onClick={submit} disabled={!canSubmit}>
          {status === 'loading'
            ? <><Loader2 size={14} className="spin" /> Processing…</>
            : <><Send size={14} /> Submit Report</>}
        </button>

      </motion.div>
    </div>
  );
}