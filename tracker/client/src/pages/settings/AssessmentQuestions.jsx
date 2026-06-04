import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import Modal from '../../components/Modal.jsx';

const QUESTION_TYPES = ['text', 'textarea', 'select', 'number'];

export default function AssessmentQuestions() {
  const { sectors } = useSectors();
  const [sectorId, setSectorId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editing, setEditing] = useState(null); // null, 'new', or question object

  function load() {
    if (!sectorId) { setQuestions([]); return; }
    apiFetch(`/assessment-questions/all?sector_id=${sectorId}`)
      .then(setQuestions).catch(() => setQuestions([]));
  }

  useEffect(load, [sectorId]);

  // Auto-select first sector
  useEffect(() => {
    if (sectors.length > 0 && !sectorId) setSectorId(sectors[0].id);
  }, [sectors]);

  return (
    <div>
      <PageHeader title="Assessment Questions">
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!sectorId}>+ Add Question</button>
      </PageHeader>

      <div className="form-group" style={{ maxWidth: 300, marginBottom: 20 }}>
        <label>Sector</label>
        <select value={sectorId} onChange={e => setSectorId(e.target.value)}>
          <option value="">Select sector...</option>
          {sectors.filter(s => s.is_active).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {questions.length === 0 && sectorId ? (
        <div className="empty-state"><h3>No questions for this sector yet.</h3></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Type</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id} style={{ opacity: q.is_active ? 1 : 0.5 }}>
                <td>{q.order_index}</td>
                <td style={{ maxWidth: 400 }}>{q.question_text}</td>
                <td><span className="stage-badge stage-active">{q.question_type}</span></td>
                <td>{q.is_active ? 'Yes' : 'No'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditing(q)}>Edit</button>
                    {q.is_active && (
                      <button className="btn btn-danger btn-small" onClick={async () => {
                        await apiFetch(`/assessment-questions/${q.id}`, { method: 'DELETE' });
                        load();
                      }}>Disable</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <QuestionForm
          question={editing === 'new' ? null : editing}
          sectorId={sectorId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function QuestionForm({ question, sectorId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    question_text: question?.question_text || '',
    question_type: question?.question_type || 'text',
    options: question?.options ? question.options.join(', ') : '',
    order_index: question?.order_index ?? 0,
    is_active: question?.is_active !== false,
  });

  function set(field) {
    return e => {
      const val = field === 'is_active' ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        sector_id: sectorId,
        question_text: form.question_text,
        question_type: form.question_type,
        options: form.question_type === 'select' && form.options
          ? form.options.split(',').map(s => s.trim()).filter(Boolean)
          : null,
        order_index: parseInt(form.order_index) || 0,
        is_active: form.is_active,
      };
      if (question) {
        await apiFetch(`/assessment-questions/${question.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/assessment-questions', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={question ? 'Edit Question' : 'Add Question'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Question Text *</label>
          <textarea value={form.question_text} onChange={set('question_text')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select value={form.question_type} onChange={set('question_type')}>
              {QUESTION_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Order</label>
            <input type="number" value={form.order_index} onChange={set('order_index')} min="0" />
          </div>
        </div>
        {form.question_type === 'select' && (
          <div className="form-group">
            <label>Options (comma-separated)</label>
            <input value={form.options} onChange={set('options')} placeholder="Option 1, Option 2, Option 3" />
          </div>
        )}
        {question && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} id="q_active" />
            <label htmlFor="q_active" style={{ marginBottom: 0 }}>Active</label>
          </div>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (question ? 'Update' : 'Add')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
