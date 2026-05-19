'use client';

import { useEffect, useState } from 'react';

type Source = { title: string; url?: string | null; evidence_kind?: string | null; cite?: string | null };
type Scoring = { risk_band: 'low' | 'medium' | 'high' | 'critical'; reasons: { kind: string; severity?: string; reason?: string; sources?: Source[]; last_verified?: string | null; vendor?: string; tool_name?: string; residency?: string; data_kinds?: string[]; summary?: string }[] };
type InventoryEntry = {
  vendor: string;
  tool_name: string;
  data_residency: string | null;
  declared_use: string | null;
  data_kinds_exposed: string[];
  risk_band: Scoring['risk_band'];
  reasons: Scoring['reasons'];
};

type HistoryRow = {
  workflow_slug: string;
  sensitivity_label: string;
  executed_on: string;
  runs: number;
  completed: number;
  failed: number;
};

type FixItem = { priority: 'critical' | 'high' | 'medium' | 'low'; title: string; action: string; evidence: string };

type Summary = {
  generated_at: string;
  jurisdiction: string;
  jurisdiction_pack: { data_law_summary: string; data_law_sources: Source[]; audit_depth: 'deep' | 'light'; last_verified: string | null };
  inventory_with_scoring: InventoryEntry[];
  counts_by_band: { low: number; medium: number; high: number; critical: number };
  overall_risk_band: Scoring['risk_band'];
  routing_window_days: number;
  routing_totals: { runs: number; by_sensitivity: Record<string, number>; by_target: Record<string, number> };
  routing_history: HistoryRow[];
  summary_narrative: string;
  fix_list: FixItem[];
  concerns_noted: string[];
};

type Report = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  overall_risk_band: Scoring['risk_band'] | null;
  routing_window_days: number;
  summary_json: Summary | null;
  inventory_snapshot_json: unknown[];
  started_at: string;
  finished_at: string | null;
  cost_usd: string | null;
  error: string | null;
  initiated_by_email: string | null;
};

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export default function ReportViewer({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/security/reports/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? setReport(j.report) : Promise.reject(j))))
      .catch((j) => setError(j?.error || 'Failed to load report'));
  }, [id]);

  if (error) return <p style={{ color: '#a02020' }}>{error}</p>;
  if (!report) return <p style={{ color: '#666' }}>Loading report…</p>;

  if (report.status === 'failed') {
    return (
      <div style={panel}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Audit failed</h1>
        <p style={{ fontSize: 13, color: '#a02020', whiteSpace: 'pre-wrap' }}>{report.error || 'Unknown error'}</p>
        <p style={{ fontSize: 12, color: '#888' }}>
          Started {new Date(report.started_at).toLocaleString()} by {report.initiated_by_email || '—'}.
        </p>
      </div>
    );
  }

  if (report.status === 'running' || !report.summary_json) {
    return (
      <div style={panel}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Audit running…</h1>
        <p style={{ fontSize: 13, color: '#666' }}>Typical runs take 2–6 seconds. Refresh to check.</p>
      </div>
    );
  }

  const s = report.summary_json;
  const sortedFixes = [...s.fix_list].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));

  return (
    <div>
      <header style={{ ...panel, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Audit report</h1>
          <BandPill band={s.overall_risk_band} />
          <span style={meta}>jurisdiction: <strong>{s.jurisdiction}</strong></span>
          <span style={meta}>routing window: <strong>{s.routing_window_days} days</strong></span>
        </div>
        <div style={{ ...meta, marginTop: 6 }}>
          generated {new Date(s.generated_at).toLocaleString()}
          {report.initiated_by_email && ` · by ${report.initiated_by_email}`}
          {report.cost_usd && ` · cost $${Number(report.cost_usd).toFixed(4)}`}
        </div>
        {s.summary_narrative && (
          <p style={{ fontSize: 14, color: '#222', marginTop: 12, lineHeight: 1.55 }}>{s.summary_narrative}</p>
        )}
      </header>

      <section style={panel}>
        <h2 style={h2}>Prioritised fixes ({sortedFixes.length})</h2>
        {sortedFixes.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No fixes recommended. (Either the inventory is empty or no risks were detected.)</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sortedFixes.map((f, i) => (
              <article key={i} style={fixCard}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <PriorityPill priority={f.priority} />
                  <strong style={{ fontSize: 14 }}>{f.title}</strong>
                </div>
                <p style={{ fontSize: 13, color: '#333', margin: '6px 0 0', lineHeight: 1.5 }}>{f.action}</p>
                {f.evidence && (
                  <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>Evidence: {f.evidence}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={panel}>
        <h2 style={h2}>Inventory risks ({s.inventory_with_scoring.length})</h2>
        {s.inventory_with_scoring.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No external tools in the inventory.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {s.inventory_with_scoring
              .slice()
              .sort((a, b) => bandRank(b.risk_band) - bandRank(a.risk_band))
              .map((t, i) => (
                <InventoryRow key={i} entry={t} />
              ))}
          </div>
        )}
      </section>

      <section style={panel}>
        <h2 style={h2}>What's been sent outside (last {s.routing_window_days} days)</h2>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          <Stat label="Total runs" value={String(s.routing_totals.runs)} />
          <Stat label="Sensitive" value={String(s.routing_totals.by_sensitivity.sensitive || 0)} tone="warn" />
          <Stat label="Cloud (Anthropic)" value={String(s.routing_totals.by_target.cloud || 0)} />
          <Stat label="Appliance (local)" value={String(s.routing_totals.by_target.appliance || 0)} />
        </div>
        {s.routing_history.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No workflow runs recorded in this window.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr><Th>Workflow</Th><Th>Sensitivity</Th><Th>Ran on</Th><Th>Runs</Th><Th>Completed</Th><Th>Failed</Th></tr>
            </thead>
            <tbody>
              {s.routing_history.map((r, i) => (
                <tr key={i} style={trStyle}>
                  <Td><code style={codeStyle}>{r.workflow_slug}</code></Td>
                  <Td><SensitivityPill label={r.sensitivity_label} /></Td>
                  <Td><TargetPill target={r.executed_on} /></Td>
                  <Td>{r.runs}</Td>
                  <Td>{r.completed}</Td>
                  <Td style={{ color: r.failed > 0 ? '#a02020' : undefined }}>{r.failed}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ ...panel, background: '#fafbfd' }}>
        <h2 style={h2}>Jurisdiction context</h2>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 4px' }}>
          {s.jurisdiction} · {s.jurisdiction_pack.audit_depth} pack
          {s.jurisdiction_pack.last_verified && ` · verified ${s.jurisdiction_pack.last_verified}`}
        </p>
        <p style={{ fontSize: 13, color: '#333', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{s.jurisdiction_pack.data_law_summary}</p>
        {s.jurisdiction_pack.data_law_sources?.length > 0 && (
          <SourceList sources={s.jurisdiction_pack.data_law_sources} />
        )}
      </section>

      {s.concerns_noted.length > 0 && (
        <section style={panel}>
          <h2 style={h2}>Concerns noted</h2>
          <ul style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
            {s.concerns_noted.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function InventoryRow({ entry }: { entry: InventoryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={invCard}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <BandPill band={entry.risk_band} />
        <strong style={{ fontSize: 13 }}>{entry.vendor} · {entry.tool_name}</strong>
        {entry.data_residency && <code style={codeStyle}>{entry.data_residency}</code>}
        <span style={{ fontSize: 11, color: '#888' }}>{entry.declared_use || 'no declared use'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#0a5da0' }}>{open ? '▲' : '▼'} {entry.reasons.length} reason{entry.reasons.length === 1 ? '' : 's'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {entry.reasons.map((r, i) => (
            <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px dashed #eee' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 2 }}>
                {r.kind}{r.severity ? ` · ${r.severity}` : ''}
              </div>
              {r.reason && <p style={{ fontSize: 12, color: '#444', margin: '2px 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.reason}</p>}
              {r.residency && <p style={{ fontSize: 12, color: '#666', margin: '2px 0' }}>residency: <code style={codeStyle}>{r.residency}</code></p>}
              {r.data_kinds && r.data_kinds.length > 0 && <p style={{ fontSize: 12, color: '#666' }}>data: {r.data_kinds.join(', ')}</p>}
              {r.sources && r.sources.length > 0 && <SourceList sources={r.sources} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>Sources ({sources.length})</summary>
      <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 11, color: '#666', lineHeight: 1.5 }}>
        {sources.map((s, i) => (
          <li key={i}>
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0a5da0' }}>{s.title}</a> : <span>{s.title}</span>}
            {s.evidence_kind && <span style={evPill}>{s.evidence_kind}</span>}
            {s.cite && <span style={{ color: '#888' }}> — {s.cite}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function bandRank(b: string) { return ({ low: 0, medium: 1, high: 2, critical: 3 } as Record<string, number>)[b] ?? 0; }

function BandPill({ band }: { band: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    low: { bg: '#e7f6e7', fg: '#1a5d1a' },
    medium: { bg: '#fffbe6', fg: '#a07000' },
    high: { bg: '#fdf0e0', fg: '#a04000' },
    critical: { bg: '#fdf0f0', fg: '#a02020' },
  };
  const c = map[band] || map.low;
  return <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '2px 10px', borderRadius: 10, background: c.bg, color: c.fg }}>{band}</span>;
}

function PriorityPill({ priority }: { priority: string }) {
  return <BandPill band={priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : priority === 'medium' ? 'medium' : 'low'} />;
}

function SensitivityPill({ label }: { label: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    public: { bg: '#e7f6e7', fg: '#1a5d1a' },
    internal: { bg: '#fffbe6', fg: '#a07000' },
    sensitive: { bg: '#fdf0f0', fg: '#a02020' },
    unlabelled: { bg: '#f0f0f0', fg: '#666' },
  };
  const c = map[label] || map.unlabelled;
  return <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: c.bg, color: c.fg }}>{label}</span>;
}

function TargetPill({ target }: { target: string }) {
  const isCloud = target === 'cloud';
  return (
    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: isCloud ? '#eef3fb' : '#e7f6e7', color: isCloud ? '#234' : '#1a5d1a' }}>
      {target}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: tone === 'warn' ? '#a04000' : '#222' }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#666', borderBottom: '1px solid #ddd' }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f0f0f0', ...style }}>{children}</td>;
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 15, margin: '0 0 10px' };
const meta: React.CSSProperties = { fontSize: 12, color: '#666' };
const fixCard: React.CSSProperties = { padding: 12, background: '#fafbfd', border: '1px solid #eef0f3', borderRadius: 6 };
const invCard: React.CSSProperties = { padding: 10, background: '#fafbfd', border: '1px solid #eef0f3', borderRadius: 6 };
const codeStyle: React.CSSProperties = { fontSize: 11, background: '#f3f4f6', padding: '1px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const trStyle: React.CSSProperties = {};
const evPill: React.CSSProperties = { fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8, background: '#eef3fb', color: '#234', textTransform: 'uppercase', letterSpacing: 0.3 };
