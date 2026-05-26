import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const STATUS_LABELS = { assigned: 'To Do', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Complete', revision_needed: 'Needs Revision' };
const STATUS_COLOURS = { assigned: '#94A3B8', in_progress: '#60A5FA', submitted: '#F59E0B', approved: '#10B981', revision_needed: '#EF4444' };

async function portalFetch(path, token, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`/api/portal${path}${sep}token=${token}`, {
    ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

export default function ParticipantPortal() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(null);
  const [submitForm, setSubmitForm] = useState({ text: '', url: '' });

  function load() {
    if (!token) return;
    portalFetch('/me', token).then(setProfile).catch(e => setError(e.message));
    portalFetch('/tasks', token).then(setTasks).catch(() => setTasks([]));
    portalFetch('/progress', token).then(setProgress).catch(() => setProgress(null));
  }

  useEffect(load, [token]);

  async function handleSubmit(taskId) {
    if (!submitForm.text.trim() && !submitForm.url.trim()) return;
    try {
      await portalFetch(`/tasks/${taskId}/submit`, token, {
        method: 'POST', body: JSON.stringify({ submission_text: submitForm.text, submission_url: submitForm.url }),
      });
      setSubmitting(null);
      setSubmitForm({ text: '', url: '' });
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  if (!token) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Holly Learning Portal</h1>
        <p style={{ color: '#64748B' }}>Access token required. Please use the link provided by your trainer.</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#EF4444' }}>Access Denied</h1>
        <p style={{ color: '#64748B' }}>{error}</p>
      </div>
    </div>
  );

  const activeTasks = tasks.filter(t => t.status !== 'approved');
  const completedTasks = tasks.filter(t => t.status === 'approved');

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {/* Header */}
      <div style={{ background: '#1E1E2E', color: 'white', padding: '20px 32px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>Holly Learning Portal · Develop AI</div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Welcome, {profile?.name || 'Participant'}</h1>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>{profile?.organisation || ''} · {profile?.job_title || ''}</div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px' }}>
        {/* Progress bar */}
        {progress && (
          <div style={{ background: 'white', borderRadius: 8, padding: 20, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Your Progress</span>
              <span style={{ fontWeight: 700, fontSize: 18, color: '#6366F1' }}>{progress.progress}%</span>
            </div>
            <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${progress.progress}%`, height: '100%', background: '#6366F1', borderRadius: 5, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, color: '#64748B' }}>
              <span>{progress.approved} completed</span>
              <span>{progress.submitted} submitted</span>
              <span>{progress.assigned + (progress.revision_needed || 0)} remaining</span>
            </div>
          </div>
        )}

        {/* Active Tasks */}
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Your Tasks</h2>
        {activeTasks.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 8, padding: 24, textAlign: 'center', color: '#64748B' }}>
            All tasks completed! Great work. Your trainer will assign more soon.
          </div>
        ) : (
          activeTasks.map(t => (
            <div key={t.id} style={{
              background: 'white', borderRadius: 8, padding: 18, marginBottom: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              borderLeft: `4px solid ${STATUS_COLOURS[t.status]}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: STATUS_COLOURS[t.status], color: 'white' }}>
                      {STATUS_LABELS[t.status]}
                    </span>
                  </div>
                  {t.description && <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5, marginBottom: 6 }}>{t.description}</div>}
                  {t.due_date && <div style={{ fontSize: 12, color: '#94A3B8' }}>Due: {new Date(t.due_date).toLocaleDateString()}</div>}

                  {/* Review feedback */}
                  {t.status === 'revision_needed' && t.review_notes && (
                    <div style={{ marginTop: 8, padding: 10, background: '#FEF2F2', borderRadius: 6, fontSize: 13, color: '#991B1B' }}>
                      <strong>Feedback:</strong> {t.review_notes}
                    </div>
                  )}

                  {/* Submission area */}
                  {submitting === t.id ? (
                    <div style={{ marginTop: 10, padding: 12, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                      <textarea value={submitForm.text} onChange={e => setSubmitForm(prev => ({ ...prev, text: e.target.value }))}
                        placeholder="Describe what you did, paste your work, or explain your approach..."
                        rows={4} style={{ width: '100%', padding: 10, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 14, resize: 'vertical' }} />
                      <input value={submitForm.url} onChange={e => setSubmitForm(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="Link to your work (optional)"
                        style={{ width: '100%', padding: 8, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, marginTop: 8 }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => handleSubmit(t.id)}
                          style={{ padding: '8px 16px', background: '#6366F1', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                          Submit
                        </button>
                        <button onClick={() => setSubmitting(null)}
                          style={{ padding: '8px 16px', background: '#E5E7EB', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : t.status === 'submitted' ? (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#F59E0B', fontWeight: 500 }}>Submitted — awaiting review</div>
                  ) : null}
                </div>
                {(t.status === 'assigned' || t.status === 'in_progress' || t.status === 'revision_needed') && submitting !== t.id && (
                  <button onClick={() => { setSubmitting(t.id); setSubmitForm({ text: '', url: '' }); }}
                    style={{ padding: '8px 14px', background: '#6366F1', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Submit Work
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#10B981' }}>Completed ({completedTasks.length})</h2>
            {completedTasks.map(t => (
              <div key={t.id} style={{
                background: 'white', borderRadius: 8, padding: 14, marginBottom: 6,
                borderLeft: '4px solid #10B981', opacity: 0.8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{t.title}</span>
                  {t.review_score && <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>{t.review_score}/5</span>}
                </div>
                {t.review_notes && <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{t.review_notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
