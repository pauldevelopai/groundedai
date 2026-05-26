import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSectors } from '../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../hooks/useApi.js';
import AiBadge from '../components/AiBadge.jsx';

const AI_ACTIONS = [
  { title: 'Analyse Assessment', desc: 'AI analyses needs assessment responses', link: '/assessments' },
  { title: 'Improve Curriculum', desc: 'Get AI suggestions for your courses', link: '/curriculum' },
  { title: 'Generate Document', desc: 'Create policies and frameworks', link: '/documents/new' },
  { title: 'Draft Cold Email', desc: 'Personalised outreach emails', link: '/marketing/campaigns' },
  { title: 'Draft Social Post', desc: 'AI content for LinkedIn & more', link: '/marketing/social' },
  { title: 'Research Funding', desc: 'Analyse grant opportunities', link: '/fundraising' },
];

const PIPELINE_STAGES = ['prospect', 'contacted', 'meeting', 'proposal', 'client'];
const PIPELINE_COLOURS = { prospect: '#94A3B8', contacted: '#60A5FA', meeting: '#F59E0B', proposal: '#A78BFA', client: '#10B981' };

const PRIORITY_STYLES = {
  urgent: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  high: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  medium: { bg: '#DBEAFE', color: '#1E40AF', border: '#BFDBFE' },
  low: { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
};

const TYPE_LABELS = { ethical_ai_policy: 'AI Policy', ai_legal_framework: 'Legal Framework', mentorship: 'Mentorship' };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const now = new Date();
  const diff = Math.floor((now - dt) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function SectionCard({ title, linkTo, linkText, children, badge, maxHeight }) {
  return (
    <div className="dashboard-section">
      <div className="dashboard-section-header">
        <h3>{title} {badge}</h3>
        {linkTo && <Link to={linkTo} className="dashboard-section-link">{linkText || 'View all →'}</Link>}
      </div>
      <div className="dashboard-section-body" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>{children}</div>
    </div>
  );
}

function PipelineBar({ data }) {
  const total = PIPELINE_STAGES.reduce((s, stage) => s + (data[stage] || 0), 0);
  if (total === 0) return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No contacts in pipeline</div>;
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {PIPELINE_STAGES.map(stage => {
          const count = data[stage] || 0;
          if (count === 0) return null;
          return <div key={stage} style={{ flex: count, background: PIPELINE_COLOURS[stage] }} title={`${stage}: ${count}`} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {PIPELINE_STAGES.map(stage => (
          <div key={stage} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIPELINE_COLOURS[stage], display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{stage}</span>
            <span style={{ fontWeight: 600 }}>{data[stage] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Quick Upload widget
function QuickUpload() {
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('general');
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const fileRef = useRef();

  async function handleFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', category);
    setExtracting(true);
    try {
      const res = await fetch('/api/uploads/extract-and-preview', { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPreview(data);
      setEditing(JSON.stringify(data.extracted, null, 2));
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleTextSubmit() {
    if (!text.trim()) return;
    setExtracting(true);
    try {
      const res = await apiFetch('/uploads/extract-and-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, entityType: category }),
      });
      setPreview(res);
      setEditing(JSON.stringify(res.extracted, null, 2));
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    try {
      let parsed;
      try { parsed = JSON.parse(editing); } catch { setResult('Invalid JSON'); setSaving(false); return; }
      await apiFetch('/uploads/approve', {
        method: 'POST',
        body: JSON.stringify({ entityType: category, data: parsed }),
      });
      setResult('Saved to database.');
      setPreview(null);
      setEditing(null);
      setText('');
      setTimeout(() => setResult(''), 3000);
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (preview) {
    return (
      <div className="dashboard-section" style={{ borderLeft: '4px solid var(--ai-purple)' }}>
        <div className="dashboard-section-header"><h3>Review Extracted Data <AiBadge /></h3></div>
        <div className="dashboard-section-body">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Category: {category}. Edit the JSON below, then approve to save.</div>
          <textarea value={editing} onChange={e => setEditing(e.target.value)} rows={10}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-small" onClick={handleApprove} disabled={saving}>{saving ? 'Saving...' : 'Approve & Save'}</button>
            <button className="btn btn-secondary btn-small" onClick={() => { setPreview(null); setEditing(null); }}>Cancel</button>
          </div>
          {result && <div style={{ marginTop: 8, fontSize: 13, color: result.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>{result}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-section">
      <div className="dashboard-section-header"><h3>Quick Upload <AiBadge /></h3></div>
      <div className="dashboard-section-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
            <option value="organisation">Organisation</option>
            <option value="contact">Contact</option>
            <option value="course">Course</option>
            <option value="funding_opportunity">Funding Opportunity</option>
            <option value="general">General Knowledge</option>
          </select>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--ai-purple)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius)', padding: '12px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? '#F5F3FF' : 'transparent', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)',
          }}
        >
          {extracting ? 'Extracting with AI...' : 'Drop a file here or click to upload'}
          <input ref={fileRef} type="file" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Or paste text here..." style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }} />
          <button className="btn btn-primary btn-small" onClick={handleTextSubmit} disabled={extracting || !text.trim()}>Extract</button>
        </div>
        {result && <div style={{ marginTop: 6, fontSize: 12, color: result.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>{result}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { selectedSectorId } = useSectors();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [aiSummary, setAiSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  function refreshSummary() {
    const cacheKey = `holly_ai_summary_${selectedSectorId || 'all'}`;
    sessionStorage.removeItem(cacheKey);
    setSummaryLoading(true);
    setAiSummary('');
    apiFetch(buildUrl('/dashboard/ai-summary', selectedSectorId))
      .then(r => { setAiSummary(r.summary); sessionStorage.setItem(cacheKey, r.summary); })
      .catch(() => setAiSummary(''))
      .finally(() => setSummaryLoading(false));
  }

  useEffect(() => {
    // Load full dashboard data
    apiFetch(buildUrl('/dashboard/full', selectedSectorId)).then(setData).catch(() => setData(null));
    // Load legacy data for next actions
    apiFetch(buildUrl('/dashboard', selectedSectorId)).then(setLegacy).catch(() => setLegacy(null));
    // AI summary (cached per session)
    const cacheKey = `holly_ai_summary_${selectedSectorId || 'all'}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setAiSummary(cached);
    } else {
      setSummaryLoading(true);
      apiFetch(buildUrl('/dashboard/ai-summary', selectedSectorId))
        .then(r => { setAiSummary(r.summary); sessionStorage.setItem(cacheKey, r.summary); })
        .catch(() => setAiSummary(''))
        .finally(() => setSummaryLoading(false));
    }
  }, [selectedSectorId]);

  const stats = data?.stats || {};
  const nextActions = legacy?.nextActions || [];
  const pipeline = data?.pipeline || {};
  const recentContacts = data?.recentContacts || [];
  const orgHierarchy = data?.orgHierarchy || { funders: [], programmeOrgs: [], leads: [] };
  const activeCohorts = data?.activeCohorts || [];
  const upcomingSessions = data?.upcomingSessions || [];
  const engagements = data?.activeEngagements || [];
  const fundraising = data?.fundraising || { stages: {}, totalValue: 0, approachingDeadlines: [] };
  const digest = data?.latestDigest;
  const curriculumHealth = data?.curriculumHealth || { lowestCourses: [], flaggedModules: [] };
  const marketing = data?.marketing || {};
  const recentActivity = data?.recentActivity || [];
  const learning = data?.learning || { activeLearners: 0, pendingTaskReviews: 0 };

  const statItems = [
    { label: 'Contacts', value: stats.contacts || 0, link: '/contacts' },
    { label: 'Organisations', value: stats.organisations || 0, link: '/organisations' },
    { label: 'Active Cohorts', value: stats.activeCohorts || 0, link: '/programmes' },
    { label: 'Engagements', value: stats.activeEngagements || 0, link: '/services' },
    { label: 'Pipeline Value', value: stats.pipelineValue ? `£${stats.pipelineValue.toLocaleString()}` : '£0', link: '/fundraising' },
    { label: 'Notifications', value: stats.unreadNotifications || 0, link: '#' },
  ];

  return (
    <div>
      {/* Welcome + AI Briefing */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{getGreeting()}, {user?.name || 'there'}</h1>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 700, lineHeight: 1.6 }}>
          {summaryLoading ? <span style={{ color: 'var(--ai-purple)' }}>Holly is thinking...</span>
            : aiSummary ? <span>{aiSummary}</span>
            : <span>Welcome to Holly — your AI-powered business operating system.</span>}
        </div>
        {aiSummary && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <AiBadge variant="powered" />
            <button onClick={refreshSummary} disabled={summaryLoading} className="btn btn-secondary btn-small" style={{ fontSize: 11, padding: '2px 8px' }}>
              {summaryLoading ? '...' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {/* Next 3 Things — what to do when you sit down */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>What to Do Next</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(nextActions.length > 0 ? nextActions.slice(0, 3) : [
            { title: 'Check your briefing', link: '/newsletter', priority: 'high', detail: 'Review today\'s AI briefing and flag curriculum items' },
            { title: 'Review pending leads', link: '/leads', priority: 'medium', detail: 'Vet auto-discovered leads from Gmail and web scraping' },
            { title: 'Build course content', link: '/course-builder', priority: 'medium', detail: 'Use the AI Curriculum Builder to develop training modules' },
          ]).map((a, i) => {
            const ps = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.medium;
            const icons = ['1️⃣', '2️⃣', '3️⃣'];
            return (
              <Link key={i} to={a.link} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="dashboard-card" style={{ borderLeft: `4px solid ${ps.border}`, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{icons[i]}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: ps.color }}>{a.priority}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                  {a.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{a.detail}</div>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {statItems.map((s, i) => (
          <Link key={i} to={s.link} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="dashboard-card" style={{ padding: 12, textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Workflow Grid */}
      <div className="dashboard-grid">
        {/* Client Portfolio */}
        <SectionCard title="Client Portfolio" linkTo="/organisations" maxHeight={280}>
          {/* Funders */}
          {orgHierarchy.funders.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>Funders / Clients</div>
              {orgHierarchy.funders.map(f => (
                <Link key={f.id} to={`/organisations/${f.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.programme_org_count} org{f.programme_org_count !== 1 ? 's' : ''}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Programme Orgs grouped by programme */}
          {orgHierarchy.programmeOrgs.length > 0 && (() => {
            const grouped = {};
            orgHierarchy.programmeOrgs.forEach(o => {
              const prog = o.programme_name || o.funder_name || 'Other';
              if (!grouped[prog]) grouped[prog] = [];
              grouped[prog].push(o);
            });
            return Object.entries(grouped).map(([prog, orgsInProg]) => (
              <div key={prog} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>{prog} ({orgsInProg.length})</div>
                {orgsInProg.slice(0, 4).map(o => (
                  <Link key={o.id} to={`/organisations/${o.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
                    <span>{o.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.contact_count} contact{o.contact_count !== 1 ? 's' : ''}</span>
                  </Link>
                ))}
                {orgsInProg.length > 4 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>+{orgsInProg.length - 4} more</div>}
              </div>
            ));
          })()}

          {/* Leads */}
          {orgHierarchy.leads.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#F59E0B', marginBottom: 4 }}>Leads ({orgHierarchy.leads.length})</div>
              {orgHierarchy.leads.slice(0, 3).map(o => (
                <Link key={o.id} to={`/organisations/${o.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
                  <span>{o.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.relationship_stage}</span>
                </Link>
              ))}
            </div>
          )}

          {orgHierarchy.funders.length === 0 && orgHierarchy.programmeOrgs.length === 0 && orgHierarchy.leads.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No organisations yet</div>
          )}
        </SectionCard>

        {/* Newsletter Digest */}
        <SectionCard title="Newsletter Digest" linkTo="/newsletter" badge={<AiBadge />} maxHeight={280}>
          {digest ? (
            <div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {digest.summary?.slice(0, 300)}{digest.summary?.length > 300 ? '...' : ''}
              </div>
              {data?.curriculumItemsCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ai-purple)', fontWeight: 500 }}>
                  {data.curriculumItemsCount} curriculum-relevant item{data.curriculumItemsCount !== 1 ? 's' : ''} to review
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No digest yet. Run the Newsletter Digest job from Background Jobs.</div>
          )}
        </SectionCard>

        {/* PILLAR 1: Training */}
        <SectionCard title="Training" linkTo="/curriculum" badge={learning.pendingTaskReviews > 0 ? <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{learning.pendingTaskReviews} to review</span> : null}>
          {/* Active cohorts */}
          {activeCohorts.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>Active Cohorts</div>
              {activeCohorts.map(c => (
                <Link key={c.id} to={`/programmes/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.org_name || '—'} · {c.participant_count} participants</div>
                </Link>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>No active cohorts</div>}
          {/* Learning stats */}
          {(learning.activeLearners > 0 || learning.pendingTaskReviews > 0) && (
            <Link to="/learning" style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '8px 0', borderTop: '1px solid var(--border-color)', marginBottom: 4 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{learning.activeLearners}</span> active learner{learning.activeLearners !== 1 ? 's' : ''}
                {learning.pendingTaskReviews > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>{learning.pendingTaskReviews} task{learning.pendingTaskReviews !== 1 ? 's' : ''} awaiting review</span>}
              </div>
            </Link>
          )}
          {/* Curriculum health */}
          {curriculumHealth.flaggedModules.length > 0 && (
            <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Modules needing review</div>
              {curriculumHealth.flaggedModules.slice(0, 3).map(m => (
                <Link key={m.id} to={`/curriculum/${m.course_id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '3px 0', fontSize: 13 }}>
                  <span>{m.module_title}</span>
                  <span style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 6 }}>{m.effectiveness_rating}/5</span>
                </Link>
              ))}
            </div>
          )}
          {upcomingSessions.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Next 7 Days</div>
              {upcomingSessions.map(s => (
                <div key={s.id} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text-secondary)' }}>
                  {new Date(s.session_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} — {s.title || s.cohort_name}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* PILLAR 2: Mentorship */}
        <SectionCard title="Mentorship" linkTo="/mentoring">
          {engagements.filter(e => e.type === 'mentorship').length > 0 ? (
            engagements.filter(e => e.type === 'mentorship').map(e => (
              <Link key={e.id} to={`/services/${e.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{e.org_name || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.status} {e.mentor_name ? `· ${e.mentor_name}` : ''}</div>
              </Link>
            ))
          ) : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No active mentorship engagements</div>}
        </SectionCard>

        {/* PILLAR 3: AI Policies */}
        <SectionCard title="AI Policies" linkTo="/documents">
          {/* Ethical AI Policy engagements */}
          {engagements.filter(e => e.type === 'ethical_ai_policy').length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Active Engagements</div>
              {engagements.filter(e => e.type === 'ethical_ai_policy').map(e => (
                <Link key={e.id} to={`/services/${e.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '4px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{e.org_name || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{e.status}</span>
                </Link>
              ))}
            </div>
          )}
          <Link to="/documents/new" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>+ Generate AI Policy →</Link>
        </SectionCard>

        {/* PILLAR 4: AI Legal Frameworks */}
        <SectionCard title="AI Legal Frameworks" linkTo="/documents">
          {/* AI Legal Framework engagements */}
          {engagements.filter(e => e.type === 'ai_legal_framework').length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Active Engagements</div>
              {engagements.filter(e => e.type === 'ai_legal_framework').map(e => (
                <Link key={e.id} to={`/services/${e.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '4px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{e.org_name || '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{e.status}</span>
                </Link>
              ))}
            </div>
          )}
          <Link to="/documents/new" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>+ Generate Legal Framework →</Link>
        </SectionCard>

        {/* Marketing */}
        <SectionCard title="Marketing" linkTo="/marketing/campaigns">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
            <div className="dashboard-card" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{marketing.emailsSentThisWeek || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Emails sent</div>
            </div>
            <div className="dashboard-card" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{marketing.repliesThisWeek || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Replies</div>
            </div>
            <div className="dashboard-card" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{marketing.draftPosts || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Draft posts</div>
            </div>
            <div className="dashboard-card" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{marketing.activeCampaigns || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Active campaigns</div>
            </div>
          </div>
        </SectionCard>

        {/* Fundraising */}
        <SectionCard title="Fundraising" linkTo="/fundraising">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pipeline: £{(fundraising.totalValue || 0).toLocaleString()}</div>
          {fundraising.approachingDeadlines?.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 4 }}>Approaching Deadlines</div>
              {fundraising.approachingDeadlines.map(d => (
                <Link key={d.id} to={`/fundraising/opportunities/${d.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '4px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{d.title}</span>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.funder_name} · {new Date(d.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                </Link>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No upcoming deadlines</div>}
        </SectionCard>

        {/* Quick Upload */}
        <QuickUpload />
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentActivity.map((item, i) => (
              <Link key={i} to={item.link} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', fontSize: 13 }}>
                <span className="stage-badge stage-active" style={{ fontSize: 10 }}>{item.type}</span>
                <span style={{ fontWeight: 500, flex: 1 }}>{item.title}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{relDate(item.created_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
