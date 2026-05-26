import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import ContactForm from './ContactForm.jsx';

const STAGE_LABELS = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  meeting: 'Meeting',
  proposal: 'Proposal',
  client: 'Client',
  inactive: 'Inactive',
};

export default function ContactsList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch(buildUrl('/contacts', selectedSectorId))
      .then(setContacts)
      .catch(() => setContacts([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'name', label: 'Name', render: row => `${row.first_name} ${row.last_name}` },
    { key: 'email', label: 'Email' },
    { key: 'organisation_name', label: 'Organisation' },
    { key: 'pipeline_stage', label: 'Stage', render: row => (
      <span className={`stage-badge stage-${row.pipeline_stage}`}>
        {STAGE_LABELS[row.pipeline_stage] || row.pipeline_stage}
      </span>
    )},
    { key: 'sector_name', label: 'Sector', render: row => (
      <SectorBadge name={row.sector_name} colour={row.sector_colour} />
    )},
    { key: 'last_contacted_at', label: 'Last Contacted', render: row => (
      row.last_contacted_at ? new Date(row.last_contacted_at).toLocaleDateString() : '—'
    )},
  ];

  return (
    <div>
      <PageHeader title="Contacts">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Contact</button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={contacts}
        onRowClick={row => navigate(`/contacts/${row.id}`)}
        emptyMessage="No contacts yet. Add your first contact to get started."
      />
      {showForm && (
        <ContactForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
