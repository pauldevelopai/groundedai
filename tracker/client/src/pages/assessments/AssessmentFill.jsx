import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

export default function AssessmentFill({ assessment, onSaved }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/assessment-questions?sector_id=${assessment.sector_id}`)
      .then(qs => {
        setQuestions(qs);
        // Pre-fill from existing responses
        const existing = {};
        if (assessment.responses?.length) {
          for (const r of assessment.responses) {
            existing[r.question_id] = r.answer;
          }
        }
        setAnswers(existing);
      })
      .catch(() => setQuestions([]));
  }, [assessment.sector_id]);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      const responses = questions.map(q => ({
        question_id: q.id,
        question_text: q.question_text,
        answer: answers[q.id] || '',
      }));
      await apiFetch(`/needs-assessments/${assessment.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          responses,
          status: 'completed',
          submitted_at: new Date().toISOString(),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      {questions.map((q, i) => (
        <div key={q.id} className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Question {i + 1}</div>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{q.question_text}</div>
          {q.question_type === 'select' && q.options ? (
            <select
              value={answers[q.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14 }}
            >
              <option value="">Select...</option>
              {q.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : q.question_type === 'textarea' ? (
            <textarea
              value={answers[q.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14, minHeight: 80 }}
            />
          ) : q.question_type === 'number' ? (
            <input
              type="number"
              value={answers[q.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14 }}
            />
          ) : (
            <input
              type="text"
              value={answers[q.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14 }}
            />
          )}
        </div>
      ))}
      {questions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Complete'}
          </button>
        </div>
      )}
    </div>
  );
}
