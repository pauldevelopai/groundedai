// Public AI Legal regulations list — same expand-in-place pattern as the
// lawsuits page, adapted for regulations. Coloured by regulation_type,
// includes key-provision bullet list + penalties + extraterritorial scope,
// and a timeline with regulation-event icons.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import Pagination from './Pagination.jsx';
import TimelineVertical from './TimelineVertical.jsx';
import {
  REG_STATUS, REG_TYPE_COLORS, REG_EVENT_STYLES,
  StatusBadge, TypeBadge, ChipTag, DetailField,
  SourceLinks, StatsBar, ChipStrip,
  formatDate, timeAgo, inputStyle, mostRecentActivity,
} from './publicHelpers.jsx';

const REG_TYPES = [
  'regulation', 'statute', 'directive', 'guidance',
  'executive_order', 'standard', 'voluntary_code', 'court_ruling',
];
const PUBLIC_STATUS_ORDER = ['in_force', 'partial_force', 'enacted', 'amended'];
const PAGE_SIZE = 20;

export default function PublicRegulationsList({ mode = 'list', regId: regIdProp }) {
  const navigate = useNavigate();
  const params = useParams();
  const idFromRoute = regIdProp || params.id;

  const [regs, setRegs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState({ in_force: 0, partial_force: 0, enacted: 0, amended: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState([]);

  const [selected, setSelected] = useState(idFromRoute || null);
  const [events, setEvents] = useState({});

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterJurisdiction, setFilterJurisdiction] = useState('all');

  const cardRefs = useRef({});

  useEffect(() => { if (idFromRoute) setSelected(idFromRoute); }, [idFromRoute]);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterType, filterJurisdiction]);

  const loadAll = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (filterStatus !== 'all') p.set('status', filterStatus);
    if (filterJurisdiction !== 'all') p.set('jurisdiction', filterJurisdiction);
    if (mode === 'list') {
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
    } else {
      p.set('pageSize', '100');
    }
    setLoading(true);
    publicFetch(`/public/regulations?${p}`)
      .then(res => {
        setRegs(res.items || []);
        setTotalCount(res.total || 0);
        setTotalPages(res.totalPages || 1);
        if (res.statusCounts) setStatusCounts(res.statusCounts);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, filterStatus, filterJurisdiction, page, mode]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Globally most-recent regulations — independent of filters/page so the
  // freshness strip is honest on every page.
  useEffect(() => {
    if (mode !== 'list') return;
    publicFetch('/public/regulations/recent?limit=5')
      .then(res => setRecentlyUpdated(res.items || []))
      .catch(() => setRecentlyUpdated([]));
  }, [mode]);

  useEffect(() => {
    if (!selected || events[selected]) return;
    publicFetch(`/public/regulations/${selected}`)
      .then(data => setEvents(prev => ({ ...prev, [selected]: data.events || [] })))
      .catch(() => setEvents(prev => ({ ...prev, [selected]: [] })));
  }, [selected, events]);

  const visibleRegs = useMemo(() => {
    if (filterType === 'all') return regs;
    return regs.filter(r => r.regulation_type === filterType);
  }, [regs, filterType]);

  // Stats come from the server so the breakdown reflects all filter-matching
  // rows, not just the current page.
  const stats = useMemo(
    () => ({ total: totalCount, ...statusCounts }),
    [totalCount, statusCounts]
  );

  // Top jurisdictions (clickable filter chips)
  const topJurisdictions = useMemo(() => {
    const counts = new Map();
    regs.forEach(r => { if (r.jurisdiction) counts.set(r.jurisdiction, (counts.get(r.jurisdiction) || 0) + 1); });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ key: k, label: k, count: v }));
  }, [regs]);

  const jurisdictions = useMemo(() => {
    const set = new Set(regs.map(r => r.jurisdiction).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [regs]);

  function selectAndScroll(id) {
    const next = selected === id ? null : id;
    setSelected(next);
    if (next) {
      if (mode === 'list') navigate(`/legal/regulations/${id}`);
    } else {
      if (mode === 'list') navigate('/legal/regulations');
    }
    setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }

  const isDetailMode = mode === 'detail';

  return (
    <div>
      {!isDetailMode && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>AI regulations</h1>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {totalCount} {totalCount === 1 ? 'regulation' : 'regulations'}
            {(search || filterStatus !== 'all' || filterType !== 'all' || filterJurisdiction !== 'all') ? ' (filtered)' : ''}
          </span>
        </div>
      )}

      {!isDetailMode && (
        <>
          <StatsBar stats={[
            { label: 'Total',         value: stats.total, color: 'var(--text-primary)' },
            { label: 'In force',      value: stats.in_force, color: '#065F46' },
            { label: 'Partial force', value: stats.partial_force, color: '#166534' },
            { label: 'Enacted',       value: stats.enacted, color: '#1D4ED8' },
            { label: 'Amended',       value: stats.amended, color: '#92400E' },
          ]} />

          {recentlyUpdated.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid #6366F1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recently updated
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recentlyUpdated.map(r => {
                  const isOpen = selected === r.id;
                  const label = r.short_name || r.regulation_name;
                  const when = timeAgo(r.latest_event_date || r.updated_at);
                  return (
                    <div
                      key={r.id}
                      onClick={() => selectAndScroll(r.id)}
                      style={{
                        cursor: 'pointer', fontSize: 12, padding: '7px 12px', borderRadius: 6,
                        border: `1.5px solid ${isOpen ? '#6366F1' : 'var(--border-color)'}`,
                        background: isOpen ? '#EEF2FF' : 'var(--card-bg)',
                        transition: 'all 0.15s', maxWidth: 260,
                      }}>
                      <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label.length > 38 ? label.slice(0, 38) + '…' : label}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <StatusBadge map={REG_STATUS} status={r.status} />
                        {when && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{when}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ChipStrip
            label="Jurisdictions"
            items={topJurisdictions}
            selected={filterJurisdiction === 'all' ? '' : filterJurisdiction}
            onSelect={val => setFilterJurisdiction(val || 'all')}
            onClear={() => setFilterJurisdiction('all')}
          />

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search name, regulator, provisions…" value={search}
                   onChange={e => setSearch(e.target.value)} style={inputStyle} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="all">All statuses</option>
              {PUBLIC_STATUS_ORDER.map(s => <option key={s} value={s}>{REG_STATUS[s]?.label || s}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
              <option value="all">All types</option>
              {REG_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)} style={inputStyle}>
              {jurisdictions.map(j => (
                <option key={j} value={j}>{j === 'all' ? 'All jurisdictions' : j}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading regulations…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}

      {!loading && visibleRegs.length === 0 && !isDetailMode && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <h3 style={{ margin: '0 0 6px 0' }}>No regulations found</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Try adjusting your filters.</p>
        </div>
      )}

      {!loading && visibleRegs
        .filter(r => !isDetailMode || r.id === idFromRoute)
        .map(r => (
          <RegCard
            key={r.id}
            reg={r}
            selected={selected === r.id || isDetailMode}
            events={events[r.id]}
            onSelect={() => selectAndScroll(r.id)}
            cardRef={el => { if (el) cardRefs.current[r.id] = el; }}
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

// ─── Regulation card ─────────────────────────────────────────────────────
function RegCard({ reg: r, selected, events, onSelect, cardRef, hideExpandHint }) {
  return (
    <div
      ref={cardRef}
      className="card"
      style={{
        marginBottom: 6, padding: 0, overflow: 'hidden',
        borderLeft: `3px solid ${REG_TYPE_COLORS[r.regulation_type] || '#94A3B8'}`,
        cursor: hideExpandHint ? 'default' : 'pointer',
      }}
      onClick={hideExpandHint ? undefined : onSelect}
    >
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <StatusBadge map={REG_STATUS} status={r.status} />
            <TypeBadge map={REG_TYPE_COLORS} type={r.regulation_type} />
            <ChipTag>{r.jurisdiction}</ChipTag>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
            {r.short_name ? <><span>{r.short_name}</span> <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>— {r.regulation_name}</span></> : r.regulation_name}
          </div>

          {r.regulator && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{r.regulator}</div>
          )}

          {!selected && (() => {
            const recent = mostRecentActivity(r, 'regulation');
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
          {r.summary && !selected && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {r.summary}
            </div>
          )}

          {selected && r.scope?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {r.scope.map((s, i) => (
                <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#F1F5F9', color: '#475569' }}>{s}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
          {r.effective_date && <div>Effective {formatDate(r.effective_date)}</div>}
          {r.enforcement_date && <div style={{ marginTop: 2 }}>Enforcement {formatDate(r.enforcement_date)}</div>}
          {r.next_milestone && <div style={{ marginTop: 2, color: '#1D4ED8', fontWeight: 600 }}>Next {formatDate(r.next_milestone)}</div>}
          {(r.latest_event_date || r.updated_at) && (
            <div style={{ marginTop: 2 }}>Updated {timeAgo(r.latest_event_date || r.updated_at)}</div>
          )}
          {!hideExpandHint && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#6366F1' }}>{selected ? '▲ collapse' : '▼ expand'}</div>
          )}
        </div>
      </div>

      {selected && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px', background: '#FAFBFC' }} onClick={e => e.stopPropagation()}>
          {r.detailed_analysis ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                AI Legal analysis
              </div>
              {r.detailed_analysis.split('\n\n').map((p, i) => (
                p.trim() ? <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10, color: 'var(--text-primary)' }}>{p.trim()}</p> : null
              ))}
            </div>
          ) : r.summary ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12, color: 'var(--text-primary)' }}>{r.summary}</p>
          ) : null}

          {r.key_provisions?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Key provisions
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                {r.key_provisions.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
            <DetailField label="Regulator" value={r.regulator} />
            <DetailField label="Proposed" value={formatDate(r.proposed_date)} />
            <DetailField label="Enacted" value={formatDate(r.enacted_date)} />
            <DetailField label="Effective" value={formatDate(r.effective_date)} />
            <DetailField label="Enforcement" value={formatDate(r.enforcement_date)} />
          </div>

          {r.next_milestone && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1D4ED8' }}>
                Next: {r.next_milestone_notes || 'Milestone'} — {formatDate(r.next_milestone)}
              </span>
            </div>
          )}

          {r.penalties && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Penalties</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{r.penalties}</div>
            </div>
          )}

          {r.extraterritorial_scope && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Extraterritorial scope</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{r.extraterritorial_scope}</div>
            </div>
          )}

          {r.affected_sectors?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Affected sectors</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {r.affected_sectors.map((s, i) => (
                  <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#F1F5F9', color: '#475569' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {r.official_url && (
            <div style={{ marginBottom: 12 }}>
              <a href={r.official_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                Official text →
              </a>
            </div>
          )}

          <SourceLinks urls={r.source_urls} exclude={r.official_url} />
          <TimelineVertical events={events} styleMap={REG_EVENT_STYLES} heading="Regulation timeline" />
        </div>
      )}
    </div>
  );
}
