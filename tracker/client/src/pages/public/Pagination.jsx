// Shared pagination control used by public lawsuit + regulation pages and the
// admin raw-items view. Shows first/prev/numbered/next/last with a windowed
// number band so it stays compact when totalPages is large.
export default function Pagination({ page, totalPages, onPage, totalItems, pageSize }) {
  if (!totalPages || totalPages <= 1) return null;

  const windowed = [];
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, start + 6);
  for (let i = start; i <= end; i++) windowed.push(i);

  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, totalItems);

  return (
    <div style={{
      marginTop: 20, display: 'flex', gap: 12, alignItems: 'center',
      justifyContent: 'space-between', flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Showing <strong style={{ color: 'var(--text-primary)' }}>{from}–{to}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalItems}</strong>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <PaginationBtn disabled={page === 1} onClick={() => onPage(1)}>« First</PaginationBtn>
        <PaginationBtn disabled={page === 1} onClick={() => onPage(page - 1)}>‹ Prev</PaginationBtn>
        {start > 1 && <span style={{ color: 'var(--text-secondary)' }}>…</span>}
        {windowed.map(n => (
          <PaginationBtn
            key={n}
            active={n === page}
            onClick={() => onPage(n)}
          >{n}</PaginationBtn>
        ))}
        {end < totalPages && <span style={{ color: 'var(--text-secondary)' }}>…</span>}
        <PaginationBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}>Next ›</PaginationBtn>
        <PaginationBtn disabled={page === totalPages} onClick={() => onPage(totalPages)}>Last »</PaginationBtn>
      </div>
    </div>
  );
}

function PaginationBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px', fontSize: 12, fontWeight: active ? 700 : 500,
        minWidth: 30, textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
        borderRadius: 'var(--radius)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
        background: active ? 'var(--accent)' : 'var(--card-bg)',
        color: active ? 'white' : disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</button>
  );
}
