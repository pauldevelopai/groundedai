import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import FunderForm from './FunderForm.jsx';

const TYPE_LABELS = { foundation: 'Foundation', government: 'Government', arts_council: 'Arts Council', innovation_fund: 'Innovation Fund', international_development: 'International Dev' };

export default function FundersList() {
  const navigate = useNavigate();
  const [funders, setFunders] = useState([]);
  const [showForm, setShowForm] = useState(false);

  function load() { apiFetch('/funders').then(setFunders).catch(() => setFunders([])); }
  useEffect(load, []);

  const columns = [
    { key: 'name', label: 'Name', render: row => <span style={{ fontWeight: 500 }}>{row.name}</span> },
    { key: 'type', label: 'Type', render: row => <span className={`stage-badge funder-${row.type}`}>{TYPE_LABELS[row.type] || row.type}</span> },
    { key: 'country', label: 'Country', render: row => row.country || '—' },
    { key: 'contact_name', label: 'Contact', render: row => row.contact_name || '—' },
    { key: 'opportunity_count', label: 'Opportunities', render: row => row.opportunity_count || 0 },
  ];

  return (
    <div>
      <PageHeader title="Funders">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Funder</button>
      </PageHeader>
      <DataTable columns={columns} data={funders} onRowClick={row => navigate(`/fundraising/funders/${row.id}`)} emptyMessage="No funders yet." />
      {showForm && <FunderForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
