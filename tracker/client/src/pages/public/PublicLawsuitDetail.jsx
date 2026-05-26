// Single-case detail view — renders the same card as the list page but
// permanently expanded, with a back-to-list link. Fetches the full case
// (including events in the response) via /public/lawsuits/:id.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import {
  LAWSUIT_STATUS, LAWSUIT_TYPE_COLORS, LAWSUIT_EVENT_STYLES,
  StatusBadge, TypeBadge, ChipTag, DetailField,
  SourceLinks, EventTimeline, formatDate, timeAgo,
} from './publicHelpers.jsx';
import InsightsBox from './InsightsBox.jsx';
import SourceMentions from './SourceMentions.jsx';
import TimelineVertical from './TimelineVertical.jsx';
import AdminCaseActions from './AdminCaseActions.jsx';
import WatchButton from './WatchButton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function PublicLawsuitDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    publicFetch(`/public/lawsuits/${id}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, reloadTick]);

  const refresh = () => setReloadTick(t => t + 1);

  return (
    <div>
      <Link to="/legal/lawsuits" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>
        ← All lawsuits
      </Link>

      <div style={{ marginTop: 14 }}>
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
        {error   && <div style={{ color: '#991B1B' }}>{error}</div>}
        {!loading && !error && data && (
          <>
            <AdminCaseActions kind="lawsuit" id={id} onDone={refresh} />
            <ExpandedCase c={data} isAdmin={isAdmin} onChanged={refresh} />
          </>
        )}
      </div>
    </div>
  );
}

function ExpandedCase({ c, isAdmin, onChanged }) {
  const events = c.events || [];
  return (
    <div
      className="card"
      style={{
        marginBottom: 6, padding: 0, overflow: 'hidden',
        borderLeft: `3px solid ${LAWSUIT_TYPE_COLORS[c.case_type] || '#94A3B8'}`,
      }}
    >
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
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 3 }}>{c.case_name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-primary)' }}>{(c.plaintiffs || []).join(', ') || '—'}</span>
            <span style={{ margin: '0 6px', color: '#CBD5E1' }}>v.</span>
            <span style={{ color: 'var(--text-primary)' }}>{(c.defendants || []).join(', ') || '—'}</span>
          </div>
          {c.key_issues?.length > 0 && (
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
          <WatchButton entityKind="lawsuit" entityId={c.id} label="Watch this case" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px', background: '#FAFBFC' }}>
        <TimelineVertical events={events} styleMap={LAWSUIT_EVENT_STYLES} heading="Case timeline" />

        <InsightsBox
          insights={c.insights}
          subjectKind="lawsuit"
          subjectId={c.id}
          canEdit={isAdmin}
          onChanged={onChanged}
        />

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
          <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12, color: 'var(--text-primary)' }}>{c.summary}</p>
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
            <a href={c.case_url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
              Court documents →
            </a>
          </div>
        )}

        <SourceMentions mentions={c.mentions} />
        <SourceLinks urls={c.source_urls} exclude={c.case_url} />
      </div>
    </div>
  );
}
