import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const STATUS_COLORS = {
  active:    { bg: '#DBEAFE', text: '#1D4ED8', label: 'Active' },
  appealing: { bg: '#EDE9FE', text: '#6D28D9', label: 'Appealing' },
  settled:   { bg: '#D1FAE5', text: '#065F46', label: 'Settled' },
  dismissed: { bg: '#F3F4F6', text: '#6B7280', label: 'Dismissed' },
  decided:   { bg: '#FEF3C7', text: '#92400E', label: 'Decided' },
};

const TYPE_COLORS = {
  copyright:  '#6366F1',
  privacy:    '#F59E0B',
  defamation: '#EF4444',
  labour:     '#10B981',
  contract:   '#EC4899',
  other:      '#94A3B8',
};

const EVENT_TYPE_STYLES = {
  filing:     { color: '#6366F1', icon: '⚖' },
  hearing:    { color: '#F59E0B', icon: '🗓' },
  ruling:     { color: '#EF4444', icon: '📋' },
  settlement: { color: '#10B981', icon: '🤝' },
  dismissal:  { color: '#6B7280', icon: '✕' },
  decision:   { color: '#92400E', icon: '⚖' },
  appeal:     { color: '#6D28D9', icon: '↑' },
  amendment:  { color: '#0891B2', icon: '✎' },
  update:     { color: '#64748B', icon: '•' },
};

const PHASE_LABELS = {
  starting:      'Initialising',
  courtlistener: 'CourtListener API',
  news:          'News sources',
  analysing:     'AI analysis',
  saving:        'Saving to database',
  done:          'Complete',
  error:         'Error',
  idle:          '',
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, letterSpacing: '0.02em' }}>
      {s.label.toUpperCase()}
    </span>
  );
}

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#94A3B8';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: color + '20', color, border: `1px solid ${color}40` }}>
      {(type || 'other').replace('_', ' ')}
    </span>
  );
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatElapsed(ms) {
  if (!ms) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeAgo(d) {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Scan progress banner ──────────────────────────────────────────────────────
function ScanBanner({ scanStatus, elapsed, onDismiss }) {
  if (!scanStatus || scanStatus.phase === 'idle') return null;

  const isDone  = scanStatus.phase === 'done';
  const isError = scanStatus.phase === 'error';
  const isRunning = scanStatus.running;

  const progress = scanStatus.articlesTotal > 0
    ? Math.round((scanStatus.articlesDone / scanStatus.articlesTotal) * 100)
    : null;

  const bg    = isDone ? '#D1FAE5' : isError ? '#FEE2E2' : '#EFF6FF';
  const border= isDone ? '#6EE7B7' : isError ? '#FECACA' : '#BFDBFE';
  const color = isDone ? '#065F46' : isError ? '#991B1B' : '#1D4ED8';

  return (
    <div style={{
      marginBottom: 16, padding: '14px 16px', borderRadius: 8, fontSize: 13,
      background: bg, border: `1px solid ${border}`, color,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        {/* Left: status */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {isRunning && (
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: '#3B82F6', animation: 'pulse 1.2s ease-in-out infinite',
              }} />
            )}
            {isDone && <span style={{ fontSize: 15 }}>✓</span>}
            {isError && <span style={{ fontSize: 15 }}>⚠</span>}
            <span style={{ fontWeight: 700 }}>
              {isDone ? 'Scan complete' : isError ? 'Scan error' : `Scanning — ${PHASE_LABELS[scanStatus.phase] || scanStatus.phase}`}
            </span>
            {(isRunning || isDone) && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>⏱ {formatElapsed(elapsed)}</span>
            )}
          </div>

          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: progress !== null ? 8 : 0, lineHeight: 1.4 }}>
            {scanStatus.step}
          </div>

          {/* Article progress bar */}
          {isRunning && progress !== null && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                <span>Source {scanStatus.articlesDone} of {scanStatus.articlesTotal}</span>
                <span>{progress}%</span>
              </div>
              <div style={{ background: '#BFDBFE', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: '#3B82F6',
                  width: `${progress}%`, transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}

          {/* Running tally */}
          {isRunning && (scanStatus.newCases > 0 || scanStatus.updatedCases > 0) && (
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
              {scanStatus.newCases > 0 && <span style={{ marginRight: 12 }}>✦ {scanStatus.newCases} new case{scanStatus.newCases !== 1 ? 's' : ''} found</span>}
              {scanStatus.updatedCases > 0 && <span>{scanStatus.updatedCases} updated</span>}
            </div>
          )}

          {/* Final result */}
          {(isDone || isError) && scanStatus.lastResult && (
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600 }}>{scanStatus.lastResult}</div>
          )}
        </div>

        {/* Dismiss button (only when not running) */}
        {!isRunning && (
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.4, padding: 0, lineHeight: 1 }}>×</button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function LawsuitTracker() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [events, setEvents] = useState({});   // { caseId: [...events] }

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDefendant, setFilterDefendant] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [sources, setSources] = useState(null);
  const [showSources, setShowSources] = useState(false);

  // Live scan state
  const [scanStatus, setScanStatus] = useState(null);
  const [scanElapsed, setScanElapsed] = useState(0);
  const pollRef = useRef(null);
  const elapsedRef = useRef(null);

  // Refs so recently-updated chips can scroll to the right card
  const cardRefs = useRef({});

  // ─── Data loading ───────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterDefendant) params.set('defendant', filterDefendant);
    if (filterType !== 'all') params.set('case_type', filterType);
    if (search) params.set('q', search);

    return Promise.all([
      apiFetch(`/lawsuits?${params}`),
      apiFetch('/lawsuits/stats'),
    ]).then(([c, s]) => {
      setCases(c);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filterStatus, filterDefendant, filterType, search]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    apiFetch('/lawsuits/sources').then(setSources).catch(() => {});
  }, []);

  // Lazy-load events when a case is expanded
  useEffect(() => {
    if (!selected || events[selected]) return;
    apiFetch(`/lawsuits/${selected}/events`)
      .then(e => setEvents(prev => ({ ...prev, [selected]: e })))
      .catch(() => setEvents(prev => ({ ...prev, [selected]: [] })));
  }, [selected]);

  // ─── Scan polling ───────────────────────────────────────────────────────────
  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await apiFetch('/lawsuits/scan-status');
        setScanStatus(s);
        if (s.startedAt) {
          setScanElapsed(Date.now() - s.startedAt);
        }
        if (!s.running) {
          stopPolling();
          // Refresh case list when scan finishes
          loadAll();
        }
      } catch {}
    }, 1500);
  }

  function stopPolling() {
    clearInterval(pollRef.current);
    pollRef.current = null;
    clearInterval(elapsedRef.current);
    elapsedRef.current = null;
  }

  // Tick elapsed every second while running
  useEffect(() => {
    if (scanStatus?.running && scanStatus.startedAt) {
      if (!elapsedRef.current) {
        elapsedRef.current = setInterval(() => {
          setScanElapsed(Date.now() - scanStatus.startedAt);
        }, 1000);
      }
    } else {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    return () => clearInterval(elapsedRef.current);
  }, [scanStatus?.running, scanStatus?.startedAt]);

  useEffect(() => () => stopPolling(), []);

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function refresh() {
    try {
      const r = await apiFetch('/lawsuits/refresh', { method: 'POST' });
      if (r.started) {
        setScanStatus({ running: true, phase: 'starting', step: 'Initialising scan…', newCases: 0, updatedCases: 0, articlesDone: 0, articlesTotal: 0, startedAt: Date.now() });
        setScanElapsed(0);
        startPolling();
      } else {
        // Already running — just start polling to show progress
        startPolling();
      }
    } catch (err) {
      setScanStatus({ running: false, phase: 'error', step: `Failed to start: ${err.message}`, startedAt: null });
    }
  }

  function selectAndScroll(id) {
    setSelected(prev => prev === id ? null : id);
    setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  const isScanning = scanStatus?.running;

  return (
    <div>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>

      <PageHeader title="AI Lawsuit Tracker">
        <AiBadge />
        <button
          className="btn btn-secondary btn-small"
          onClick={() => setShowSources(s => !s)}
          style={{ fontSize: 11 }}
        >
          {showSources ? '▲ Hide Sources' : `◎ ${sources?.totalSources || '…'} Sources`}
        </button>
        <button
          className="btn btn-secondary btn-small"
          onClick={isScanning ? undefined : refresh}
          disabled={isScanning}
          style={{ fontSize: 11, opacity: isScanning ? 0.6 : 1 }}
        >
          {isScanning ? '● Scanning…' : '↻ Scan Now'}
        </button>
      </PageHeader>

      {/* Sources panel */}
      {showSources && sources && (
        <SourcesPanel sources={sources} />
      )}

      {/* Live scan progress banner */}
      <ScanBanner
        scanStatus={scanStatus}
        elapsed={scanElapsed}
        onDismiss={() => setScanStatus(null)}
      />

      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Cases', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Active', value: parseInt(stats.active || 0) + parseInt(stats.appealing || 0), color: '#1D4ED8' },
            { label: 'Settled', value: stats.settled || 0, color: '#065F46' },
            { label: 'Dismissed', value: stats.dismissed || 0, color: '#6B7280' },
            { label: 'Decided', value: stats.decided || 0, color: '#92400E' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '10px 16px', minWidth: 90, textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recently updated — clicking scrolls to and expands the case */}
      {stats?.recentlyUpdated?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid #6366F1' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🕐 Recently Updated
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.recentlyUpdated.map(c => {
              const isOpen = selected === c.id;
              const when = timeAgo(c.last_update || c.updated_at);
              return (
                <div
                  key={c.id}
                  onClick={() => selectAndScroll(c.id)}
                  style={{
                    cursor: 'pointer', fontSize: 12, padding: '7px 12px', borderRadius: 6,
                    border: `1.5px solid ${isOpen ? '#6366F1' : 'var(--border-color)'}`,
                    background: isOpen ? '#EEF2FF' : 'var(--card-bg)',
                    transition: 'all 0.15s', maxWidth: 240,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.case_name.length > 38 ? c.case_name.slice(0, 38) + '…' : c.case_name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge status={c.status} />
                    {when && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{when}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top defendants bar */}
      {stats?.defendants?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Defendants:</span>
          {stats.defendants.map(d => (
            <button key={d.defendant} onClick={() => setFilterDefendant(filterDefendant === d.defendant ? '' : d.defendant)}
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: `1.5px solid ${filterDefendant === d.defendant ? 'var(--accent)' : 'var(--border-color)'}`, background: filterDefendant === d.defendant ? 'var(--accent)' : 'transparent', color: filterDefendant === d.defendant ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {d.defendant} <span style={{ opacity: 0.7 }}>({d.case_count})</span>
            </button>
          ))}
          {filterDefendant && <button onClick={() => setFilterDefendant('')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Clear</button>}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search cases, parties…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13, minWidth: 200 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="appealing">Appealing</option>
          <option value="settled">Settled</option>
          <option value="dismissed">Dismissed</option>
          <option value="decided">Decided</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="all">All Types</option>
          <option value="copyright">Copyright</option>
          <option value="privacy">Privacy</option>
          <option value="defamation">Defamation</option>
          <option value="labour">Labour</option>
          <option value="contract">Contract</option>
          <option value="other">Other</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {cases.length} case{cases.length !== 1 ? 's' : ''}{filterStatus !== 'all' || filterDefendant || filterType !== 'all' || search ? ' (filtered)' : ''}
        </span>
      </div>

      {loading && <div className="empty-state"><p>Loading cases…</p></div>}

      {!loading && cases.length === 0 && (
        <div className="empty-state">
          <h3>No cases found.</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Try adjusting your filters, or click Scan Sources to search for new litigation.</p>
        </div>
      )}

      {/* Case list — ordered by most recent activity */}
      {!loading && cases.map(c => (
        <CaseCard
          key={c.id}
          case_={c}
          selected={selected === c.id}
          events={events[c.id]}
          onSelect={() => selectAndScroll(c.id)}
          cardRef={el => { if (el) cardRefs.current[c.id] = el; }}
          onCaseUpdate={updated => setCases(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
        />
      ))}
    </div>
  );
}

// ─── Case card ─────────────────────────────────────────────────────────────────
function CaseCard({ case_: c, selected, events, onSelect, cardRef, onCaseUpdate }) {
  const [analysing, setAnalysing] = useState(false);
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [scrapingSources, setScrapingSources] = useState(false);
  const [syncingCL, setSyncingCL] = useState(false);
  const [buildingTimeline, setBuildingTimeline] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  async function generateInsights(e) {
    e.stopPropagation();
    setGeneratingInsights(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/legal-sources/insights/lawsuit/${c.id}`, { method: 'POST' });
      const cites = (r.written || []).reduce((a, w) => a + (w.citations_count || 0), 0);
      setActionMsg({ type: 'success', text: `Insights generated — ${r.related_count} related entities, ${cites} citations` });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Insights failed: ' + err.message });
    } finally {
      setGeneratingInsights(false);
      setTimeout(() => setActionMsg(null), 8000);
    }
  }

  async function scrapeSources(e) {
    e.stopPropagation();
    setScrapingSources(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/legal-sources/scrape-sources/lawsuit/${c.id}`, { method: 'POST' });
      setActionMsg({ type: 'success', text: `Scraped — ${r.ok} ok, ${r.fail} failed of ${r.urls} URLs` });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Scrape failed: ' + err.message });
    } finally {
      setScrapingSources(false);
      setTimeout(() => setActionMsg(null), 8000);
    }
  }

  async function buildTimeline(e) {
    e.stopPropagation();
    setBuildingTimeline(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/legal-sources/timeline/lawsuit/${c.id}`, { method: 'POST' });
      setActionMsg({ type: 'success', text: `Timeline built — ${r.inserted} new events (of ${r.proposed_count} proposed, ${r.rejected} rejected as unsourced)` });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Timeline failed: ' + err.message });
    } finally {
      setBuildingTimeline(false);
      setTimeout(() => setActionMsg(null), 10000);
    }
  }

  async function syncCourtListener(e) {
    e.stopPropagation();
    setSyncingCL(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/legal-sources/courtlistener/sync/${c.id}`, { method: 'POST' });
      if (r.needs_auth) setActionMsg({ type: 'error', text: 'Needs COURTLISTENER_TOKEN in .env — docket bound but entries not synced' });
      else if (r.needs_review) {
        // Open a prompt to manually bind a docket ID from CL search candidates
        const candidates = (r.candidates || []).slice(0, 5);
        const list = candidates.length
          ? '\n\nCandidates:\n' + candidates.map((h, i) => `  ${i + 1}. [sim ${(h.sim*100).toFixed(0)}%] ${h.caseName} (id=${h.id})`).join('\n')
          : '';
        const docketId = window.prompt(
          `Auto-match was low-confidence (${(r.confidence*100).toFixed(0)}%). Paste the CourtListener docket ID to bind this case manually. Leave blank to skip.${list}`,
          candidates[0]?.id || ''
        );
        if (docketId) {
          const bind = await apiFetch(`/legal-sources/courtlistener/bind/${c.id}`, {
            method: 'POST', body: JSON.stringify({ docket_id: docketId.trim() }),
          });
          setActionMsg({ type: 'success', text: `Bound docket ${bind.docket_id || docketId} — ${bind.inserted || 0} new events` });
        } else {
          setActionMsg({ type: 'error', text: 'No match confident enough for auto-bind. Skipped.' });
        }
      } else setActionMsg({ type: 'success', text: `Docket ${r.docket_id} synced — ${r.inserted} new events, ${r.duplicates} duplicates` });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'CL sync failed: ' + err.message });
    } finally {
      setSyncingCL(false);
      setTimeout(() => setActionMsg(null), 12000);
    }
  }

  async function generateAnalysis(e) {
    e.stopPropagation();
    setAnalysing(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/lawsuits/${c.id}/analyse`, { method: 'POST' });
      onCaseUpdate?.({ id: c.id, detailed_analysis: r.detailed_analysis, analysis_generated_at: new Date().toISOString() });
      setActionMsg({ type: 'success', text: 'Analysis generated' });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Analysis failed: ' + err.message });
    } finally {
      setAnalysing(false);
      setTimeout(() => setActionMsg(null), 6000);
    }
  }

  async function addToKnowledge(e) {
    e.stopPropagation();
    setAddingKnowledge(true);
    setActionMsg(null);
    try {
      const r = await apiFetch(`/lawsuits/${c.id}/add-to-knowledge`, { method: 'POST' });
      onCaseUpdate?.({ id: c.id, knowledge_entry_id: r.knowledge_entry_id });
      setActionMsg({ type: 'success', text: r.created ? 'Added to Holly\'s knowledge base' : 'Knowledge entry updated' });
    } catch (err) {
      setActionMsg({ type: 'error', text: 'Failed: ' + err.message });
    } finally {
      setAddingKnowledge(false);
      setTimeout(() => setActionMsg(null), 6000);
    }
  }

  return (
    <div
      ref={cardRef}
      className="card"
      style={{
        marginBottom: 6, padding: 0, overflow: 'hidden',
        borderLeft: `3px solid ${TYPE_COLORS[c.case_type] || '#94A3B8'}`,
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      {/* Header row */}
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <StatusBadge status={c.status} />
            <TypeBadge type={c.case_type} />
            {c.jurisdiction && c.jurisdiction !== 'US Federal' && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>{c.jurisdiction}</span>
            )}
            {c.district && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{c.district}{c.circuit ? ` · ${c.circuit}` : ''}</span>
            )}
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{c.case_name}</div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-primary)' }}>{(c.plaintiffs || []).join(', ') || '—'}</span>
            <span style={{ margin: '0 6px', color: '#CBD5E1' }}>v.</span>
            <span style={{ color: 'var(--text-primary)' }}>{(c.defendants || []).join(', ') || '—'}</span>
          </div>

          {c.summary && !selected && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {c.summary}
            </div>
          )}

          {selected && c.key_issues?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {c.key_issues.map(issue => (
                <span key={issue} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#F1F5F9', color: '#475569' }}>{issue}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
          {c.filing_date && <div>Filed {formatDate(c.filing_date)}</div>}
          {c.last_update && <div style={{ marginTop: 2 }}>Updated {timeAgo(c.last_update)}</div>}
          {c.judge && <div style={{ marginTop: 2 }}>Judge {c.judge}</div>}
          {c.settlement_amount && <div style={{ marginTop: 2, color: '#065F46', fontWeight: 600 }}>{c.settlement_amount}</div>}
          <div style={{ marginTop: 4, fontSize: 10, color: '#6366F1' }}>{selected ? '▲ collapse' : '▼ expand'}</div>
        </div>
      </div>

      {/* Expanded detail */}
      {selected && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px 14px', background: '#FAFBFC' }} onClick={e => e.stopPropagation()}>

          {/* Action feedback */}
          {actionMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: actionMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2',
              color: actionMsg.type === 'success' ? '#065F46' : '#991B1B' }}>
              {actionMsg.type === 'success' ? '✓ ' : '⚠ '}{actionMsg.text}
            </div>
          )}

          {/* Deep analysis — primary content block */}
          {c.detailed_analysis ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                AI Legal Analysis {c.analysis_generated_at && <span style={{ fontWeight: 400 }}>· generated {timeAgo(c.analysis_generated_at)}</span>}
              </div>
              {c.detailed_analysis.split('\n\n').map((para, i) => (
                para.trim() ? (
                  <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10, color: 'var(--text-primary)' }}>
                    {para.trim()}
                  </p>
                ) : null
              ))}
            </div>
          ) : c.summary ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12, color: 'var(--text-primary)' }}>{c.summary}</p>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
            {c.court && <DetailField label="Court" value={c.court} />}
            {c.district && <DetailField label="District/Circuit" value={`${c.district}${c.circuit ? ` · ${c.circuit}` : ''}`} />}
            {c.last_update && <DetailField label="Last Legal Update" value={formatDate(c.last_update)} />}
            {c.outcome && <DetailField label="Outcome" value={c.outcome} />}
          </div>

          {c.next_deadline && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>
                Next: {c.next_deadline_notes || 'Deadline'} — {formatDate(c.next_deadline)}
              </span>
            </div>
          )}

          {c.curriculum_relevance && (
            <div style={{ fontSize: 12, padding: '8px 10px', background: '#EEF2FF', borderRadius: 6, color: 'var(--accent)', marginBottom: 12, lineHeight: 1.5 }}>
              <strong>Why this matters for AI training:</strong> {c.curriculum_relevance}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              onClick={generateAnalysis}
              disabled={analysing}
              className="btn btn-secondary btn-small"
              style={{ fontSize: 11, opacity: analysing ? 0.6 : 1 }}
            >
              {analysing ? '⏳ Generating…' : c.detailed_analysis ? '↻ Regenerate Analysis' : '✦ Generate Analysis'}
            </button>
            <button
              onClick={buildTimeline}
              disabled={buildingTimeline}
              className="btn btn-secondary btn-small"
              style={{ fontSize: 11, opacity: buildingTimeline ? 0.6 : 1 }}
              title="Claude + web_search enumerates every significant event with source URLs"
            >
              {buildingTimeline ? '⏳ Researching…' : '⏰ Build Timeline'}
            </button>
            <button
              onClick={generateInsights}
              disabled={generatingInsights}
              className="btn btn-secondary btn-small"
              style={{ fontSize: 11, opacity: generatingInsights ? 0.6 : 1 }}
              title="RAG-backed industry impact + predicted outcome, published on the public detail page"
            >
              {generatingInsights ? '⏳ Thinking…' : '◇ Generate Insights'}
            </button>
            <button
              onClick={scrapeSources}
              disabled={scrapingSources}
              className="btn btn-secondary btn-small"
              style={{ fontSize: 11, opacity: scrapingSources ? 0.6 : 1 }}
              title="Fetches every source URL, extracts title / author / publish date for richer detail page"
            >
              {scrapingSources ? '⏳ Scraping…' : '↻ Scrape Sources'}
            </button>
            {c.jurisdiction && /^US/i.test(c.jurisdiction) && (
              <button
                onClick={syncCourtListener}
                disabled={syncingCL}
                className="btn btn-secondary btn-small"
                style={{ fontSize: 11, opacity: syncingCL ? 0.6 : 1 }}
                title="Pulls the full docket from CourtListener (requires COURTLISTENER_TOKEN)"
              >
                {syncingCL ? '⏳ Syncing…' : '⚖ Sync CourtListener'}
              </button>
            )}
            <button
              onClick={addToKnowledge}
              disabled={addingKnowledge}
              className="btn btn-small"
              style={{
                fontSize: 11, opacity: addingKnowledge ? 0.6 : 1,
                background: c.knowledge_entry_id ? '#D1FAE5' : 'var(--accent)',
                color: c.knowledge_entry_id ? '#065F46' : 'white',
                border: c.knowledge_entry_id ? '1px solid #6EE7B7' : 'none',
              }}
            >
              {addingKnowledge ? '⏳ Saving…' : c.knowledge_entry_id ? '✓ In Knowledge Base' : '+ Add to Knowledge'}
            </button>
            {c.case_url && (
              <a href={c.case_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small" style={{ fontSize: 11 }} onClick={e => e.stopPropagation()}>
                Court Docs →
              </a>
            )}
          </div>

          {/* All source articles */}
          <SourceLinks case_={c} />

          {/* Event Timeline */}
          <EventTimeline events={events} />
        </div>
      )}
    </div>
  );
}

// ─── Per-case source article links ────────────────────────────────────────────
function SourceLinks({ case_: c }) {
  // Deduplicate: source_urls array + legacy source_url field, excluding case_url (court docs shown separately)
  const all = [...new Set([
    ...(c.source_urls || []),
    c.source_url || null,
  ].filter(Boolean).filter(u => u !== c.case_url))];

  if (all.length === 0) return null;

  function hostLabel(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url.slice(0, 40); }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Source Articles ({all.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {all.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 10, opacity: 0.5, minWidth: 14 }}>{i + 1}.</span>
            <span style={{ opacity: 0.6, fontSize: 11 }}>{hostLabel(url)}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
            <span style={{ opacity: 0.4, fontSize: 10 }}>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Sources panel ────────────────────────────────────────────────────────────
function SourcesPanel({ sources }) {
  const typeColors = { api: '#6366F1', web: '#0891B2', rss: '#F59E0B' };
  const typeLabels = { api: 'API', web: 'Web scrape', rss: 'RSS' };

  return (
    <div className="card" style={{ marginBottom: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Intelligence Sources</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{sources.totalSources} sources monitored</span>
        </div>
        {sources.lastScanned && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Last scan: {new Date(sources.lastScanned).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {sources.sources.map(s => (
          <div key={s.url} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary, #F8FAFC)', border: '1px solid var(--border-color)' }}>
            <div style={{ flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: typeColors[s.type] + '20', color: typeColors[s.type] }}>
                {typeLabels[s.type] || s.type.toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                {s.name}
              </a>
              {s.description && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{s.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────────
function EventTimeline({ events }) {
  if (!events) {
    return (
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Case History</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading history…</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Case History</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No events recorded yet. Click Scan Sources to check for updates.</div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        Case History ({events.length} event{events.length !== 1 ? 's' : ''})
      </div>
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* vertical line */}
        <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: 'var(--border-color)', borderRadius: 2 }} />

        {events.map((ev, i) => {
          const style = EVENT_TYPE_STYLES[ev.event_type] || EVENT_TYPE_STYLES.update;
          return (
            <div key={ev.id} style={{ position: 'relative', marginBottom: i < events.length - 1 ? 16 : 0 }}>
              <div style={{
                position: 'absolute', left: -20, top: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: style.color, color: 'white',
                fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, zIndex: 1,
              }}>
                {style.icon}
              </div>

              <div style={{ paddingLeft: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: style.color }}>
                    {ev.title || ev.event_type}
                  </span>
                  {ev.event_date && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {formatDate(ev.event_date)}
                    </span>
                  )}
                </div>
                {ev.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>
                    {ev.description}
                  </div>
                )}
                {ev.source_url && (
                  <a
                    href={ev.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginTop: 2, display: 'inline-block' }}
                    onClick={e => e.stopPropagation()}
                  >
                    Source →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
