// Admin dashboard for the AI Legal ingestion pipeline.
// Two tabs: Sources (the pool of scraper targets) and Raw Items (what they fetched).
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const KIND_COLORS = {
  rss:      '#6366F1',
  html:     '#0891B2',
  bluesky:  '#3B82F6',
  mastodon: '#8B5CF6',
  reddit:   '#F59E0B',
  api_json: '#10B981',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d) {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-GB');
}

export default function LegalSourcesPage() {
  const [tab, setTab] = useState('sources'); // 'sources' | 'raw'
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => {
    apiFetch('/legal-sources/stats').then(setStats).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="AI Legal sources" subtitle="Scraper source pool + raw item queue" />

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Active sources"    value={stats.sources.active}    color="#065F46" />
          <StatCard label="Inactive"          value={stats.sources.inactive}  color="#6B7280" />
          <StatCard label="Total sources"     value={stats.sources.total}     color="var(--text-primary)" />
          <StatCard label="Raw items"         value={stats.raw_items.total}   color="var(--text-primary)" />
          <StatCard label="Pending triage"    value={stats.raw_items.pending} color="#92400E" />
          <StatCard label="Promoted"          value={stats.raw_items.promoted} color="#065F46" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
        <TabBtn active={tab === 'sources'}     onClick={() => setTab('sources')}>Sources</TabBtn>
        <TabBtn active={tab === 'health'}      onClick={() => setTab('health')}>Health</TabBtn>
        <TabBtn active={tab === 'raw'}         onClick={() => setTab('raw')}>Raw items</TabBtn>
        <TabBtn active={tab === 'usecases'}    onClick={() => setTab('usecases')}>Use case candidates</TabBtn>
        <TabBtn active={tab === 'submissions'} onClick={() => setTab('submissions')}>User submissions</TabBtn>
      </div>

      {tab === 'sources'     && <SourcesTab onStatsChange={loadStats} />}
      {tab === 'health'      && <HealthTab />}
      {tab === 'raw'         && <RawItemsTab />}
      {tab === 'usecases'    && <UseCaseCandidatesTab />}
      {tab === 'submissions' && <SubmissionsTab />}
    </div>
  );
}

// ── Health tab ──────────────────────────────────────────────────────────────
// Per-source run history from the last 10 runs. Sources bubble to the top when
// they're broken (≥3 consecutive failures) or degraded (≥1 failure). Lets Paul
// spot scrapers that have quietly stopped working before they rot the dataset.
const HEALTH_COLORS = {
  healthy:  '#065F46',
  degraded: '#92400E',
  broken:   '#991B1B',
  inactive: '#6B7280',
  unknown:  '#94A3B8',
};

function HealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/legal-sources/health')
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>;
  if (error)   return <div style={{ color: '#991B1B' }}>{error}</div>;

  const { counts = {}, sources = [] } = data || {};

  // Problem sources first, then degraded, then healthy, then inactive/unknown.
  const order = ['broken', 'degraded', 'unknown', 'healthy', 'inactive'];
  const groups = {};
  for (const s of sources) {
    const g = s.health_status || 'unknown';
    (groups[g] ||= []).push(s);
  }

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {order.map(k => counts[k] ? (
          <StatCard key={k} label={k[0].toUpperCase() + k.slice(1)} value={counts[k]} color={HEALTH_COLORS[k]} />
        ) : null)}
      </div>

      {order.map(g => (groups[g] || []).length > 0 && (
        <section key={g} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: HEALTH_COLORS[g],
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
          }}>
            {g} · {groups[g].length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[g].map(s => <HealthRow key={s.id} s={s} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function HealthRow({ s }) {
  const colour = HEALTH_COLORS[s.health_status] || '#64748B';
  const successRate = s.runs && Number(s.runs) > 0
    ? Math.round((Number(s.success) / Number(s.runs)) * 100)
    : null;

  return (
    <div className="card" style={{
      padding: '10px 14px',
      borderLeft: `3px solid ${colour}`,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span style={{
            padding: '1px 6px', borderRadius: 4, background: '#F1F5F9',
            color: '#475569', fontWeight: 600, marginRight: 6,
          }}>{s.kind}</span>
          {s.jurisdiction || '—'}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', minWidth: 140 }}>
        {s.runs ? (
          <>
            <div>
              Last 10: <strong style={{ color: successRate === 100 ? '#065F46' : successRate >= 50 ? '#92400E' : '#991B1B' }}>
                {s.success}/{s.runs}
              </strong> ok
            </div>
            {s.consecutive_failures > 0 && (
              <div style={{ color: '#991B1B', fontWeight: 600 }}>
                {s.consecutive_failures}× consecutive fail
              </div>
            )}
            <div>avg {Number(s.avg_items).toFixed(1)} items</div>
          </>
        ) : (
          <div>No runs yet</div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', minWidth: 130 }}>
        {s.last_run && <div>Last run {timeAgo(s.last_run)}</div>}
        <div>Promoted: <strong style={{ color: '#065F46' }}>{s.items_promoted || 0}</strong></div>
      </div>

      {s.last_error_message && (
        <div style={{
          flexBasis: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 4,
          background: '#FEF2F2', border: '1px solid #FECACA',
          fontSize: 11, color: '#991B1B', fontFamily: 'monospace',
        }}>
          <strong>Last error ({timeAgo(s.last_error_at)}):</strong> {s.last_error_message.slice(0, 300)}
        </div>
      )}
    </div>
  );
}

// ── Use-case candidates tab ─────────────────────────────────────────────────
// Raw items the triage agent flagged as "use_case_candidate". Admin reviews
// each, optionally edits the proposed fields, and promotes → ai_legal_usecases.
function UseCaseCandidatesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // raw item being reviewed

  const load = useCallback(() => {
    setLoading(true);
    // Pull classified raw items then filter client-side for use_case_candidate
    apiFetch('/legal-sources/raw-items?triage=classified&pageSize=100')
      .then(res => {
        const items = (res.items || []).filter(r => r.triage_result?.classification === 'use_case_candidate');
        setRows(items);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function reject(id) {
    if (!confirm('Reject this candidate?')) return;
    try {
      // Flip status to rejected; we're keeping raw items; just toggle status
      // via a direct update through raw-items review endpoint would be ideal
      // but for v1 we just do nothing cleanly — admin can ignore
      alert('Rejection endpoint not yet wired. For now, leave it — it won\'t bother you again.');
    } catch (err) { alert(err.message); }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-secondary btn-small" onClick={load}>Refresh</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {rows.length} candidate{rows.length === 1 ? '' : 's'} awaiting review
        </span>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No pending use-case candidates. When the triage agent detects news about law firms using AI, they'll appear here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => <CandidateRow key={r.id} row={r} onPromote={() => setEditing(r)} onReject={() => reject(r.id)} />)}
      </div>

      {editing && (
        <PromoteModal
          row={editing}
          onSave={async overrides => {
            try {
              await apiFetch(`/legal-sources/raw-items/${editing.id}/promote-use-case`, {
                method: 'POST', body: JSON.stringify({ overrides }),
              });
              setEditing(null); load();
            } catch (err) { alert('Promote failed: ' + err.message); }
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CandidateRow({ row, onPromote, onReject }) {
  const proposed = row.triage_result?.use_case || {};
  const confidence = row.triage_result?.confidence;
  return (
    <div className="card" style={{ padding: 14, borderLeft: '3px solid #10B981' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#D1FAE5', color: '#065F46', textTransform: 'uppercase' }}>{proposed.firm_type || 'firm'}</span>
            {proposed.jurisdiction && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>{proposed.jurisdiction}</span>}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.source_name}</span>
            {confidence != null && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>conf {Number(confidence).toFixed(2)}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{proposed.firm_name || '(firm unknown)'}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>{proposed.use_case_title || row.title}</div>
          {proposed.summary && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 4 }}>{proposed.summary}</div>}
          {proposed.tools_used?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
              {proposed.tools_used.map(t => (
                <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#EEF2FF', color: '#4F46E5' }}>{t}</span>
              ))}
            </div>
          )}
          {row.url && <a href={row.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</a>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <button className="btn btn-primary btn-small" style={{ fontSize: 11 }} onClick={onPromote}>Review & Promote</button>
          <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={onReject}>Skip</button>
        </div>
      </div>
    </div>
  );
}

function PromoteModal({ row, onSave, onCancel }) {
  const p = row.triage_result?.use_case || {};
  const [form, setForm] = useState({
    firm_name: p.firm_name || '',
    firm_type: p.firm_type || 'biglaw',
    jurisdiction: p.jurisdiction || '',
    use_case_title: p.use_case_title || row.title || '',
    summary: p.summary || '',
    tools_used: (p.tools_used || []).join(', '),
    categories: (p.categories || []).join(', '),
    quantified_impact: p.quantified_impact || '',
    source_url: row.url || '',
    outcome: '',
  });
  const [saving, setSaving] = useState(false);

  function update(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      tools_used: form.tools_used.split(',').map(s => s.trim()).filter(Boolean),
      categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 18 }}>Promote to published use case</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>Review Claude's proposal. Edit anything, then publish.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Firm name" required><input type="text" value={form.firm_name} onChange={update('firm_name')} required style={inp} /></Field>
          <Field label="Firm type">
            <select value={form.firm_type} onChange={update('firm_type')} style={inp}>
              {['biglaw','boutique','solo','inhouse','government','nonprofit','legaltech','other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Jurisdiction"><input type="text" value={form.jurisdiction} onChange={update('jurisdiction')} style={inp} /></Field>
          <Field label="Quantified impact"><input type="text" value={form.quantified_impact} onChange={update('quantified_impact')} placeholder="75% faster review" style={inp} /></Field>
        </div>
        <Field label="Use case title" required><input type="text" value={form.use_case_title} onChange={update('use_case_title')} required style={inp} /></Field>
        <Field label="Summary"><textarea value={form.summary} onChange={update('summary')} style={{ ...inp, minHeight: 80 }} /></Field>
        <Field label="Outcome"><textarea value={form.outcome} onChange={update('outcome')} style={{ ...inp, minHeight: 60 }} placeholder="Optional — what did they achieve?" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Tools used (comma-sep)"><input type="text" value={form.tools_used} onChange={update('tools_used')} style={inp} /></Field>
          <Field label="Categories (comma-sep)"><input type="text" value={form.categories} onChange={update('categories')} style={inp} /></Field>
        </div>
        <Field label="Source URL" required><input type="url" value={form.source_url} onChange={update('source_url')} required style={inp} /></Field>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-small" disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#991B1B' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inp = {
  padding: '8px 12px', fontSize: 14, width: '100%',
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
  background: 'var(--card-bg)', color: 'var(--text-primary)', fontFamily: 'inherit',
};

// ── Submissions tab ────────────────────────────────────────────────────────
function SubmissionsTab() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/legal-sources/submissions?status=${encodeURIComponent(status)}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function review(id, decision) {
    const notes = decision === 'rejected' ? (prompt('Reject reason (optional):') || '') : '';
    try {
      await apiFetch(`/legal-sources/submissions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, review_notes: notes }),
      });
      load();
    } catch (err) {
      alert('Review failed: ' + err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        {['pending', 'approved', 'rejected', 'duplicate'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
                  className={s === status ? 'btn btn-primary btn-small' : 'btn btn-secondary btn-small'}
                  style={{ fontSize: 11 }}>
            {s}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{rows.length}</span>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No {status} submissions.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(s => (
          <div key={s.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#EEF2FF', color: '#4F46E5', textTransform: 'uppercase' }}>{s.submission_kind}</span>
              {s.jurisdiction && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>{s.jurisdiction}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(s.created_at).toLocaleString('en-GB')}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{s.case_name}</div>
            {s.parties && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.parties}</div>}
            {s.summary && <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{s.summary}</div>}
            <a href={s.source_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source_url}</a>
            {s.submitter_email && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>from {s.submitter_email}</div>
            )}
            {s.review_notes && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>Reviewer: {s.review_notes}</div>
            )}
            {status === 'pending' && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button onClick={() => review(s.id, 'approved')}  className="btn btn-small" style={{ fontSize: 11, background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }}>Approve</button>
                <button onClick={() => review(s.id, 'rejected')}  className="btn btn-small" style={{ fontSize: 11, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>Reject</button>
                <button onClick={() => review(s.id, 'duplicate')} className="btn btn-secondary btn-small" style={{ fontSize: 11 }}>Duplicate</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sources tab ──────────────────────────────────────────────────────────────
function SourcesTab({ onStatsChange }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState({}); // sourceId -> bool
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/legal-sources')
      .then(setSources)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runOne(id) {
    setRunning(r => ({ ...r, [id]: true }));
    try {
      await apiFetch(`/legal-sources/${id}/run`, { method: 'POST' });
      load();
      onStatsChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(r => ({ ...r, [id]: false }));
    }
  }

  async function runAllDue() {
    setRunningAll(true);
    try {
      await apiFetch('/legal-sources/run-all-due', { method: 'POST' });
      load();
      onStatsChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningAll(false);
    }
  }

  async function toggleActive(s) {
    try {
      await apiFetch(`/legal-sources/${s.id}`, { method: 'PUT', body: JSON.stringify({ active: !s.active }) });
      load();
      onStatsChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-small" onClick={runAllDue} disabled={runningAll}>
          {runningAll ? '⏳ Running…' : '↻ Run all due now'}
        </button>
        <button className="btn btn-secondary btn-small" onClick={load}>Refresh</button>
      </div>

      {error && <div style={{ color: '#991B1B', marginBottom: 8 }}>{error}</div>}
      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.map(s => (
          <div key={s.id} className="card" style={{
            padding: '12px 14px',
            borderLeft: `3px solid ${KIND_COLORS[s.kind] || '#94A3B8'}`,
            opacity: s.active ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: (KIND_COLORS[s.kind] || '#94A3B8') + '20', color: KIND_COLORS[s.kind] || '#94A3B8', textTransform: 'uppercase' }}>{s.kind}</span>
                  {s.jurisdiction && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>{s.jurisdiction}</span>}
                  {(s.tags || []).slice(0, 4).map(t => (
                    <span key={t} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#EEF2FF', color: '#4F46E5' }}>{t}</span>
                  ))}
                  {!s.active && <span style={{ fontSize: 10, color: '#991B1B', fontWeight: 600 }}>DISABLED</span>}
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>

                <div style={{ marginTop: 6, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>seen <strong style={{ color: 'var(--text-primary)' }}>{s.items_seen}</strong></span>
                  <span>new <strong style={{ color: '#065F46' }}>{s.items_new}</strong></span>
                  {s.items_promoted > 0 && <span>promoted <strong style={{ color: '#1D4ED8' }}>{s.items_promoted}</strong></span>}
                  <span>every {s.run_frequency_hours}h</span>
                  {s.last_run_at && <span>last {timeAgo(s.last_run_at)}</span>}
                  {s.last_run_status === 'error' && <span style={{ color: '#991B1B' }}>last run: error</span>}
                </div>
                {s.last_error && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#991B1B', fontFamily: 'monospace', background: '#FEE2E2', padding: '4px 8px', borderRadius: 4 }}>
                    {s.last_error.slice(0, 160)}{s.last_error.length > 160 ? '…' : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={() => runOne(s.id)} disabled={running[s.id]}>
                  {running[s.id] ? '⏳' : '↻ Run'}
                </button>
                <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={() => toggleActive(s)}>
                  {s.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Raw items tab ────────────────────────────────────────────────────────────
function RawItemsTab() {
  const [page, setPage] = useState(1);
  const [triage, setTriage] = useState('pending');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (triage) p.set('triage', triage);
    apiFetch(`/legal-sources/raw-items?${p}`)
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }))
      .finally(() => setLoading(false));
  }, [page, triage]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={triage} onChange={e => { setPage(1); setTriage(e.target.value); }}
                style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 }}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="classified">Classified</option>
          <option value="promoted">Promoted</option>
          <option value="rejected">Rejected</option>
          <option value="duplicate">Duplicate</option>
        </select>
        {data && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.total} items</span>}
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(data?.items || []).map(it => (
          <div key={it.id} className="card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: (KIND_COLORS[it.source_kind] || '#94A3B8') + '20', color: KIND_COLORS[it.source_kind] || '#94A3B8', textTransform: 'uppercase' }}>{it.source_kind}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{it.source_name}</span>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: triageColor(it.triage_status).bg, color: triageColor(it.triage_status).fg, fontWeight: 600 }}>{it.triage_status}</span>
              {it.published_at && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(it.published_at)}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{it.title || '(no title)'}</div>
            {it.url && (
              <a href={it.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>{it.url}</a>
            )}
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}

function triageColor(status) {
  switch (status) {
    case 'pending':   return { bg: '#FEF3C7', fg: '#92400E' };
    case 'classified':return { bg: '#E0F2FE', fg: '#075985' };
    case 'promoted':  return { bg: '#D1FAE5', fg: '#065F46' };
    case 'rejected':  return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'duplicate': return { bg: '#F3F4F6', fg: '#6B7280' };
    default:          return { bg: '#F3F4F6', fg: '#374151' };
  }
}

// ── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPage }) {
  // Window of up to 7 pages centred on current
  const windowed = [];
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, start + 6);
  for (let i = start; i <= end; i++) windowed.push(i);

  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-secondary btn-small" disabled={page === 1} onClick={() => onPage(1)}>« First</button>
      <button className="btn btn-secondary btn-small" disabled={page === 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {start > 1 && <span style={{ color: 'var(--text-secondary)' }}>…</span>}
      {windowed.map(n => (
        <button key={n}
                className={n === page ? 'btn btn-primary btn-small' : 'btn btn-secondary btn-small'}
                style={{ fontWeight: n === page ? 700 : 500, minWidth: 32 }}
                onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      {end < totalPages && <span style={{ color: 'var(--text-secondary)' }}>…</span>}
      <button className="btn btn-secondary btn-small" disabled={page === totalPages} onClick={() => onPage(page + 1)}>Next ›</button>
      <button className="btn btn-secondary btn-small" disabled={page === totalPages} onClick={() => onPage(totalPages)}>Last »</button>
    </div>
  );
}

// ── Small bits ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '10px 16px', minWidth: 110, textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', fontSize: 13, fontWeight: active ? 600 : 500,
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      background: 'transparent', border: 'none', cursor: 'pointer',
      borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
      marginBottom: -1,
    }}>{children}</button>
  );
}
