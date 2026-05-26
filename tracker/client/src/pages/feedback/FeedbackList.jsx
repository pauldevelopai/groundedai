import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const CATEGORY_COLORS = { bug: '#EF4444', feature: '#6366F1', improvement: '#10B981', ui: '#F59E0B' };
const CATEGORY_LABELS = { bug: 'Bug', feature: 'Feature', improvement: 'Improvement', ui: 'UI/Design' };
const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', done: 'Done', dismissed: 'Dismissed' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

export default function FeedbackList() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(null);
  const [masterPrompt, setMasterPrompt] = useState('');
  const [generatingMaster, setGeneratingMaster] = useState(false);

  function load() {
    const url = filter === 'all' ? '/feedback' : `/feedback?status=${filter}`;
    apiFetch(url).then(setItems).catch(() => setItems([]));
  }

  useEffect(load, [filter]);

  async function updateStatus(id, status) {
    await apiFetch(`/feedback/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    load();
  }

  async function generatePrompt(id) {
    setGenerating(id);
    try {
      const result = await apiFetch(`/feedback/${id}/generate-prompt`, { method: 'POST' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerating(null);
    }
  }

  async function deleteFeedback(id) {
    await apiFetch(`/feedback/${id}`, { method: 'DELETE' });
    load();
  }

  async function generateMasterPrompt() {
    setGeneratingMaster(true);
    try {
      const result = await apiFetch('/feedback/generate-master-prompt', { method: 'POST', timeout: 300000 });
      setMasterPrompt(result.prompt);
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingMaster(false);
    }
  }

  function copyPrompt(text) {
    navigator.clipboard.writeText(text);
  }

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'in_progress').length;

  return (
    <div>
      <PageHeader title="Feedback">
        {pendingCount > 0 && (
          <button className="btn btn-primary" onClick={generateMasterPrompt} disabled={generatingMaster}>
            {generatingMaster ? 'Generating...' : `Generate Master Prompt (${pendingCount} items)`}
          </button>
        )}
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        All feedback submitted via the feedback bubble. Generate Claude Code prompts from any item, or combine all unaddressed items into one master prompt.
      </p>

      {masterPrompt && (
        <div className="card" style={{ marginBottom: 20, padding: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Master Claude Code Prompt ({pendingCount} items)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => copyPrompt(masterPrompt)} className="btn btn-primary btn-small">Copy to Clipboard</button>
              <button onClick={() => setMasterPrompt('')} className="btn btn-secondary btn-small">Dismiss</button>
            </div>
          </div>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace', lineHeight: 1.6, background: '#F8FAFC', padding: 16, borderRadius: 6, maxHeight: 400, overflowY: 'auto' }}>
            {masterPrompt}
          </pre>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'pending', 'in_progress', 'done', 'dismissed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`btn btn-small ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty-state"><h3>No feedback yet. Use the yellow bubble to submit feedback from any page.</h3></div>
      ) : (
        items.map(fb => (
          <div key={fb.id} className="card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: CATEGORY_COLORS[fb.category] || '#6366F1', color: 'white',
                }}>
                  {CATEGORY_LABELS[fb.category] || fb.category}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {PRIORITY_LABELS[fb.priority]} priority
                </span>
                {fb.page && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fb.page}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <select
                  value={fb.status}
                  onChange={e => updateStatus(fb.id, e.target.value)}
                  style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: 4 }}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {fb.status !== 'done' && (
                  <button className="btn btn-small" onClick={() => updateStatus(fb.id, 'done')} style={{ fontSize: 11, padding: '2px 8px', background: '#10B981', color: 'white', border: 'none' }}>✓ Done</button>
                )}
                <button className="btn btn-danger btn-small" onClick={() => deleteFeedback(fb.id)} style={{ fontSize: 11, padding: '2px 8px' }}>x</button>
              </div>
            </div>

            <div style={{ fontSize: 14, marginBottom: 8 }}>{fb.content}</div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {new Date(fb.created_at).toLocaleString()}
              {fb.user_name && ` by ${fb.user_name}`}
            </div>

            {fb.claude_prompt ? (
              <div style={{ marginTop: 8, padding: 12, background: '#F1F5F9', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Claude Code Prompt</span>
                  <button
                    onClick={() => copyPrompt(fb.claude_prompt)}
                    className="btn btn-secondary btn-small"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    Copy
                  </button>
                </div>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace', lineHeight: 1.5 }}>
                  {fb.claude_prompt}
                </pre>
              </div>
            ) : (
              <button
                onClick={() => generatePrompt(fb.id)}
                className="btn btn-primary btn-small"
                disabled={generating === fb.id}
                style={{ fontSize: 12 }}
              >
                {generating === fb.id ? 'Generating...' : 'Generate Claude Code Prompt'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
