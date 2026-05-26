import { useState, useEffect } from 'react';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import Modal from '../../components/Modal.jsx';

const PARTICIPANT_STATUSES = ['enrolled', 'attending', 'completed', 'dropped'];

export default function ParticipantForm({ participant, cohortId, sectorId, onClose, onSaved }) {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contact_id: participant?.contact_id || '',
    status: participant?.status || 'enrolled',
    feedback_score: participant?.feedback_score || '',
    feedback_notes: participant?.feedback_notes || '',
    cpd_certificate_issued: participant?.cpd_certificate_issued || false,
    completion_date: participant?.completion_date?.slice(0, 10) || '',
  });

  useEffect(() => {
    if (!participant) {
      apiFetch(buildUrl('/contacts', sectorId))
        .then(setContacts).catch(() => setContacts([]));
    }
  }, [sectorId, participant]);

  function set(field) {
    return e => {
      const val = field === 'cpd_certificate_issued' ? e.target.checked : e.target.value;
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
        feedback_score: form.feedback_score ? parseInt(form.feedback_score) : null,
        completion_date: form.completion_date || null,
      };
      if (participant) {
        await apiFetch(`/cohorts/${cohortId}/participants/${participant.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch(`/cohorts/${cohortId}/participants`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={participant ? 'Edit Participant' : 'Add Participant'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        {!participant && (
          <div className="form-group">
            <label>Contact *</label>
            <select value={form.contact_id} onChange={set('contact_id')} required>
              <option value="">Select contact...</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.email || 'no email'}</option>
              ))}
            </select>
          </div>
        )}
        {participant && (
          <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
            {participant.first_name} {participant.last_name}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              {PARTICIPANT_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Completion Date</label>
            <input type="date" value={form.completion_date} onChange={set('completion_date')} />
          </div>
        </div>
        {participant && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>Feedback Score (1-10)</label>
                <input type="number" value={form.feedback_score} onChange={set('feedback_score')} min="1" max="10" />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" checked={form.cpd_certificate_issued} onChange={set('cpd_certificate_issued')} id="cpd_cert" />
                <label htmlFor="cpd_cert" style={{ marginBottom: 0 }}>CPD Certificate Issued</label>
              </div>
            </div>
            <div className="form-group">
              <label>Feedback Notes</label>
              <textarea value={form.feedback_notes} onChange={set('feedback_notes')} />
            </div>
          </>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (participant ? 'Update' : 'Add')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
