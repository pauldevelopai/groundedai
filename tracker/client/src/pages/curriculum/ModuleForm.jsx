import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

export default function ModuleForm({ module, courseId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: module?.title || '',
    description: module?.description || '',
    order_index: module?.order_index ?? '',
    duration_minutes: module?.duration_minutes || '',
    content: module?.content || '',
    content_url: module?.content_url || '',
    video_url: module?.video_url || '',
    feedback_notes: module?.feedback_notes || '',
    effectiveness_rating: module?.effectiveness_rating || '',
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
        order_index: form.order_index !== '' ? parseInt(form.order_index) : 0,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        effectiveness_rating: form.effectiveness_rating ? parseInt(form.effectiveness_rating) : null,
      };
      if (module) {
        await apiFetch(`/courses/${courseId}/modules/${module.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={module ? 'Edit Module' : 'Add Module'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Title *</label>
          <input value={form.title} onChange={set('title')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Order</label>
            <input type="number" value={form.order_index} onChange={set('order_index')} min="0" />
          </div>
          <div className="form-group">
            <label>Duration (minutes)</label>
            <input type="number" value={form.duration_minutes} onChange={set('duration_minutes')} min="1" />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={set('description')} rows={3} />
        </div>
        <div className="form-group">
          <label>Content / Outline</label>
          <textarea value={form.content} onChange={set('content')} rows={6} placeholder="Module content, learning objectives, key topics..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Content URL (slides/docs)</label>
            <input value={form.content_url} onChange={set('content_url')} />
          </div>
          <div className="form-group">
            <label>Video URL</label>
            <input value={form.video_url} onChange={set('video_url')} />
          </div>
        </div>
        <div className="form-group">
          <label>Trainer Feedback Notes</label>
          <textarea value={form.feedback_notes} onChange={set('feedback_notes')} rows={3} placeholder="What worked, what didn't, suggestions for next time..." />
        </div>
        <div className="form-group">
          <label>Effectiveness Rating (1-5)</label>
          <select value={form.effectiveness_rating} onChange={set('effectiveness_rating')}>
            <option value="">Not rated</option>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} — {['Poor','Below Average','Average','Good','Excellent'][n-1]}</option>)}
          </select>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (module ? 'Update' : 'Add')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
