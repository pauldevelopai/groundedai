// Public AI Legal lawsuits list — expand-in-place, mirroring the admin
// LawsuitTracker's visual language minus the admin actions (no Scan Sources,
// no Generate Analysis button, no Add to Knowledge, no Sources panel, no
// curriculum_relevance text).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import Pagination from './Pagination.jsx';
import TimelineVertical from './TimelineVertical.jsx';
import {
  LAWSUIT_STATUS, LAWSUIT_TYPE_COLORS, LAWSUIT_EVENT_STYLES,
  StatusBadge, TypeBadge, ChipTag, DetailField,
  SourceLinks, StatsBar, ChipStrip,
  formatDate, timeAgo, inputStyle, mostRecentActivity,
} from './publicHelpers.jsx';

const PAGE_SIZE = 20;

export default function PublicLawsuitsList({ mode = 'list', caseId: caseIdProp }) {
  const navigate = useNavigate();
  const params = useParams();
  const caseIdFromRoute = caseIdProp || params.id;

  const [cases, setCases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState({ active: 0, appealing: 0, settled: 0, dismissed: 0, decided: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState([]);

  // In-place expansion — one card open at a time
  const [selected, setSelected] = useState(caseIdFromRoute || null);
  const [events, setEvents] = useState({}); // caseId -> events[]

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterJurisdiction, setFilterJurisdiction] = useState('all');
  const [filterDefendant, setFilterDefendant] = useState('');

  const cardRefs = useRef({});

  // Reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1); }, [search, filterStatus, filterType, filterJurisdiction, filterDefendant]);

  // Keep expansion in sync with the URL (detail mode)
  useEffect(() => {
    if (caseIdFromRoute) setSelected(caseIdFromRoute);
  }, [caseIdFromRoute]);

  // ─── Load cases ──────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (filterStatus !== 'all') p.set('status', filterStatus);
    if (filterType !== 'all') p.set('case_type', filterType);
    if (filterJurisdiction !== 'all') p.set('jurisdiction', filterJurisdiction);
    // In detail mode we fetch everything to find the target case;
    // in list mode we paginate with the user's current page.
    if (mode === 'list') {
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
    } else {
      p.set('pageSize', '100');
    }
    setLoading(true);
    publicFetch(`/public/lawsuits?${p}`)
      .then(res => {
        setCases(res.items || []);
        setTotalCount(res.total || 0);
        setTotalPages(res.totalPages || 1);
        if (res.statusCounts) setStatusCounts(res.statusCounts);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, filterStatus, filterType, filterJurisdiction, page, mode]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Fetch the globally most-recent cases once. Independent of filters/page so
  // the freshness strip stays accurate everywhere — and reflects all cases,
  // not just the 20 visible on this page.
  useEffect(() => {
    if (mode !== 'list') return;
    publicFetch('/public/lawsuits/recent?limit=5')
      .then(res => setRecentlyUpdated(res.items || []))
      .catch(() => setRecentlyUpdated([]));
  }, [mode]);

  // Lazy-load events when a case is expanded (either by click or by URL)
  useEffect(() => {
    if (!selected || events[selected]) return;
    publicFetch(`/public/lawsuits/${selected}`)
      .then(data => setEvents(prev => ({ ...prev, [selected]: data.events || [] })))
      .catch(() => setEvents(prev => ({ ...prev, [selected]: [] })));
  }, [selected, events]);

  // ─── Derived UI data ────────────────────────────────────────────────────
  // Apply the defendant filter client-side (no public API param for it)
  const visibleCases = useMemo(() => {
    if (!filterDefendant) return cases;
    return cases.filter(c => (c.defendants || []).some(d => d === filterDefendant));
  }, [cases, filterDefendant]);

  // Stats come from the server so the breakdown reflects all filter-matching
  // rows, not just the current page. Match the header total.
  const stats = useMemo(() => ({
    total: totalCount,
    ...statusCounts,
  }), [totalCount, statusCounts]);

  // Top defendants (active + appealing cases, most-frequent first — matches admin)
  const topDefendants = useMemo(() => {
    const counts = new Map();
    cases.forEach(c => {
      if (c.status !== 'active' && c.status !== 'appealing') return;
      (c.defendants || []).forEach(d => counts.set(d, (counts.get(d) || 0) + 1));
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => ({ key: k, label: k, count: v }));
  }, [cases]);

  const jurisdictions = useMemo(() => {
    const set = new Set(cases.map(c => c.jurisdiction).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [cases]);

  // ─── Actions ────────────────────────────────────────────────────────────
  function selectAndScroll(id) {
    const next = selected === id ? null : id;
    setSelected(next);
    if (next) {
      // Update URL for shareability (back behaves as list→detail navigation)
      if (mode === 'list') navigate(`/legal/lawsuits/${id}`, { replace: false });
    } else {
      if (mode === 'list') navigate('/legal/lawsuits', { replace: false });
    }
    setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  const isDetailMode = mode === 'detail';

  return (
    <div>
      {!isDetailMode && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>AI lawsuits</h1>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {totalCount} {totalCount === 1 ? 'case' : 'cases'}
            {(search || filterStatus !== 'all' || filterType !== 'all' || filterJurisdiction !== 'all' || filterDefendant) ? ' (filtered)' : ''}
          </span>
        </div>
      )}

      {!isDetailMode && (
        <>
          <StatsBar stats={[
            { label: 'Total cases', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Active', value: stats.active + stats.appealing, color: '#1D4ED8' },
            { label: 'Settled', value: stats.settled, color: '#065F46' },
            { label: 'Dismissed', value: stats.dismissed, color: '#6B7280' },
            { label: 'Decided', value: stats.decided, color: '#92400E' },
          ]} />

          {recentlyUpdated.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid #6366F1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recently updated
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recentlyUpdated.map(c => {
                  const isOpen = selected === c.id;
                  const when = timeAgo(c.latest_event_date || c.last_update || c.updated_at);
                  return (
                    <div
                      key={c.id}
                      onClick={() => selectAndScroll(c.id)}
                      style={{
                        cursor: 'pointer', fontSize: 12, padding: '7px 12px', borderRadius: 6,
                        border: `1.5px solid ${isOpen ? '#6366F1' : 'var(--border-color)'}`,
                        background: isOpen ? '#EEF2FF' : 'var(--card-bg)',
                        transition: 'all 0.15s', maxWidth: 240,
                      }}>
                      <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.case_name.length > 38 ? c.case_name.slice(0, 38) + '…' : c.case_name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <StatusBadge map={LAWSUIT_STATUS} status={c.status} />
                        {when && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{when}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ChipStrip
            label="Defendants"
            items={topDefendants}
            selected={filterDefendant}
            onSelect={val => setFilterDefendant(val || '')}
            onClear={() => setFilterDefendant('')}
          />

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search cases, parties, issues…" value={search}
                   onChange={e => setSearch(e.target.value)} style={inputStyle} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="all">All statuses</option>
              {Object.keys(LAWSUIT_STATUS).map(s => (
                <option key={s} value={s}>{LAWSUIT_STATUS[s].label}</option>
              ))}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
              <option value="all">All types</option>
              <option value="copyright">Copyright</option>
              <option value="privacy">Privacy</option>
              <option value="defamation">Defamation</option>
              <option value="labour">Labour</option>
              <option value="contract">Contract</option>
              <option value="other">Other</option>
            </select>
            <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)} style={inputStyle}>
              {jurisdictions.map(j => (
                <option key={j} value={j}>{j === 'all' ? 'All jurisdictions' : j}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading cases…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}

      {!loading && visibleCases.length === 0 && !isDetailMode && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <h3 style={{ margin: '0 0 6px 0' }}>No cases found</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Try adjusting your filters.</p>
        </div>
      )}

      {isDetailMode && !loading && visibleCases.filter(c => c.id === caseIdFromRoute).length === 0 && cases.length > 0 && (
        <div style={{ color: 'var(--text-secondary)' }}>Case not found.</div>
      )}

      {!loading && visibleCases
        .filter(c => !isDetailMode || c.id === caseIdFromRoute)
        .map(c => (
          <CaseCard
            key={c.id}
            case_={c}
            selected={selected === c.id || isDetailMode}
            events={events[c.id]}
            onSelect={() => selectAndScroll(c.id)}
            cardRef={el => { if (el) cardRefs.current[c.id] = el; }}
            hideExpandHint={isDetailMode}
          />
        ))}

      {!isDetailMode && !loading && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────
function CaseCard({ case_: c, selected, events, onSelect, cardRef, hideExpandHint }) {
  return (
    <div
      ref={cardRef}
      className="card"
      style={{
        marginBottom: 6, padding: 0, overflow: 'hidden',
        borderLeft: `3px solid ${LAWSUIT_TYPE_COLORS[c.case_type] || '#94A3B8'}`,
        cursor: hideExpandHint ? 'default' : 'pointer',
      }}
      onClick={hideExpandHint ? undefined : onSelect}
    >
      {/* Header row */}
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <StatusBadge map={LAWSUIT_STATUS} status={c.status} />
            <TypeBadge map={LAWSUIT_TYPE_COLORS} type={c.case_type} />
            {c.jurisdiction && c.jurisdiction !== 'US Federal' && <ChipTag>{c.jurisdiction}</ChipTag>}
            {c.district && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {c.district}{c.circuit ? ` · ${c.circuit}` : ''}
              </span>
            )}
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{c.case_name}</div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-primary)' }}>{(c.plaintiffs || []).join(', ') || '—'}</span>
            <span style={{ margin: '0 6px', color: '#CBD5E1' }}>v.</span>
            <span style={{ color: 'var(--text-primary)' }}>{(c.defendants || []).join(', ') || '—'}</span>
          </div>

          {!selected && (() => {
            const recent = mostRecentActivity(c, 'lawsuit');
            if (!recent) return null;
            return (
              <div style={{
                marginTop: 6, marginBottom: 6, padding: '6px 10px',
                background: '#EEF2FF', borderLeft: '2px solid #6366F1', borderRadius: 4,
                fontSize: 12, lineHeight: 1.4,
              }}>
                <span style={{ fontWeight: 700, color: '#4F46E5' }}>
                  Latest update · {formatDate(recent.date)} ({timeAgo(recent.date)})
                </span>
                {recent.type === 'event' && recent.title && (
                  <span style={{ color: 'var(--text-primary)' }}> · {recent.title}</span>
                )}
              </div>
            );
          })()}
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
          {(c.latest_event_date || c.last_update) && (
            <div style={{ marginTop: 2 }}>Updated {timeAgo(c.latest_event_date || c.last_update)}</div>
          )}
          {c.judge && <div style={{ marginTop: 2 }}>Judge {c.judge}</div>}
          {c.settlement_amount && <div style={{ marginTop: 2, color: '#065F46', fontWeight: 600 }}>{c.settlement_amount}</div>}
          {!hideExpandHint && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#6366F1' }}>{selected ? '▲ collapse' : '▼ expand'}</div>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {selected && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px', background: '#FAFBFC' }} onClick={e => e.stopPropagation()}>
          {/* Deep analysis if available, otherwise summary */}
          {c.detailed_analysis ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                AI Legal analysis
              </div>
              {c.detailed_analysis.split('\n\n').map((p, i) => (
                p.trim() ? <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10, color: 'var(--text-primary)' }}>{p.trim()}</p> : null
              ))}
            </div>
          ) : c.summary ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12, color: 'var(--text-primary)' }}>{c.summary}</p>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
            <DetailField label="Court" value={c.court} />
            <DetailField label="District / circuit" value={[c.district, c.circuit].filter(Boolean).join(' · ') || null} />
            <DetailField label="Last legal update" value={formatDate(c.last_update)} />
            <DetailField label="Outcome" value={c.outcome} />
          </div>

          {c.next_deadline && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>
                Next: {c.next_deadline_notes || 'Deadline'} — {formatDate(c.next_deadline)}
              </span>
            </div>
          )}

          {c.case_url && (
            <div style={{ marginBottom: 12 }}>
              <a href={c.case_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                Court documents →
              </a>
            </div>
          )}

          <SourceLinks urls={c.source_urls} exclude={c.case_url} />
          <TimelineVertical events={events} styleMap={LAWSUIT_EVENT_STYLES} heading="Case timeline" />
        </div>
      )}
    </div>
  );
}
