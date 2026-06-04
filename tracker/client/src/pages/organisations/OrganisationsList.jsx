import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import OrganisationForm from './OrganisationForm.jsx';

const STAGE_LABELS = {
  prospect: 'Prospect', active: 'Active', partner: 'Partner', inactive: 'Inactive',
};

export default function OrganisationsList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch(buildUrl('/organisations', selectedSectorId))
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type', render: row => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {row.type || '—'}
        {(row.type === 'foundation' || row.programme_org_count > 0) && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: '#FEF3C7', color: '#92400E' }}>FUNDER</span>
        )}
      </span>
    )},
    { key: 'location', label: 'Location', render: row => [row.city, row.country].filter(Boolean).join(', ') || '—' },
    { key: 'relationship_stage', label: 'Stage', render: row => (
      <span className={`stage-badge stage-${row.relationship_stage}`}>
        {STAGE_LABELS[row.relationship_stage] || row.relationship_stage}
      </span>
    )},
    { key: 'sector_name', label: 'Sector', render: row => (
      <SectorBadge name={row.sector_name} colour={row.sector_colour} />
    )},
    { key: 'contact_count', label: 'Contacts', render: row => row.contact_count || 0 },
  ];

  return (
    <div>
      <PageHeader title="Organisations">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Organisation</button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={orgs}
        onRowClick={row => navigate(`/organisations/${row.id}`)}
        emptyMessage="No organisations yet. Add your first organisation to get started."
      />
      {showForm && (
        <OrganisationForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
