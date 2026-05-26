export default function SectorBadge({ name, colour }) {
  if (!name) return null;
  return (
    <span className="sector-badge">
      <span className="sector-badge-dot" style={{ backgroundColor: colour || '#6B7280' }} />
      {name}
    </span>
  );
}
