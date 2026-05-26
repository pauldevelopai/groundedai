import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const CATEGORIES = [
  'course_outcome', 'assessment_insight', 'industry_trend', 'tool_technique',
  'regulatory', 'client_insight', 'content_effectiveness', 'proposal_outcome', 'feedback_pattern',
];

const CATEGORY_LABELS = {
  course_outcome: 'Course Outcome', assessment_insight: 'Assessment Insight',
  industry_trend: 'Industry Trend', tool_technique: 'Tool/Technique',
  regulatory: 'Regulatory', client_insight: 'Client Insight',
  content_effectiveness: 'Content Effectiveness', proposal_outcome: 'Proposal Outcome',
  feedback_pattern: 'Feedback Pattern',
};

export default function KnowledgeBase() {
  const { selectedSectorId } = useSectors();
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    let url = `/knowledge?`;
    if (selectedSectorId) url += `sector_id=${selectedSectorId}&`;
    if (categoryFilter) url += `category=${categoryFilter}&`;
    apiFetch(url).then(setEntries).catch(() => setEntries([]));
    apiFetch('/knowledge/stats').then(setStats).catch(() => {});
  }

  useEffect(load, [selectedSectorId, categoryFilter]);

  async function search() {
    if (!searchQuery.trim()) { load(); return; }
    const results = await apiFetch(`/knowledge/search?q=${encodeURIComponent(searchQuery)}${selectedSectorId ? `&sector_id=${selectedSectorId}` : ''}`);
    setEntries(results);
  }

  async function toggleVerify(entry) {
    await apiFetch(`/knowledge/${entry.id}`, {
      method: 'PUT', body: JSON.stringify({ is_verified: !entry.is_verified }),
    });
    load();
  }

  const confidenceColor = v => v >= 0.8 ? '#10B981' : v >= 0.5 ? '#F59E0B' : '#EF4444';

  return (
    <div>
      <PageHeader title="Knowledge Base">
        <AiBadge />
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Knowledge</button>
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: -8 }}>
        Verified facts and insights that Holly uses as context in every AI response. Promoted from Intelligence, uploaded documents, or added manually. This is Holly's long-term memory.
      </p>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
          <div className="stat-card"><div className="stat-label">Verified</div><div className="stat-value">{stats.verified}</div></div>
          <div className="stat-card"><div className="stat-label">This Week</div><div className="stat-value">{stats.recent}</div></div>
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search knowledge..." onKeyDown={e => e.key === 'Enter' && search()}
          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}
        />
        <button className="btn btn-primary btn-small" onClick={search}>Search</button>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="empty-state"><h3>No knowledge entries found.</h3></div>
      ) : (
        entries.map(e => (
          <div key={e.id} className="card" style={{ marginBottom: 6, padding: 14, borderLeft: `3px solid ${e.is_verified ? '#10B981' : '#94A3B8'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span className="stage-badge" style={{ fontSize: 10 }}>{CATEGORY_LABELS[e.category] || e.category}</span>
                  {e.sector_name && <SectorBadge name={e.sector_name} />}
                  <span style={{ fontSize: 11, color: confidenceColor(parseFloat(e.confidence)), fontWeight: 600 }}>
                    {Math.round(parseFloat(e.confidence) * 100)}%
                  </span>
                  {e.is_verified && <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>Verified</span>}
                  {e.usage_count > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Used {e.usage_count}x</span>}
                </div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{e.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {e.content.slice(0, 250)}{e.content.length > 250 ? '...' : ''}
                </div>
                {e.source_description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Source: {e.source_description}
                  </div>
                )}
                {e.tags && e.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {e.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', background: '#F1F5F9', borderRadius: 10 }}>{t}</span>)}
                  </div>
                )}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => toggleVerify(e)} style={{ fontSize: 11, marginLeft: 8 }}>
                {e.is_verified ? 'Unverify' : 'Verify'}
              </button>
            </div>
          </div>
        ))
      )}

      {showAdd && <AddKnowledgeModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddKnowledgeModal({ onClose, onSaved }) {
  const { sectors } = useSectors();
  const [form, setForm] = useState({ category: 'client_insight', title: '', content: '', sector_id: '', tags: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        }),
      });
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add Knowledge</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Content *</label>
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={5} required />
          </div>
          <div className="form-group">
            <label>Sector</label>
            <select value={form.sector_id} onChange={e => setForm(p => ({ ...p, sector_id: e.target.value }))}>
              <option value="">Cross-sector</option>
              {sectors.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="e.g. legal, popia, training" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
