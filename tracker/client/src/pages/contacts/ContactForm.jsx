import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const PIPELINE_STAGES = ['prospect', 'contacted', 'meeting', 'proposal', 'client', 'inactive'];

export default function ContactForm({ contact, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: contact?.sector_id || selectedSectorId || '',
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    job_title: contact?.job_title || '',
    organisation_id: contact?.organisation_id || '',
    linkedin_url: contact?.linkedin_url || '',
    notes: contact?.notes || '',
    tags: contact?.tags?.join(', ') || '',
    pipeline_stage: contact?.pipeline_stage || 'prospect',
    source: contact?.source || '',
  });

  useEffect(() => {
    apiFetch(buildUrl('/organisations', form.sector_id || null))
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, [form.sector_id]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        ...form,
        organisation_id: form.organisation_id || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      if (contact) {
        await apiFetch(`/contacts/${contact.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/contacts', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={contact ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>First Name *</label>
            <input value={form.first_name} onChange={set('first_name')} required />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input value={form.last_name} onChange={set('last_name')} required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="form-group">
          <label>Job Title</label>
          <input value={form.job_title} onChange={set('job_title')} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Sector *</label>
            <select value={form.sector_id} onChange={set('sector_id')} required>
              <option value="">Select sector...</option>
              {sectors.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Organisation</label>
            <select value={form.organisation_id} onChange={set('organisation_id')}>
              <option value="">None</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Pipeline Stage</label>
            <select value={form.pipeline_stage} onChange={set('pipeline_stage')}>
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Source</label>
            <input value={form.source} onChange={set('source')} placeholder="e.g. cold outreach, referral" />
          </div>
        </div>
        <div className="form-group">
          <label>LinkedIn URL</label>
          <input value={form.linkedin_url} onChange={set('linkedin_url')} />
        </div>
        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="e.g. warm, referral" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (contact ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
