import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import CohortForm from './CohortForm.jsx';

const STATUS_LABELS = {
  planned: 'Planned', active: 'Active', completed: 'Completed', cancelled: 'Cancelled',
};

const DELIVERY_LABELS = {
  online_3x2hr: 'Online 3x2hr', in_person_2day: 'In-Person 2 day',
};

export default function CohortsList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [cohorts, setCohorts] = useState([]);
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch(buildUrl('/cohorts', selectedSectorId))
      .then(setCohorts).catch(() => setCohorts([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'client_name', label: 'Client', render: row => row.client_name || 'Self-funded' },
    { key: 'org_count', label: 'Orgs', render: row => row.org_count || 0 },
    { key: 'sector_name', label: 'Sector', render: row => (
      <SectorBadge name={row.sector_name} colour={row.sector_colour} />
    )},
    { key: 'delivery_type', label: 'Delivery', render: row => (
      <span className="stage-badge stage-active">{DELIVERY_LABELS[row.delivery_type] || row.delivery_type}</span>
    )},
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
    )},
    { key: 'dates', label: 'Dates', render: row => {
      if (!row.start_date) return '—';
      const start = new Date(row.start_date).toLocaleDateString();
      const end = row.end_date ? new Date(row.end_date).toLocaleDateString() : '';
      return end ? `${start} — ${end}` : start;
    }},
    { key: 'trainer_name', label: 'Trainer', render: row => row.trainer_name || '—' },
    { key: 'participant_count', label: 'Participants', render: row => row.participant_count || 0 },
  ];

  return (
    <div>
      <PageHeader title="Cohorts">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Cohort</button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={cohorts}
        onRowClick={row => navigate(`/programmes/${row.id}`)}
        emptyMessage="No cohorts yet. Add your first cohort to get started."
      />
      {showForm && (
        <CohortForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
