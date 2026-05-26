// Redesigned vertical timeline for detail pages.
// Groups events by year with year headings. Each event shows:
//   - colored icon for the event_type
//   - date + type chip
//   - title (prominent)
//   - description
//   - source link + verified badge if the URL resolved
//
// Replaces the old "Case history" list at the bottom of detail pages — this
// component is meant to sit near the top, because the chronology IS the story.

import { formatDate, timeAgo, hostLabel } from './publicHelpers.jsx';

export default function TimelineVertical({ events, styleMap, heading = 'Timeline' }) {
  if (!events) {
    return (
      <section style={{ marginBottom: 16 }}>
        <Heading>{heading}</Heading>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div>
      </section>
    );
  }
  if (events.length === 0) {
    return (
      <section style={{ marginBottom: 16 }}>
        <Heading>{heading}</Heading>
        <div className="card" style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
          No events tracked yet. An admin can click <strong>Build Timeline</strong> on the admin page to research this case via Claude + web search, or data will flow in as sources publish updates.
        </div>
      </section>
    );
  }

  // Sort most-recent-first (so the latest is visible at the top)
  const sorted = [...events].sort((a, b) => {
    const ad = a.event_date ? new Date(a.event_date).getTime() : 0;
    const bd = b.event_date ? new Date(b.event_date).getTime() : 0;
    return bd - ad;
  });

  // Group by year
  const groups = new Map();
  for (const ev of sorted) {
    const year = ev.event_date ? new Date(ev.event_date).getFullYear() : 'undated';
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(ev);
  }

  return (
    <section style={{ marginBottom: 16 }}>
      <Heading>{heading} <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>· {events.length} event{events.length === 1 ? '' : 's'}</span></Heading>

      <div style={{ position: 'relative', paddingLeft: 32 }}>
        {/* Vertical spine */}
        <div style={{
          position: 'absolute', left: 12, top: 12, bottom: 12,
          width: 2, background: 'var(--border-color)', borderRadius: 2,
        }} />

        {[...groups.entries()].map(([year, evs]) => (
          <div key={year} style={{ marginBottom: 4 }}>
            <div style={{
              position: 'relative', marginLeft: -32, padding: '8px 0',
              fontSize: 14, fontWeight: 800, color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}>
              {year}
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {evs.length} event{evs.length === 1 ? '' : 's'}
              </span>
            </div>
            {evs.map((ev, i) => (
              <EventRow key={ev.id || `${year}-${i}`} ev={ev} styleMap={styleMap} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function EventRow({ ev, styleMap }) {
  const style = styleMap[ev.event_type] || { color: '#64748B', icon: '•' };
  const host = ev.source_url ? hostLabel(ev.source_url) : null;
  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      {/* Icon on the spine */}
      <div style={{
        position: 'absolute', left: -32, top: 2,
        width: 22, height: 22, borderRadius: '50%',
        background: style.color, color: 'white',
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid var(--card-bg)',
      }}>{style.icon}</div>

      <div className="card" style={{
        padding: '10px 14px',
        borderLeft: `3px solid ${style.color}`,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
            background: style.color + '20', color: style.color, textTransform: 'uppercase', letterSpacing: '0.02em',
          }}>{ev.event_type.replace(/_/g, ' ')}</span>
          {ev.event_date && (
            <>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(ev.event_date)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>({timeAgo(ev.event_date)})</span>
            </>
          )}
          {ev.source_verified && (
            <span title="Source URL verified to resolve" style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 6,
              background: '#D1FAE5', color: '#065F46', fontWeight: 700,
            }}>✓ VERIFIED</span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: ev.description ? 4 : 0 }}>
          {ev.title || ev.event_type}
        </div>
        {ev.description && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {ev.description}
          </div>
        )}
        {ev.source_url && (
          <a href={ev.source_url} target="_blank" rel="noreferrer"
             onClick={e => e.stopPropagation()}
             style={{
               marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
               fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
             }}>
            {host && <span style={{ opacity: 0.6 }}>{host}</span>}
            <span>→</span>
          </a>
        )}
      </div>
    </div>
  );
}

function Heading({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
      {children}
    </div>
  );
}
