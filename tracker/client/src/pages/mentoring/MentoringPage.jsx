import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import AgentChatPanel from '../../components/AgentChatPanel.jsx';

const STATUS_LABELS = { scoping: 'Scoping', active: 'Active', review: 'Review', completed: 'Completed' };
const STATUS_COLORS = { scoping: '#F59E0B', active: '#10B981', review: '#6366F1', completed: '#94A3B8' };

export default function MentoringPage() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [activeTab, setActiveTab] = useState('engagements');
  const [engagements, setEngagements] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [journeyStats, setJourneyStats] = useState(null);

  function loadEngagements() {
    apiFetch(buildUrl('/service-engagements', selectedSectorId)).then(data => {
      setEngagements(data.filter(e => e.type === 'mentorship'));
    }).catch(() => setEngagements([]));
  }

  function loadJourneys() {
    apiFetch(buildUrl('/learning-journeys', selectedSectorId)).then(setJourneys).catch(() => setJourneys([]));
    apiFetch('/learning-journeys/stats').then(setJourneyStats).catch(() => {});
  }

  useEffect(() => { loadEngagements(); loadJourneys(); }, [selectedSectorId]);

  const activeEngagements = engagements.filter(e => e.status !== 'completed');
  const completedEngagements = engagements.filter(e => e.status === 'completed');
  const activeJourneys = journeys.filter(j => j.status === 'active');
  const stalledJourneys = journeys.filter(j => {
    if (j.status !== 'active') return false;
    const lastActivity = j.last_activity_at || j.created_at;
    return lastActivity && (Date.now() - new Date(lastActivity).getTime()) > 7 * 24 * 60 * 60 * 1000;
  });

  return (
    <div>
      <PageHeader title="Mentoring">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Track mentorship engagements, monitor post-training learning journeys, and use the AI coach to generate tasks and nudge stalled learners.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{activeEngagements.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Active Mentorships</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{activeJourneys.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Active Learners</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: stalledJourneys.length > 0 ? '#EF4444' : 'inherit' }}>{stalledJourneys.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Stalled (7+ days)</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{journeyStats?.pendingReviews || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pending Reviews</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{completedEngagements.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Completed</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'engagements' ? 'active' : ''}`} onClick={() => setActiveTab('engagements')}>
          Mentorships ({engagements.length})
        </button>
        <button className={`tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
          Learners ({journeys.length})
        </button>
        <button className={`tab ${activeTab === 'coach' ? 'active' : ''}`} onClick={() => setActiveTab('coach')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          AI Coach <AiBadge />
        </button>
      </div>

      {/* Mentorships tab */}
      {activeTab === 'engagements' && (
        <div>
          {engagements.length === 0 ? (
            <div className="empty-state"><h3>No mentorship engagements yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Organisation</th><th>Contact</th><th>Status</th><th>Sessions</th><th>Started</th></tr>
              </thead>
              <tbody>
                {engagements.map(e => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/services/${e.id}`)}>
                    <td style={{ fontWeight: 500 }}>{e.organisation_name || '—'}</td>
                    <td>{e.contact_name || '—'}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[e.status] || '#94A3B8' }}>
                        {STATUS_LABELS[e.status] || e.status}
                      </span>
                    </td>
                    <td>{e.session_count || 0}</td>
                    <td>{e.start_date ? new Date(e.start_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Learners tab */}
      {activeTab === 'learners' && (
        <div>
          {stalledJourneys.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, background: '#FEF2F2', borderRadius: 6, border: '1px solid #FECACA' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>
                {stalledJourneys.length} stalled learner{stalledJourneys.length > 1 ? 's' : ''} (no activity in 7+ days)
              </div>
              <div style={{ fontSize: 12, color: '#991B1B' }}>
                {stalledJourneys.map(j => j.contact_name || 'Unknown').join(', ')}
                — use the AI Coach tab to send nudge emails
              </div>
            </div>
          )}

          {journeys.length === 0 ? (
            <div className="empty-state"><h3>No learning journeys yet. Assign learners from cohort contacts.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Learner</th><th>Organisation</th><th>Status</th><th>Progress</th><th>Skill Level</th><th>Last Active</th></tr>
              </thead>
              <tbody>
                {journeys.map(j => {
                  const isStalled = stalledJourneys.some(s => s.id === j.id);
                  return (
                    <tr key={j.id} style={{ cursor: 'pointer', background: isStalled ? '#FEF2F2' : undefined }}
                      onClick={() => navigate(`/learning/${j.contact_id}`)}>
                      <td style={{ fontWeight: 500 }}>
                        {j.contact_name || '—'}
                        {isStalled && <span style={{ fontSize: 10, color: '#DC2626', marginLeft: 6 }}>STALLED</span>}
                      </td>
                      <td>{j.organisation_name || '—'}</td>
                      <td>{j.status}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${j.overall_progress || 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11 }}>{j.overall_progress || 0}%</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{j.skill_level || '—'}</td>
                      <td style={{ fontSize: 12 }}>{j.last_activity_at ? new Date(j.last_activity_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* AI Coach tab */}
      {activeTab === 'coach' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-primary btn-small" onClick={() => apiFetch('/agent-actions/coach/generate-followup-tasks', { method: 'POST', timeout: 120000 }).then(() => alert('Tasks generated')).catch(e => alert(e.message))}>
              Generate Follow-up Tasks
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => apiFetch('/agent-actions/coach/send-nudge', { method: 'POST', timeout: 120000 }).then(() => alert('Nudges sent')).catch(e => alert(e.message))}>
              Send Nudge to Stalled
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => apiFetch('/agent-actions/coach/cohort-progress', { method: 'POST', timeout: 120000 }).then(r => alert(r.report?.slice(0, 500) || 'Report generated')).catch(e => alert(e.message))}>
              Cohort Progress Report
            </button>
          </div>
          <AgentChatPanel
            agentType="implementation_coach"
            placeholder="Ask about learner progress, suggest follow-up tasks, draft nudge emails..."
            emptyText="Implementation Coach — monitor and support post-training AI adoption"
          />
        </div>
      )}
    </div>
  );
}
