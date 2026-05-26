// Combined sources + transparency page.
// One flow: intro → headline stats → pipeline diagram → 30d sparkline →
// source list grouped by role → recent ingest runs.
// Readers see both where data comes from AND how the agent system processes it.

import { useEffect, useMemo, useState } from 'react';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { ChipTag, timeAgo } from './publicHelpers.jsx';

const KIND_META = {
  rss:      { label: 'RSS feed',          color: '#6366F1' },
  html:     { label: 'Website scrape',    color: '#0891B2' },
  api_json: { label: 'API',               color: '#10B981' },
  bluesky:  { label: 'Bluesky',           color: '#3B82F6' },
  mastodon: { label: 'Mastodon',          color: '#8B5CF6' },
  reddit:   { label: 'Reddit',            color: '#F59E0B' },
};

const TAG_GROUP = {
  regulator: 'Regulators & enforcement',
  official: 'Regulators & enforcement',
  government: 'Regulators & enforcement',
  enforcement: 'Regulators & enforcement',
  court: 'Courts',
  legal: 'Legal press',
  news: 'News',
  tech: 'Tech press',
  ngo: 'NGOs & advocacy',
  academic: 'Academic / research',
  tracker: 'AI trackers',
  social: 'Social media',
  reddit: 'Social media',
};

const GROUP_ORDER = [
  'Regulators & enforcement', 'Courts', 'Legal press',
  'News', 'Tech press', 'NGOs & advocacy',
  'AI trackers', 'Academic / research', 'Social media', 'Other',
];

const RUN_STATUS_COLORS = {
  success: '#065F46',
  running: '#1D4ED8',
  error:   '#991B1B',
};

export default function PublicSources() {
  const [sources, setSources] = useState([]);
  const [transparency, setTransparency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      publicFetch('/public/sources'),
      publicFetch('/public/transparency'),
    ])
      .then(([s, t]) => { setSources(s || []); setTransparency(t || null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const s of sources) {
      let label = 'Other';
      for (const t of s.tags || []) {
        if (TAG_GROUP[t]) { label = TAG_GROUP[t]; break; }
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(s);
    }
    return GROUP_ORDER
      .map(l => ({ label: l, items: groups.get(l) || [] }))
      .filter(g => g.items.length > 0);
  }, [sources]);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.01em' }}>
          Where our data comes from
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 780, lineHeight: 1.65, margin: 0 }}>
          A scheduler pulls from every source below every few hours. Each item lands in a raw queue. A Claude
          agent classifies it — matching it to an existing case or regulation, proposing an event, or discarding
          it as noise. Anything flagged as genuinely new gets queued for human review. Dates are fact-checked
          against primary sources nightly. No black boxes — everything on this page is live.
        </p>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      {error   && <div style={{ color: '#991B1B' }}>{error}</div>}

      {!loading && !error && transparency && (
        <>
          {/* Headline stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
            <Stat label="Active sources" value={transparency.sources.active}  color="var(--text-primary)" />
            <Stat label="Items (24h)"    value={transparency.items.fetched_24h} color="#1D4ED8" />
            <Stat label="Triaged (24h)"  value={transparency.items.triaged_24h} color="#7C3AED" />
            <Stat label="Pending triage" value={transparency.items.pending}     color="#92400E" />
            <Stat label="Promoted"       value={transparency.items.promoted}    color="#065F46" />
            <Stat label="Total items"    value={transparency.items.total}       color="var(--text-primary)" />
          </div>

          <Pipeline data={transparency} />

          {transparency.series?.length > 1 && (
            <section style={{ marginBottom: 32 }}>
              <SectionHeader label="Last 30 days" />
              <Sparkline series={transparency.series} />
            </section>
          )}
        </>
      )}

      {!loading && !error && grouped.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader label={`Sources · ${sources.length} active`} />
          {grouped.map(group => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {group.label} <span style={{ fontWeight: 500, opacity: 0.6 }}>· {group.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map(s => <SourceRow key={s.id} source={s} />)}
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && !error && transparency?.recent_runs?.length > 0 && (
        <section>
          <SectionHeader label="Recent ingest runs" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {transparency.recent_runs.map(r => (
              <div key={r.id} className="card" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (RUN_STATUS_COLORS[r.status] || '#6B7280') + '20', color: RUN_STATUS_COLORS[r.status] || '#6B7280', textTransform: 'uppercase' }}>
                      {r.status}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{r.source_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>· {r.source_kind}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                    <div>{timeAgo(r.started_at)}</div>
                    {r.status === 'success' && <div>seen {r.items_seen} · new {r.items_new}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Parts ──────────────────────────────────────────────────────────────────
function Pipeline({ data }) {
  const stages = [
    { label: 'Sources',   sub: `${data.sources.active} active`,                                   color: '#6366F1' },
    { label: 'Raw queue', sub: `${data.items.total} fetched · ${data.items.pending} pending`,       color: '#F59E0B' },
    { label: 'Triage',    sub: `${data.items.triaged_24h} in last 24h`,                            color: '#7C3AED' },
    { label: 'Promoted',  sub: `${data.items.promoted} events`,                                    color: '#065F46' },
    { label: 'Rejected',  sub: `${data.items.rejected} noise`,                                     color: '#94A3B8' },
  ];
  return (
    <section style={{ marginBottom: 32 }}>
      <SectionHeader label="Pipeline" />
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div className="card" style={{ padding: '12px 16px', borderTop: `3px solid ${s.color}`, minWidth: 170 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: s.color }}>{s.sub}</div>
            </div>
            {i < stages.length - 1 && (
              <div style={{ padding: '0 4px', color: 'var(--text-secondary)', fontSize: 20 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Sparkline({ series }) {
  const W = 720, H = 120, PAD = 24;
  const max = Math.max(1, ...series.map(s => s.items));
  const n = series.length;
  const points = series.map((s, i) => {
    const x = PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD * 2));
    const y = H - PAD - (s.items / max) * (H - PAD * 2);
    return { x, y, s };
  });
  const promotedPoints = series.map((s, i) => {
    const x = PAD + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD * 2));
    const y = H - PAD - (s.promoted / max) * (H - PAD * 2);
    return { x, y };
  });
  return (
    <div className="card" style={{ padding: 14, overflow: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--border-color)" />
        <polyline
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#1D4ED8" strokeWidth="2"
        />
        <polyline
          points={promotedPoints.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#065F46" strokeWidth="2" strokeDasharray="3 3"
        />
        {points.map(p => (
          <circle key={p.s.day} cx={p.x} cy={p.y} r="2.5" fill="#1D4ED8">
            <title>{p.s.day}: {p.s.items} items ({p.s.promoted} promoted)</title>
          </circle>
        ))}
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 16, marginTop: 6 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#1D4ED8', verticalAlign: 'middle' }} /> items fetched</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#065F46', borderTop: '1px dashed #065F46', verticalAlign: 'middle' }} /> promoted to events</span>
      </div>
    </div>
  );
}

function SourceRow({ source: s }) {
  const meta = KIND_META[s.kind] || { label: s.kind, color: '#94A3B8' };
  const healthy = s.last_success_at && !s.has_error;

  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer"
       style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{
        padding: '12px 14px',
        borderLeft: `3px solid ${meta.color}`,
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              background: meta.color + '20', color: meta.color, textTransform: 'uppercase',
            }}>{meta.label}</span>
            {s.jurisdiction && <ChipTag>{s.jurisdiction}</ChipTag>}
            {(s.tags || []).filter(t => !['official','news','social'].includes(t)).slice(0, 3).map(t => (
              <span key={t} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {t}</span>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>
          {s.last_success_at ? (
            <>
              <div style={{ color: healthy ? '#065F46' : '#991B1B', fontWeight: 600 }}>
                {healthy ? '✓' : '⚠'} {timeAgo(s.last_success_at)}
              </div>
              <div>{Number(s.items_seen).toLocaleString()} items</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>Not yet fetched</div>
          )}
        </div>
      </div>
    </a>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value ?? 0}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
      {label}
    </div>
  );
}
