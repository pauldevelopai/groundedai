import { useState } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const DELIVERY_TYPES = ['online', 'in_person', 'both'];
const STATUSES = ['draft', 'active', 'archived'];

export default function CourseForm({ course, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: course?.sector_id || selectedSectorId || '',
    title: course?.title || '',
    description: course?.description || '',
    notes: course?.notes || '',
    delivery_type: course?.delivery_type || 'both',
    version: course?.version || 'v1.0',
    status: course?.status || 'draft',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (course) {
        await apiFetch(`/courses/${course.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiFetch('/courses', { method: 'POST', body: JSON.stringify(form) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={course ? 'Edit Course' : 'Add Course'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required />
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
            <label>Delivery Type</label>
            <select value={form.delivery_type} onChange={set('delivery_type')}>
              {DELIVERY_TYPES.map(t => (
                <option key={t} value={t}>{t.replace('_', '-').charAt(0).toUpperCase() + t.replace('_', '-').slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Version</label>
            <input value={form.version} onChange={set('version')} />
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
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Delivery tips, context, target audience details, trainer guidance..." />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (course ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
