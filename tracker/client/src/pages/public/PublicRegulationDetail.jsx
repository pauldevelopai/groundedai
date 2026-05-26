// Single-regulation detail view — same card as list page, permanently expanded,
// with a back-to-list link.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import {
  REG_STATUS, REG_TYPE_COLORS, REG_EVENT_STYLES,
  StatusBadge, TypeBadge, ChipTag, DetailField,
  SourceLinks, EventTimeline, formatDate, timeAgo,
} from './publicHelpers.jsx';
import InsightsBox from './InsightsBox.jsx';
import SourceMentions from './SourceMentions.jsx';
import TimelineVertical from './TimelineVertical.jsx';
import AdminCaseActions from './AdminCaseActions.jsx';
import WatchButton from './WatchButton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function PublicRegulationDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    publicFetch(`/public/regulations/${id}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, reloadTick]);

  const refresh = () => setReloadTick(t => t + 1);

  return (
    <div>
      <Link to="/legal/regulations" style={{ color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>
        ← All regulations
      </Link>
      <div style={{ marginTop: 14 }}>
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
        {error   && <div style={{ color: '#991B1B' }}>{error}</div>}
        {!loading && !error && data && (
          <>
            <AdminCaseActions kind="regulation" id={id} onDone={refresh} />
            <ExpandedReg r={data} isAdmin={isAdmin} onChanged={refresh} />
          </>
        )}
      </div>
    </div>
  );
}

function ExpandedReg({ r, isAdmin, onChanged }) {
  const events = r.events || [];
  return (
    <div
      className="card"
      style={{
        marginBottom: 6, padding: 0, overflow: 'hidden',
        borderLeft: `3px solid ${REG_TYPE_COLORS[r.regulation_type] || '#94A3B8'}`,
      }}>
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <StatusBadge map={REG_STATUS} status={r.status} />
            <TypeBadge map={REG_TYPE_COLORS} type={r.regulation_type} />
            <ChipTag>{r.jurisdiction}</ChipTag>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 3 }}>
            {r.short_name ? <><span>{r.short_name}</span> <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>— {r.regulation_name}</span></> : r.regulation_name}
          </div>
          {r.regulator && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.regulator}</div>}
          {r.scope?.length > 0 && (
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
          {r.updated_at && <div style={{ marginTop: 2 }}>Updated {timeAgo(r.updated_at)}</div>}
          <WatchButton entityKind="regulation" entityId={r.id} label="Watch this regulation" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px', background: '#FAFBFC' }}>
        <TimelineVertical events={events} styleMap={REG_EVENT_STYLES} heading="Regulation timeline" />

        <InsightsBox
          insights={r.insights}
          subjectKind="regulation"
          subjectId={r.id}
          canEdit={isAdmin}
          onChanged={onChanged}
        />

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
          <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12, color: 'var(--text-primary)' }}>{r.summary}</p>
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
            <a href={r.official_url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
              Official text →
            </a>
          </div>
        )}

        <SourceMentions mentions={r.mentions} />
        <SourceLinks urls={r.source_urls} exclude={r.official_url} />
      </div>
    </div>
  );
}
