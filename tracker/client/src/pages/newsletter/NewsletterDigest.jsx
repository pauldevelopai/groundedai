import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const CATEGORY_LABELS = {
  ai_tool: 'AI Tool', regulation: 'Regulation', technique: 'Technique',
  use_case: 'Use Case', industry_news: 'Industry News', opinion: 'Opinion',
  training_trend: 'Training Trend', framework: 'Framework',
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

const CATEGORY_COLORS = {
  ai_tool: '#6366F1', regulation: '#EF4444', technique: '#10B981',
  use_case: '#F59E0B', industry_news: '#94A3B8', opinion: '#8B5CF6',
  training_trend: '#3B82F6', framework: '#EC4899',
};

const BRIEFING_FILTERS = [
  {
    key: 'legal',
    label: 'Legal Cases & Frameworks',
    color: '#EC4899',
    categories: ['regulation', 'framework'],
    keywords: ['legal', 'law', 'court', 'legislation', 'regulation', 'gdpr', 'eu ai act', 'compliance', 'liability', 'lawsuit', 'judgment'],
  },
  {
    key: 'ethics',
    label: 'Ethics & AI',
    color: '#8B5CF6',
    categories: ['opinion'],
    keywords: ['ethics', 'ethical', 'bias', 'fairness', 'responsible', 'transparency', 'accountability', 'harm', 'trust', 'safety'],
  },
  {
    key: 'security',
    label: 'Data Security & AI',
    color: '#F59E0B',
    categories: [],
    keywords: ['security', 'privacy', 'breach', 'vulnerability', 'data protection', 'cybersecurity', 'hack', 'phishing', 'encryption', 'gdpr'],
  },
  {
    key: 'workflows',
    label: 'Workflows & Tools',
    color: '#10B981',
    categories: ['ai_tool', 'technique', 'use_case'],
    keywords: ['workflow', 'tool', 'build', 'automation', 'pipeline', 'integrate', 'productivity', 'agent', 'prompt', 'agentic'],
  },
];

function itemMatchesFilter(item, filter) {
  if (filter.categories.includes(item.category)) return true;
  const text = `${item.subject || ''} ${item.summary || ''}`.toLowerCase();
  return filter.keywords.some(kw => text.includes(kw));
}

function renderMarkdown(text) {
  if (!text) return '';
  let t = text;
  t = t.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/(https?:\/\/[^\s"]+)"[^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#6366F1;text-decoration:underline">$1</a>');
  t = t.replace(/(?<!href=")(https?:\/\/[^\s<)"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#6366F1;text-decoration:underline;word-break:break-all">$1</a>');
  return t;
}

export default function NewsletterDigest() {
  const [activeTab, setActiveTab] = useState('digest');
  const [items, setItems] = useState([]);
  const [curriculumItems, setCurriculumItems] = useState([]);
  const [digest, setDigest] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [curriculumDate, setCurriculumDate] = useState(new Date().toISOString().split('T')[0]);
  const [settings, setSettings] = useState({});
  const [archive, setArchive] = useState([]);

  const [activeFilters, setActiveFilters] = useState([]);
  const [includeGmail, setIncludeGmail] = useState(true);
  const [includeWeb, setIncludeWeb] = useState(false);
  const [storiesPerDay, setStoriesPerDay] = useState(10);

  const [regenerating, setRegenerating] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [editingDigest, setEditingDigest] = useState(false);
  const [editedDigest, setEditedDigest] = useState('');
  const [publishing, setPublishing] = useState(false);

  function loadDigest() {
    return apiFetch(`/newsletter/digest/${selectedDate}`).then(d => {
      setDigest(d.digest);
      setItems(d.items || []);
    }).catch(() => { setDigest(null); setItems([]); });
  }

  function loadCurriculum() {
    return apiFetch('/newsletter/curriculum').then(setCurriculumItems).catch(() => setCurriculumItems([]));
  }

  function loadSettings() {
    apiFetch('/newsletter/settings').then(setSettings).catch(() => {});
  }

  function loadArchive() {
    apiFetch('/newsletter/archive').then(setArchive).catch(() => setArchive([]));
  }

  useEffect(() => {
    loadSettings();
    loadCurriculum();
    apiFetch('/newsletter/archive').then(a => {
      setArchive(a);
      if (a.length > 0 && a[0].digest_date) {
        setSelectedDate(a[0].digest_date.split('T')[0]);
      }
    }).catch(() => setArchive([]));
  }, []);

  useEffect(() => {
    if (activeTab === 'digest') loadDigest();
    else if (activeTab === 'curriculum') loadCurriculum();
  }, [activeTab, selectedDate]);

  async function promoteToKnowledge(id, tags) {
    await apiFetch(`/newsletter/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    });
    if (activeTab === 'digest') loadDigest(); else loadCurriculum();
  }

  async function toggleCurriculum(item) {
    await apiFetch(`/newsletter/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_curriculum_relevant: !item.is_curriculum_relevant }),
    });
    if (activeTab === 'digest') loadDigest(); else loadCurriculum();
  }

  async function rejectItem(id) {
    await apiFetch(`/newsletter/${id}/reject`, { method: 'POST' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function toggleFilter(key) {
    setActiveFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function applyFilters(itemList) {
    let list = itemList;
    if (includeGmail && !includeWeb) list = list.filter(i => !i.source_type || i.source_type === 'email');
    else if (!includeGmail && includeWeb) list = list.filter(i => i.source_type === 'web');
    if (activeFilters.length > 0) {
      list = list.filter(item =>
        activeFilters.some(key => {
          const filter = BRIEFING_FILTERS.find(f => f.key === key);
          return filter && itemMatchesFilter(item, filter);
        })
      );
    }
    return list;
  }

  async function regenerateDigest() {
    if (!includeGmail && !includeWeb) return alert('Select at least one source (Gmail or Web).');
    setRegenerating(true);
    try {
      if (includeWeb) {
        await apiFetch('/newsletter/fetch-web', {
          method: 'POST',
          body: JSON.stringify({ date: selectedDate }),
          timeout: 300000,
        });
      }
      const sourceFilter = includeGmail && includeWeb ? 'all' : includeGmail ? 'email' : 'web';
      await apiFetch('/newsletter/regenerate-digest', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, storiesLimit: storiesPerDay, sourceFilter }),
        timeout: 300000,
      });
      await loadDigest();
      loadArchive();
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function generateCurriculumItems() {
    setClassifying(true);
    try {
      const result = await apiFetch('/newsletter/classify-items', {
        method: 'POST',
        body: JSON.stringify({ date: curriculumDate }),
        timeout: 300000,
      });
      if (result.curriculumItems) setCurriculumItems(result.curriculumItems);
      else await loadCurriculum();
    } catch (err) {
      alert('Classification failed: ' + err.message);
    } finally {
      setClassifying(false);
    }
  }

  function startEditDigest() {
    setEditedDigest(digest || '');
    setEditingDigest(true);
  }

  function saveDigestEdit() {
    setDigest(editedDigest);
    setEditingDigest(false);
    apiFetch(`/newsletter/digest/${selectedDate}`, {
      method: 'PUT',
      body: JSON.stringify({ content: editedDigest }),
    }).catch(() => {});
  }

  async function publishTo(platform) {
    const content = digest || '';
    if (!content) return alert('No digest to publish');
    setPublishing(true);
    try {
      await apiFetch('/social-posts', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          content: platform === 'linkedin'
            ? content.replace(/─+/g, '').replace(/\n{3,}/g, '\n\n').trim()
            : content,
          status: 'draft',
          ai_generated: true,
        }),
      });
      alert(`Draft created for ${platform}. Go to Marketing > Social Content to review and publish.`);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  // Daily Briefing tab: only non-curriculum, non-rejected items
  const digestItems = applyFilters(items.filter(i => !i.is_curriculum_relevant)).slice(0, storiesPerDay);

  return (
    <div>
      <PageHeader title="Newsletter">
        <AiBadge />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gmail label: {settings.label || 'Newsletters'}</span>
      </PageHeader>

      <div className="tabs">
        <button className={`tab ${activeTab === 'digest' ? 'active' : ''}`} onClick={() => setActiveTab('digest')}>
          Daily Briefing
        </button>
        <button className={`tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}>
          Curriculum Items ({curriculumItems.length})
        </button>
        <button className={`tab ${activeTab === 'archive' ? 'active' : ''}`} onClick={() => setActiveTab('archive')}>
          Past Briefings ({archive.length})
        </button>
      </div>

      {/* ── DAILY BRIEFING TAB ── */}
      {activeTab === 'digest' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date" value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}
              />
              <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Sources:</span>
              {[['Gmail', includeGmail, setIncludeGmail], ['Web', includeWeb, setIncludeWeb]].map(([label, checked, setter]) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  {label}
                </label>
              ))}
              <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Stories:</span>
              <input
                type="number" min={3} max={10} value={storiesPerDay}
                onChange={e => setStoriesPerDay(Math.min(10, Math.max(3, parseInt(e.target.value) || 3)))}
                style={{ width: 48, padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13, textAlign: 'center' }}
              />
              <button className="btn btn-primary btn-small" onClick={regenerateDigest} disabled={regenerating} style={{ marginLeft: 4 }}>
                {regenerating ? (includeWeb ? 'Fetching web…' : 'Generating…') : 'Generate Briefing'}
              </button>
            </div>
            {/* Topic filters */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Topic:</span>
              {BRIEFING_FILTERS.map(f => {
                const active = activeFilters.includes(f.key);
                return (
                  <button key={f.key} onClick={() => toggleFilter(f.key)} style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 16,
                    border: `1.5px solid ${active ? f.color : 'var(--border-color)'}`,
                    background: active ? f.color : 'transparent',
                    color: active ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer', fontWeight: active ? 600 : 400,
                    transition: 'all 0.15s',
                  }}>{f.label}</button>
                );
              })}
              {activeFilters.length > 0 && (
                <button onClick={() => setActiveFilters([])} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 12,
                  border: '1px solid var(--border-color)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>Clear</button>
              )}
            </div>
          </div>

          {/* Digest */}
          {digest && (
            <div className="card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AiBadge />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Morning Briefing</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-small" onClick={editingDigest ? saveDigestEdit : startEditDigest} style={{ fontSize: 11 }}>
                    {editingDigest ? 'Save' : 'Edit'}
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => publishTo('linkedin')} disabled={publishing} style={{ fontSize: 11 }}>→ LinkedIn</button>
                  <button className="btn btn-secondary btn-small" onClick={() => publishTo('substack')} disabled={publishing} style={{ fontSize: 11 }}>→ Substack</button>
                </div>
              </div>
              {editingDigest ? (
                <div>
                  <textarea value={editedDigest} onChange={e => setEditedDigest(e.target.value)}
                    rows={20} style={{ width: '100%', fontSize: 14, lineHeight: 1.7, padding: 12, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontFamily: 'inherit', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-small" onClick={saveDigestEdit}>Save Changes</button>
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingDigest(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(digest) }} />
              )}
            </div>
          )}

          {/* Industry Intelligence items */}
          {digestItems.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                Industry Intelligence ({digestItems.length})
              </h3>
              {digestItems.map(item => (
                <NewsItem key={item.id} item={item} onPromote={promoteToKnowledge} onToggle={toggleCurriculum} onReject={rejectItem} />
              ))}
            </div>
          )}

          {items.length === 0 && !digest && (
            <div className="empty-state">
              <h3>No newsletter items for this date.</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Select Gmail and/or Web sources above, then click Generate Briefing.
              </p>
            </div>
          )}
          {items.length > 0 && activeFilters.length > 0 && digestItems.length === 0 && (
            <div className="empty-state">
              <h3>No items match the selected filters.</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Try different filters or clear them.</p>
            </div>
          )}
        </div>
      )}

      {/* ── CURRICULUM ITEMS TAB ── */}
      {activeTab === 'curriculum' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
            <input
              type="date" value={curriculumDate}
              onChange={e => setCurriculumDate(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}
            />
            <button className="btn btn-primary btn-small" onClick={generateCurriculumItems} disabled={classifying}>
              {classifying ? 'Identifying…' : 'Generate Items'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Re-classifies items for the selected date to find curriculum-relevant content
            </span>
          </div>

          {curriculumItems.length === 0 ? (
            <div className="empty-state"><h3>No curriculum-relevant items found yet.</h3></div>
          ) : (
            curriculumItems.map(item => (
              <NewsItem key={item.id} item={item} onPromote={promoteToKnowledge} onToggle={toggleCurriculum} />
            ))
          )}
        </div>
      )}

      {/* ── PAST BRIEFINGS TAB ── */}
      {activeTab === 'archive' && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Past Briefings</h3>
          {archive.length === 0 ? (
            <div className="empty-state"><h3>No past briefings yet.</h3></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Items</th><th>Curriculum</th><th></th></tr>
              </thead>
              <tbody>
                {archive.map(a => (
                  <tr key={a.digest_date} style={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedDate(a.digest_date); setActiveTab('digest'); }}>
                    <td style={{ fontWeight: 500 }}>{new Date(a.digest_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    <td>{a.item_count} items</td>
                    <td>{a.curriculum_count > 0 ? <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{a.curriculum_count} curriculum</span> : '—'}</td>
                    <td><span style={{ fontSize: 12, color: 'var(--accent)' }}>View →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function NewsItem({ item, onPromote, onToggle, onReject }) {
  const [tagging, setTagging] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [rejecting, setRejecting] = useState(false);

  function toggleTag(tag) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function confirmPromote() {
    await onPromote(item.id, selectedTags);
    setTagging(false);
    setSelectedTags([]);
  }

  async function handleReject() {
    setRejecting(true);
    try { await onReject(item.id); } finally { setRejecting(false); }
  }

  const pubDate = item.received_at
    ? new Date(item.received_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="card" style={{
      marginBottom: 6, padding: 14,
      borderLeft: item.is_curriculum_relevant ? '3px solid var(--accent)' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {/* Category + tags row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              background: CATEGORY_COLORS[item.category] || '#94A3B8', color: 'white',
            }}>{CATEGORY_LABELS[item.category] || item.category}</span>
            {item.is_curriculum_relevant && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>CURRICULUM</span>}
            {item.relevant_sectors?.length > 0 && item.relevant_sectors.map(s => (
              <span key={s} style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s}</span>
            ))}
          </div>

          {/* Title */}
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.subject}</div>

          {/* Summary */}
          {item.summary && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.summary}</div>}

          {/* Curriculum reason */}
          {item.curriculum_relevance_reason && (
            <div style={{ fontSize: 12, marginTop: 4, padding: '4px 8px', background: '#EEF2FF', borderRadius: 4, color: 'var(--accent)' }}>
              {item.curriculum_relevance_reason}
            </div>
          )}

          {/* Source + date — always visible */}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {item.source_url ? (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366F1', textDecoration: 'underline' }}>{item.sender}</a>
            ) : (
              <span>{item.sender}</span>
            )}
            {pubDate && <span style={{ color: '#94A3B8' }}>•</span>}
            {pubDate && <span style={{ fontWeight: 500 }}>{pubDate}</span>}
          </div>

          {/* Tag picker */}
          {tagging && (
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
                <button className="btn btn-primary btn-small" onClick={confirmPromote} style={{ fontSize: 11 }}>
                  Add to Knowledge {selectedTags.length > 0 ? `(${selectedTags.length} tags)` : ''}
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => { setTagging(false); setSelectedTags([]); }} style={{ fontSize: 11 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
          {item.is_curriculum_relevant && !item.promoted_to_knowledge && !tagging && (
            <button className="btn btn-primary btn-small" onClick={() => setTagging(true)} style={{ fontSize: 10 }}>
              + Knowledge
            </button>
          )}
          {item.promoted_to_knowledge && (
            <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600 }}>✓ Knowledge</span>
          )}
          <button className="btn btn-secondary btn-small" onClick={() => onToggle(item)} style={{ fontSize: 10 }}>
            {item.is_curriculum_relevant ? 'Not Curriculum' : 'Mark Curriculum'}
          </button>
          {onReject && !item.is_curriculum_relevant && (
            <button
              className="btn btn-small"
              onClick={handleReject}
              disabled={rejecting}
              style={{ fontSize: 10, background: 'transparent', border: '1px solid #EF4444', color: '#EF4444', cursor: 'pointer', borderRadius: 'var(--radius)', padding: '2px 8px' }}
            >
              {rejecting ? '…' : 'Reject'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
