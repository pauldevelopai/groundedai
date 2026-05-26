// Rich "Sources & references" grid for a detail page. Each card is a live
// click-through to the primary source — shows the extracted title, host,
// publish date, and a short body excerpt.
import { formatDate, timeAgo } from './publicHelpers.jsx';

export default function SourceMentions({ mentions }) {
  if (!mentions || mentions.length === 0) return null;

  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Sources &amp; references ({mentions.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {mentions.map((m, i) => <Card key={i} m={m} />)}
      </div>
    </section>
  );
}

function Card({ m }) {
  const headline = m.title || m.description || m.url;
  return (
    <a href={m.url} target="_blank" rel="noopener noreferrer"
       style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{
        padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
        height: '100%', borderLeft: '3px solid var(--accent)',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
          {m.host && <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{m.host}</span>}
          {m.published_at && (
            <>
              <span>·</span>
              <span>{formatDate(m.published_at)}</span>
              <span style={{ opacity: 0.7 }}>({timeAgo(m.published_at)})</span>
            </>
          )}
          {m.author && (
            <>
              <span>·</span>
              <span>by {m.author}</span>
            </>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)' }}>
          {clip(headline, 140)}
        </div>
        {m.description && m.description !== m.title && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {m.description}
          </div>
        )}
        {!m.description && m.body_excerpt && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {m.body_excerpt}
          </div>
        )}
        <div style={{ marginTop: 'auto', fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.url}
        </div>
      </div>
    </a>
  );
}

function clip(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
