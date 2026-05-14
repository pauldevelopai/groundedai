// LearningWorkspace — V2 Step 3 Tracker UI. Seven tabs:
//
//   Home          : weekly digest masthead + most-relevant feed
//   Lawsuits      : data_law / press_freedom entries flagged as lawsuit
//   Regulations   : data_law / governance entries (non-lawsuit), by jurisdiction
//   Connections   : force-directed SVG map of tracker_relationships
//   Use cases     : list + submit (own newsroom + cohort-shared)
//   Sources       : publisher directory rollup
//   Submit        : submit a new entry for cohort review (pending → live)
//
// Cohort metrics + promoted workflows that lived in the V1 Learning page
// now live in /mentorship; a pointer is surfaced in the Home tab.

'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import GlobalNav from '@/app/components/GlobalNav';

type Update = {
  id: string;
  newsroom_id: string | null;
  title: string;
  body: string;
  kind: 'ethics' | 'data_law' | 'security' | 'governance' | 'model_change' | 'platform_takedown' | 'press_freedom';
  severity: 'info' | 'advisory' | 'urgent';
  source_publisher: string | null;
  source_url: string | null;
  published_at: string | null;
  applies_to_agents: string[];
  country_scope: string[];
  is_default: boolean;
  source: string;
  ack_decision?: 'applies' | 'dismissed' | 'pending' | null;
  ack_notes?: string | null;
};

type Digest = {
  id: string;
  period_start: string;
  period_end: string;
  summary_md: string;
  top_entry_ids: string[];
  entry_count: number;
  generated_at: string;
} | null;

type UseCase = {
  id: string;
  newsroom_id: string;
  newsroom_name: string | null;
  submitted_by_email: string | null;
  title: string;
  summary: string;
  outcome: 'positive' | 'negative' | 'mixed';
  agents_involved: string[];
  tags: string[];
  attachment_urls: string[];
  shared_with_cohort: boolean;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  source_publisher: string;
  entry_count: number;
  last_update: string | null;
  countries: string[] | null;
  urgent: number;
  advisory: number;
  info: number;
};

type GraphNode = {
  id: string;
  title: string;
  kind: Update['kind'];
  severity: Update['severity'];
  country_scope: string[];
  source_publisher: string | null;
  at: string;
};
type GraphEdge = {
  id: string;
  from_entry_id: string;
  to_entry_id: string;
  kind: string;
  notes: string | null;
  cohort_wide: boolean;
};

const KIND_LABELS: Record<Update['kind'], string> = {
  ethics: 'Ethics',
  data_law: 'Data law',
  security: 'Security',
  governance: 'Governance',
  model_change: 'Model change',
  platform_takedown: 'Platform takedown',
  press_freedom: 'Press freedom',
};

const LAWSUIT_KEYWORDS = /\b(lawsuit|sued|class[\s-]action|filed against|settlement|court[\s-]ruling|injunction|complaint|plaintiff|defendant|tribunal|magistrate)\b/i;

function isLawsuit(u: Update) {
  return LAWSUIT_KEYWORDS.test(u.title) || LAWSUIT_KEYWORDS.test(u.body);
}

const TAB_LABELS = {
  home: 'Home',
  lawsuits: 'Lawsuits',
  regulations: 'Regulations',
  connections: 'Connections',
  use_cases: 'Use cases',
  sources: 'Sources',
  submit: 'Submit',
} as const;

type TabKey = keyof typeof TAB_LABELS;

export default function LearningWorkspace({
  initialUpdates, initialDigest, canEdit, isAdmin: _isAdmin, role,
}: {
  initialUpdates: Update[];
  initialDigest: Digest;
  canEdit: boolean;
  isAdmin: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const [tab, setTab] = useState<TabKey>('home');
  const [updates] = useState(initialUpdates);
  const [digest] = useState(initialDigest);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="⚖️ Tracker" role={role} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>AI Legal, Ethics & Regulation Tracker</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          The 12th agent. Lawsuits, regulations, governance shifts, and ethics decisions — collected daily, scoped to
          your jurisdictions, cross-referenced with your newsroom's use cases.
        </p>

        <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 16, borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'home' && <HomeTab updates={updates} digest={digest} />}
        {tab === 'lawsuits' && <LawsuitsTab updates={updates} />}
        {tab === 'regulations' && <RegulationsTab updates={updates} />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'use_cases' && <UseCasesTab canEdit={canEdit} />}
        {tab === 'sources' && <SourcesTab />}
        {tab === 'submit' && <SubmitTab />}
      </div>
    </main>
  );
}

// ─── Home ──────────────────────────────────────────────────────────────────

function HomeTab({ updates, digest }: { updates: Update[]; digest: Digest }) {
  // Home shows urgent + advisory entries first (severity-weighted) then the
  // most-recent info entries. Capped to 30 so the feed stays scannable.
  const sorted = useMemo(() => {
    const sevRank: Record<Update['severity'], number> = { urgent: 0, advisory: 1, info: 2 };
    return [...updates].sort((a, b) => {
      if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
      const aDate = a.published_at || '';
      const bDate = b.published_at || '';
      return bDate.localeCompare(aDate);
    }).slice(0, 30);
  }, [updates]);

  return (
    <>
      {digest && (
        <section style={{ ...panelStyle, background: '#f1f6fb', border: '1px solid #cfe1f5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>This week's cohort digest</h2>
            <span style={{ fontSize: 12, color: '#666' }}>
              {shortDate(digest.period_start)} → {shortDate(digest.period_end)} · {digest.entry_count} entries
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: '#1a3a66' }}>
            <Markdown text={digest.summary_md} />
          </div>
        </section>
      )}

      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Most-relevant feed ({sorted.length})</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
          Urgent and advisory entries first. Use the Lawsuits / Regulations tabs above for a filtered view.
          Team-wide signals (workflow performance, edit hotspots) live in <Link href="/mentorship" style={{ color: '#0066cc' }}>Mentorship</Link>.
        </p>
        <EntryList rows={sorted} />
      </section>
    </>
  );
}

// ─── Lawsuits ──────────────────────────────────────────────────────────────

function LawsuitsTab({ updates }: { updates: Update[] }) {
  const rows = useMemo(() => updates.filter((u) =>
    (u.kind === 'data_law' || u.kind === 'press_freedom') && isLawsuit(u)
  ), [updates]);

  return (
    <section style={panelStyle}>
      <h3 style={subHeadStyle}>Lawsuits ({rows.length})</h3>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
        Active and decided cases relevant to data law and press freedom. Detected from titles/bodies that mention
        keywords like <code style={codeStyle}>sued</code>, <code style={codeStyle}>filed</code>,
        <code style={codeStyle}>court ruling</code>, <code style={codeStyle}>settlement</code>.
      </p>
      {rows.length === 0
        ? <Hint>No lawsuit entries in your scope yet. Submit one from the Submit tab.</Hint>
        : <EntryList rows={rows} />}
    </section>
  );
}

// ─── Regulations ───────────────────────────────────────────────────────────

function RegulationsTab({ updates }: { updates: Update[] }) {
  const rows = useMemo(() => updates.filter((u) =>
    (u.kind === 'data_law' || u.kind === 'governance') && !isLawsuit(u)
  ), [updates]);

  // Group by primary country in country_scope (first entry, fallback 'global').
  const groups = useMemo(() => {
    const map = new Map<string, Update[]>();
    for (const r of rows) {
      const k = (r.country_scope && r.country_scope[0]) || 'global';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  if (rows.length === 0) {
    return <Hint>No regulations in your scope yet.</Hint>;
  }
  return (
    <>
      {groups.map(([country, list]) => (
        <section key={country} style={panelStyle}>
          <h3 style={subHeadStyle}>{country} <span style={{ color: '#888', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {list.length}</span></h3>
          <EntryList rows={list} />
        </section>
      ))}
    </>
  );
}

// ─── Connections (SVG force-directed) ──────────────────────────────────────

function ConnectionsTab() {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; max_nodes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetch('/api/learning/connections')
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setData(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Hint>Loading the graph…</Hint>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data || data.nodes.length === 0) {
    return (
      <Hint>
        No connections yet. As admins curate <code style={codeStyle}>cited_in</code>,
        <code style={codeStyle}>superseded_by</code>, <code style={codeStyle}>applies_to</code> links between Tracker
        entries, this map fills out.
      </Hint>
    );
  }

  return (
    <section style={panelStyle}>
      <h3 style={subHeadStyle}>Connections map ({data.nodes.length} entries · {data.edges.length} links)</h3>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
        How entries cite, supersede, or apply to each other. Click a node to see its details.
      </p>
      <ForceGraph nodes={data.nodes} edges={data.edges} onSelect={setSelected} />
      {selected && (
        <div style={{ marginTop: 12, padding: 12, background: '#fafbfc', border: '1px solid #e1e4e8', borderRadius: 6 }}>
          <SeverityPill severity={selected.severity} />
          {' '}
          <KindPill kind={selected.kind} />
          <h4 style={{ fontSize: 15, margin: '6px 0 4px' }}>{selected.title}</h4>
          <div style={{ fontSize: 12, color: '#666' }}>
            {selected.source_publisher || '(no source)'} · {selected.country_scope.join(', ') || 'global'} · {shortDate(selected.at)}
          </div>
        </div>
      )}
    </section>
  );
}

function ForceGraph({
  nodes, edges, onSelect,
}: { nodes: GraphNode[]; edges: GraphEdge[]; onSelect: (n: GraphNode) => void }) {
  // Compute a deterministic radial layout: nodes on a circle, edges drawn
  // as lines. Cheap, deterministic, no library needed. Real spring physics
  // is overkill for ≤80 nodes.
  const positions = useMemo(() => {
    const W = 760;
    const H = 460;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.38;
    const map: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      map[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return { positions: map, W, H };
  }, [nodes]);

  const sevColor: Record<Update['severity'], string> = {
    urgent: '#a00',
    advisory: '#915d00',
    info: '#0066cc',
  };

  return (
    <svg width={positions.W} height={positions.H} viewBox={`0 0 ${positions.W} ${positions.H}`}
      style={{ background: '#fafbfd', border: '1px solid #e5e5e5', borderRadius: 6, width: '100%', height: 'auto', maxHeight: 520 }}>
      {edges.map((e) => {
        const a = positions.positions[e.from_entry_id];
        const b = positions.positions[e.to_entry_id];
        if (!a || !b) return null;
        return (
          <line key={e.id}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={e.cohort_wide ? '#9ab3c9' : '#cbd0d5'}
            strokeWidth={e.cohort_wide ? 1.5 : 1}
            strokeDasharray={e.kind === 'superseded_by' ? '4 3' : undefined}
            opacity={0.85}>
            <title>{e.kind}{e.notes ? ` — ${e.notes}` : ''}</title>
          </line>
        );
      })}
      {nodes.map((n) => {
        const p = positions.positions[n.id];
        if (!p) return null;
        return (
          <g key={n.id} onClick={() => onSelect(n)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={n.severity === 'urgent' ? 9 : n.severity === 'advisory' ? 7 : 5}
              fill={sevColor[n.severity]} opacity={0.85}>
              <title>{n.title}</title>
            </circle>
            <text x={p.x + 11} y={p.y + 4} fontSize={11} fill="#222">
              {n.title.length > 28 ? n.title.slice(0, 25) + '…' : n.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Use cases ─────────────────────────────────────────────────────────────

function UseCasesTab({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'cohort' | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true); setError(null);
    fetch(`/api/learning/use-cases?scope=${scope}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setRows(j.rows); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [scope]);

  return (
    <>
      <section style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <h3 style={{ ...subHeadStyle, margin: 0 }}>Use cases ({rows.length})</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'mine', 'cohort'] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} style={pillBtnStyle(scope === s)}>{s}</button>
            ))}
            {canEdit && (
              <button onClick={() => setShowForm((x) => !x)} style={primaryBtnStyle}>
                {showForm ? 'Close' : 'Submit use case'}
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '8px 0 0' }}>
          What happened when your newsroom used Grounded for X. Share the wins, share the misses. The cohort
          benefits when more newsrooms record outcomes.
        </p>
      </section>

      {showForm && <UseCaseForm onSaved={() => { setShowForm(false); load(); }} />}

      {loading && <Hint>Loading…</Hint>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {!loading && rows.length === 0 && <Hint>No use cases in this view yet.</Hint>}
      {rows.map((r) => <UseCaseCard key={r.id} row={r} />)}
    </>
  );
}

function UseCaseCard({ row }: { row: UseCase }) {
  const outcomeColor = row.outcome === 'positive' ? { bg: '#e6f4ea', fg: '#0a7d2a' }
    : row.outcome === 'negative' ? { bg: '#fde8e8', fg: '#a00' }
    : { bg: '#fff4e1', fg: '#915d00' };
  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h4 style={{ fontSize: 15, margin: 0 }}>{row.title}</h4>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
          background: outcomeColor.bg, color: outcomeColor.fg, fontWeight: 600,
        }}>{row.outcome}</span>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        {row.newsroom_name ? row.newsroom_name : '(anonymised cohort entry)'}
        {row.submitted_by_email && <> · {row.submitted_by_email}</>}
        {' · '}{shortDate(row.created_at)}
        {row.shared_with_cohort && <> · <strong>shared with cohort</strong></>}
      </div>
      <p style={{ fontSize: 14, color: '#333', lineHeight: 1.55, marginTop: 10, whiteSpace: 'pre-wrap' }}>{row.summary}</p>
      {(row.agents_involved.length > 0 || row.tags.length > 0) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {row.agents_involved.map((a) => <span key={a} style={chipStyle}>agent: {a}</span>)}
          {row.tags.map((t) => <span key={t} style={chipStyle}>{t}</span>)}
        </div>
      )}
      {row.attachment_urls.length > 0 && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Attachments: {row.attachment_urls.map((u, i) => (
            <span key={u}>{i > 0 ? ' · ' : ''}<a href={u} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>{shortUrl(u)}</a></span>
          ))}
        </div>
      )}
    </section>
  );
}

function UseCaseForm({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState<UseCase['outcome']>('positive');
  const [agentsText, setAgentsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [shared, setShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/learning/use-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          outcome,
          agents_involved: agentsText.split(',').map((s) => s.trim()).filter(Boolean),
          tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
          shared_with_cohort: shared,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={panelStyle}>
      <h3 style={subHeadStyle}>New use case</h3>
      <label style={lbl}>Title<input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></label>
      <label style={lbl}>Summary
        <textarea style={{ ...inp, minHeight: 120, fontFamily: 'inherit' }} value={summary} onChange={(e) => setSummary(e.target.value)} required maxLength={5000} placeholder="What happened? What did the model do well or poorly? Anything other newsrooms should know?" />
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={lbl}>Outcome
          <select style={inp} value={outcome} onChange={(e) => setOutcome(e.target.value as UseCase['outcome'])}>
            <option value="positive">positive</option>
            <option value="negative">negative</option>
            <option value="mixed">mixed</option>
          </select>
        </label>
        <label style={{ ...lbl, flex: 1 }}>Agents involved (comma-separated)
          <input style={inp} value={agentsText} onChange={(e) => setAgentsText(e.target.value)} placeholder="verifier, drafter" />
        </label>
        <label style={{ ...lbl, flex: 1 }}>Tags (comma-separated)
          <input style={inp} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="POPIA, source-protection" />
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Share with cohort (your newsroom name is hidden; other newsrooms see the summary anonymously)
      </label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div style={{ marginTop: 12 }}>
        <button type="submit" disabled={submitting} style={primaryBtnStyle}>{submitting ? 'Saving…' : 'Save use case'}</button>
      </div>
    </form>
  );
}

// ─── Sources ───────────────────────────────────────────────────────────────

function SourcesTab() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/learning/sources')
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setRows(j.rows); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Hint>Loading…</Hint>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (rows.length === 0) return <Hint>No sources tracked yet.</Hint>;

  return (
    <section style={panelStyle}>
      <h3 style={subHeadStyle}>Sources ({rows.length})</h3>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>
        Publishers feeding the Tracker. Volume + recency + severity mix per source.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Publisher</Th><Th>Entries</Th><Th>Urgent</Th><Th>Advisory</Th><Th>Countries</Th><Th>Last update</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source_publisher}>
              <Td><strong>{r.source_publisher}</strong></Td>
              <Td>{r.entry_count}</Td>
              <Td style={{ color: r.urgent > 0 ? '#a00' : '#888' }}>{r.urgent}</Td>
              <Td style={{ color: r.advisory > 0 ? '#915d00' : '#888' }}>{r.advisory}</Td>
              <Td style={{ fontSize: 11, color: '#666' }}>{(r.countries || []).join(', ') || '—'}</Td>
              <Td style={{ color: '#666' }}>{shortDate(r.last_update)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Submit ────────────────────────────────────────────────────────────────

function SubmitTab() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Update['kind']>('governance');
  const [severity, setSeverity] = useState<Update['severity']>('info');
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [countriesText, setCountriesText] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSavedId(null);
    try {
      const res = await fetch('/api/learning/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          kind, severity,
          source_publisher: publisher.trim() || null,
          source_url: url.trim() || null,
          published_at: publishedAt || null,
          country_scope: countriesText.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSavedId(j.id);
      setTitle(''); setBody(''); setPublisher(''); setUrl(''); setPublishedAt(''); setCountriesText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panelStyle}>
      <h3 style={subHeadStyle}>Submit a new entry</h3>
      <p style={{ fontSize: 13, color: '#444', margin: '0 0 12px' }}>
        Saw a legal / regulatory / ethics development that the cohort should know about? Submit it here. It enters
        the queue as <code style={codeStyle}>pending</code> until a cohort admin reviews and promotes it to{' '}
        <code style={codeStyle}>live</code>.
      </p>
      {savedId && <div style={{ ...panelStyle, background: '#e6f4ea', border: '1px solid #b6e0bd' }}>
        Submission saved (<code style={codeStyle}>{savedId.slice(0, 8)}</code>) and queued for review.
      </div>}
      <form onSubmit={submit}>
        <label style={lbl}>Title<input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={240} placeholder="Court strikes down Y, or POPIA amendment Z, or ..." /></label>
        <label style={lbl}>Body
          <textarea style={{ ...inp, minHeight: 140, fontFamily: 'inherit' }} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={8000} placeholder="What happened. Why it matters to African newsrooms. Direct relevance to newsroom workflows." />
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={lbl}>Kind
            <select style={inp} value={kind} onChange={(e) => setKind(e.target.value as Update['kind'])}>
              {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label style={lbl}>Severity
            <select style={inp} value={severity} onChange={(e) => setSeverity(e.target.value as Update['severity'])}>
              <option value="info">info</option>
              <option value="advisory">advisory</option>
              <option value="urgent">urgent</option>
            </select>
          </label>
          <label style={lbl}>Published date
            <input style={inp} type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...lbl, flex: 1 }}>Source publisher
            <input style={inp} value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Information Regulator (South Africa)" />
          </label>
          <label style={{ ...lbl, flex: 1 }}>Source URL
            <input style={inp} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label style={{ ...lbl, flex: 1 }}>Country scope
            <input style={inp} value={countriesText} onChange={(e) => setCountriesText(e.target.value)} placeholder="ZA, ZW, KE" />
          </label>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" disabled={busy} style={{ ...primaryBtnStyle, marginTop: 12 }}>
          {busy ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </section>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function EntryList({ rows }: { rows: Update[] }) {
  if (rows.length === 0) return <Hint>No entries.</Hint>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((u) => (
        <li key={u.id} style={{ padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <SeverityPill severity={u.severity} />
            <KindPill kind={u.kind} />
            {(u.country_scope || []).map((c) => <span key={c} style={countryPill}>{c}</span>)}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
              {u.published_at ? shortDate(u.published_at) : '—'}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{u.title}</div>
          <p style={{ fontSize: 13, color: '#444', lineHeight: 1.5, margin: '4px 0 0' }}>{u.body}</p>
          {u.source_publisher && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {u.source_url
                ? <a href={u.source_url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>{u.source_publisher}</a>
                : u.source_publisher}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SeverityPill({ severity }: { severity: Update['severity'] }) {
  const m: Record<Update['severity'], { bg: string; fg: string }> = {
    urgent: { bg: '#fde8e8', fg: '#a00' },
    advisory: { bg: '#fff4e1', fg: '#915d00' },
    info: { bg: '#e6f0fb', fg: '#0066cc' },
  };
  return <span style={{ ...pillBase, background: m[severity].bg, color: m[severity].fg }}>{severity}</span>;
}

function KindPill({ kind }: { kind: Update['kind'] }) {
  return <span style={{ ...pillBase, background: '#f0f0f0', color: '#444' }}>{KIND_LABELS[kind]}</span>;
}

function Markdown({ text }: { text: string }) {
  // Very simple inline markdown — headers + bullets + bold. Avoids
  // shipping a parser dep for this one consumer.
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let bulletBuffer: React.ReactNode[] = [];
  function flushBullets() {
    if (bulletBuffer.length > 0) {
      out.push(<ul key={`u${out.length}`} style={{ paddingLeft: 18, margin: '4px 0' }}>{bulletBuffer}</ul>);
      bulletBuffer = [];
    }
  }
  lines.forEach((ln, i) => {
    if (/^##\s/.test(ln)) { flushBullets(); out.push(<h4 key={i} style={{ fontSize: 14, margin: '10px 0 4px' }}>{ln.replace(/^##\s/, '')}</h4>); }
    else if (/^#\s/.test(ln)) { flushBullets(); out.push(<h3 key={i} style={{ fontSize: 16, margin: '12px 0 6px' }}>{ln.replace(/^#\s/, '')}</h3>); }
    else if (/^-\s/.test(ln)) { bulletBuffer.push(<li key={i}>{renderInline(ln.replace(/^-\s/, ''))}</li>); }
    else if (/^\d+\.\s/.test(ln)) { bulletBuffer.push(<li key={i}>{renderInline(ln.replace(/^\d+\.\s/, ''))}</li>); }
    else if (ln.trim() === '') { flushBullets(); out.push(<div key={i} style={{ height: 6 }} />); }
    else { flushBullets(); out.push(<p key={i} style={{ margin: '4px 0' }}>{renderInline(ln)}</p>); }
  });
  flushBullets();
  return <>{out}</>;
}
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <span key={i}>{p}</span>;
  });
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ ...panelStyle, color: '#666', fontSize: 13 }}>{children}</div>;
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div style={errorBoxStyle}>{children}</div>;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{
    textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #ddd',
    fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3,
  }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, ...style }}>{children}</td>;
}
function shortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '—'; }
}
function shortUrl(u: string) {
  try { const url = new URL(u); return url.hostname + url.pathname.slice(0, 40); }
  catch { return u.slice(0, 60); }
}

const panelStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16,
};
const subHeadStyle: React.CSSProperties = {
  fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px',
};
const codeStyle: React.CSSProperties = {
  fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, color: '#555',
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const chipStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 7px', background: '#e0eaff', color: '#003a99', borderRadius: 4,
};
const pillBase: React.CSSProperties = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 4,
  fontSize: 11, fontWeight: 600,
};
const countryPill: React.CSSProperties = {
  ...pillBase, background: '#f0f0f0', color: '#555', fontWeight: 500,
};
const errorBoxStyle: React.CSSProperties = {
  background: '#fff3f3', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6,
  fontSize: 13, marginBottom: 16,
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', margin: '8px 0', fontWeight: 500 };
const inp: React.CSSProperties = {
  display: 'block', width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #ccc', borderRadius: 4, marginTop: 4, boxSizing: 'border-box',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4,
  fontSize: 13, cursor: 'pointer',
};
function pillBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
    background: active ? '#0066cc' : 'white',
    color: active ? 'white' : '#444',
    border: '1px solid ' + (active ? '#0066cc' : '#ccc'),
    fontWeight: active ? 600 : 400,
  };
}
function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 16px', fontSize: 14,
    background: active ? '#0066cc' : 'transparent',
    color: active ? 'white' : '#444',
    border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  };
}
