import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import ContactForm from './ContactForm.jsx';
import Modal from '../../components/Modal.jsx';
import SmartInput from '../../components/SmartInput.jsx';
import InlineEditField from '../../components/InlineEditField.jsx';

const STAGE_LABELS = {
  pending_review: 'Pending Review', prospect: 'Prospect', contacted: 'Contacted',
  meeting: 'Meeting', proposal: 'Proposal', client: 'Client', inactive: 'Inactive', rejected: 'Rejected',
};
const STAGE_COLORS = {
  pending_review: '#F59E0B', prospect: '#94A3B8', contacted: '#6366F1',
  meeting: '#F59E0B', proposal: '#10B981', client: '#059669', inactive: '#94A3B8', rejected: '#EF4444',
};

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emails, setEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  function load() {
    apiFetch(`/contacts/${id}`).then(setContact).catch(() => navigate('/contacts'));
  }

  useEffect(load, [id]);

  function loadEmails() {
    if (!contact?.email) return;
    setLoadingEmails(true);
    apiFetch(`/contacts/${id}/emails`, { timeout: 60000 })
      .then(setEmails)
      .catch(() => setEmails([]))
      .finally(() => setLoadingEmails(false));
  }

  useEffect(() => {
    if (activeTab === 'emails' && emails.length === 0 && contact?.email) loadEmails();
  }, [activeTab, contact]);

  async function saveField(field, value) {
    await apiFetch(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) });
    load();
  }

  async function handleDelete() {
    await apiFetch(`/contacts/${id}`, { method: 'DELETE' });
    navigate('/contacts');
  }

  async function updateStage(stage) {
    await apiFetch(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify({ pipeline_stage: stage }) });
    load();
  }

  if (!contact) return null;

  const isMined = contact.source === 'email_mining';
  const isPendingReview = contact.pipeline_stage === 'pending_review';
  const tagColors = { hot: '#EF4444', warm: '#F59E0B', cold: '#94A3B8', senior: '#6366F1', 'high-influence': '#10B981', 'deep-relationship': '#F59E0B', 'auto-discovered': '#94A3B8' };

  return (
    <div>
      <Link to={isMined ? '/leads' : '/contacts'} className="back-link">← {isMined ? 'Leads' : 'Contacts'}</Link>
      <div className="detail-header">
        <h1>{contact.first_name} {contact.last_name}</h1>
        <SectorBadge name={contact.sector_name} colour={contact.sector_colour} />
        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: (STAGE_COLORS[contact.pipeline_stage] || '#94A3B8') + '22', color: STAGE_COLORS[contact.pipeline_stage] || '#94A3B8' }}>
          {STAGE_LABELS[contact.pipeline_stage] || contact.pipeline_stage}
        </span>
        {isMined && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#6366F122', color: '#6366F1' }}>📧 Mined from Gmail</span>}
      </div>

      {/* Vetting bar for pending_review leads */}
      {isPendingReview && (
        <div className="card" style={{ marginBottom: 16, padding: 16, borderLeft: '4px solid #F59E0B', background: '#FFFBEB' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⚡ This lead needs your review</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Discovered by the Lead Miner from your Gmail. Review the email history below and decide:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => updateStage('prospect')}>
              ✓ Approve as Lead
            </button>
            <button className="btn btn-secondary" onClick={() => updateStage('contacted')}>
              Already Contacted
            </button>
            <button className="btn btn-secondary" onClick={() => updateStage('client')}>
              Already a Client
            </button>
            <button className="btn btn-danger btn-small" onClick={() => updateStage('rejected')} style={{ marginLeft: 'auto' }}>
              ✗ Not a Lead
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {!isPendingReview && (
              <select value={contact.pipeline_stage} onChange={e => updateStage(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: 4 }}>
                {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
            {user?.role === 'admin' && (
              <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
            )}
          </div>
        </div>
        <div className="detail-grid">
          <InlineEditField
            label="Email"
            value={contact.email}
            onSave={v => saveField('email', v)}
            type="email"
            placeholder="email@example.com"
            displayValue={contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
          />
          <InlineEditField
            label="Phone"
            value={contact.phone}
            onSave={v => saveField('phone', v)}
            type="text"
            placeholder="Phone number..."
          />
          <InlineEditField
            label="Job Title"
            value={contact.job_title}
            onSave={v => saveField('job_title', v)}
            type="text"
            placeholder="Job title..."
          />
          <div className="detail-field">
            <div className="detail-field-label">Organisation</div>
            <div className="detail-field-value">
              {contact.organisation_id ? (
                <Link to={`/organisations/${contact.organisation_id}`}>{contact.organisation_name}</Link>
              ) : '—'}
            </div>
          </div>
          <InlineEditField
            label="Source"
            value={contact.source}
            onSave={v => saveField('source', v)}
            type="text"
            placeholder="Source..."
          />
          <InlineEditField
            label="Last Contacted"
            value={contact.last_contacted_at ? contact.last_contacted_at.slice(0, 10) : ''}
            onSave={v => saveField('last_contacted_at', v)}
            type="date"
            displayValue={contact.last_contacted_at ? new Date(contact.last_contacted_at).toLocaleDateString() : null}
          />
          <InlineEditField
            label="LinkedIn"
            value={contact.linkedin_url}
            onSave={v => saveField('linkedin_url', v)}
            type="url"
            placeholder="https://linkedin.com/in/..."
            displayValue={contact.linkedin_url ? <a href={contact.linkedin_url} target="_blank" rel="noreferrer">{contact.linkedin_url}</a> : null}
          />
          <InlineEditField
            label="Pipeline Stage"
            value={contact.pipeline_stage}
            onSave={v => saveField('pipeline_stage', v)}
            type="select"
            options={Object.entries(STAGE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            displayValue={<span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: (STAGE_COLORS[contact.pipeline_stage] || '#94A3B8') + '22', color: STAGE_COLORS[contact.pipeline_stage] || '#94A3B8' }}>{STAGE_LABELS[contact.pipeline_stage] || contact.pipeline_stage}</span>}
          />
          <div className="detail-field">
            <div className="detail-field-label">Tags</div>
            <div className="detail-field-value" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {contact.tags?.length > 0 ? contact.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: (tagColors[t] || '#94A3B8') + '18', color: tagColors[t] || '#94A3B8', fontWeight: 500 }}>{t}</span>
              )) : '—'}
            </div>
          </div>
        </div>
        <InlineEditField
          label="Notes"
          value={contact.notes}
          onSave={v => saveField('notes', v)}
          type="textarea"
          placeholder="Add notes about this contact..."
        />
      </div>

      {/* Tabs: Details / Email History */}
      {contact.email && (
        <>
          <div className="tabs">
            <button className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              Activity
            </button>
            <button className={`tab ${activeTab === 'emails' ? 'active' : ''}`} onClick={() => setActiveTab('emails')}>
              Email History ({emails.length || '...'})
            </button>
          </div>

          {activeTab === 'emails' && (
            <div>
              {loadingEmails ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading emails from Gmail...
                </div>
              ) : emails.length === 0 ? (
                <div className="empty-state"><h3>No emails found with {contact.email}</h3></div>
              ) : (
                emails.map((email, i) => (
                  <div key={email.id || i} className="card" style={{ marginBottom: 6, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{email.subject || '(no subject)'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {email.date ? new Date(email.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {email.from?.includes(contact.email) ? 'From them →' : '← From you'}
                      {' '}{email.from}
                    </div>
                    {email.snippet && (
                      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, marginTop: 4, padding: '6px 10px', background: '#F8FAFC', borderRadius: 4 }}>
                        {email.snippet}...
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <ContactForm contact={contact} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}

      {deleting && (
        <Modal title="Delete Contact" onClose={() => setDeleting(false)}>
          <p>Are you sure you want to delete {contact.first_name} {contact.last_name}? This cannot be undone.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}

      <SmartInput entityType="contact" entityId={id} sectorId={contact.sector_id} onUpdated={() => load()} />
    </div>
  );
}
