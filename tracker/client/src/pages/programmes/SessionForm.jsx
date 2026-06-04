import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

export default function SessionForm({ session, cohortId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: session?.title || '',
    session_date: session?.session_date?.slice(0, 10) || '',
    start_time: session?.start_time?.slice(0, 5) || '',
    end_time: session?.end_time?.slice(0, 5) || '',
    location: session?.location || '',
    notes: session?.notes || '',
    order_index: session?.order_index ?? '',
  });

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
        session_date: form.session_date || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        order_index: form.order_index !== '' ? parseInt(form.order_index) : 0,
      };
      if (session) {
        await apiFetch(`/cohorts/${cohortId}/sessions/${session.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/cohorts/${cohortId}/sessions`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={session ? 'Edit Session' : 'Add Session'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required placeholder="e.g. Session 1, Day 1 Morning" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.session_date} onChange={set('session_date')} />
          </div>
          <div className="form-group">
            <label>Order</label>
            <input type="number" value={form.order_index} onChange={set('order_index')} min="0" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Start Time</label>
            <input type="time" value={form.start_time} onChange={set('start_time')} />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input type="time" value={form.end_time} onChange={set('end_time')} />
          </div>
        </div>
        <div className="form-group">
          <label>Location</label>
          <input value={form.location} onChange={set('location')} placeholder="URL for online, room for in-person" />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (session ? 'Update' : 'Add')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
