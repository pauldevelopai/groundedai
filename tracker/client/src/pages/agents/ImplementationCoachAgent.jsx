import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import Modal from '../../components/Modal.jsx';
import AgentChatPanel from '../../components/AgentChatPanel.jsx';

export default function ImplementationCoachAgent() {
  const { selectedSectorId } = useSectors();
  const [stats, setStats] = useState({ active: 0, pending: 0, stalled: 0, totalTasks: 0 });
  const [cohorts, setCohorts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [learners, setLearners] = useState([]);

  // Action states
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskContactId, setTaskContactId] = useState('');
  const [taskCourseId, setTaskCourseId] = useState('');
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState(null);

  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [nudgeContactId, setNudgeContactId] = useState('');
  const [nudging, setNudging] = useState(false);
  const [nudgeResult, setNudgeResult] = useState(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCohortId, setReportCohortId] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState('');

  useEffect(() => {
    apiFetch(buildUrl('/learning-journeys/stats', selectedSectorId)).then(s => {
      setStats({
        active: s.active_learners || s.activeJourneys || 0,
        pending: s.pending_reviews || s.pendingReview || 0,
        stalled: s.stalled_learners || 0,
        totalTasks: s.total_tasks || s.totalTasks || 0,
      });
    }).catch(() => {});
    apiFetch(buildUrl('/cohorts', selectedSectorId)).then(setCohorts).catch(() => setCohorts([]));
    apiFetch(buildUrl('/contacts', selectedSectorId)).then(c => setContacts(c.slice(0, 100))).catch(() => setContacts([]));
    apiFetch(buildUrl('/courses', selectedSectorId)).then(setCourses).catch(() => setCourses([]));
    apiFetch(buildUrl('/learning-journeys', selectedSectorId)).then(setLearners).catch(() => setLearners([]));
  }, [selectedSectorId]);

  async function handleGenerateTasks() {
    if (!taskContactId) return;
    setGeneratingTasks(true);
    try {
      const result = await apiFetch('/agent-actions/coach/generate-followup-tasks', {
        method: 'POST',
        body: JSON.stringify({ contact_id: taskContactId, course_id: taskCourseId || null }),
      });
      setGeneratedTasks(result);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setGeneratingTasks(false);
    }
  }

  async function handleSendNudge() {
    if (!nudgeContactId) return;
    setNudging(true);
    try {
      const result = await apiFetch('/agent-actions/coach/send-nudge', {
        method: 'POST',
        body: JSON.stringify({ contact_id: nudgeContactId }),
      });
      setNudgeResult(result);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setNudging(false);
    }
  }

  async function handleCohortReport() {
    if (!reportCohortId) return;
    setReportLoading(true);
    try {
      const result = await apiFetch('/agent-actions/coach/cohort-progress', {
        method: 'POST',
        body: JSON.stringify({ cohort_id: reportCohortId }),
      });
      setReport(result.report);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setReportLoading(false);
    }
  }

  function renderMarkdown(text) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</h3>;
      if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, fontSize: 14 }}>• {line.slice(2)}</div>;
      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
      return <p key={i} style={{ fontSize: 14, marginBottom: 3, lineHeight: 1.5 }}>{line}</p>;
    });
  }

  return (
    <div>
      <PageHeader title="Implementation Coach">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: -8 }}>
        AI agent that monitors post-training implementation, generates follow-up tasks, and nudges stalled learners.
      </p>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.active}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Active Learners</div>
        </div>
        <div style={{ padding: '10px 16px', background: stats.pending > 0 ? '#FEF3C7' : 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.pending > 0 ? '#92400E' : undefined }}>{stats.pending}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pending Reviews</div>
        </div>
        <div style={{ padding: '10px 16px', background: stats.stalled > 0 ? '#FEE2E2' : 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.stalled > 0 ? '#991B1B' : undefined }}>{stats.stalled}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Stalled (7+ days)</div>
        </div>
        <div style={{ padding: '10px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalTasks}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Tasks</div>
        </div>
      </div>

      {/* Learners table */}
      {learners.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Learners</h3>
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Name</th><th>Organisation</th><th>Skill Level</th><th>Progress</th><th>Last Active</th><th></th></tr></thead>
            <tbody>
              {learners.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>{l.first_name} {l.last_name}</td>
                  <td>{l.org_name || '—'}</td>
                  <td><span className="stage-badge stage-active">{l.skill_level}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: '#E5E7EB', borderRadius: 3 }}>
                        <div style={{ width: `${l.overall_progress || 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11 }}>{l.overall_progress || 0}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {l.last_activity_at ? new Date(l.last_activity_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-small" style={{ fontSize: 11 }}
                      onClick={() => { setTaskContactId(l.contact_id); setShowTaskModal(true); }}>
                      + Tasks
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-small" onClick={() => setShowTaskModal(true)}>Generate Follow-up Tasks</button>
        <button className="btn btn-secondary btn-small" onClick={() => setShowNudgeModal(true)}>Send Nudge</button>
        <button className="btn btn-secondary btn-small" onClick={() => setShowReportModal(true)}>Cohort Progress Report</button>
      </div>

      <AgentChatPanel
        agentType="implementation_coach"
        placeholder="Ask about learner progress, implementation strategies, task ideas..."
        emptyText="Implementation Coach — monitor and support post-training AI adoption"
        contextData={{ sector_id: selectedSectorId || null }}
      />

      {/* Generate Tasks Modal */}
      {showTaskModal && (
        <Modal title="Generate Follow-up Tasks" onClose={() => { setShowTaskModal(false); setGeneratedTasks(null); }}>
          {!generatedTasks ? (
            <div>
              <div className="form-group">
                <label>Contact *</label>
                <select value={taskContactId} onChange={e => setTaskContactId(e.target.value)}>
                  <option value="">Select contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.organisation_name ? ` (${c.organisation_name})` : ''}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Based on Course (optional)</label>
                <select value={taskCourseId} onChange={e => setTaskCourseId(e.target.value)}>
                  <option value="">General</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleGenerateTasks} disabled={generatingTasks || !taskContactId}>
                  {generatingTasks ? 'Generating...' : 'Generate Tasks'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500, marginBottom: 12 }}>
                {generatedTasks.saved_count} tasks created and assigned
              </div>
              {generatedTasks.tasks?.map((t, i) => (
                <div key={i} style={{ padding: '8px 12px', marginBottom: 4, background: '#F8FAFC', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.task_type} • {t.difficulty}{t.estimated_minutes ? ` • ${t.estimated_minutes} min` : ''}</div>
                </div>
              ))}
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => { setShowTaskModal(false); setGeneratedTasks(null); }}>Done</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Send Nudge Modal */}
      {showNudgeModal && (
        <Modal title="Send Nudge Email" onClose={() => { setShowNudgeModal(false); setNudgeResult(null); }}>
          {!nudgeResult ? (
            <div>
              <div className="form-group">
                <label>Contact to Nudge *</label>
                <select value={nudgeContactId} onChange={e => setNudgeContactId(e.target.value)}>
                  <option value="">Select contact...</option>
                  {contacts.filter(c => c.email).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</option>)}
                </select>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleSendNudge} disabled={nudging || !nudgeContactId}>
                  {nudging ? 'Sending...' : 'Draft & Send Nudge'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500, marginBottom: 8 }}>Nudge sent to {nudgeResult.to}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Subject: {nudgeResult.subject}</div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => { setShowNudgeModal(false); setNudgeResult(null); }}>Done</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Cohort Report Modal */}
      {showReportModal && (
        <Modal title="Cohort Progress Report" onClose={() => { setShowReportModal(false); setReport(''); }}>
          {!report ? (
            <div>
              <div className="form-group">
                <label>Cohort *</label>
                <select value={reportCohortId} onChange={e => setReportCohortId(e.target.value)}>
                  <option value="">Select cohort...</option>
                  {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}{c.client_name ? ` (${c.client_name})` : ''}</option>)}
                </select>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleCohortReport} disabled={reportLoading || !reportCohortId}>
                  {reportLoading ? 'Analysing...' : 'Generate Report'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>{renderMarkdown(report)}</div>
          )}
        </Modal>
      )}
    </div>
  );
}
