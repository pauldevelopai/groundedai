import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import EngagementForm from './EngagementForm.jsx';

const TYPE_LABELS = { ethical_ai_policy: 'Ethical AI Policy', ai_legal_framework: 'AI Legal Framework', ai_security_framework: 'AI Security Framework', mentorship: 'Mentorship' };
const STATUS_LABELS = { scoping: 'Scoping', active: 'Active', review: 'Review', completed: 'Completed' };

export default function ServicesList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [engagements, setEngagements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  function load() {
    let url = buildUrl('/service-engagements', selectedSectorId);
    if (filterType) url += `${url.includes('?') ? '&' : '?'}type=${filterType}`;
    if (filterStatus) url += `${url.includes('?') ? '&' : '?'}status=${filterStatus}`;
    apiFetch(url).then(setEngagements).catch(() => setEngagements([]));
  }

  useEffect(load, [selectedSectorId, filterType, filterStatus]);

  const columns = [
    { key: 'organisation_name', label: 'Client', render: row => <span style={{ fontWeight: 500 }}>{row.organisation_name || '—'}</span> },
    { key: 'sector_name', label: 'Sector', render: row => <SectorBadge name={row.sector_name} colour={row.sector_colour} /> },
    { key: 'type', label: 'Type', render: row => (
      <span className={`stage-badge type-${row.type}`}>{TYPE_LABELS[row.type] || row.type}</span>
    )},
    { key: 'mentor_name', label: 'Mentor / Consultant', render: row => row.mentor_name || '—' },
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
    )},
    { key: 'start_date', label: 'Start', render: row => row.start_date ? new Date(row.start_date).toLocaleDateString() : '—' },
    { key: 'end_date', label: 'End', render: row => row.end_date ? new Date(row.end_date).toLocaleDateString() : '—' },
  ];

  return (
    <div>
      <PageHeader title="Mentorship & Services">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Create Engagement</button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', fontSize: 13 }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', fontSize: 13 }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={engagements}
        onRowClick={row => navigate(`/services/${row.id}`)}
        emptyMessage="No service engagements yet."
      />
      {showForm && <EngagementForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
