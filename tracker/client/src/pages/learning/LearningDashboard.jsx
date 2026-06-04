import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const STATUS_COLOURS = { active: '#10B981', paused: '#F59E0B', completed: '#6366F1' };

export default function LearningDashboard() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [journeys, setJourneys] = useState([]);
  const [stats, setStats] = useState({});
  const [pendingTasks, setPendingTasks] = useState([]);

  function load() {
    apiFetch(buildUrl('/learning-journeys', selectedSectorId)).then(setJourneys).catch(() => setJourneys([]));
    apiFetch(buildUrl('/learning-journeys/stats', selectedSectorId)).then(setStats).catch(() => setStats({}));
    apiFetch('/learning-tasks?status=submitted&limit=10').then(setPendingTasks).catch(() => setPendingTasks([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'name', label: 'Participant', render: row => <span style={{ fontWeight: 500 }}>{row.first_name} {row.last_name}</span> },
    { key: 'org_name', label: 'Organisation', render: row => row.org_name || '—' },
    { key: 'skill_level', label: 'Level', render: row => (
      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'capitalize' }}>{row.skill_level}</span>
    )},
    { key: 'overall_progress', label: 'Progress', render: row => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${row.overall_progress || 0}%`, height: '100%', background: '#6366F1', borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{row.overall_progress || 0}%</span>
      </div>
    )},
    { key: 'tasks', label: 'Tasks', render: row => (
      <span style={{ fontSize: 12 }}>
        {row.completed_tasks || 0}/{row.total_tasks || 0}
        {(row.pending_review || 0) > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>({row.pending_review} to review)</span>}
      </span>
    )},
    { key: 'status', label: 'Status', render: row => (
      <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOURS[row.status] || '#94A3B8' }}>{row.status}</span>
    )},
    { key: 'last_activity_at', label: 'Last Active', render: row => row.last_activity_at ? new Date(row.last_activity_at).toLocaleDateString() : '—' },
  ];

  return (
    <div>
      <PageHeader title="Learning Journeys">
        <AiBadge variant="powered" />
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="dashboard-card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.activeJourneys || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active Learners</div>
        </div>
        <div className="dashboard-card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{stats.pendingReview || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Awaiting Review</div>
        </div>
        <div className="dashboard-card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{journeys.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Journeys</div>
        </div>
      </div>

      {/* Pending reviews */}
      {pendingTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>Submissions Awaiting Review</h3>
          {pendingTasks.map(t => (
            <div key={t.id} className="card" style={{ marginBottom: 6, padding: 12, borderLeft: '3px solid var(--accent)', cursor: 'pointer' }}
              onClick={() => navigate(`/learning/${t.contact_id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{t.first_name} {t.last_name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t.org_name}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Submitted: {t.title}</div>
            </div>
          ))}
        </div>
      )}

      {/* All journeys */}
      <DataTable
        columns={columns}
        data={journeys}
        onRowClick={row => navigate(`/learning/${row.contact_id}`)}
        emptyMessage="No learning journeys yet. Go to a contact's page and generate personalised tasks to start."
      />
    </div>
  );
}
