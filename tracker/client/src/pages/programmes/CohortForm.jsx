import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const DELIVERY_TYPES = [
  { value: 'online_3x2hr', label: 'Online (3 x 2hr)' },
  { value: 'in_person_2day', label: 'In-Person (2 day)' },
];

const STATUSES = ['planned', 'active', 'completed', 'cancelled'];

export default function CohortForm({ cohort, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: cohort?.sector_id || selectedSectorId || '',
    organisation_id: cohort?.organisation_id || '',
    name: cohort?.name || '',
    delivery_type: cohort?.delivery_type || 'online_3x2hr',
    status: cohort?.status || 'planned',
    start_date: cohort?.start_date?.slice(0, 10) || '',
    end_date: cohort?.end_date?.slice(0, 10) || '',
    trainer_id: cohort?.trainer_id || '',
    max_participants: cohort?.max_participants || '',
    cpd_hours: cohort?.cpd_hours || '',
    notes: cohort?.notes || '',
  });

  useEffect(() => {
    apiFetch(buildUrl('/organisations', form.sector_id || null))
      .then(setOrgs).catch(() => setOrgs([]));
  }, [form.sector_id]);

  useEffect(() => {
    apiFetch('/team-members')
      .then(data => setTrainers(data.filter(t => t.is_active)))
      .catch(() => setTrainers([]));
  }, []);

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
        trainer_id: form.trainer_id || null,
        max_participants: form.max_participants ? parseInt(form.max_participants) : null,
        cpd_hours: form.cpd_hours ? parseFloat(form.cpd_hours) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      if (cohort) {
        await apiFetch(`/cohorts/${cohort.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/cohorts', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={cohort ? 'Edit Cohort' : 'Add Cohort'} onClose={onClose}>
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
            <label>Delivery Type</label>
            <select value={form.delivery_type} onChange={set('delivery_type')}>
              {DELIVERY_TYPES.map(dt => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
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
        <div className="form-row">
          <div className="form-group">
            <label>Lead Trainer</label>
            <select value={form.trainer_id} onChange={set('trainer_id')}>
              <option value="">None</option>
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Max Participants</label>
            <input type="number" value={form.max_participants} onChange={set('max_participants')} min="1" />
          </div>
        </div>
        <div className="form-group">
          <label>CPD Hours</label>
          <input type="number" value={form.cpd_hours} onChange={set('cpd_hours')} min="0" step="0.5" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (cohort ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
