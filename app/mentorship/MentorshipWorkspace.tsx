// MentorshipWorkspace — V2 Step 2.
//
// Three tabs:
//   Team activity      — per-user rollup of runs / edits / accept rate
//   Workflow performance — per-workflow rollup of runs / cost / edit feedback
//   Cohort signals     — anonymised aggregate across opted-in newsrooms
//
// Only admin + builder reach this page (gated server-side in page.tsx).
// The cohort tab is double-gated: the API endpoint also checks opt-in
// independently, and the UI surfaces the toggle inline.

'use client';

import { useEffect, useState } from 'react';
import GlobalNav from '@/app/components/GlobalNav';

type TeamRow = {
  user_id: string;
  email: string;
  workflow_runs: number;
  completed: number;
  failed: number;
  direct_invocations: number;
  direct_completed: number;
  direct_failed: number;
  edit_count: number;
  accepted: number;
  edited: number;
  rejected: number;
  forked: number;
  accept_rate: number | null;
  total_cost_usd: number;
  last_active: string | null;
};

type WorkflowRow = {
  workflow_id: string | null;
  workflow_name: string;
  workflow_slug: string;
  runs: number;
  completed: number;
  failed: number;
  total_cost_usd: string;
  avg_duration_ms: number;
  edits: number;
  accepted_edits: number;
  avg_edit_chars: number;
};

type TopEditRow = {
  id: string;
  workflow_run_id: string;
  workflow_execution_id: string | null;
  edit_kind: string;
  diff_chars: number | null;
  created_at: string;
  notes: string | null;
  agent: string | null;
  workflow_slug: string | null;
};

type CohortRow = {
  workflow_slug: string;
  newsrooms: number;
  runs: number;
  completed: number;
  failed: number;
  avg_cost_usd: string;
  avg_duration_ms: number;
  accept_rate: string | null;
  edit_signals: number;
};

type TeamResp = { days: number; rows: TeamRow[] };
type WorkflowsResp = { days: number; per_workflow: WorkflowRow[]; top_edits: TopEditRow[] };
type CohortResp = {
  status: 'ok' | 'opted_out';
  message?: string;
  days?: number;
  min_newsrooms_per_row: number;
  rows: CohortRow[];
};

const TAB_LABELS = {
  team: 'Team activity',
  workflows: 'Workflow performance',
  cohort: 'Cohort signals',
} as const;

export default function MentorshipWorkspace({
  role, cohortEnabled: initialCohortEnabled,
}: {
  role: 'builder' | 'admin';
  cohortEnabled: boolean;
}) {
  const [tab, setTab] = useState<keyof typeof TAB_LABELS>('team');
  const [days, setDays] = useState(14);
  const [cohortEnabled, setCohortEnabled] = useState(initialCohortEnabled);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="🪴 Mentorship" role={role} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Mentorship</h1>
            <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
              How your team uses Grounded over the last {days} days. The signal for "who's stuck", "what's working", and
              "where the model needs help". Builder + admin only — this is a leadership view, not a peer view.
            </p>
          </div>
          <label style={{ fontSize: 13, color: '#666' }}>
            Window:{' '}
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
              style={{ padding: 4, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 }}>
              <option value={1}>24 hours</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
          {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'team' && <TeamTab days={days} />}
        {tab === 'workflows' && <WorkflowsTab days={days} />}
        {tab === 'cohort' && (
          <CohortTab
            days={days}
            cohortEnabled={cohortEnabled}
            isAdmin={role === 'admin'}
            onToggle={(v) => setCohortEnabled(v)}
          />
        )}
      </div>
    </main>
  );
}

// ─── Team activity ─────────────────────────────────────────────────────────

function TeamTab({ days }: { days: number }) {
  const [data, setData] = useState<TeamResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/mentorship/team?days=${days}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) return <Hint>Loading…</Hint>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data || data.rows.length === 0) return <Hint>No active users in this window.</Hint>;

  return (
    <section style={panelStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>User</Th><Th>Workflow runs</Th><Th>Direct invocations</Th>
            <Th>Edits</Th><Th>Accept rate</Th><Th>Failed</Th>
            <Th>Cost</Th><Th>Last active</Th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.user_id}>
              <Td>{r.email}</Td>
              <Td>{r.workflow_runs} <span style={{ color: '#888', fontSize: 11 }}>({r.completed} ok, {r.failed} fail)</span></Td>
              <Td>{r.direct_invocations} <span style={{ color: '#888', fontSize: 11 }}>({r.direct_completed} ok, {r.direct_failed} fail)</span></Td>
              <Td>{r.edit_count} <span style={{ color: '#888', fontSize: 11 }}>({r.accepted}✓ {r.edited}✎ {r.rejected}✗)</span></Td>
              <Td>{r.accept_rate != null ? `${(r.accept_rate * 100).toFixed(0)}%` : '—'}</Td>
              <Td style={{ color: (r.failed + r.direct_failed) > 0 ? '#a00' : '#888' }}>{r.failed + r.direct_failed}</Td>
              <Td>${Number(r.total_cost_usd).toFixed(4)}</Td>
              <Td style={{ color: '#666' }}>{shortDate(r.last_active)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Workflow performance ──────────────────────────────────────────────────

function WorkflowsTab({ days }: { days: number }) {
  const [data, setData] = useState<WorkflowsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/mentorship/workflows?days=${days}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setData(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) return <Hint>Loading…</Hint>;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  return (
    <>
      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Per workflow ({data.per_workflow.length})</h3>
        {data.per_workflow.length === 0 ? (
          <p style={{ fontSize: 13, color: '#666' }}>No workflow runs in this window.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Workflow</Th><Th>Runs</Th><Th>Completed</Th><Th>Failed</Th>
                <Th>Edits</Th><Th>Accepted</Th><Th>Avg edit size</Th>
                <Th>Total cost</Th><Th>Avg duration</Th>
              </tr>
            </thead>
            <tbody>
              {data.per_workflow.map((r) => {
                const acceptPct = r.edits > 0 ? (r.accepted_edits / r.edits) * 100 : null;
                return (
                  <tr key={r.workflow_slug}>
                    <Td>
                      <strong>{r.workflow_name}</strong>
                      <div style={{ fontSize: 11, color: '#888' }}><code style={codeStyle}>{r.workflow_slug}</code></div>
                    </Td>
                    <Td>{r.runs}</Td>
                    <Td style={{ color: '#0a7d2a' }}>{r.completed}</Td>
                    <Td style={{ color: r.failed > 0 ? '#a00' : '#888' }}>{r.failed}</Td>
                    <Td>{r.edits}</Td>
                    <Td>{acceptPct != null ? `${acceptPct.toFixed(0)}%` : '—'}</Td>
                    <Td>{r.avg_edit_chars > 0 ? `${r.avg_edit_chars} chars` : '—'}</Td>
                    <Td>${Number(r.total_cost_usd).toFixed(4)}</Td>
                    <Td>{(r.avg_duration_ms / 1000).toFixed(1)}s</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Top edits in this window</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
          The biggest individual edits — where humans rewrote the model's output most aggressively. Open each to see the
          raw signal.
        </p>
        {data.top_edits.length === 0 ? (
          <p style={{ fontSize: 13, color: '#666' }}>No edit signals yet. Once your team clicks Edit / Reject on agent outputs, the heaviest ones appear here.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th><Th>Agent</Th><Th>Workflow</Th><Th>Kind</Th>
                <Th>Diff size</Th><Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {data.top_edits.map((e) => (
                <tr key={e.id}>
                  <Td style={{ color: '#666' }}>{shortDate(e.created_at)}</Td>
                  <Td><code style={codeStyle}>{e.agent || '—'}</code></Td>
                  <Td><code style={codeStyle}>{e.workflow_slug || '—'}</code></Td>
                  <Td><EditKindPill kind={e.edit_kind} /></Td>
                  <Td>{e.diff_chars != null ? `${e.diff_chars} chars` : '—'}</Td>
                  <Td style={{ color: '#888', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.notes || '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

// ─── Cohort signals ────────────────────────────────────────────────────────

function CohortTab({
  days, cohortEnabled, isAdmin, onToggle,
}: {
  days: number; cohortEnabled: boolean; isAdmin: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [data, setData] = useState<CohortResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/mentorship/cohort?days=${Math.max(days, 30)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setData(j); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days, cohortEnabled]);

  async function toggle(target: boolean) {
    if (!isAdmin) return;
    setToggling(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/metadata/cohort_signals_enabled', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target ? true : null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onToggle(target);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <>
      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Cohort sharing</h3>
        <p style={{ fontSize: 13, color: '#444', margin: '0 0 10px' }}>
          When on, your newsroom contributes anonymised aggregate counts (runs / completion / accept-rate per workflow)
          to a cohort-wide view. In return you see the cohort's signals. Nothing identifies any newsroom by name; only
          workflows that <em>at least 3 different newsrooms</em> use are shown.
        </p>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => toggle(!cohortEnabled)}
            disabled={toggling}
            style={cohortEnabled ? secondaryBtnStyle : primaryBtnStyle}
          >
            {toggling ? 'Saving…' : cohortEnabled ? 'Turn cohort sharing OFF' : 'Turn cohort sharing ON'}
          </button>
        ) : (
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            Admin role required to change cohort sharing. Sharing is currently <strong>{cohortEnabled ? 'on' : 'off'}</strong>.
          </p>
        )}
      </section>

      {loading && <Hint>Loading…</Hint>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {data && data.status === 'opted_out' && (
        <Hint>{data.message || 'Cohort sharing is off for your newsroom.'}</Hint>
      )}

      {data && data.status === 'ok' && (
        <section style={panelStyle}>
          <h3 style={subHeadStyle}>Cohort workflow signals</h3>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
            Only workflows with ≥{data.min_newsrooms_per_row} distinct newsrooms appear (k-anonymity).
          </p>
          {data.rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#666' }}>
              Not enough cohort participation yet — once 3+ newsrooms run the same workflow, it shows here.
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Workflow</Th><Th>Newsrooms</Th><Th>Runs</Th>
                  <Th>Accept rate</Th><Th>Edit signals</Th><Th>Avg cost</Th><Th>Avg duration</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.workflow_slug}>
                    <Td><code style={codeStyle}>{r.workflow_slug}</code></Td>
                    <Td>{r.newsrooms}</Td>
                    <Td>{r.runs}</Td>
                    <Td>{r.accept_rate != null ? `${(Number(r.accept_rate) * 100).toFixed(0)}%` : '—'}</Td>
                    <Td>{r.edit_signals}</Td>
                    <Td>${Number(r.avg_cost_usd).toFixed(4)}</Td>
                    <Td>{(r.avg_duration_ms / 1000).toFixed(1)}s</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{
    textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #ddd',
    fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3,
  }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, ...style }}>{children}</td>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ ...panelStyle, color: '#666', fontSize: 13 }}>{children}</div>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div style={errorBoxStyle}>{children}</div>;
}

function EditKindPill({ kind }: { kind: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    accepted: { bg: '#e6f4ea', fg: '#0a7d2a' },
    edited: { bg: '#e6f0fb', fg: '#0066cc' },
    rejected: { bg: '#fde8e8', fg: '#a00' },
    forked: { bg: '#fff4e1', fg: '#915d00' },
  };
  const c = map[kind] || { bg: '#f0f0f0', fg: '#666' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, background: c.bg, color: c.fg, fontWeight: 600,
    }}>{kind}</span>
  );
}

function shortDate(iso: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const panelStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16,
};
const subHeadStyle: React.CSSProperties = {
  fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px',
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const codeStyle: React.CSSProperties = {
  fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, color: '#555',
};
const errorBoxStyle: React.CSSProperties = {
  background: '#fff3f3', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6,
  fontSize: 13, marginBottom: 16,
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4,
  fontSize: 13, cursor: 'pointer',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', background: 'white', color: '#444', border: '1px solid #ccc', borderRadius: 4,
  fontSize: 13, cursor: 'pointer',
};
function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 16px', fontSize: 14,
    background: active ? '#0066cc' : 'transparent',
    color: active ? 'white' : '#444',
    border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  };
}
