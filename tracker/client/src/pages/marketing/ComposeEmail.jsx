import { useState, useEffect } from 'react';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

export default function ComposeEmail({ campaignId, sectorId, onClose, onSaved }) {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({
    contact_id: '',
    subject: '',
    body: '',
  });

  useEffect(() => {
    if (sectorId) {
      apiFetch(buildUrl('/contacts', sectorId)).then(setContacts).catch(() => setContacts([]));
    }
  }, [sectorId]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleAiDraft() {
    if (!form.contact_id) { setError('Select a contact first'); return; }
    setDrafting(true);
    setError('');
    try {
      const draft = await apiFetch('/outreach-messages/ai-draft', {
        method: 'POST',
        body: JSON.stringify({ contact_id: form.contact_id, campaign_id: campaignId }),
      });
      setForm(prev => ({ ...prev, subject: draft.subject, body: draft.body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSaveDraft(e) {
    e.preventDefault();
    if (!form.contact_id) { setError('Select a contact'); return; }
    setError('');
    setSaving(true);
    try {
      await apiFetch('/outreach-messages', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId, contact_id: form.contact_id, subject: form.subject, body: form.body, status: 'draft' }),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    if (!form.contact_id || !form.subject || !form.body) { setError('Contact, subject, and body are all required'); return; }
    setError('');
    setSending(true);
    try {
      // Create message first
      const msg = await apiFetch('/outreach-messages', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId, contact_id: form.contact_id, subject: form.subject, body: form.body, status: 'draft' }),
      });
      // Then send via Gmail
      await apiFetch(`/outreach-messages/${msg.id}/send`, { method: 'POST' });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const selectedContact = contacts.find(c => c.id === form.contact_id);

  return (
    <Modal title="Compose Email" onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSaveDraft}>
        <div className="form-group">
          <label>Contact *</label>
          <select value={form.contact_id} onChange={set('contact_id')} required>
            <option value="">Select contact...</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name} {c.email ? `(${c.email})` : ''} {c.organisation_name ? `— ${c.organisation_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        {form.contact_id && (
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleAiDraft} disabled={drafting}
              style={{ borderLeft: '3px solid var(--accent)' }}>
              {drafting ? 'AI Drafting...' : 'AI Draft Email'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
              Claude will write a personalised email for this contact
            </span>
          </div>
        )}

        <div className="form-group">
          <label>Subject</label>
          <input value={form.subject} onChange={set('subject')} placeholder="Email subject line" />
        </div>
        <div className="form-group">
          <label>Body</label>
          <textarea value={form.body} onChange={set('body')} rows={10} placeholder="Email body..." style={{ fontFamily: 'inherit', lineHeight: 1.6 }} />
        </div>

        {drafting && (
          <div style={{ padding: 12, background: '#F1F5F9', borderRadius: 'var(--radius)', marginBottom: 12, textAlign: 'center', fontSize: 13 }}>
            Claude is drafting a personalised email...
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-secondary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSendNow} disabled={sending || !form.subject || !form.body}>
            {sending ? 'Sending...' : 'Send via Gmail'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
