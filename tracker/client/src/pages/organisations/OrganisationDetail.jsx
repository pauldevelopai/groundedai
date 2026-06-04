import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import DataTable from '../../components/DataTable.jsx';
import OrganisationForm from './OrganisationForm.jsx';
import Modal from '../../components/Modal.jsx';
import DocumentUpload from '../../components/DocumentUpload.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const STAGE_LABELS = {
  prospect: 'Prospect', active: 'Active', partner: 'Partner', inactive: 'Inactive',
};

const AI_LEVEL_COLOURS = {
  starting: '#e74c3c',
  in_progress: '#f39c12',
  strong: '#27ae60',
  excellent: '#2980b9',
};

function AIScoreBadge({ ai }) {
  if (!ai) return null;
  const bg = AI_LEVEL_COLOURS[ai.level] || '#888';
  return (
    <span style={{ background: bg, color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, marginLeft: 8 }}>
      AI: {ai.score ?? '—'} ({(ai.level || 'unknown').replace(/_/g, ' ')})
    </span>
  );
}

function AIBreakdown({ ai }) {
  if (!ai) return null;
  const items = [
    { label: 'Policy', ok: ai.hasPolicy },
    { label: 'Framework', ok: ai.hasFramework },
    { label: 'Security', ok: ai.hasSecurity },
    { label: 'Mentoring', ok: ai.hasMentoring },
    { label: 'Learning', ok: ai.avgProgress > 0 },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, marginTop: 4 }}>
      {items.map(i => (
        <span key={i.label}>{i.ok ? '\u2705' : '\u274C'} {i.label}</span>
      ))}
      {ai.avgProgress != null && (
        <span style={{ color: 'var(--text-secondary)' }}>Avg progress: {Math.round(ai.avgProgress)}%</span>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`stage-badge stage-${status}`}>{(status || '—').replace(/_/g, ' ')}</span>;
}

export default function OrganisationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [programmeOrgs, setProgrammeOrgs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function load() {
    apiFetch(`/organisations/${id}`).then(o => {
      setOrg(o);
      // If this is a funder, load programme orgs linked to it
      if (o.relationship_type === 'funder') {
        apiFetch(`/organisations?funder_id=${id}`).then(setProgrammeOrgs).catch(() => setProgrammeOrgs([]));
      }
    }).catch(() => navigate('/organisations'));
    apiFetch(`/contacts?organisation_id=${id}`).then(setContacts).catch(() => setContacts([]));
  }

  useEffect(load, [id]);

  async function saveField(field, value) {
    await apiFetch(`/organisations/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    load();
  }

  async function handleDelete() {
    await apiFetch(`/organisations/${id}`, { method: 'DELETE' });
    navigate('/organisations');
  }

  if (!org) return null;

  const contactColumns = [
    { key: 'name', label: 'Name', render: row => (
      <Link to={`/contacts/${row.id}`}>{row.first_name} {row.last_name}</Link>
    )},
    { key: 'email', label: 'Email' },
    { key: 'job_title', label: 'Job Title', render: row => row.job_title || '—' },
    { key: 'pipeline_stage', label: 'Stage', render: row => (
      <span className={`stage-badge stage-${row.pipeline_stage}`}>{row.pipeline_stage}</span>
    )},
  ];

  return (
    <div>
      <Link to="/organisations" className="back-link">← Organisations</Link>
      <div className="detail-header">
        <h1>{org.name}</h1>
        <SectorBadge name={org.sector_name} colour={org.sector_colour} />
        <span className={`stage-badge stage-${org.relationship_stage}`}>
          {STAGE_LABELS[org.relationship_stage] || org.relationship_stage}
        </span>
        <AIScoreBadge ai={org.ai_implementation} />
      </div>
      {org.funder_name && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Funded by: {org.funder_name}</div>
      )}
      {org.ai_implementation && (
        <div style={{ marginBottom: 12 }}>
          <AIBreakdown ai={org.ai_implementation} />
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && (
            <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
          )}
        </div>
        <div className="detail-grid">
          <InlineEditField
            label="Type"
            value={org.type}
            onSave={v => saveField('type', v)}
            type="text"
            placeholder="e.g. NGO, University, Corporate..."
          />
          <div className="detail-field">
            <div className="detail-field-label">Relationship</div>
            <div className="detail-field-value">
              <span className={`stage-badge ${org.relationship_type === 'funder' ? 'stage-active' : org.relationship_type === 'programme_org' ? 'stage-client' : 'stage-prospect'}`}>
                {(org.relationship_type || 'lead').replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <InlineEditField
            label="Relationship Stage"
            value={org.relationship_stage}
            onSave={v => saveField('relationship_stage', v)}
            type="select"
            options={[
              { value: 'prospect', label: 'Prospect' },
              { value: 'active', label: 'Active' },
              { value: 'partner', label: 'Partner' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            displayValue={<span className={`stage-badge stage-${org.relationship_stage}`}>{STAGE_LABELS[org.relationship_stage] || org.relationship_stage}</span>}
          />
          <InlineEditField
            label="Programme"
            value={org.programme_name}
            onSave={v => saveField('programme_name', v)}
            type="text"
            placeholder="Programme name..."
          />
          <InlineEditField
            label="City"
            value={org.city}
            onSave={v => saveField('city', v)}
            type="text"
            placeholder="City..."
          />
          <InlineEditField
            label="Country"
            value={org.country}
            onSave={v => saveField('country', v)}
            type="text"
            placeholder="Country..."
          />
          <InlineEditField
            label="Website"
            value={org.website}
            onSave={v => saveField('website', v)}
            type="url"
            placeholder="https://..."
            displayValue={org.website ? <a href={org.website} target="_blank" rel="noreferrer">{org.website}</a> : null}
          />
        </div>
        <InlineEditField
          label="Notes"
          value={org.notes}
          onSave={v => saveField('notes', v)}
          type="textarea"
          placeholder="Add notes about this organisation..."
        />
      </div>

      {/* Programme Organisations (for funders) */}
      {org.relationship_type === 'funder' && (
        <div className="detail-section">
          <h2>Programme Organisations ({programmeOrgs.length})</h2>
          {programmeOrgs.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Organisation</th><th>Programme</th><th>Country</th><th>Status</th></tr>
              </thead>
              <tbody>
                {programmeOrgs.map(po => (
                  <tr key={po.id} onClick={() => navigate(`/organisations/${po.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 500 }}>{po.name}</td>
                    <td>{po.programme_name || '—'}</td>
                    <td>{po.country || '—'}</td>
                    <td><span className={`stage-badge stage-${po.relationship_stage}`}>{po.relationship_stage}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 14 }}>No programme organisations linked yet.</div>
          )}
        </div>
      )}

      {/* Funder link (for programme orgs) */}
      {org.relationship_type === 'programme_org' && org.funder_organisation_id && (
        <div className="detail-section">
          <h2>Funder</h2>
          <Link to={`/organisations/${org.funder_organisation_id}`} style={{ fontSize: 14, fontWeight: 500 }}>
            View funder organisation →
          </Link>
        </div>
      )}

      <div className="detail-section">
        <h2>Documents</h2>
        <DocumentUpload entityType="organisation" entityId={id} sectorId={org.sector_id} onUploaded={load} />
      </div>

      <div className="detail-section">
        <h2>Contacts ({contacts.length})</h2>
        <DataTable columns={contactColumns} data={contacts} emptyMessage="No contacts linked to this organisation." />
      </div>

      {/* Cohorts */}
      {org.cohorts && org.cohorts.length > 0 && (
        <div className="detail-section">
          <h2>Cohorts ({org.cohorts.length})</h2>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Client</th><th>Delivery</th><th>Status</th></tr>
            </thead>
            <tbody>
              {org.cohorts.map(c => (
                <tr key={c.id} onClick={() => navigate(`/programmes/${c.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.client_name || '—'}</td>
                  <td>{(c.delivery_type || '—').replace(/_/g, ' ')}</td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Courses */}
      {org.courses && org.courses.length > 0 && (
        <div className="detail-section">
          <h2>Courses ({org.courses.length})</h2>
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Version</th><th>Status</th></tr>
            </thead>
            <tbody>
              {org.courses.map(c => (
                <tr key={c.id} onClick={() => navigate(`/curriculum/${c.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{c.title}</td>
                  <td>{c.version || '—'}</td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mentoring & Learning */}
      {((org.mentoring && org.mentoring.length > 0) || (org.learners && org.learners.length > 0)) && (
        <div className="detail-section">
          <h2>Mentoring &amp; Learning</h2>
          {org.mentoring && org.mentoring.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Mentoring Engagements</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Type</th><th>Mentor</th><th>Sessions</th><th>Start</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {org.mentoring.map(m => (
                    <tr key={m.id}>
                      <td>{(m.type || '—').replace(/_/g, ' ')}</td>
                      <td>{m.mentor_name || '—'}</td>
                      <td>{m.session_count ?? '—'}</td>
                      <td>{m.start_date ? new Date(m.start_date).toLocaleDateString() : '—'}</td>
                      <td><StatusBadge status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {org.learners && org.learners.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>Learning Journeys</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Learner</th><th>Skill Level</th><th>Progress</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {org.learners.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.first_name} {l.last_name}</td>
                      <td>{(l.skill_level || '—').replace(/_/g, ' ')}</td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${l.overall_progress || 0}%`, height: '100%', background: 'var(--primary)', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.overall_progress || 0}%</span>
                        </div>
                      </td>
                      <td><StatusBadge status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Generated Documents */}
      {org.documents && org.documents.length > 0 && (
        <div className="detail-section">
          <h2>Generated Documents ({org.documents.length})</h2>
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Type</th><th>Status</th></tr>
            </thead>
            <tbody>
              {org.documents.map(d => (
                <tr key={d.id} onClick={() => navigate(`/documents/${d.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{d.title}</td>
                  <td>{(d.template_type || '—').replace(/_/g, ' ')}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <OrganisationForm
          organisation={org}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}

      {deleting && (
        <Modal title="Delete Organisation" onClose={() => setDeleting(false)}>
          <p>Are you sure you want to delete {org.name}? This cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}

      <SmartInput entityType="organisation" entityId={id} sectorId={org.sector_id} onUpdated={() => load()} />
    </div>
  );
}
