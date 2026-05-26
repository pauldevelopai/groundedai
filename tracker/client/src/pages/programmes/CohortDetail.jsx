import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import DataTable from '../../components/DataTable.jsx';
import Modal from '../../components/Modal.jsx';
import CohortForm from './CohortForm.jsx';
import ParticipantForm from './ParticipantForm.jsx';
import SessionForm from './SessionForm.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const STATUS_LABELS = { planned: 'Planned', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const DELIVERY_LABELS = { online_3x2hr: 'Online 3x2hr', in_person_2day: 'In-Person 2 day' };
const PARTICIPANT_STATUSES = ['enrolled', 'attending', 'completed', 'dropped'];

export default function CohortDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cohort, setCohort] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('participants');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState(null);
  const [addingSession, setAddingSession] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [organisations, setOrganisations] = useState([]);
  const [courses, setCourses] = useState([]);
  const [allOrgs, setAllOrgs] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');

  function loadCohort() {
    apiFetch(`/cohorts/${id}`).then(setCohort).catch(() => navigate('/programmes'));
  }

  function loadParticipants() {
    apiFetch(`/cohorts/${id}/participants`).then(setParticipants).catch(() => setParticipants([]));
  }

  function loadSessions() {
    apiFetch(`/cohorts/${id}/sessions`).then(setSessions).catch(() => setSessions([]));
  }

  function loadOrganisations() {
    apiFetch(`/cohorts/${id}`).then(data => setOrganisations(data.organisations || [])).catch(() => setOrganisations([]));
  }

  function loadCourses() {
    apiFetch(`/cohorts/${id}`).then(data => setCourses(data.courses || [])).catch(() => setCourses([]));
  }

  useEffect(() => {
    loadCohort(); loadParticipants(); loadSessions();
    apiFetch(`/cohorts/${id}`).then(data => {
      setOrganisations(data.organisations || []);
      setCourses(data.courses || []);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (cohort?.sector_id) {
      apiFetch(`/organisations?sector_id=${cohort.sector_id}`).then(data => setAllOrgs(Array.isArray(data) ? data : data.organisations || [])).catch(() => setAllOrgs([]));
      apiFetch(`/courses?sector_id=${cohort.sector_id}`).then(data => setAllCourses(Array.isArray(data) ? data : data.courses || [])).catch(() => setAllCourses([]));
    }
  }, [cohort?.sector_id]);

  async function saveField(field, value) {
    await apiFetch(`/cohorts/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    loadCohort();
  }

  async function handleDelete() {
    await apiFetch(`/cohorts/${id}`, { method: 'DELETE' });
    navigate('/programmes');
  }

  async function removeParticipant(participantId) {
    await apiFetch(`/cohorts/${id}/participants/${participantId}`, { method: 'DELETE' });
    loadParticipants();
  }

  async function removeSession(sessionId) {
    await apiFetch(`/cohorts/${id}/sessions/${sessionId}`, { method: 'DELETE' });
    loadSessions();
  }

  async function addOrganisation() {
    if (!selectedOrgId) return;
    await apiFetch(`/cohorts/${id}/organisations`, { method: 'POST', body: JSON.stringify({ organisation_id: selectedOrgId }) });
    setSelectedOrgId('');
    loadOrganisations();
  }

  async function removeOrganisation(orgId) {
    await apiFetch(`/cohorts/${id}/organisations/${orgId}`, { method: 'DELETE' });
    loadOrganisations();
  }

  async function addCourse() {
    if (!selectedCourseId) return;
    await apiFetch(`/cohorts/${id}/courses`, { method: 'POST', body: JSON.stringify({ course_id: selectedCourseId }) });
    setSelectedCourseId('');
    loadCourses();
  }

  async function removeCourse(courseId) {
    await apiFetch(`/cohorts/${id}/courses/${courseId}`, { method: 'DELETE' });
    loadCourses();
  }

  if (!cohort) return null;

  const participantColumns = [
    { key: 'name', label: 'Name', render: row => (
      <Link to={`/contacts/${row.contact_id}`}>{row.first_name} {row.last_name}</Link>
    )},
    { key: 'email', label: 'Email' },
    { key: 'organisation_name', label: 'Organisation', render: row => row.organisation_name || '—' },
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge stage-${row.status}`}>{row.status.charAt(0).toUpperCase() + row.status.slice(1)}</span>
    )},
    { key: 'feedback_score', label: 'Feedback', render: row => row.feedback_score ? `${row.feedback_score}/10` : '—' },
    { key: 'cpd_certificate_issued', label: 'CPD Cert', render: row => row.cpd_certificate_issued ? 'Yes' : '—' },
    { key: 'actions', label: '', render: row => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-secondary btn-small" onClick={e => { e.stopPropagation(); setEditingParticipant(row); }}>Edit</button>
        <button className="btn btn-danger btn-small" onClick={e => { e.stopPropagation(); removeParticipant(row.id); }}>Remove</button>
      </div>
    )},
  ];

  return (
    <div>
      <Link to="/programmes" className="back-link">← Programmes</Link>
      <div className="detail-header">
        <h1>{cohort.name}</h1>
        <SectorBadge name={cohort.sector_name} colour={cohort.sector_colour} />
        <span className={`stage-badge status-${cohort.status}`}>{STATUS_LABELS[cohort.status] || cohort.status}</span>
        <span className="stage-badge stage-active">{DELIVERY_LABELS[cohort.delivery_type] || cohort.delivery_type}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && (
            <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
          )}
        </div>
        <div className="detail-grid">
          <div className="detail-field">
            <div className="detail-field-label">Client (Funder)</div>
            <div className="detail-field-value">
              {cohort.client_organisation_id ? (
                <Link to={`/organisations/${cohort.client_organisation_id}`}>{cohort.client_name}</Link>
              ) : 'Self-funded / Direct'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Lead Trainer</div>
            <div className="detail-field-value">{cohort.trainer_name || '—'}</div>
          </div>
          <InlineEditField
            label="Start Date"
            value={cohort.start_date ? cohort.start_date.slice(0, 10) : ''}
            onSave={v => saveField('start_date', v)}
            type="date"
            displayValue={cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : null}
          />
          <InlineEditField
            label="End Date"
            value={cohort.end_date ? cohort.end_date.slice(0, 10) : ''}
            onSave={v => saveField('end_date', v)}
            type="date"
            displayValue={cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : null}
          />
          <InlineEditField
            label="Max Participants"
            value={cohort.max_participants}
            onSave={v => saveField('max_participants', v)}
            type="number"
            placeholder="e.g. 20"
          />
          <InlineEditField
            label="CPD Hours"
            value={cohort.cpd_hours}
            onSave={v => saveField('cpd_hours', v)}
            type="number"
            placeholder="e.g. 6"
          />
          <InlineEditField
            label="Status"
            value={cohort.status}
            onSave={v => saveField('status', v)}
            type="select"
            options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            displayValue={<span className={`stage-badge status-${cohort.status}`}>{STATUS_LABELS[cohort.status] || cohort.status}</span>}
          />
          <InlineEditField
            label="Delivery Type"
            value={cohort.delivery_type}
            onSave={v => saveField('delivery_type', v)}
            type="select"
            options={Object.entries(DELIVERY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            displayValue={<span className="stage-badge stage-active">{DELIVERY_LABELS[cohort.delivery_type] || cohort.delivery_type}</span>}
          />
          <InlineEditField
            label="Participants"
            value={`${participants.length}${cohort.max_participants ? ` / ${cohort.max_participants}` : ''}`}
            onSave={() => {}}
            readOnly={true}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'participants' ? 'active' : ''}`} onClick={() => setActiveTab('participants')}>
          Participants ({participants.length})
        </button>
        <button className={`tab ${activeTab === 'organisations' ? 'active' : ''}`} onClick={() => setActiveTab('organisations')}>
          Organisations ({organisations.length})
        </button>
        <button className={`tab ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
          Courses ({courses.length})
        </button>
        <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
          Sessions ({sessions.length})
        </button>
        <button className={`tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>
          Notes
        </button>
      </div>

      {/* Participants tab */}
      {activeTab === 'participants' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingParticipant(true)}>+ Add Participant</button>
          </div>
          <DataTable columns={participantColumns} data={participants} emptyMessage="No participants enrolled yet." />
        </div>
      )}

      {/* Organisations tab */}
      {activeTab === 'organisations' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} className="form-select" style={{ flex: 1 }}>
              <option value="">Select organisation to add…</option>
              {allOrgs.filter(o => !organisations.some(existing => existing.id === o.id)).map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-small" onClick={addOrganisation} disabled={!selectedOrgId}>Add</button>
          </div>
          {organisations.length === 0 ? (
            <div className="empty-state"><h3>No organisations linked yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Country</th>
                  <th>Stage</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {organisations.map(org => (
                  <tr key={org.id}>
                    <td><Link to={`/organisations/${org.id}`} style={{ fontWeight: 500 }}>{org.name}</Link></td>
                    <td>{org.type || '—'}</td>
                    <td>{org.country || '—'}</td>
                    <td>{org.relationship_stage ? (
                      <span className={`stage-badge stage-${org.relationship_stage}`}>{org.relationship_stage.charAt(0).toUpperCase() + org.relationship_stage.slice(1)}</span>
                    ) : '—'}</td>
                    <td>
                      <button className="btn btn-danger btn-small" onClick={() => removeOrganisation(org.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Courses tab */}
      {activeTab === 'courses' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="form-select" style={{ flex: 1 }}>
              <option value="">Select course to add…</option>
              {allCourses.filter(c => !courses.some(existing => existing.id === c.id)).map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-small" onClick={addCourse} disabled={!selectedCourseId}>Add</button>
          </div>
          {courses.length === 0 ? (
            <div className="empty-state"><h3>No courses linked yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Modules</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {courses.map(course => (
                  <tr key={course.id}>
                    <td><Link to={`/curriculum/${course.id}`} style={{ fontWeight: 500 }}>{course.title}</Link></td>
                    <td>{course.status ? (
                      <span className={`stage-badge stage-${course.status}`}>{course.status.charAt(0).toUpperCase() + course.status.slice(1)}</span>
                    ) : '—'}</td>
                    <td>{course.version || '—'}</td>
                    <td>{course.module_count ?? '—'}</td>
                    <td>
                      <button className="btn btn-danger btn-small" onClick={() => removeCourse(course.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Sessions tab */}
      {activeTab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-small" onClick={() => setAddingSession(true)}>+ Add Session</button>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><h3>No sessions scheduled yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>{s.order_index}</td>
                    <td style={{ fontWeight: 500 }}>{s.title}</td>
                    <td>{s.session_date ? new Date(s.session_date).toLocaleDateString() : '—'}</td>
                    <td>{s.start_time && s.end_time ? `${s.start_time.slice(0,5)} — ${s.end_time.slice(0,5)}` : s.start_time?.slice(0,5) || '—'}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.location || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-small" onClick={() => setEditingSession(s)}>Edit</button>
                        <button className="btn btn-danger btn-small" onClick={() => removeSession(s.id)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Notes tab */}
      {activeTab === 'notes' && (
        <div className="card">
          <InlineEditField
            label="Notes"
            value={cohort.notes}
            onSave={v => saveField('notes', v)}
            type="textarea"
            placeholder="Add notes about this cohort..."
          />
        </div>
      )}

      {/* Modals */}
      {editing && (
        <CohortForm cohort={cohort} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadCohort(); }} />
      )}
      {deleting && (
        <Modal title="Delete Cohort" onClose={() => setDeleting(false)}>
          <p>Are you sure you want to delete {cohort.name}? This will also remove all participants and sessions. This cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
      {addingParticipant && (
        <ParticipantForm cohortId={id} sectorId={cohort.sector_id} onClose={() => setAddingParticipant(false)} onSaved={() => { setAddingParticipant(false); loadParticipants(); }} />
      )}
      {editingParticipant && (
        <ParticipantForm participant={editingParticipant} cohortId={id} sectorId={cohort.sector_id} onClose={() => setEditingParticipant(null)} onSaved={() => { setEditingParticipant(null); loadParticipants(); }} />
      )}
      {addingSession && (
        <SessionForm cohortId={id} onClose={() => setAddingSession(false)} onSaved={() => { setAddingSession(false); loadSessions(); }} />
      )}
      {editingSession && (
        <SessionForm session={editingSession} cohortId={id} onClose={() => setEditingSession(null)} onSaved={() => { setEditingSession(null); loadSessions(); }} />
      )}

      {/* Smart Input — add info via text or document */}
      <SmartInput entityType="cohort" entityId={id} sectorId={cohort.sector_id} onUpdated={() => { loadCohort(); loadParticipants(); }} />
    </div>
  );
}
