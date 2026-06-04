import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import Modal from '../../components/Modal.jsx';

const PLATFORMS = ['linkedin', 'twitter', 'facebook'];
const STATUSES = ['draft', 'scheduled', 'published'];

export default function SocialContent() {
  const { sectors, selectedSectorId } = useSectors();
  const [posts, setPosts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [filterPlatform, setFilterPlatform] = useState('');

  function load() {
    let url = buildUrl('/social-posts', selectedSectorId);
    if (filterPlatform) url += `${url.includes('?') ? '&' : '?'}platform=${filterPlatform}`;
    apiFetch(url).then(setPosts).catch(() => setPosts([]));
  }

  useEffect(load, [selectedSectorId, filterPlatform]);

  async function deletePost(id) {
    await apiFetch(`/social-posts/${id}`, { method: 'DELETE' });
    load();
  }

  async function markPublished(id) {
    await apiFetch(`/social-posts/${id}`, {
      method: 'PUT', body: JSON.stringify({ status: 'published', published_at: new Date().toISOString() })
    });
    load();
  }

  // Group by month for calendar-like view
  const months = {};
  posts.forEach(p => {
    const date = p.scheduled_for ? new Date(p.scheduled_for) : new Date(p.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = [];
    months[key].push(p);
  });

  return (
    <div>
      <PageHeader title="Social Content">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Create Post</button>
      </PageHeader>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', fontSize: 13 }}>
          <option value="">All Platforms</option>
          {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state"><h3>No social posts yet. Create or AI-generate your first post.</h3></div>
      ) : (
        Object.keys(months).sort().reverse().map(monthKey => (
          <div key={monthKey} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {new Date(monthKey + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </h3>
            {months[monthKey].map(p => (
              <div key={p.id} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <span className={`stage-badge platform-${p.platform}`}>{p.platform}</span>
                      <span className={`stage-badge status-${p.status}`}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
                      <SectorBadge name={p.sector_name} colour={p.sector_colour} />
                      {p.ai_generated && <span style={{ fontSize: 11, background: '#EDE9FE', color: '#6D28D9', padding: '2px 6px', borderRadius: 4 }}>AI</span>}
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{p.content}</p>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                      {p.scheduled_for && <span>Scheduled: {new Date(p.scheduled_for).toLocaleDateString()}</span>}
                      {p.published_at && <span> · Published: {new Date(p.published_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                    {p.status === 'draft' && <button className="btn btn-secondary btn-small" onClick={() => setEditingPost(p)}>Edit</button>}
                    {(p.status === 'draft' || p.status === 'scheduled') && <button className="btn btn-primary btn-small" onClick={() => markPublished(p.id)}>Published</button>}
                    <button className="btn btn-danger btn-small" onClick={() => deletePost(p.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {(showForm || editingPost) && (
        <PostForm
          post={editingPost}
          sectors={sectors}
          selectedSectorId={selectedSectorId}
          onClose={() => { setShowForm(false); setEditingPost(null); }}
          onSaved={() => { setShowForm(false); setEditingPost(null); load(); }}
        />
      )}
    </div>
  );
}

function PostForm({ post, sectors, selectedSectorId, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    sector_id: post?.sector_id || selectedSectorId || '',
    platform: post?.platform || 'linkedin',
    content: post?.content || '',
    status: post?.status || 'draft',
    scheduled_for: post?.scheduled_for?.slice(0, 10) || '',
    topic: '',
  });

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleAiGenerate() {
    if (!form.sector_id) { setError('Select a sector first'); return; }
    setGenerating(true);
    setError('');
    try {
      const result = await apiFetch('/social-posts/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ sector_id: form.sector_id, platform: form.platform, topic: form.topic }),
      });
      setForm(prev => ({ ...prev, content: result.content }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        sector_id: form.sector_id,
        platform: form.platform,
        content: form.content,
        status: form.status,
        scheduled_for: form.scheduled_for || null,
        ai_generated: post?.ai_generated || generating,
      };
      if (post) {
        await apiFetch(`/social-posts/${post.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/social-posts', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={post ? 'Edit Post' : 'Create Post'} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Sector *</label>
            <select value={form.sector_id} onChange={set('sector_id')} required>
              <option value="">Select sector...</option>
              {sectors.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Platform</label>
            <select value={form.platform} onChange={set('platform')}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* AI Generate section */}
        <div style={{ padding: 12, background: '#F8FAFC', borderRadius: 'var(--radius)', marginBottom: 12, borderLeft: '3px solid var(--accent)' }}>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>Topic or theme (for AI generation)</label>
            <input value={form.topic} onChange={set('topic')} placeholder="e.g. AI contract review, ethical AI in newsrooms..." />
          </div>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleAiGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'AI Generate Post'}
          </button>
        </div>

        <div className="form-group">
          <label>Content</label>
          <textarea value={form.content} onChange={set('content')} rows={8} placeholder="Post content..." style={{ lineHeight: 1.6 }} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Scheduled For</label>
            <input type="date" value={form.scheduled_for} onChange={set('scheduled_for')} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (post ? 'Update' : 'Save Post')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
