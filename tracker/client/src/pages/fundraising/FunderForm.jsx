import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const TYPES = ['foundation', 'government', 'arts_council', 'innovation_fund', 'international_development'];

export default function FunderForm({ funder, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: funder?.name || '',
    type: funder?.type || 'foundation',
    website: funder?.website || '',
    contact_name: funder?.contact_name || '',
    contact_email: funder?.contact_email || '',
    country: funder?.country || '',
    notes: funder?.notes || '',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (funder) {
        await apiFetch(`/funders/${funder.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiFetch('/funders', { method: 'POST', body: JSON.stringify(form) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={funder ? 'Edit Funder' : 'Add Funder'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Name *</label>
          <input value={form.name} onChange={set('name')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={set('type')}>
              {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Country</label>
            <input value={form.country} onChange={set('country')} />
          </div>
        </div>
        <div className="form-group">
          <label>Website</label>
          <input value={form.website} onChange={set('website')} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Contact Name</label>
            <input value={form.contact_name} onChange={set('contact_name')} />
          </div>
          <div className="form-group">
            <label>Contact Email</label>
            <input value={form.contact_email} onChange={set('contact_email')} type="email" />
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (funder ? 'Update' : 'Add Funder')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
