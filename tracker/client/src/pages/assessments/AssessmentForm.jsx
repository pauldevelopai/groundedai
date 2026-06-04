import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

export default function AssessmentForm({ onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: selectedSectorId || '',
    organisation_id: '',
    contact_id: '',
  });

  useEffect(() => {
    if (form.sector_id) {
      apiFetch(buildUrl('/organisations', form.sector_id)).then(setOrgs).catch(() => setOrgs([]));
    }
  }, [form.sector_id]);

  useEffect(() => {
    if (form.organisation_id) {
      apiFetch(`/contacts?organisation_id=${form.organisation_id}`).then(setContacts).catch(() => setContacts([]));
    } else if (form.sector_id) {
      apiFetch(buildUrl('/contacts', form.sector_id)).then(setContacts).catch(() => setContacts([]));
    }
  }, [form.organisation_id, form.sector_id]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        sector_id: form.sector_id,
        organisation_id: form.organisation_id || null,
        contact_id: form.contact_id || null,
      };
      await apiFetch('/needs-assessments', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Assessment" onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
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
        <div className="form-group">
          <label>Primary Contact</label>
          <select value={form.contact_id} onChange={set('contact_id')}>
            <option value="">None</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.email || 'no email'}</option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Assessment'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
