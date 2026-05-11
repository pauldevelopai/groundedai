// LearningWorkspace — three regions: updates feed, cohort metrics,
// promoted workflows. Read-only for users; builders/admins can ack-or-
// dismiss updates and adopt promoted workflows.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

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
  ack_decision: 'applies' | 'dismissed' | 'pending' | null;
  ack_notes: string | null;
};
type Metrics = {
  cohort_size: number;
  workflows_total: number;
  workflow_runs_30d: number;
  briefs_by_agent_30d: Array<{ agent: string; n: number }>;
  verifier: { runs_30d: number; runs_with_credibility_match: number; by_status: Array<{ status: string; n: number }> };
  social: { signals_30d: number; signals_with_io_network_match: number; by_status: Array<{ status: string; n: number }> };
  distribution: { sends_30d: number; by_status: Array<{ status: string; n: number }> };
  audience: { consultations_30d: number; by_kind: Array<{ kind: string; n: number }> };
};
type Promotion = {
  id: string;
  workflow_id: string;
  title: string;
  problem_statement: string | null;
  problem_category: string | null;
  origin_newsroom_name: string | null;
  usage_count: number;
  cohort_adopter_count: number;
  cohort_success_rate: number | string | null;
  recommendation_note: string | null;
  status: string;
  adoption_id: string | null;
  adopted_at: string | null;
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

export default function LearningWorkspace({
  initialUpdates, initialMetrics, initialPromotions, canEdit, isAdmin, role,
}: {
  initialUpdates: Update[];
  initialMetrics: Metrics;
  initialPromotions: Promotion[];
  canEdit: boolean;
  isAdmin: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [updates, setUpdates] = useState(initialUpdates);
  const [metrics] = useState(initialMetrics);
  const [promotions, setPromotions] = useState(initialPromotions);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>📚 Learning</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Distributor →</Link>
        <Link href="/social" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Social →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Learning</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Curated AI-ethics, data-law, and press-freedom updates for African newsrooms · cohort meta-analytics across all newsrooms · workflows the cohort has adopted at scale.
        </p>

        <UpdatesSection updates={updates} canEdit={canEdit} isAdmin={isAdmin} onChange={setUpdates} onRefresh={() => router.refresh()} />
        <CohortSection metrics={metrics} />
        <PromotionsSection promotions={promotions} canEdit={canEdit} isAdmin={isAdmin} onChange={setPromotions} onRefresh={() => router.refresh()} />
      </div>
    </main>
  );
}

// ─── Updates feed ──────────────────────────────────────────────────────────

function UpdatesSection({
  updates, canEdit, isAdmin, onChange, onRefresh,
}: {
  updates: Update[]; canEdit: boolean; isAdmin: boolean;
  onChange: (rows: Update[]) => void; onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'advisory' | 'pending_ack'>('all');

  const filtered = updates.filter(u => {
    if (filter === 'urgent') return u.severity === 'urgent';
    if (filter === 'advisory') return u.severity === 'advisory' || u.severity === 'urgent';
    if (filter === 'pending_ack') return u.ack_decision !== 'applies' && u.ack_decision !== 'dismissed';
    return true;
  });

  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>📰 Updates</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            Curated AI-ethics / data-law / security / press-freedom feed. Mark items that apply to your newsroom or dismiss those that don&apos;t.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['all', 'pending_ack', 'urgent', 'advisory'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...miniBtn,
              background: filter === f ? '#0066cc' : 'white',
              color: filter === f ? 'white' : '#444',
              borderColor: filter === f ? '#0066cc' : '#d0d0d0',
              fontWeight: filter === f ? 600 : 400,
            }}>
              {f === 'all' ? 'All' : f === 'pending_ack' ? 'Needs review' : f}
            </button>
          ))}
          {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add update'}</button>}
        </div>
      </div>
      {adding && canEdit && (
        <AddUpdateForm isAdmin={isAdmin} onCancel={() => setAdding(false)} onCreated={(u) => { onChange([u, ...updates]); setAdding(false); onRefresh(); }} />
      )}
      {filtered.length === 0 ? <Empty text="No updates match this filter." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(u => (
            <UpdateCard key={u.id} update={u} canEdit={canEdit} onChange={(updated) => onChange(updates.map(x => x.id === updated.id ? updated : x))} />
          ))}
        </div>
      )}
    </section>
  );
}

function UpdateCard({ update: u, canEdit, onChange }: { update: Update; canEdit: boolean; onChange: (u: Update) => void }) {
  const [busy, setBusy] = useState(false);
  async function ack(decision: 'applies' | 'dismissed' | 'pending') {
    setBusy(true);
    const res = await fetch(`/api/learning/updates/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { alert(data.error || 'Failed'); return; }
    onChange(data.update);
  }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{u.title}</strong>
            <Tag accent={severityTone(u.severity)}>{u.severity}</Tag>
            <Tag muted>{KIND_LABELS[u.kind]}</Tag>
            {u.country_scope.length > 0 && <Tag muted>{u.country_scope.join(', ')}</Tag>}
            {u.is_default && <Tag muted>cohort</Tag>}
            {u.ack_decision === 'applies' && <Tag accent={severityTone('advisory')}>✓ applies to us</Tag>}
            {u.ack_decision === 'dismissed' && <Tag muted>dismissed</Tag>}
          </div>
          <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.5 }}>{u.body}</p>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            {u.source_publisher && <span>{u.source_publisher}</span>}
            {u.published_at && <span> · {new Date(u.published_at).toISOString().slice(0, 10)}</span>}
            {u.source_url && <> · <a href={u.source_url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>source ↗</a></>}
            {u.applies_to_agents.length > 0 && <span> · applies to {u.applies_to_agents.join(', ')}</span>}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {u.ack_decision !== 'applies' && (
              <button disabled={busy} onClick={() => ack('applies')} style={miniBtn}>Applies</button>
            )}
            {u.ack_decision !== 'dismissed' && (
              <button disabled={busy} onClick={() => ack('dismissed')} style={miniBtn}>Dismiss</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddUpdateForm({ isAdmin, onCancel, onCreated }: { isAdmin: boolean; onCancel: () => void; onCreated: (u: Update) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Update['kind']>('governance');
  const [severity, setSeverity] = useState<Update['severity']>('info');
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [scope, setScope] = useState('');
  const [cohort, setCohort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/learning/updates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body, kind, severity,
          source_publisher: publisher || undefined,
          source_url: url || undefined,
          published_at: publishedAt || undefined,
          country_scope: scope.split(',').map(s => s.trim()).filter(Boolean),
          cohort,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.update);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Title"><input required value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></Field>
      <Field label="Body"><textarea required rows={4} value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Kind">
          <select value={kind} onChange={e => setKind(e.target.value as Update['kind'])} style={inputStyle}>
            <option value="governance">Governance</option>
            <option value="ethics">Ethics</option>
            <option value="data_law">Data law</option>
            <option value="security">Security</option>
            <option value="model_change">Model change</option>
            <option value="platform_takedown">Platform takedown</option>
            <option value="press_freedom">Press freedom</option>
          </select>
        </Field>
        <Field label="Severity">
          <select value={severity} onChange={e => setSeverity(e.target.value as Update['severity'])} style={inputStyle}>
            <option value="info">Info</option>
            <option value="advisory">Advisory</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Country scope (comma-sep)"><input value={scope} onChange={e => setScope(e.target.value)} style={inputStyle} placeholder="ZA, ZM" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8 }}>
        <Field label="Publisher"><input value={publisher} onChange={e => setPublisher(e.target.value)} style={inputStyle} /></Field>
        <Field label="Source URL"><input type="url" value={url} onChange={e => setUrl(e.target.value)} style={inputStyle} /></Field>
        <Field label="Published"><input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} style={inputStyle} /></Field>
      </div>
      {isAdmin && (
        <label style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={cohort} onChange={e => setCohort(e.target.checked)} />
          Share across the cohort (visible to all newsrooms)
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !title.trim() || !body.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add update'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Cohort metrics ────────────────────────────────────────────────────────

function CohortSection({ metrics }: { metrics: Metrics }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>📊 Cohort meta-analytics (last 30 days)</h2>
      <p style={{ fontSize: 13, color: '#666', margin: '2px 0 8px' }}>
        Anonymised aggregates across all {metrics.cohort_size} newsrooms in the cohort. Your newsroom is included in the rollup.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        <MetricCard label="Newsrooms in cohort" value={metrics.cohort_size} />
        <MetricCard label="Workflows total" value={metrics.workflows_total} />
        <MetricCard label="Workflow runs (30d)" value={metrics.workflow_runs_30d} />
      </div>
      <h3 style={{ fontSize: 13, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 }}>Briefs by agent (30d)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {metrics.briefs_by_agent_30d.map(b => (
          <MetricCard key={b.agent} label={b.agent} value={b.n} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginTop: 10 }}>
        <DetailCard
          label="Verifier"
          rows={[
            ['Runs (30d)', metrics.verifier.runs_30d],
            ['…with credibility-map matches', metrics.verifier.runs_with_credibility_match],
            ...metrics.verifier.by_status.map(r => [`status: ${r.status}`, r.n]) as Array<[string, number]>,
          ]}
        />
        <DetailCard
          label="Social Listener"
          rows={[
            ['Signals (30d)', metrics.social.signals_30d],
            ['…matched a documented IO network', metrics.social.signals_with_io_network_match],
            ...metrics.social.by_status.map(r => [`status: ${r.status}`, r.n]) as Array<[string, number]>,
          ]}
        />
        <DetailCard
          label="Distributor sends"
          rows={[
            ['Sends (30d)', metrics.distribution.sends_30d],
            ...metrics.distribution.by_status.map(r => [`status: ${r.status}`, r.n]) as Array<[string, number]>,
          ]}
        />
        <DetailCard
          label="Audience consultations"
          rows={[
            ['Total (30d)', metrics.audience.consultations_30d],
            ...metrics.audience.by_kind.map(r => [`kind: ${r.kind}`, r.n]) as Array<[string, number]>,
          ]}
        />
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ ...cardStyle, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function DetailCard({ label, rows }: { label: string; rows: Array<[string, number]> }) {
  return (
    <div style={{ ...cardStyle, padding: '10px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <table style={{ width: '100%', fontSize: 12, marginTop: 6, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
              <td style={{ padding: '4px 0', color: '#666' }}>{k}</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Promoted workflows ────────────────────────────────────────────────────

function PromotionsSection({
  promotions, canEdit, isAdmin, onChange, onRefresh,
}: {
  promotions: Promotion[]; canEdit: boolean; isAdmin: boolean;
  onChange: (rows: Promotion[]) => void; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function recompute() {
    setBusy(true);
    const res = await fetch('/api/learning/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    setBusy(false);
    if (!res.ok) { alert((await res.json()).error || 'Failed'); return; }
    onRefresh();
  }
  async function adopt(promotionId: string) {
    setBusy(true);
    const res = await fetch(`/api/learning/workflows/${promotionId}/adopt`, { method: 'POST' });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed'); return; }
    onChange(promotions.map(p => p.id === promotionId ? { ...p, adoption_id: data.adoption.id, adopted_at: data.adoption.created_at } : p));
  }
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>⭐ Promoted workflows</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            Workflows the cohort has adopted at scale. Click adopt to add to your newsroom&apos;s starter library.
          </p>
        </div>
        {isAdmin && (
          <button onClick={recompute} disabled={busy} style={ghostBtn}>{busy ? 'Recomputing…' : 'Recompute promotions'}</button>
        )}
      </div>
      {promotions.length === 0 ? (
        <Empty text="No promoted workflows yet — promotions appear after a workflow has been adopted by ≥2 cohort newsrooms with ≥5 runs." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {promotions.map(p => (
            <div key={p.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{p.title}</strong>
                  {p.problem_category && <Tag muted>{p.problem_category}</Tag>}
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                    Origin: {p.origin_newsroom_name || 'unknown'} ·
                    {' '}{p.cohort_adopter_count} cohort adopters · {p.usage_count} runs
                    {p.cohort_success_rate != null && <> · success {(parseFloat(String(p.cohort_success_rate)) * 100).toFixed(0)}%</>}
                  </div>
                  {p.problem_statement && <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.5 }}>{p.problem_statement}</p>}
                  {p.recommendation_note && <p style={{ fontSize: 12, color: '#5a3a99', margin: '6px 0 0', fontStyle: 'italic' }}>{p.recommendation_note}</p>}
                </div>
                {canEdit && (p.adoption_id ? (
                  <span style={{ fontSize: 12, color: '#1a5d1a', alignSelf: 'center' }}>✓ adopted</span>
                ) : (
                  <button onClick={() => adopt(p.id)} disabled={busy} style={primaryBtn}>Adopt</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 4 }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: 18, background: 'white', border: '1px dashed #d0d0d0', borderRadius: 8, color: '#777', fontSize: 13, textAlign: 'center' }}>{text}</div>;
}
function Tag({ children, muted = false, accent }: { children: React.ReactNode; muted?: boolean; accent?: { bg: string; fg: string } }) {
  const style = accent
    ? { background: accent.bg, color: accent.fg }
    : muted ? { background: '#eef0f3', color: '#555' } : { background: '#e6f0ff', color: '#0044aa' };
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 4, ...style }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8,
  padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'white', color: '#0066cc', border: '1px solid #0066cc',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
};

function severityTone(s: 'info' | 'advisory' | 'urgent') {
  if (s === 'urgent') return { bg: '#ffe6e6', fg: '#a02020' };
  if (s === 'advisory') return { bg: '#fff8e6', fg: '#8a5400' };
  return { bg: '#e0f0ff', fg: '#0044aa' };
}
