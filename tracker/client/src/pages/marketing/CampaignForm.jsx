import { useState } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const TYPES = ['cold_email', 'linkedin', 'social', 'event'];
const STATUSES = ['draft', 'active', 'paused', 'completed'];

export default function CampaignForm({ campaign, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sector_id: campaign?.sector_id || selectedSectorId || '',
    name: campaign?.name || '',
    type: campaign?.type || 'cold_email',
    status: campaign?.status || 'draft',
    target_audience: campaign?.target_audience || '',
    start_date: campaign?.start_date?.slice(0, 10) || '',
    end_date: campaign?.end_date?.slice(0, 10) || '',
    notes: campaign?.notes || '',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { ...form, start_date: form.start_date || null, end_date: form.end_date || null };
      if (campaign) {
        await apiFetch(`/outreach-campaigns/${campaign.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/outreach-campaigns', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={campaign ? 'Edit Campaign' : 'Create Campaign'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Campaign Name *</label>
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
              {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}</option>)}
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
        </div>
        <div className="form-group">
          <label>Target Audience</label>
          <textarea value={form.target_audience} onChange={set('target_audience')} rows={2} placeholder="Who does this campaign target?" />
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
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (campaign ? 'Update' : 'Create')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
