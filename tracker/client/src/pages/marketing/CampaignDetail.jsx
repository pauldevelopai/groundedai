import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import CampaignForm from './CampaignForm.jsx';
import ComposeEmail from './ComposeEmail.jsx';

const TYPE_LABELS = { cold_email: 'Cold Email', linkedin: 'LinkedIn', social: 'Social', event: 'Event' };
const STATUS_LABELS = { draft: 'Draft', active: 'Active', paused: 'Paused', completed: 'Completed' };
const MSG_STATUS_LABELS = { draft: 'Draft', sent: 'Sent', replied: 'Replied', bounced: 'Bounced', no_response: 'No Response' };

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [messages, setMessages] = useState([]);
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function loadCampaign() {
    apiFetch(`/outreach-campaigns/${id}`).then(setCampaign).catch(() => navigate('/marketing/campaigns'));
  }
  function loadMessages() {
    apiFetch(`/outreach-messages?campaign_id=${id}`).then(setMessages).catch(() => setMessages([]));
  }

  useEffect(() => { loadCampaign(); loadMessages(); }, [id]);

  async function handleDelete() {
    await apiFetch(`/outreach-campaigns/${id}`, { method: 'DELETE' });
    navigate('/marketing/campaigns');
  }

  async function markStatus(msgId, status) {
    await apiFetch(`/outreach-messages/${msgId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, replied_at: status === 'replied' ? new Date().toISOString() : null }),
    });
    loadMessages();
  }

  if (!campaign) return null;

  const sentCount = messages.filter(m => m.status === 'sent' || m.status === 'replied').length;
  const replyCount = messages.filter(m => m.status === 'replied').length;

  return (
    <div>
      <Link to="/marketing/campaigns" className="back-link">← Campaigns</Link>
      <div className="detail-header">
        <h1>{campaign.name}</h1>
        <SectorBadge name={campaign.sector_name} colour={campaign.sector_colour} />
        <span className={`stage-badge status-${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{TYPE_LABELS[campaign.type]}</span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary btn-small" onClick={() => setComposing(true)}>+ Compose Email</button>
          <button className="btn btn-secondary btn-small" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger btn-small" onClick={() => setDeleting(true)}>Delete</button>
        </div>
        {campaign.target_audience && (
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            <strong>Target audience:</strong> {campaign.target_audience}
          </div>
        )}
        <div className="detail-grid">
          <div className="detail-field">
            <div className="detail-field-label">Messages</div>
            <div className="detail-field-value">{messages.length}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Sent</div>
            <div className="detail-field-value">{sentCount}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Replies</div>
            <div className="detail-field-value">{replyCount}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Response Rate</div>
            <div className="detail-field-value">{sentCount > 0 ? `${Math.round((replyCount / sentCount) * 100)}%` : '—'}</div>
          </div>
        </div>
        {campaign.notes && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>{campaign.notes}</div>}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Messages</h3>
      {messages.length === 0 ? (
        <div className="empty-state"><h3>No messages yet. Compose your first email.</h3></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Contact</th><th>Organisation</th><th>Subject</th><th>Status</th><th>Sent</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {messages.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.first_name} {m.last_name}</td>
                <td>{m.organisation_name || '—'}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '—'}</td>
                <td><span className={`stage-badge msg-${m.status}`}>{MSG_STATUS_LABELS[m.status] || m.status}</span></td>
                <td>{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {m.status === 'sent' && (
                      <button className="btn btn-secondary btn-small" onClick={() => markStatus(m.id, 'replied')}>Mark Replied</button>
                    )}
                    {m.status === 'sent' && (
                      <button className="btn btn-secondary btn-small" onClick={() => markStatus(m.id, 'no_response')}>No Response</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && <CampaignForm campaign={campaign} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); loadCampaign(); }} />}
      {composing && <ComposeEmail campaignId={id} sectorId={campaign.sector_id} onClose={() => setComposing(false)} onSaved={() => { setComposing(false); loadMessages(); }} />}
      {deleting && (
        <Modal title="Delete Campaign" onClose={() => setDeleting(false)}>
          <p>Delete this campaign? Messages will be unlinked but not deleted.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
