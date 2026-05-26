import { useState } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const RELATIONSHIP_STAGES = ['prospect', 'active', 'partner', 'inactive'];
const ORG_TYPES = ['law society', 'law firm', 'pro bono org', 'media NGO', 'broadcaster', 'publisher', 'consultancy', 'other'];

export default function OrganisationForm({ organisation, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: organisation?.sector_id || selectedSectorId || '',
    name: organisation?.name || '',
    type: organisation?.type || '',
    country: organisation?.country || '',
    city: organisation?.city || '',
    website: organisation?.website || '',
    notes: organisation?.notes || '',
    relationship_stage: organisation?.relationship_stage || 'prospect',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (organisation) {
        await apiFetch(`/organisations/${organisation.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiFetch('/organisations', { method: 'POST', body: JSON.stringify(form) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={organisation ? 'Edit Organisation' : 'Add Organisation'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Name *</label>
          <input value={form.name} onChange={set('name')} required />
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
            <label>Type</label>
            <select value={form.type} onChange={set('type')}>
              <option value="">Select type...</option>
              {ORG_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>City</label>
            <input value={form.city} onChange={set('city')} />
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
        <div className="form-group">
          <label>Relationship Stage</label>
          <select value={form.relationship_stage} onChange={set('relationship_stage')}>
            {RELATIONSHIP_STAGES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (organisation ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
