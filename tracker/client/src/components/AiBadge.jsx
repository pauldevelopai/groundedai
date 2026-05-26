export default function AiBadge({ variant = 'default', style = {} }) {
  if (variant === 'powered') {
    return (
      <span style={{ fontSize: 11, color: 'var(--ai-purple)', fontWeight: 500, ...style }}>
        Powered by Claude
      </span>
    );
  }

  if (variant === 'dot') {
    return (
      <span style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
        background: 'var(--ai-purple)', marginLeft: 6, ...style
      }} />
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: 'var(--ai-purple-bg)', color: 'var(--ai-purple)',
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
      letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: 1, ...style
    }}>
      AI
    </span>
  );
}
