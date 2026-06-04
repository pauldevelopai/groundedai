// Home: hero + combined chronological activity feed.
// The per-type lists (latest lawsuits / latest regulations) used to live here
// but they duplicated what /legal/lawsuits and /legal/regulations already
// render in richer form. Home is now a single "everything together" feed —
// the one view that doesn't exist anywhere else on the site.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import {
  LAWSUIT_EVENT_STYLES, REG_EVENT_STYLES,
  ChipTag, formatDate, timeAgo,
} from './publicHelpers.jsx';
import WatchButton from './WatchButton.jsx';

export default function PublicHome() {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    publicFetch('/public/feed?limit=30')
      .then(res => setFeed(Array.isArray(res) ? res : []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 12px 0', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Global AI lawsuits &amp; regulations
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 720, lineHeight: 1.6, margin: 0 }}>
          A chronological feed of every significant AI court case and regulation worldwide.
          Browse <Link to="/legal/lawsuits" style={linkStyle}>lawsuits</Link>,{' '}
          <Link to="/legal/regulations" style={linkStyle}>regulations</Link>, or see how they connect on
          the <Link to="/legal/explore" style={linkStyle}>connections map</Link>.
        </p>
        <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 10, background: 'var(--card-bg, #fff)', maxWidth: 520 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
            Weekly digest
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Every Monday, a summary of the week's AI legal movements by email. No spam. Unsubscribe any time.
          </div>
          <WatchButton entityKind="all" label="Subscribe to weekly digest" />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Recent activity
        </div>

        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
        {error && <div style={{ color: '#991B1B' }}>{error}</div>}
        {!loading && !error && feed.length === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No tracked events yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {feed.map(ev => <FeedItem key={`${ev.type}:${ev.event_id}`} ev={ev} />)}
        </div>
      </section>
    </div>
  );
}

function FeedItem({ ev }) {
  const isLawsuit = ev.type === 'lawsuit_event';
  const style = (isLawsuit ? LAWSUIT_EVENT_STYLES : REG_EVENT_STYLES)[ev.event_type] || { color: '#64748B', icon: '•' };
  const href = isLawsuit ? `/legal/lawsuits/${ev.item_id}` : `/legal/regulations/${ev.item_id}`;

  return (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{
        padding: '12px 14px', borderLeft: `3px solid ${style.color}`,
        display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
      }}>
        <div style={{
          minWidth: 26, height: 26, borderRadius: '50%',
          background: style.color, color: 'white', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{style.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
            <ChipTag>{isLawsuit ? 'Lawsuit' : 'Regulation'}</ChipTag>
            <ChipTag>{ev.jurisdiction}</ChipTag>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {ev.event_type.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>·</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{formatDate(ev.date) || '—'}</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7 }}>({timeAgo(ev.date)})</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{ev.title || ev.item_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ev.item_name}</div>
          {ev.description && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {ev.description}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

const linkStyle = { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' };
