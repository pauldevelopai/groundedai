import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import CampaignForm from './CampaignForm.jsx';

const TYPE_LABELS = { cold_email: 'Cold Email', linkedin: 'LinkedIn', social: 'Social', event: 'Event' };
const STATUS_LABELS = { draft: 'Draft', active: 'Active', paused: 'Paused', completed: 'Completed' };

export default function CampaignsList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [campaigns, setCampaigns] = useState([]);
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch(buildUrl('/outreach-campaigns', selectedSectorId)).then(setCampaigns).catch(() => setCampaigns([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'name', label: 'Campaign', render: row => <span style={{ fontWeight: 500 }}>{row.name}</span> },
    { key: 'sector_name', label: 'Sector', render: row => <SectorBadge name={row.sector_name} colour={row.sector_colour} /> },
    { key: 'type', label: 'Type', render: row => TYPE_LABELS[row.type] || row.type },
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
    )},
    { key: 'sent_count', label: 'Sent', render: row => row.sent_count || 0 },
    { key: 'reply_count', label: 'Replies', render: row => row.reply_count || 0 },
    { key: 'start_date', label: 'Start', render: row => row.start_date ? new Date(row.start_date).toLocaleDateString() : '—' },
  ];

  return (
    <div>
      <PageHeader title="Campaigns">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Create Campaign</button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={campaigns}
        onRowClick={row => navigate(`/marketing/campaigns/${row.id}`)}
        emptyMessage="No campaigns yet."
      />
      {showForm && <CampaignForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
