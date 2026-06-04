import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../hooks/useApi.js';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'ui', label: 'UI/Design' },
];

export default function FeedbackBubble() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('feature');
  const [priority, setPriority] = useState('medium');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ content, category, priority, page: location.pathname }),
      });
      setSent(true);
      setContent('');
      setTimeout(() => { setSent(false); setOpen(false); }, 1500);
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 80, right: 24, width: 44, height: 44,
          borderRadius: '50%', background: '#F59E0B', color: 'white', border: 'none',
          fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Submit feedback"
      >
        !
      </button>

      {/* Feedback form */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 130, right: 24, width: 320,
          background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 999, padding: 20, border: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Submit Feedback</h4>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-secondary)' }}>x</button>
          </div>

          {sent ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--success)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>Submitted</div>
              <div style={{ fontSize: 13 }}>View all feedback in the sidebar</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                        border: '1px solid var(--border-color)',
                        background: category === c.value ? 'var(--accent)' : 'white',
                        color: category === c.value ? 'white' : 'var(--text-primary)',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Describe what you'd like changed..."
                rows={4}
                style={{ width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
                required
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <select value={priority} onChange={e => setPriority(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 12 }}>
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                </select>
                <button type="submit" disabled={sending} style={{
                  padding: '6px 16px', background: 'var(--accent)', color: 'white',
                  border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                }}>
                  {sending ? '...' : 'Submit'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                Page: {location.pathname}
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
