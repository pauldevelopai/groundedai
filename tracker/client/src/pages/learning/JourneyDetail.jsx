import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import AiBadge from '../../components/AiBadge.jsx';
import Modal from '../../components/Modal.jsx';

const STATUS_COLOURS = { assigned: '#94A3B8', in_progress: '#60A5FA', submitted: '#F59E0B', approved: '#10B981', revision_needed: '#EF4444' };
const DIFFICULTY_COLOURS = { beginner: '#10B981', intermediate: '#F59E0B', advanced: '#EF4444' };

export default function JourneyDetail() {
  const { contactId } = useParams();
  const [journey, setJourney] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [reviewingTask, setReviewingTask] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: 'approved', review_notes: '', review_score: 4 });
  const [generating, setGenerating] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [aiAssessment, setAiAssessment] = useState('');

  function load() {
    apiFetch(`/learning-journeys/contact/${contactId}`).then(j => {
      setJourney(j);
      setTasks(j.tasks || []);
    }).catch(() => setJourney(null));
  }

  useEffect(load, [contactId]);

  async function generateTasks() {
    setGenerating(true);
    try {
      const result = await apiFetch('/learning-tasks/generate', {
        method: 'POST', body: JSON.stringify({ contact_id: contactId, skill_level: journey?.skill_level || 'beginner' })
      });
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function runAiReview(taskId) {
    try {
      const result = await apiFetch(`/learning-tasks/${taskId}/ai-review`, { method: 'POST' });
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function submitReview() {
    try {
      await apiFetch(`/learning-tasks/${reviewingTask.id}/review`, {
        method: 'POST', body: JSON.stringify(reviewForm)
      });
      setReviewingTask(null);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function aiAssess() {
    if (!journey) return;
    setAssessing(true);
    try {
      const result = await apiFetch(`/learning-journeys/${journey.id}/ai-assess`, { method: 'POST' });
      setAiAssessment(result.assessment);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!journey) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No learning journey found for this contact. <Link to={`/contacts/${contactId}`}>Go to contact</Link> and generate tasks.</div>;

  const approved = tasks.filter(t => t.status === 'approved').length;
  const submitted = tasks.filter(t => t.status === 'submitted').length;
  const progress = tasks.length > 0 ? Math.round((approved / tasks.length) * 100) : 0;

  return (
    <div>
      <Link to="/learning" className="back-link">← Learning</Link>
      <div className="detail-header">
        <h1>{journey.first_name} {journey.last_name}</h1>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{journey.org_name} · {journey.job_title || 'Professional'}</span>
      </div>

      {/* Progress + actions */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Progress</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div style={{ width: 200, height: 8, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#6366F1', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{progress}%</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {approved} approved · {submitted} submitted · {tasks.length} total · Level: {journey.skill_level}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-small" onClick={generateTasks} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Tasks'}
            </button>
            <button className="btn btn-secondary btn-small" onClick={aiAssess} disabled={assessing}>
              {assessing ? 'Assessing...' : 'AI Assessment'}
            </button>
          </div>
        </div>
      </div>

      {/* AI Assessment */}
      {(aiAssessment || journey.ai_notes) && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--ai-purple)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><AiBadge /> <span style={{ fontWeight: 600 }}>AI Assessment</span></div>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aiAssessment || journey.ai_notes}</div>
        </div>
      )}

      {/* Task list */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Tasks ({tasks.length})</h2>
      {tasks.length === 0 ? (
        <div className="empty-state"><h3>No tasks yet. Click "Generate Tasks" to create personalised learning tasks.</h3></div>
      ) : (
        tasks.map(t => (
          <div key={t.id} className="card" style={{
            marginBottom: 8, padding: 14,
            borderLeft: `3px solid ${STATUS_COLOURS[t.status] || '#94A3B8'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: STATUS_COLOURS[t.status], color: 'white' }}>{t.status.replace('_', ' ')}</span>
                  <span style={{ fontSize: 10, color: DIFFICULTY_COLOURS[t.difficulty] }}>{t.difficulty}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{t.task_type}</span>
                </div>
                {t.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{t.description}</div>}
                {t.outcome_title && <div style={{ fontSize: 11, color: 'var(--accent)' }}>Outcome: {t.outcome_title}</div>}

                {/* Submission */}
                {t.submission_text && (
                  <div style={{ marginTop: 8, padding: 10, background: '#F8FAFC', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Submission</div>
                    <div style={{ fontSize: 13 }}>{t.submission_text}</div>
                    {t.submission_url && <a href={t.submission_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{t.submission_url}</a>}
                  </div>
                )}

                {/* AI Review */}
                {t.ai_review && (
                  <div style={{ marginTop: 8, padding: 10, background: '#F5F3FF', borderRadius: 'var(--radius)', border: '1px solid #E0D7FF' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ai-purple)', marginBottom: 4 }}>AI Review</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.ai_review.replace(/^SCORE:\s*\d\s*---\s*/i, '')}</div>
                  </div>
                )}

                {/* Review notes */}
                {t.review_notes && (
                  <div style={{ marginTop: 8, padding: 10, background: '#F0FDF4', borderRadius: 'var(--radius)', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
                      Review {t.review_score ? `(${t.review_score}/5)` : ''}
                    </div>
                    <div style={{ fontSize: 13 }}>{t.review_notes}</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 12 }}>
                {t.status === 'submitted' && (
                  <>
                    <button className="btn btn-primary btn-small" onClick={() => { setReviewingTask(t); setReviewForm({ status: 'approved', review_notes: '', review_score: 4 }); }}>Review</button>
                    <button className="btn btn-secondary btn-small" onClick={() => runAiReview(t.id)}>AI Review</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Review Modal */}
      {reviewingTask && (
        <Modal title={`Review: ${reviewingTask.title}`} onClose={() => setReviewingTask(null)}>
          <div className="form-group">
            <label>Decision</label>
            <select value={reviewForm.status} onChange={e => setReviewForm(prev => ({ ...prev, status: e.target.value }))}>
              <option value="approved">Approve</option>
              <option value="revision_needed">Request Revision</option>
            </select>
          </div>
          <div className="form-group">
            <label>Score (1-5)</label>
            <select value={reviewForm.review_score} onChange={e => setReviewForm(prev => ({ ...prev, review_score: parseInt(e.target.value) }))}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Feedback Notes</label>
            <textarea value={reviewForm.review_notes} onChange={e => setReviewForm(prev => ({ ...prev, review_notes: e.target.value }))} rows={4} placeholder="What did they do well? What could improve?" />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={submitReview}>Submit Review</button>
            <button className="btn btn-secondary" onClick={() => setReviewingTask(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
