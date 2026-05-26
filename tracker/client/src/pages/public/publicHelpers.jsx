// Shared visual language for the public AI Legal pages. Lifted and adapted from
// client/src/pages/lawsuits/LawsuitTracker.jsx so public matches admin.

// ── Status palettes ──────────────────────────────────────────────────────────
export const LAWSUIT_STATUS = {
  active:    { bg: '#DBEAFE', text: '#1D4ED8', label: 'Active' },
  appealing: { bg: '#EDE9FE', text: '#6D28D9', label: 'Appealing' },
  settled:   { bg: '#D1FAE5', text: '#065F46', label: 'Settled' },
  dismissed: { bg: '#F3F4F6', text: '#6B7280', label: 'Dismissed' },
  decided:   { bg: '#FEF3C7', text: '#92400E', label: 'Decided' },
};

export const REG_STATUS = {
  proposed:      { bg: '#E0F2FE', text: '#075985', label: 'Proposed' },
  draft:         { bg: '#E0F2FE', text: '#075985', label: 'Draft' },
  consultation:  { bg: '#FEF3C7', text: '#92400E', label: 'Consultation' },
  enacted:       { bg: '#D1FAE5', text: '#065F46', label: 'Enacted' },
  in_force:      { bg: '#D1FAE5', text: '#065F46', label: 'In force' },
  partial_force: { bg: '#DCFCE7', text: '#166534', label: 'Partial force' },
  amended:       { bg: '#FEF3C7', text: '#92400E', label: 'Amended' },
  repealed:      { bg: '#FEE2E2', text: '#991B1B', label: 'Repealed' },
  superseded:    { bg: '#F3F4F6', text: '#6B7280', label: 'Superseded' },
};

// Border / accent colour per lawsuit case type.
export const LAWSUIT_TYPE_COLORS = {
  copyright:  '#6366F1',
  privacy:    '#F59E0B',
  defamation: '#EF4444',
  labour:     '#10B981',
  contract:   '#EC4899',
  other:      '#94A3B8',
};

// Border / accent colour per regulation type.
export const REG_TYPE_COLORS = {
  regulation:      '#6366F1',
  statute:         '#10B981',
  directive:       '#0891B2',
  guidance:        '#F59E0B',
  executive_order: '#EF4444',
  standard:        '#8B5CF6',
  voluntary_code:  '#6B7280',
  court_ruling:    '#EC4899',
};

// Icon + colour per lawsuit event type.
export const LAWSUIT_EVENT_STYLES = {
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

// Icon + colour per regulation event type.
export const REG_EVENT_STYLES = {
  proposed:            { color: '#075985', icon: '✎' },
  consultation:        { color: '#92400E', icon: '💬' },
  enacted:             { color: '#065F46', icon: '✓' },
  amended:             { color: '#92400E', icon: '✎' },
  took_effect:         { color: '#10B981', icon: '⚡' },
  enforcement_action:  { color: '#EF4444', icon: '⚠' },
  guidance_issued:     { color: '#0891B2', icon: '📘' },
  repealed:            { color: '#991B1B', icon: '✕' },
  superseded:          { color: '#6B7280', icon: '↩' },
  update:              { color: '#64748B', icon: '•' },
};

// ── Formatters ───────────────────────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(d) {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 0) return formatDate(d); // future date — show absolute
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return (url || '').slice(0, 40); }
}

// ── Small visual primitives ──────────────────────────────────────────────────
export function StatusBadge({ map, status }) {
  const s = map[status] || { bg: '#F3F4F6', text: '#374151', label: status || '—' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: s.bg, color: s.text, letterSpacing: '0.02em', textTransform: 'uppercase',
    }}>{s.label}</span>
  );
}

export function TypeBadge({ map, type }) {
  const color = map[type] || '#94A3B8';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: color + '20', color, border: `1px solid ${color}40`,
    }}>{(type || 'other').replace(/_/g, ' ')}</span>
  );
}

export function ChipTag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 8,
      background: '#F1F5F9', color: '#475569', fontWeight: 600,
    }}>{children}</span>
  );
}

export function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// ── SourceLinks: hostname-labelled numbered list, used in the card expansion.
export function SourceLinks({ urls, exclude, title = 'Source articles' }) {
  const excludeSet = new Set((Array.isArray(exclude) ? exclude : [exclude]).filter(Boolean));
  const all = [...new Set((urls || []).filter(Boolean).filter(u => !excludeSet.has(u)))];
  if (all.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {title} ({all.length})
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

// ── EventTimeline: generic over event style map. `events` are rows with
// {id, event_type, title, description, event_date, source_url}.
export function EventTimeline({ events, styleMap, heading = 'History' }) {
  if (!events) {
    return (
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        <TimelineHeading>{heading}</TimelineHeading>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading history…</div>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        <TimelineHeading>{heading}</TimelineHeading>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No events recorded yet.</div>
      </div>
    );
  }
  return (
    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
      <TimelineHeading>{heading} ({events.length} event{events.length !== 1 ? 's' : ''})</TimelineHeading>
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: 'var(--border-color)', borderRadius: 2 }} />
        {events.map((ev, i) => {
          const style = styleMap[ev.event_type] || styleMap.update || { color: '#64748B', icon: '•' };
          return (
            <div key={ev.id} style={{ position: 'relative', marginBottom: i < events.length - 1 ? 16 : 0 }}>
              <div style={{
                position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%',
                background: style.color, color: 'white', fontSize: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, zIndex: 1,
              }}>{style.icon}</div>
              <div style={{ paddingLeft: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: style.color }}>{ev.title || ev.event_type}</span>
                  {ev.event_date && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(ev.event_date)}</span>}
                </div>
                {ev.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{ev.description}</div>
                )}
                {ev.source_url && (
                  <a href={ev.source_url} target="_blank" rel="noopener noreferrer"
                     onClick={e => e.stopPropagation()}
                     style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginTop: 2, display: 'inline-block' }}>
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

function TimelineHeading({ children }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
      {children}
    </div>
  );
}

// ── StatsBar: row of compact stat cards.
export function StatsBar({ stats }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: '10px 16px', minWidth: 90, textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color || 'var(--text-primary)' }}>{s.value ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Chip strip: clickable chips for defendants / jurisdictions / etc.
export function ChipStrip({ label, items, selected, onSelect, onClear }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}:</span>
      {items.map(item => {
        const isSel = selected === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(isSel ? '' : item.key)}
            style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 12, cursor: 'pointer',
              border: `1.5px solid ${isSel ? 'var(--accent)' : 'var(--border-color)'}`,
              background: isSel ? 'var(--accent)' : 'transparent',
              color: isSel ? 'white' : 'var(--text-secondary)',
            }}>
            {item.label} <span style={{ opacity: 0.7 }}>({item.count})</span>
          </button>
        );
      })}
      {selected && (
        <button onClick={onClear} style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 10,
          border: '1px solid var(--border-color)', background: 'transparent',
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}>✕ Clear</button>
      )}
    </div>
  );
}

// ── Input / select style used by filter rows.
export const inputStyle = {
  padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)',
  fontSize: 13, minWidth: 180, background: 'var(--card-bg)', color: 'var(--text-primary)',
};

// ── "Most recent activity" resolution ───────────────────────────────────────
// Given a lawsuit or regulation row, decide what to show as the single
// "latest update" date. Picks the newest of { latest_event_date, last_update }
// (lawsuits) or { latest_event_date, effective_date, enacted_date } (regs).
// Only returns an event title if that event is the newest thing.
export function mostRecentActivity(item, kind /* 'lawsuit' | 'regulation' */) {
  // "Latest update" should only include dates in the past. A hearing scheduled
  // for 2027 isn't "the latest thing that happened" — it's upcoming.
  const now = new Date();
  const asPast = d => (d && !isNaN(d.getTime()) && d <= now) ? d : null;

  const ev   = asPast(item.latest_event_date ? new Date(item.latest_event_date) : null);
  const evT  = ev ? { date: ev, title: item.latest_event_title || item.latest_event_type, type: 'event' } : null;

  const candidates = [evT];
  if (kind === 'lawsuit') {
    const lu = asPast(item.last_update ? new Date(item.last_update) : null);
    if (lu)  candidates.push({ date: lu,  type: 'last_update' });
  } else {
    const ef = asPast(item.effective_date ? new Date(item.effective_date) : null);
    const en = asPast(item.enacted_date   ? new Date(item.enacted_date)   : null);
    if (ef) candidates.push({ date: ef, type: 'effective' });
    if (en) candidates.push({ date: en, type: 'enacted' });
  }
  const viable = candidates.filter(Boolean);
  if (viable.length === 0) return null;
  viable.sort((a, b) => b.date - a.date);
  return viable[0];
}

// Legacy aliases used by the first-draft public pages (kept to avoid breakage).
export const Tag = ChipTag;
export const SectionTitle = ({ children }) => <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px 0' }}>{children}</h2>;
export const controlsRow = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 };
export const input = inputStyle;
export const card = { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: 20 };
