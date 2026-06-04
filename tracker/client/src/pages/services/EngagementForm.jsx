import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const TYPES = [
  { value: 'ethical_ai_policy', label: 'Ethical AI Policy' },
  { value: 'ai_legal_framework', label: 'AI Legal Framework' },
  { value: 'ai_security_framework', label: 'AI Security Framework' },
  { value: 'mentorship', label: '1:1 Mentorship' },
];
const STATUSES = ['scoping', 'active', 'review', 'completed'];

export default function EngagementForm({ engagement, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: engagement?.sector_id || selectedSectorId || '',
    organisation_id: engagement?.organisation_id || '',
    contact_id: engagement?.contact_id || '',
    type: engagement?.type || 'ethical_ai_policy',
    status: engagement?.status || 'scoping',
    mentor_id: engagement?.mentor_id || '',
    start_date: engagement?.start_date?.slice(0, 10) || '',
    end_date: engagement?.end_date?.slice(0, 10) || '',
    deliverable_url: engagement?.deliverable_url || '',
    notes: engagement?.notes || '',
  });

  useEffect(() => {
    if (form.sector_id) {
      apiFetch(buildUrl('/organisations', form.sector_id)).then(setOrgs).catch(() => setOrgs([]));
      apiFetch(buildUrl('/contacts', form.sector_id)).then(setContacts).catch(() => setContacts([]));
    }
    apiFetch('/team-members').then(setTeamMembers).catch(() => setTeamMembers([]));
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
        contact_id: form.contact_id || null,
        mentor_id: form.mentor_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        deliverable_url: form.deliverable_url || null,
      };
      if (engagement) {
        await apiFetch(`/service-engagements/${engagement.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/service-engagements', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={engagement ? 'Edit Engagement' : 'Create Engagement'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
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
            <label>Type *</label>
            <select value={form.type} onChange={set('type')}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Organisation</label>
            <select value={form.organisation_id} onChange={set('organisation_id')}>
              <option value="">None</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Primary Contact</label>
            <select value={form.contact_id} onChange={set('contact_id')}>
              <option value="">None</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Assigned Mentor / Consultant</label>
            <select value={form.mentor_id} onChange={set('mentor_id')}>
              <option value="">Unassigned</option>
              {teamMembers.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={form.start_date} onChange={set('start_date')} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" value={form.end_date} onChange={set('end_date')} />
          </div>
        </div>
        <div className="form-group">
          <label>Deliverable URL</label>
          <input value={form.deliverable_url} onChange={set('deliverable_url')} placeholder="Link to final document" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (engagement ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
