// Admin-side regulation tracker. Mirrors LawsuitTracker's shape but for
// regulations. Uses the authenticated /api/regulations endpoints so admins
// see all statuses (including proposed, repealed), not just the public
// in-force subset.
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const STATUS_COLORS = {
  proposed:      { bg: '#E0F2FE', text: '#075985', label: 'Proposed' },
  draft:         { bg: '#E0F2FE', text: '#075985', label: 'Draft' },
  consultation:  { bg: '#FEF3C7', text: '#92400E', label: 'Consultation' },
  enacted:       { bg: '#D1FAE5', text: '#065F46', label: 'Enacted' },
  in_force:      { bg: '#D1FAE5', text: '#065F46', label: 'In force' },
  partial_force: { bg: '#DCFCE7', text: '#166534', label: 'Partial force' },
  amended:       { bg: '#FEF3C7', text: '#92400E', label: 'Amended' },
  repealed:      { bg: '#FEE2E2', text: '#991B1B', label: 'Repealed' },
  superseded:    { bg: '#F3F4F6', text: '#6B7280', label: 'Superseded' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.in_force;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, letterSpacing: '0.02em' }}>
      {s.label.toUpperCase()}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RegulationTracker() {
  const [regs, setRegs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [jurisdiction, setJurisdiction] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (jurisdiction !== 'all') params.set('jurisdiction', jurisdiction);
    if (status !== 'all') params.set('status', status);
    const qs = params.toString();
    apiFetch(`/regulations${qs ? `?${qs}` : ''}`)
      .then(setRegs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, jurisdiction, status]);

  useEffect(() => { apiFetch('/regulations/stats').then(setStats).catch(() => {}); }, []);

  const jurisdictions = useMemo(() => {
    const set = new Set(regs.map(r => r.jurisdiction).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [regs]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="AI regulation tracker" subtitle="Global AI regulations, statutes, guidance and international instruments" />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
          <StatCard label="Total" value={stats.total} />
          <StatCard label="In force" value={stats.in_force} />
          <StatCard label="Enacted" value={stats.enacted} />
          <StatCard label="Partial" value={stats.partial_force} />
          <StatCard label="Proposed" value={stats.proposed} />
          <StatCard label="Repealed" value={stats.repealed} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
               style={inputStyle} />
        <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} style={inputStyle}>
          {jurisdictions.map(j => <option key={j} value={j}>{j === 'all' ? 'All jurisdictions' : j}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="all">All statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{STATUS_COLORS[s].label}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: '#6B7280' }}>Loading…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {regs.map(r => <RegRow key={r.id} r={r} />)}
      </div>
    </div>
  );
}

// ── Per-regulation row with action buttons ────────────────────────────────
function RegRow({ r }) {
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [scrapingSources, setScrapingSources] = useState(false);
  const [buildingTimeline, setBuildingTimeline] = useState(false);
  const [msg, setMsg] = useState(null);

  async function buildTimeline() {
    setBuildingTimeline(true); setMsg(null);
    try {
      const res = await apiFetch(`/legal-sources/timeline/regulation/${r.id}`, { method: 'POST' });
      setMsg({ type: 'success', text: `Timeline — ${res.inserted} new events (of ${res.proposed_count}, ${res.rejected} rejected)` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBuildingTimeline(false); setTimeout(() => setMsg(null), 10000); }
  }

  async function generateInsights() {
    setGeneratingInsights(true); setMsg(null);
    try {
      const res = await apiFetch(`/legal-sources/insights/regulation/${r.id}`, { method: 'POST' });
      const cites = (res.written || []).reduce((a, w) => a + (w.citations_count || 0), 0);
      setMsg({ type: 'success', text: `Insights generated — ${res.related_count} related, ${cites} cites` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setGeneratingInsights(false); setTimeout(() => setMsg(null), 7000); }
  }
  async function scrapeSources() {
    setScrapingSources(true); setMsg(null);
    try {
      const res = await apiFetch(`/legal-sources/scrape-sources/regulation/${r.id}`, { method: 'POST' });
      setMsg({ type: 'success', text: `Scraped ${res.ok}/${res.urls} URLs` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setScrapingSources(false); setTimeout(() => setMsg(null), 7000); }
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <StatusBadge status={r.status} />
        <span style={tagStyle}>{r.jurisdiction}</span>
        {r.regulation_type && <span style={tagStyle}>{r.regulation_type}</span>}
        {r.importance_score != null && (
          <span style={{ ...tagStyle, background: '#FEF3C7', color: '#92400E' }}>score {Number(r.importance_score).toFixed(1)}</span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>
        {r.short_name ? `${r.short_name} — ${r.regulation_name}` : r.regulation_name}
      </div>
      {r.regulator && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{r.regulator}</div>}
      {r.summary && (
        <div style={{ fontSize: 13, color: '#374151', marginTop: 6, lineHeight: 1.5 }}>
          {r.summary.length > 200 ? r.summary.slice(0, 200) + '…' : r.summary}
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, color: '#6B7280', flexWrap: 'wrap' }}>
        <span>Effective {formatDate(r.effective_date)}</span>
        <span>Enforcement {formatDate(r.enforcement_date)}</span>
        {r.next_milestone && <span>Next {formatDate(r.next_milestone)}</span>}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={buildTimeline} disabled={buildingTimeline}
                className="btn btn-secondary btn-small" style={{ fontSize: 11, opacity: buildingTimeline ? 0.6 : 1 }}
                title="Claude + web_search enumerates every milestone with source URLs">
          {buildingTimeline ? '⏳ Researching…' : '⏰ Build Timeline'}
        </button>
        <button onClick={generateInsights} disabled={generatingInsights}
                className="btn btn-secondary btn-small" style={{ fontSize: 11, opacity: generatingInsights ? 0.6 : 1 }}
                title="RAG-backed industry impact + predicted outcome">
          {generatingInsights ? '⏳ Thinking…' : '◇ Generate Insights'}
        </button>
        <button onClick={scrapeSources} disabled={scrapingSources}
                className="btn btn-secondary btn-small" style={{ fontSize: 11, opacity: scrapingSources ? 0.6 : 1 }}
                title="Fetches every source URL, extracts metadata">
          {scrapingSources ? '⏳ Scraping…' : '↻ Scrape Sources'}
        </button>
        {r.official_url && (
          <a href={r.official_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-small" style={{ fontSize: 11 }}>
            Official text →
          </a>
        )}
        {msg && (
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: msg.type === 'success' ? '#D1FAE5' : '#FEE2E2',
            color:      msg.type === 'success' ? '#065F46' : '#991B1B',
          }}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{value ?? 0}</div>
    </div>
  );
}

const inputStyle = {
  padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 6,
  fontSize: 14, background: '#FFFFFF', color: '#111827', minWidth: 180,
};
const tagStyle = {
  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
  background: '#F3F4F6', color: '#374151',
};
