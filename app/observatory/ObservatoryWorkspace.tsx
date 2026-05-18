// ObservatoryWorkspace — V2 Step 1 dashboard.
//
// Five views, all powered by /api/observatory/summary:
//   - Recent runs        workflow_executions (multi-agent runs)
//   - Recent invocations standalone workflow_runs (direct /api/agents/<slug>)
//   - Per workflow       rollup: runs / completed / failed / cost / edits
//   - Failing agents     where errors concentrate
//   - Edit hotspots      where the model needs the most human work

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import GlobalNav from '@/app/components/GlobalNav';

type RecentRun = {
  id: string;
  workflow_id: string | null;
  workflow_slug: string | null;
  triggered_via: string;
  input_summary: string | null;
  status: string;
  node_count: number;
  total_cost_usd: string | null;
  total_duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  user_email: string;
};

type RecentInvocation = {
  id: string;
  agent: string;
  status: string;
  cost_usd: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  user_email: string;
};

type PerWorkflowRow = {
  workflow_slug: string;
  runs: number;
  completed: number;
  failed: number;
  total_cost_usd: string;
  avg_duration_ms: number;
  edit_count: number;
};

type FailureRow = { agent: string; total: number; failed: number };

type HotspotRow = {
  agent: string;
  edit_count: number;
  accepted: number;
  edited: number;
  rejected: number;
  forked: number;
  avg_diff_chars: number;
};

type Summary = {
  days: number;
  recent_runs: RecentRun[];
  recent_invocations: RecentInvocation[];
  per_workflow: PerWorkflowRow[];
  per_agent_failures: FailureRow[];
  edit_hotspots: HotspotRow[];
};

const TAB_LABELS = {
  runs: 'Recent runs',
  invocations: 'Direct agent calls',
  workflows: 'Per workflow',
  failures: 'Failing agents',
  hotspots: 'Edit hotspots',
} as const;

export default function ObservatoryWorkspace({ role }: { role: 'user' | 'builder' | 'admin' }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<keyof typeof TAB_LABELS>('runs');
  const [days, setDays] = useState(14);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/observatory/summary?days=${days}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="📡 Observatory" role={role} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Observatory</h1>
            <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
              Workflow runs, agent invocations, edits, errors and costs — for your newsroom over the last {days} days.
              {role === 'admin' && <> Cohort-level analysis lives in <a href="/mentorship" style={{ color: '#0066cc' }}>Mentorship</a> (V2 Step 2).</>}
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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
          {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}
        {loading && !data && <div style={{ fontSize: 13, color: '#666' }}>Loading…</div>}

        {data && tab === 'runs' && <RecentRunsView rows={data.recent_runs} />}
        {data && tab === 'invocations' && <RecentInvocationsView rows={data.recent_invocations} />}
        {data && tab === 'workflows' && <PerWorkflowView rows={data.per_workflow} />}
        {data && tab === 'failures' && <FailuresView rows={data.per_agent_failures} />}
        {data && tab === 'hotspots' && <HotspotsView rows={data.edit_hotspots} />}
      </div>
    </main>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────

function RecentRunsView({ rows }: { rows: RecentRun[] }) {
  if (rows.length === 0) return <Empty>No workflow runs in this window.</Empty>;
  return (
    <section style={panelStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>When</Th><Th>Workflow</Th><Th>By</Th><Th>Status</Th>
            <Th>Nodes</Th><Th>Cost</Th><Th>Duration</Th><Th>Input</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={trStyle}>
              <Td><Link href={`/observatory/runs/${r.id}`} style={linkStyle}>{shortDate(r.started_at)}</Link></Td>
              <Td><code style={codeStyle}>{r.workflow_slug || '(ad-hoc)'}</code></Td>
              <Td style={{ color: '#666' }}>{r.user_email}</Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td>{r.node_count}</Td>
              <Td>{r.total_cost_usd ? `$${Number(r.total_cost_usd).toFixed(4)}` : '—'}</Td>
              <Td>{r.total_duration_ms != null ? `${(r.total_duration_ms / 1000).toFixed(1)}s` : '—'}</Td>
              <Td style={{ color: '#888', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.input_summary || '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecentInvocationsView({ rows }: { rows: RecentInvocation[] }) {
  if (rows.length === 0) return <Empty>No direct agent calls in this window.</Empty>;
  return (
    <section style={panelStyle}>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Single-agent runs from <code>/api/agents/&lt;slug&gt;</code> — direct from the agent's own workspace, not through a workflow.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>When</Th><Th>Agent</Th><Th>By</Th><Th>Status</Th><Th>Cost</Th><Th>Duration</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={trStyle}>
              <Td><Link href={`/observatory/runs/${r.id}`} style={linkStyle}>{shortDate(r.created_at)}</Link></Td>
              <Td><code style={codeStyle}>{r.agent}</code></Td>
              <Td style={{ color: '#666' }}>{r.user_email}</Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td>{r.cost_usd ? `$${Number(r.cost_usd).toFixed(4)}` : '—'}</Td>
              <Td>{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PerWorkflowView({ rows }: { rows: PerWorkflowRow[] }) {
  if (rows.length === 0) return <Empty>No workflow runs to roll up yet.</Empty>;
  return (
    <section style={panelStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Workflow</Th><Th>Runs</Th><Th>Completed</Th><Th>Failed</Th>
            <Th>Total cost</Th><Th>Avg duration</Th><Th>Edits</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.workflow_slug} style={trStyle}>
              <Td><code style={codeStyle}>{r.workflow_slug}</code></Td>
              <Td>{r.runs}</Td>
              <Td style={{ color: '#0a7d2a' }}>{r.completed}</Td>
              <Td style={{ color: r.failed > 0 ? '#a00' : '#888' }}>{r.failed}</Td>
              <Td>${Number(r.total_cost_usd).toFixed(4)}</Td>
              <Td>{(r.avg_duration_ms / 1000).toFixed(1)}s</Td>
              <Td>{r.edit_count}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FailuresView({ rows }: { rows: FailureRow[] }) {
  if (rows.length === 0) return <Empty>No agent failures in this window. Nice.</Empty>;
  return (
    <section style={panelStyle}>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Agents whose runs have failed in this window. High <em>fail/total</em> ratio = bad prompt, bad input, or platform issue.
      </p>
      <table style={tableStyle}>
        <thead><tr><Th>Agent</Th><Th>Total runs</Th><Th>Failed</Th><Th>Fail rate</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.agent} style={trStyle}>
              <Td><code style={codeStyle}>{r.agent}</code></Td>
              <Td>{r.total}</Td>
              <Td style={{ color: '#a00' }}>{r.failed}</Td>
              <Td>{((r.failed / r.total) * 100).toFixed(0)}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HotspotsView({ rows }: { rows: HotspotRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty>
        No edit feedback recorded yet. As your team clicks Accept / Edit / Reject on agent outputs, this list shows
        where the model needs the most help.
      </Empty>
    );
  }
  return (
    <section style={panelStyle}>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Agents whose outputs your team most frequently engages with. Low <em>accept rate</em> or high <em>avg edit size</em> =
        the model needs work on this agent.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Agent</Th><Th>Edit signals</Th><Th>Accepted</Th><Th>Edited</Th>
            <Th>Rejected</Th><Th>Forked</Th><Th>Avg edit size</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const acceptRate = r.edit_count > 0 ? (r.accepted / r.edit_count) * 100 : 0;
            return (
              <tr key={r.agent} style={trStyle}>
                <Td><code style={codeStyle}>{r.agent}</code></Td>
                <Td>{r.edit_count}</Td>
                <Td style={{ color: '#0a7d2a' }}>
                  {r.accepted} <span style={{ color: '#888', fontSize: 11 }}>({acceptRate.toFixed(0)}%)</span>
                </Td>
                <Td>{r.edited}</Td>
                <Td style={{ color: r.rejected > 0 ? '#a00' : '#888' }}>{r.rejected}</Td>
                <Td>{r.forked}</Td>
                <Td>{r.avg_diff_chars} chars</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...panelStyle, color: '#666', fontSize: 13 }}>{children}</div>;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    running: { bg: '#fff4e1', fg: '#915d00' },
    completed: { bg: '#e6f4ea', fg: '#0a7d2a' },
    failed: { bg: '#fde8e8', fg: '#a00' },
    cancelled: { bg: '#f0f0f0', fg: '#666' },
  };
  const c = colors[status] || { bg: '#f0f0f0', fg: '#666' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, background: c.bg, color: c.fg, fontWeight: 600,
    }}>{status}</span>
  );
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

function shortDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const panelStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16,
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const trStyle: React.CSSProperties = {};
const codeStyle: React.CSSProperties = {
  fontSize: 12, background: '#f3f4f6', padding: '1px 6px', borderRadius: 3, color: '#333',
};
const linkStyle: React.CSSProperties = { color: '#0a5da0', textDecoration: 'none', borderBottom: '1px dotted #0a5da0' };
const errorBoxStyle: React.CSSProperties = {
  background: '#fff3f3', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6,
  fontSize: 13, marginBottom: 16,
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
