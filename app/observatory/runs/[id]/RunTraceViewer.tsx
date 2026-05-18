'use client';

import { useEffect, useState } from 'react';

type Invocation = {
  id: string;
  agent: string;
  status: string;
  kind: string | null;
  parent_invocation_id: string | null;
  cost_usd: string | null;
  duration_ms: number | null;
  input: any;
  output: any;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  user_email?: string | null;
};

type Execution = {
  id: string;
  workflow_slug: string | null;
  status: string;
  total_cost_usd: string | null;
  total_duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  user_email: string;
  input_summary: string | null;
  error: string | null;
};

type Edit = {
  id: string;
  agent_invocation_id: string;
  edit_kind: 'accepted' | 'edited' | 'rejected' | 'forked';
  diff_chars: number | null;
  notes: string | null;
  user_email: string | null;
  created_at: string;
};

type Trace = {
  kind: 'execution' | 'invocation';
  execution: Execution | null;
  invocation: Invocation | null;
  invocations: Invocation[];
  tool_calls_by_parent: Record<string, Invocation[]>;
  edits: Edit[];
};

export default function RunTraceViewer({ id }: { id: string }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/observatory/runs/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? setTrace(j) : Promise.reject(j))))
      .catch((j) => setError(j?.error || 'Failed to load trace'));
  }, [id]);

  if (error) return <p style={{ color: '#a02020' }}>{error}</p>;
  if (!trace) return <p style={{ color: '#666' }}>Loading trace…</p>;

  const editsByInvocation = new Map<string, Edit[]>();
  for (const e of trace.edits) {
    if (!editsByInvocation.has(e.agent_invocation_id)) editsByInvocation.set(e.agent_invocation_id, []);
    editsByInvocation.get(e.agent_invocation_id)!.push(e);
  }

  return (
    <div>
      {trace.execution && <ExecutionHeader exec={trace.execution} />}
      {!trace.execution && trace.invocation && <SingleHeader inv={trace.invocation} />}

      <h2 style={{ fontSize: 16, margin: '24px 0 8px' }}>Agent invocations</h2>
      {trace.invocations.length === 0 && <p style={{ color: '#666' }}>No invocations recorded.</p>}
      {trace.invocations.map((inv) => (
        <InvocationBlock
          key={inv.id}
          inv={inv}
          toolCalls={trace.tool_calls_by_parent[inv.id] || []}
          edits={editsByInvocation.get(inv.id) || []}
        />
      ))}
    </div>
  );
}

function ExecutionHeader({ exec }: { exec: Execution }) {
  return (
    <header style={panel}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>
        {exec.workflow_slug || '(ad-hoc execution)'} <StatusPill status={exec.status} />
      </h1>
      <div style={meta}>
        Started {new Date(exec.started_at).toLocaleString()} · by {exec.user_email}
        {exec.finished_at && ` · finished ${new Date(exec.finished_at).toLocaleTimeString()}`}
      </div>
      <div style={rollup}>
        <Stat label="Cost" value={exec.total_cost_usd ? `$${Number(exec.total_cost_usd).toFixed(4)}` : '—'} />
        <Stat label="Duration" value={exec.total_duration_ms != null ? `${(exec.total_duration_ms / 1000).toFixed(1)}s` : '—'} />
      </div>
      {exec.input_summary && <Box label="Input">{exec.input_summary}</Box>}
      {exec.error && <Box label="Error" tone="error">{exec.error}</Box>}
    </header>
  );
}

function SingleHeader({ inv }: { inv: Invocation }) {
  return (
    <header style={panel}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>
        <code style={code}>{inv.agent}</code> <StatusPill status={inv.status} />
      </h1>
      <div style={meta}>
        {new Date(inv.created_at).toLocaleString()}
        {inv.user_email && ` · by ${inv.user_email}`}
        {inv.kind && ` · kind=${inv.kind}`}
      </div>
    </header>
  );
}

function InvocationBlock({
  inv, toolCalls, edits,
}: { inv: Invocation; toolCalls: Invocation[]; edits: Edit[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalToolDur = toolCalls.reduce((s, t) => s + (t.duration_ms || 0), 0);
  return (
    <section style={{ ...panel, marginBottom: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <code style={{ ...code, fontSize: 13 }}>{inv.agent}</code>
        <StatusPill status={inv.status} />
        <span style={meta}>{new Date(inv.created_at).toLocaleTimeString()}</span>
        <span style={meta}>
          {inv.duration_ms != null ? `${(inv.duration_ms / 1000).toFixed(2)}s` : '—'}
          {' · '}
          {inv.cost_usd ? `$${Number(inv.cost_usd).toFixed(4)}` : '$0'}
        </span>
        {toolCalls.length > 0 && (
          <span style={{ ...badge, background: '#eef6ff', color: '#0a5da0' }}>
            {toolCalls.length} tool call{toolCalls.length === 1 ? '' : 's'} · +{(totalToolDur / 1000).toFixed(1)}s
          </span>
        )}
        {edits.length > 0 && (
          <span style={{ ...badge, background: '#fff5e6', color: '#a06000' }}>
            {edits.length} edit{edits.length === 1 ? '' : 's'}
          </span>
        )}
        <button onClick={() => setExpanded(!expanded)} style={btn}>{expanded ? 'Collapse' : 'Expand'}</button>
      </header>

      {inv.error && <Box label="Error" tone="error">{inv.error}</Box>}

      {expanded && (
        <>
          {inv.input && <Box label="Input"><JsonView value={inv.input} maxChars={1200} /></Box>}
          {toolCalls.length > 0 && <ToolCallTree calls={toolCalls} />}
          {inv.output && <Box label="Output"><JsonView value={inv.output} maxChars={3000} /></Box>}
          {edits.length > 0 && <EditList edits={edits} />}
        </>
      )}
    </section>
  );
}

function ToolCallTree({ calls }: { calls: Invocation[] }) {
  return (
    <div style={{ marginTop: 12, paddingLeft: 16, borderLeft: '2px solid #cce4ff' }}>
      <div style={{ ...sectionLabel, color: '#0a5da0' }}>Agentic tool calls</div>
      {calls.map((c) => (
        <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px dashed #e0e0e0', fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={code}>{c.agent}</code>
            <StatusPill status={c.status} />
            <span style={meta}>{c.duration_ms != null ? `${c.duration_ms}ms` : '—'}</span>
            {c.error && <span style={{ color: '#a02020' }}>error: {c.error}</span>}
          </div>
          {c.input && <div style={subBox}><strong>in:</strong> <JsonView value={c.input} maxChars={400} /></div>}
          {c.output && <div style={subBox}><strong>out:</strong> <JsonView value={c.output} maxChars={600} /></div>}
        </div>
      ))}
    </div>
  );
}

function EditList({ edits }: { edits: Edit[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={sectionLabel}>Editor feedback</div>
      {edits.map((e) => (
        <div key={e.id} style={{ fontSize: 12, color: '#444', padding: '4px 0' }}>
          <strong style={{ color: editColor(e.edit_kind) }}>{e.edit_kind}</strong>
          {e.diff_chars != null && ` · ${e.diff_chars} chars changed`}
          {e.user_email && ` · by ${e.user_email}`}
          {' · '}{new Date(e.created_at).toLocaleString()}
          {e.notes && <div style={{ color: '#666', marginLeft: 12 }}>“{e.notes}”</div>}
        </div>
      ))}
    </div>
  );
}

function JsonView({ value, maxChars }: { value: any; maxChars: number }) {
  let s = '';
  try { s = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  catch { s = String(value); }
  const trunc = s.length > maxChars ? s.slice(0, maxChars) + `\n…(${s.length - maxChars} more chars)` : s;
  return <pre style={pre}>{trunc}</pre>;
}

function Box({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ ...box, color: tone === 'error' ? '#a02020' : undefined, background: tone === 'error' ? '#fdf0f0' : '#fafafa' }}>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    running: { bg: '#fffbe6', fg: '#a07000' },
    completed: { bg: '#e7f6e7', fg: '#1a5d1a' },
    failed: { bg: '#fdf0f0', fg: '#a02020' },
    cancelled: { bg: '#f0f0f0', fg: '#666' },
    verified: { bg: '#e7f6e7', fg: '#1a5d1a' },
    generated: { bg: '#e7f6e7', fg: '#1a5d1a' },
    pending: { bg: '#fffbe6', fg: '#a07000' },
  };
  const s = map[status] || { bg: '#eee', fg: '#444' };
  return <span style={{ ...badge, background: s.bg, color: s.fg }}>{status}</span>;
}

function editColor(k: string) {
  if (k === 'accepted') return '#1a5d1a';
  if (k === 'rejected') return '#a02020';
  if (k === 'edited') return '#a07000';
  return '#444';
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 };
const meta: React.CSSProperties = { fontSize: 12, color: '#666' };
const rollup: React.CSSProperties = { display: 'flex', gap: 32, marginTop: 12 };
const code: React.CSSProperties = { background: '#f5f5f5', padding: '2px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace', fontSize: 12 };
const badge: React.CSSProperties = { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500 };
const btn: React.CSSProperties = { marginLeft: 'auto', padding: '4px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 11, color: '#666', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 };
const box: React.CSSProperties = { background: '#fafafa', border: '1px solid #eee', borderRadius: 4, padding: 8, fontSize: 12 };
const subBox: React.CSSProperties = { background: '#f7faff', padding: '4px 8px', marginTop: 4, borderRadius: 3 };
const pre: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, fontFamily: 'ui-monospace, monospace' };
