import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const STAGES = ['identified', 'qualified', 'applying', 'submitted', 'decision', 'won', 'lost'];
const PRIORITIES = ['high', 'medium', 'low'];

export default function OpportunityForm({ opportunity, onClose, onSaved }) {
  const { sectors, selectedSectorId } = useSectors();
  const [funders, setFunders] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    funder_id: opportunity?.funder_id || '',
    sector_id: opportunity?.sector_id || selectedSectorId || '',
    title: opportunity?.title || '',
    description: opportunity?.description || '',
    amount_min: opportunity?.amount_min || '',
    amount_max: opportunity?.amount_max || '',
    currency: opportunity?.currency || 'GBP',
    deadline: opportunity?.deadline?.slice(0, 10) || '',
    pipeline_stage: opportunity?.pipeline_stage || 'identified',
    priority: opportunity?.priority || 'medium',
    match_funding_required: opportunity?.match_funding_required || false,
    match_funding_amount: opportunity?.match_funding_amount || '',
    eligibility_notes: opportunity?.eligibility_notes || '',
    url: opportunity?.url || '',
  });

  useEffect(() => { apiFetch('/funders').then(setFunders).catch(() => setFunders([])); }, []);

  function set(field) {
    return e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        ...form,
        funder_id: form.funder_id || null, sector_id: form.sector_id || null,
        amount_min: form.amount_min || null, amount_max: form.amount_max || null,
        match_funding_amount: form.match_funding_amount || null,
        deadline: form.deadline || null,
      };
      if (opportunity) {
        await apiFetch(`/funding-opportunities/${opportunity.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/funding-opportunities', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={opportunity ? 'Edit Opportunity' : 'Add Opportunity'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Funder</label>
            <select value={form.funder_id} onChange={set('funder_id')}>
              <option value="">Select funder...</option>
              {funders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Sector</label>
            <select value={form.sector_id} onChange={set('sector_id')}>
              <option value="">Cross-sector</option>
              {sectors.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Amount Min (£)</label>
            <input type="number" value={form.amount_min} onChange={set('amount_min')} min="0" />
          </div>
          <div className="form-group">
            <label>Amount Max (£)</label>
            <input type="number" value={form.amount_max} onChange={set('amount_max')} min="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Deadline</label>
            <input type="date" value={form.deadline} onChange={set('deadline')} />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Pipeline Stage</label>
          <select value={form.pipeline_stage} onChange={set('pipeline_stage')}>
            {STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>URL</label>
          <input value={form.url} onChange={set('url')} placeholder="Link to the funding call" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3} />
        </div>
        <div className="form-group">
          <label>Eligibility Notes</label>
          <textarea value={form.eligibility_notes} onChange={set('eligibility_notes')} rows={2} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={form.match_funding_required} onChange={set('match_funding_required')} id="match" />
          <label htmlFor="match" style={{ marginBottom: 0 }}>Match funding required</label>
          {form.match_funding_required && (
            <input type="number" value={form.match_funding_amount} onChange={set('match_funding_amount')} placeholder="Amount" style={{ width: 120, marginLeft: 8 }} />
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (opportunity ? 'Update' : 'Add')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
