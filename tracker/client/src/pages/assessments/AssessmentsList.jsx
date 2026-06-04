import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';
import AssessmentForm from './AssessmentForm.jsx';

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', completed: 'Completed', analysed: 'Analysed' };
const QUESTION_TYPES = ['text', 'textarea', 'select', 'number'];

export default function AssessmentsList() {
  const navigate = useNavigate();
  const { sectors, selectedSectorId } = useSectors();
  const [assessments, setAssessments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('assessments');

  // Questions state
  const [questionSectorId, setQuestionSectorId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editingQuestion, setEditingQuestion] = useState(null);

  function loadAssessments() {
    apiFetch(buildUrl('/needs-assessments', selectedSectorId))
      .then(setAssessments).catch(() => setAssessments([]));
  }

  function loadQuestions() {
    if (!questionSectorId) { setQuestions([]); return; }
    apiFetch(`/assessment-questions/all?sector_id=${questionSectorId}`)
      .then(setQuestions).catch(() => setQuestions([]));
  }

  useEffect(loadAssessments, [selectedSectorId]);
  useEffect(loadQuestions, [questionSectorId]);
  useEffect(() => {
    if (sectors.length > 0 && !questionSectorId) setQuestionSectorId(sectors[0].id);
  }, [sectors]);

  const columns = [
    { key: 'organisation_name', label: 'Organisation', render: row => row.organisation_name || '—' },
    { key: 'contact', label: 'Contact', render: row => row.contact_first_name ? `${row.contact_first_name} ${row.contact_last_name}` : '—' },
    { key: 'sector_name', label: 'Sector', render: row => <SectorBadge name={row.sector_name} colour={row.sector_colour} /> },
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
    )},
    { key: 'recommended_tier', label: 'Tier', render: row => row.recommended_tier ? (
      <span className="stage-badge stage-active">{row.recommended_tier.charAt(0).toUpperCase() + row.recommended_tier.slice(1)}</span>
    ) : '—' },
    { key: 'created_at', label: 'Created', render: row => new Date(row.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title="Needs Assessments">
        {activeTab === 'assessments' && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Assessment</button>
        )}
        {activeTab === 'questions' && (
          <button className="btn btn-primary" onClick={() => setEditingQuestion('new')} disabled={!questionSectorId}>+ Add Question</button>
        )}
      </PageHeader>

      <div className="tabs">
        <button className={`tab ${activeTab === 'assessments' ? 'active' : ''}`} onClick={() => setActiveTab('assessments')}>
          Assessments ({assessments.length})
        </button>
        <button className={`tab ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>
          Question Sets ({questions.length})
        </button>
      </div>

      {activeTab === 'assessments' && (
        <>
          <DataTable
            columns={columns}
            data={assessments}
            onRowClick={row => navigate(`/assessments/${row.id}`)}
            emptyMessage="No assessments yet. Create your first needs assessment to get started."
          />
          {showForm && (
            <AssessmentForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAssessments(); }} />
          )}
        </>
      )}

      {activeTab === 'questions' && (
        <div>
          <div className="form-group" style={{ maxWidth: 300, marginBottom: 20 }}>
            <label>Sector</label>
            <select value={questionSectorId} onChange={e => setQuestionSectorId(e.target.value)}>
              <option value="">Select sector...</option>
              {sectors.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {questions.length === 0 && questionSectorId ? (
            <div className="empty-state"><h3>No questions for this sector yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Question</th><th>Type</th><th>Active</th><th></th></tr>
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
                        <button className="btn btn-secondary btn-small" onClick={() => setEditingQuestion(q)}>Edit</button>
                        {q.is_active && (
                          <button className="btn btn-danger btn-small" onClick={async () => {
                            await apiFetch(`/assessment-questions/${q.id}`, { method: 'DELETE' });
                            loadQuestions();
                          }}>Disable</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {editingQuestion && (
            <QuestionForm
              question={editingQuestion === 'new' ? null : editingQuestion}
              sectorId={questionSectorId}
              onClose={() => setEditingQuestion(null)}
              onSaved={() => { setEditingQuestion(null); loadQuestions(); }}
            />
          )}
        </div>
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
          ? form.options.split(',').map(s => s.trim()).filter(Boolean) : null,
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
              {QUESTION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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
