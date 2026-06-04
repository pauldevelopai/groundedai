import { useState, useEffect } from 'react';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const CATEGORY_LABELS = {
  ai_tool: 'AI Tool', technique: 'Technique', framework: 'Framework',
  regulation: 'Regulation', use_case: 'Use Case', training_trend: 'Training Trend',
  competitor_move: 'Competitor',
};

const KNOWLEDGE_TAGS = [
  { value: 'research', label: 'Research', color: '#6366F1' },
  { value: 'tools', label: 'Tools', color: '#10B981' },
  { value: 'policy', label: 'Policy', color: '#EF4444' },
  { value: 'ethics', label: 'Ethics', color: '#8B5CF6' },
  { value: 'industry_news', label: 'Industry News', color: '#94A3B8' },
  { value: 'curriculum', label: 'Curriculum', color: '#3B82F6' },
  { value: 'security', label: 'Security', color: '#F59E0B' },
  { value: 'legal', label: 'Legal', color: '#EC4899' },
];

export default function IntelligenceList() {
  const { selectedSectorId } = useSectors();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [taggingId, setTaggingId] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);

  function load() {
    let url = '/intelligence?';
    if (selectedSectorId) url += `sector_id=${selectedSectorId}&`;
    if (filter === 'actionable') url += 'actionable=true&';
    apiFetch(url).then(setItems).catch(() => setItems([]));
  }

  useEffect(load, [selectedSectorId, filter]);

  function startTagging(id) {
    setTaggingId(id);
    setSelectedTags([]);
  }

  function toggleTag(tag) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function confirmPromote(id) {
    await apiFetch(`/intelligence/${id}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({ tags: selectedTags }),
    });
    setTaggingId(null);
    setSelectedTags([]);
    load();
  }

  async function markReviewed(id, action) {
    await apiFetch(`/intelligence/${id}`, { method: 'PUT', body: JSON.stringify({ action_taken: action }) });
    load();
  }

  return (
    <div>
      <PageHeader title="Industry Intelligence">
        <AiBadge />
      </PageHeader>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: -8 }}>
        Live feed of AI developments relevant to your sectors — extracted from newsletters, research, and background jobs. Items here are raw signals before they become confirmed knowledge.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'actionable'].map(f => (
          <button key={f} className={`btn btn-small ${filter === f ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : 'Actionable'}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty-state"><h3>No intelligence items yet. Run the Industry Researcher background job to discover trends.</h3></div>
      ) : (
        items.map(item => (
          <div key={item.id} className="card" style={{ marginBottom: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="stage-badge stage-active" style={{ fontSize: 11 }}>{CATEGORY_LABELS[item.category] || item.category}</span>
                  {item.sector_name && <SectorBadge name={item.sector_name} />}
                  {item.is_actionable && !item.action_taken && <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>Actionable</span>}
                  {item.relevance_score && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Relevance: {Math.round(item.relevance_score * 100)}%</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.summary}</div>
                {item.source_url && (
                  <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', display: 'inline-block', marginTop: 4 }}>
                    {item.source_description || item.source_url} →
                  </a>
                )}
                {!item.source_url && item.source_description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Source: {item.source_description}</div>
                )}
                {item.action_taken && <div style={{ fontSize: 12, marginTop: 6, color: '#10B981' }}>Action: {item.action_taken}</div>}

                {/* Inline tag picker */}
                {taggingId === item.id && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Select knowledge tags:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {KNOWLEDGE_TAGS.map(tag => (
                        <button key={tag.value} onClick={() => toggleTag(tag.value)} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 12, border: '1.5px solid',
                          borderColor: selectedTags.includes(tag.value) ? tag.color : '#D1D5DB',
                          background: selectedTags.includes(tag.value) ? tag.color : 'white',
                          color: selectedTags.includes(tag.value) ? 'white' : '#374151',
                          cursor: 'pointer', fontWeight: selectedTags.includes(tag.value) ? 600 : 400,
                          transition: 'all 0.15s',
                        }}>
                          {tag.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-small" onClick={() => confirmPromote(item.id)} style={{ fontSize: 11 }}>
                        Add to Knowledge {selectedTags.length > 0 ? `(${selectedTags.length} tags)` : ''}
                      </button>
                      <button className="btn btn-secondary btn-small" onClick={() => setTaggingId(null)} style={{ fontSize: 11 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, marginLeft: 12, flexShrink: 0 }}>
                {taggingId !== item.id && (
                  <button className="btn btn-primary btn-small" onClick={() => startTagging(item.id)} style={{ fontSize: 11 }}>
                    + Knowledge
                  </button>
                )}
                {!item.action_taken && (
                  <button className="btn btn-secondary btn-small" onClick={() => markReviewed(item.id, 'Reviewed, noted')} style={{ fontSize: 11 }}>
                    Reviewed
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
