import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import EngagementForm from './EngagementForm.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const TYPE_LABELS = { ethical_ai_policy: 'Ethical AI Policy', ai_legal_framework: 'AI Legal Framework', ai_security_framework: 'AI Security Framework', mentorship: 'Mentorship' };
const STATUS_LABELS = { scoping: 'Scoping', active: 'Active', review: 'Review', completed: 'Completed' };
const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed'];

export default function EngagementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [engagement, setEngagement] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [activeTab, setActiveTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingSession, setAddingSession] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);

  function loadEngagement() {
    apiFetch(`/service-engagements/${id}`).then(setEngagement).catch(() => navigate('/services'));
  }
  function loadSessions() {
    apiFetch(`/service-engagements/${id}/sessions`).then(setSessions).catch(() => setSessions([]));
  }
  function loadMilestones() {
    apiFetch(`/service-engagements/${id}/milestones`).then(setMilestones).catch(() => setMilestones([]));
  }

  useEffect(() => { loadEngagement(); loadSessions(); loadMilestones(); }, [id]);

  // Auto-pick tab based on type
  useEffect(() => {
    if (engagement) {
      setActiveTab(engagement.type === 'mentorship' ? 'sessions' : 'milestones');
    }
  }, [engagement?.type]);

  async function saveField(field, value) {
    await apiFetch(`/service-engagements/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    loadEngagement();
  }

  async function handleDelete() {
    await apiFetch(`/service-engagements/${id}`, { method: 'DELETE' });
    navigate('/services');
  }

  async function removeSession(sid) {
    await apiFetch(`/service-engagements/${id}/sessions/${sid}`, { method: 'DELETE' });
    loadSessions();
  }

  async function removeMilestone(mid) {
    await apiFetch(`/service-engagements/${id}/milestones/${mid}`, { method: 'DELETE' });
    loadMilestones();
  }

  async function toggleMilestoneStatus(m) {
    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
    await apiFetch(`/service-engagements/${id}/milestones/${m.id}`, {
      method: 'PUT', body: JSON.stringify({ ...m, status: newStatus })
    });
    loadMilestones();
  }

  if (!engagement) return null;

  const isMentorship = engagement.type === 'mentorship';

  return (
    <div>
      <Link to="/services" className="back-link">← Services</Link>
      <div className="detail-header">
        <h1>{engagement.organisation_name || 'Engagement'}</h1>
        <SectorBadge name={engagement.sector_name} colour={engagement.sector_colour} />
        <span className={`stage-badge type-${engagement.type}`}>{TYPE_LABELS[engagement.type]}</span>
        <span className={`stage-badge status-${engagement.status}`}>{STATUS_LABELS[engagement.status]}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && (
            <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
          )}
        </div>
        <div className="detail-grid">
          <div className="detail-field">
            <div className="detail-field-label">Contact</div>
            <div className="detail-field-value">{engagement.contact_name || '—'}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Mentor / Consultant</div>
            <div className="detail-field-value">{engagement.mentor_name || 'Unassigned'}</div>
          </div>
          <InlineEditField
            label="Status"
            value={engagement.status}
            onSave={v => saveField('status', v)}
            type="select"
            options={[
              { value: 'scoping', label: 'Scoping' },
              { value: 'active', label: 'Active' },
              { value: 'review', label: 'Review' },
              { value: 'completed', label: 'Completed' },
            ]}
            displayValue={<span className={`stage-badge status-${engagement.status}`}>{STATUS_LABELS[engagement.status]}</span>}
          />
          <InlineEditField
            label="Start Date"
            value={engagement.start_date ? engagement.start_date.slice(0, 10) : ''}
            onSave={v => saveField('start_date', v)}
            type="date"
            displayValue={engagement.start_date ? new Date(engagement.start_date).toLocaleDateString() : null}
          />
          <InlineEditField
            label="End Date"
            value={engagement.end_date ? engagement.end_date.slice(0, 10) : ''}
            onSave={v => saveField('end_date', v)}
            type="date"
            displayValue={engagement.end_date ? new Date(engagement.end_date).toLocaleDateString() : null}
          />
          {isMentorship && (
            <InlineEditField
              label="Sessions"
              value={sessions.length}
              onSave={() => {}}
              readOnly={true}
            />
          )}
          <InlineEditField
            label="Deliverable URL"
            value={engagement.deliverable_url}
            onSave={v => saveField('deliverable_url', v)}
            type="url"
            placeholder="https://..."
            displayValue={engagement.deliverable_url ? <a href={engagement.deliverable_url} target="_blank" rel="noopener">View</a> : null}
          />
          {engagement.document_id && (
            <div className="detail-field">
              <div className="detail-field-label">Generated Document</div>
              <div className="detail-field-value"><Link to={`/documents/${engagement.document_id}`}>View Document</Link></div>
            </div>
          )}
        </div>
        <InlineEditField
          label="Notes"
          value={engagement.notes}
          onSave={v => saveField('notes', v)}
          type="textarea"
          placeholder="Add notes about this engagement..."
        />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {isMentorship ? (
          <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
            Sessions ({sessions.length})
          </button>
        ) : (
          <button className={`tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>
            Milestones ({milestones.length})
          </button>
        )}
        <button className={`tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>
          History
        </button>
      </div>

      {/* Sessions Tab (Mentorship) */}
      {activeTab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingSession(true)}>+ Add Session</button>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><h3>No sessions logged yet.</h3></div>
          ) : (
            sessions.map(s => (
              <div key={s.id} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 14 }}>
                      <strong>{s.session_date ? new Date(s.session_date).toLocaleDateString() : 'No date'}</strong>
                      {s.duration_minutes && <span style={{ color: 'var(--text-secondary)' }}>{s.duration_minutes} min</span>}
                    </div>
                    {s.notes && <p style={{ fontSize: 13, margin: '4px 0' }}>{s.notes}</p>}
                    {s.next_steps && (
                      <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
                        <strong>Next steps:</strong> {s.next_steps}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingSession(s)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => removeSession(s.id)}>Remove</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Milestones Tab (Policy / Framework) */}
      {activeTab === 'milestones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingMilestone(true)}>+ Add Milestone</button>
          </div>
          {milestones.length === 0 ? (
            <div className="empty-state"><h3>No milestones yet. Add milestones to track deliverables.</h3></div>
          ) : (
            milestones.map(m => (
              <div key={m.id} className="card" style={{ marginBottom: 8, padding: 16, opacity: m.status === 'completed' ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={m.status === 'completed'}
                      onChange={() => toggleMilestoneStatus(m)}
                      style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, textDecoration: m.status === 'completed' ? 'line-through' : 'none' }}>
                        {m.title}
                      </div>
                      {m.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0' }}>{m.description}</p>}
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {m.due_date && <span>Due: {new Date(m.due_date).toLocaleDateString()}</span>}
                        {m.draft_url && <a href={m.draft_url} target="_blank" rel="noopener">View Draft</a>}
                        {m.completed_at && <span style={{ color: 'var(--success)' }}>Completed {new Date(m.completed_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingMilestone(m)}>Edit</button>
                    <button className="btn btn-danger btn-small" onClick={() => removeMilestone(m.id)}>Remove</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'notes' && (
        <div className="card" style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Created: {new Date(engagement.created_at).toLocaleString()}<br />
            Last updated: {new Date(engagement.updated_at).toLocaleString()}
          </p>
          {engagement.assessment_analysis && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Linked Needs Assessment Analysis</h4>
              <div style={{ padding: 12, background: '#F8FAFC', borderRadius: 'var(--radius)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {engagement.assessment_analysis}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {editing && <EngagementForm engagement={engagement} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadEngagement(); }} />}
      {deleting && (
        <Modal title="Delete Engagement" onClose={() => setDeleting(false)}>
          <p>Delete this engagement? All sessions and milestones will be removed. Cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
      {(addingSession || editingSession) && (
        <SessionForm
          session={editingSession}
          engagementId={id}
          onClose={() => { setAddingSession(false); setEditingSession(null); }}
          onSaved={() => { setAddingSession(false); setEditingSession(null); loadSessions(); }}
        />
      )}
      {(addingMilestone || editingMilestone) && (
        <MilestoneForm
          milestone={editingMilestone}
          engagementId={id}
          onClose={() => { setAddingMilestone(false); setEditingMilestone(null); }}
          onSaved={() => { setAddingMilestone(false); setEditingMilestone(null); loadMilestones(); }}
        />
      )}

      <SmartInput entityType="engagement" entityId={id} sectorId={engagement.sector_id} onUpdated={() => loadEngagement()} />
    </div>
  );
}

function SessionForm({ session, engagementId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    session_date: session?.session_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    duration_minutes: session?.duration_minutes || 60,
    notes: session?.notes || '',
    next_steps: session?.next_steps || '',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { ...form, duration_minutes: parseInt(form.duration_minutes) || null };
      if (session) {
        await apiFetch(`/service-engagements/${engagementId}/sessions/${session.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/service-engagements/${engagementId}/sessions`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={session ? 'Edit Session' : 'Log Session'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.session_date} onChange={set('session_date')} />
          </div>
          <div className="form-group">
            <label>Duration (minutes)</label>
            <input type="number" value={form.duration_minutes} onChange={set('duration_minutes')} min="1" />
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={4} placeholder="What was covered in this session..." />
        </div>
        <div className="form-group">
          <label>Next Steps</label>
          <textarea value={form.next_steps} onChange={set('next_steps')} rows={2} placeholder="Actions before next session..." />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (session ? 'Update' : 'Log Session')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function MilestoneForm({ milestone, engagementId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: milestone?.title || '',
    description: milestone?.description || '',
    status: milestone?.status || 'pending',
    due_date: milestone?.due_date?.slice(0, 10) || '',
    draft_url: milestone?.draft_url || '',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { ...form, due_date: form.due_date || null, draft_url: form.draft_url || null };
      if (milestone) {
        await apiFetch(`/service-engagements/${engagementId}/milestones/${milestone.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/service-engagements/${engagementId}/milestones`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={milestone ? 'Edit Milestone' : 'Add Milestone'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              {MILESTONE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <input type="date" value={form.due_date} onChange={set('due_date')} />
          </div>
        </div>
        <div className="form-group">
          <label>Draft URL</label>
          <input value={form.draft_url} onChange={set('draft_url')} placeholder="Link to draft document" />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (milestone ? 'Update' : 'Add Milestone')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
