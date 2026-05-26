// Active collector of use cases: lawyers + firms using AI successfully.
// List view with filters (firm type, jurisdiction, category, search) +
// click-through to expanded card.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import Pagination from './Pagination.jsx';
import { ChipTag, formatDate, timeAgo, inputStyle } from './publicHelpers.jsx';

const PAGE_SIZE = 20;

const FIRM_TYPE_META = {
  biglaw:    { label: 'Big Law',   color: '#6366F1' },
  boutique:  { label: 'Boutique',  color: '#F59E0B' },
  solo:      { label: 'Solo',      color: '#10B981' },
  inhouse:   { label: 'In-house',  color: '#EC4899' },
  government:{ label: 'Gov',       color: '#6B7280' },
  nonprofit: { label: 'Non-profit',color: '#10B981' },
  legaltech: { label: 'LegalTech', color: '#8B5CF6' },
  other:     { label: 'Other',     color: '#94A3B8' },
};

const CATEGORY_LABELS = {
  drafting: 'Drafting', research: 'Research', ediscovery: 'eDiscovery',
  review: 'Contract review', analytics: 'Analytics', intake: 'Client intake',
  compliance: 'Compliance', 'legal-ops': 'Legal ops', translation: 'Translation',
  training: 'Training', other: 'Other',
};

export default function PublicUseCases({ mode = 'list' }) {
  const navigate = useNavigate();
  const params = useParams();
  const idFromRoute = params.id;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(idFromRoute || null);
  const [recentlyUpdated, setRecentlyUpdated] = useState([]);

  const [search, setSearch] = useState('');
  const [filterFirmType, setFilterFirmType] = useState('all');
  const [filterJurisdiction, setFilterJurisdiction] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => { if (idFromRoute) setSelected(idFromRoute); }, [idFromRoute]);
  useEffect(() => { setPage(1); }, [search, filterFirmType, filterJurisdiction, filterCategory]);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (filterFirmType !== 'all')     p.set('firm_type', filterFirmType);
    if (filterJurisdiction !== 'all') p.set('jurisdiction', filterJurisdiction);
    if (filterCategory !== 'all')     p.set('category', filterCategory);
    p.set('page', String(page));
    p.set('pageSize', String(PAGE_SIZE));
    setLoading(true);
    publicFetch(`/public/usecases?${p}`)
      .then(res => { setItems(res.items || []); setTotal(res.total || 0); setTotalPages(res.totalPages || 1); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, filterFirmType, filterJurisdiction, filterCategory, page]);

  useEffect(() => { load(); }, [load]);

  // Globally most-recent use cases for the freshness strip — independent of
  // filters/page so it stays accurate everywhere.
  useEffect(() => {
    if (mode !== 'list') return;
    publicFetch('/public/usecases/recent?limit=5')
      .then(res => setRecentlyUpdated(res.items || []))
      .catch(() => setRecentlyUpdated([]));
  }, [mode]);

  const jurisdictions = useMemo(() => {
    const set = new Set(items.map(c => c.jurisdiction).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach(c => (c.categories || []).forEach(k => set.add(k)));
    return ['all', ...[...set].sort()];
  }, [items]);

  const isDetail = mode === 'detail';
  const visible = isDetail ? items.filter(i => i.id === idFromRoute) : items;

  function selectAndScroll(id) {
    const next = selected === id ? null : id;
    setSelected(next);
    if (mode === 'list') navigate(next ? `/legal/use-cases/${id}` : '/legal/use-cases');
  }

  return (
    <div>
      {!isDetail && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
              How lawyers are using AI
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 760, lineHeight: 1.6, margin: 0 }}>
              Verified case studies of lawyers, firms and legal departments using AI successfully.
              Every entry links to a primary source — press release, public announcement, or reputable press coverage.
            </p>
          </div>

          {recentlyUpdated.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid #6366F1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recently updated
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recentlyUpdated.map(c => {
                  const isOpen = selected === c.id;
                  const when = timeAgo(c.updated_at || c.published_at);
                  const meta = FIRM_TYPE_META[c.firm_type] || FIRM_TYPE_META.other;
                  return (
                    <div
                      key={c.id}
                      onClick={() => selectAndScroll(c.id)}
                      style={{
                        cursor: 'pointer', fontSize: 12, padding: '7px 12px', borderRadius: 6,
                        border: `1.5px solid ${isOpen ? '#6366F1' : 'var(--border-color)'}`,
                        background: isOpen ? '#EEF2FF' : 'var(--card-bg)',
                        transition: 'all 0.15s', maxWidth: 260,
                      }}>
                      <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.firm_name.length > 38 ? c.firm_name.slice(0, 38) + '…' : c.firm_name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: meta.color + '20', color: meta.color, textTransform: 'uppercase' }}>{meta.label}</span>
                        {when && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{when}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <input type="text" placeholder="Search firm, use case, tools…" value={search}
                   onChange={e => setSearch(e.target.value)} style={inputStyle} />
            <select value={filterFirmType} onChange={e => setFilterFirmType(e.target.value)} style={inputStyle}>
              <option value="all">All firm types</option>
              {Object.keys(FIRM_TYPE_META).map(t => <option key={t} value={t}>{FIRM_TYPE_META[t].label}</option>)}
            </select>
            <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)} style={inputStyle}>
              {jurisdictions.map(j => <option key={j} value={j}>{j === 'all' ? 'All jurisdictions' : j}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={inputStyle}>
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : (CATEGORY_LABELS[c] || c)}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>{total} use case{total === 1 ? '' : 's'}</div>
        </>
      )}

      {isDetail && (
        <div style={{ marginBottom: 16 }}>
          <a href="/legal/use-cases" onClick={e => { e.preventDefault(); navigate('/legal/use-cases'); }}
             style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>← All use cases</a>
        </div>
      )}

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}
      {!loading && visible.length === 0 && !isDetail && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>No use cases match these filters.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(c => (
          <UseCaseCard key={c.id} c={c} selected={selected === c.id || isDetail}
                        onSelect={() => selectAndScroll(c.id)}
                        hideExpandHint={isDetail} />
        ))}
      </div>

      {!isDetail && !loading && (
        <Pagination page={page} totalPages={totalPages}
                    onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    totalItems={total} pageSize={PAGE_SIZE} />
      )}
    </div>
  );
}

function UseCaseCard({ c, selected, onSelect, hideExpandHint }) {
  const firmMeta = FIRM_TYPE_META[c.firm_type] || FIRM_TYPE_META.other;
  return (
    <div className="card" style={{
      padding: 0, overflow: 'hidden',
      borderLeft: `3px solid ${firmMeta.color}`,
      cursor: hideExpandHint ? 'default' : 'pointer',
    }} onClick={hideExpandHint ? undefined : onSelect}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: firmMeta.color + '20', color: firmMeta.color, textTransform: 'uppercase' }}>{firmMeta.label}</span>
          {c.jurisdiction && <ChipTag>{c.jurisdiction}</ChipTag>}
          {(c.categories || []).slice(0, 4).map(k => <ChipTag key={k}>{CATEGORY_LABELS[k] || k}</ChipTag>)}
          {c.published_at && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(c.published_at)}</span>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{c.firm_name}</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 6 }}>{c.use_case_title}</div>
        {c.summary && !selected && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {c.summary}
          </div>
        )}
        {c.quantified_impact && !selected && (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#065F46' }}>
            ✓ {c.quantified_impact}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px 16px', background: '#FAFBFC' }} onClick={e => e.stopPropagation()}>
          {c.summary && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', marginTop: 0 }}>{c.summary}</p>}

          {c.outcome && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Outcome</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{c.outcome}</div>
            </div>
          )}
          {c.quantified_impact && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#D1FAE5', borderLeft: '3px solid #065F46', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#065F46' }}>
              {c.quantified_impact}
            </div>
          )}
          {(c.tools_used || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Tools used</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.tools_used.map(t => <ChipTag key={t}>{t}</ChipTag>)}
              </div>
            </div>
          )}
          {(c.source_urls || [c.source_url]).filter(Boolean).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Sources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...new Set([c.source_url, ...(c.source_urls || [])].filter(Boolean))].map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                     onClick={e => e.stopPropagation()}>
                    {u}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
