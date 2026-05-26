export default function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <div style={{ display: 'flex', gap: '8px' }}>{children}</div>
    </div>
  );
}
