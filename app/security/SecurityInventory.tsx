'use client';

import { useEffect, useState, FormEvent } from 'react';
import GlobalNav from '@/app/components/GlobalNav';
import JurisdictionPanel from './JurisdictionPanel';

type Tool = {
  id: string;
  vendor: string;
  tool_name: string;
  data_residency: string | null;
  declared_use: string | null;
  data_kinds_exposed: string[];
  data_kinds_other: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DATA_KIND_LABELS: Record<string, string> = {
  unpublished_drafts: 'Unpublished drafts',
  source_contacts: 'Source contacts',
  article_archive: 'Article archive',
  audience_pii: 'Audience PII',
  financial_records: 'Financial records',
  other: 'Other',
};

const DATA_KIND_VALUES = Object.keys(DATA_KIND_LABELS);

export default function SecurityInventory({ role }: { role: 'builder' | 'admin' }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/security/tools');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setTools(j.tools);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <GlobalNav currentApp="Digital Security Audit" role={role} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Digital Security Audit</h1>
          <p style={{ color: '#666', fontSize: 13, margin: 0, maxWidth: 700, lineHeight: 1.5 }}>
            Inventory the external AI / data tools your newsroom uses outside Grounded. The audit
            (coming in the next slice) scores each against your jurisdiction&apos;s risk profile and
            shows what data has actually flowed through them.
          </p>
        </header>

        {error && <div style={errorBox}>{error}</div>}

        <section style={{ ...panel, marginBottom: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>External tools in use ({tools.length})</h2>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                What your newsroom uses outside Grounded. Self-reported.
              </p>
            </div>
            <button onClick={() => setAdding(a => !a)} style={primaryBtn}>
              {adding ? 'Cancel' : '+ Add tool'}
            </button>
          </header>

          {adding && (
            <AddToolForm
              onCancel={() => setAdding(false)}
              onCreated={(t) => { setTools([t, ...tools]); setAdding(false); }}
            />
          )}

          {loading ? (
            <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
          ) : tools.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>
              No external tools logged yet. Click <strong>+ Add tool</strong> to start the inventory.
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Vendor / tool</Th>
                  <Th>Residency</Th>
                  <Th>Data kinds exposed</Th>
                  <Th>Declared use</Th>
                  <Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {tools.map(t => (
                  <ToolRow
                    key={t.id}
                    tool={t}
                    onUpdate={(updated) => setTools(tools.map(x => x.id === updated.id ? updated : x))}
                    onDelete={(id) => setTools(tools.filter(x => x.id !== id))}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <JurisdictionPanel canEdit={true} />

        <RunAuditPanel canEdit={true} />

        <section style={{ ...panel, background: '#fafbfd', color: '#666' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Coming in the next slice</h3>
          <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            JSON / Markdown export of audit reports, plus Builder-workflow node integration so a workflow
            can call the audit and branch on the resulting risk band. See{' '}
            <code style={codeStyle}>docs/SECURITY_AUDIT_PLAN.md</code> Slice D for the full plan.
          </p>
        </section>
      </div>
    </div>
  );
}

function ToolRow({ tool, onUpdate, onDelete }: {
  tool: Tool;
  onUpdate: (t: Tool) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Remove ${tool.vendor} – ${tool.tool_name} from the inventory?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/security/tools/${tool.id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); alert(j.error || 'Delete failed'); return; }
      onDelete(tool.id);
    } finally { setBusy(false); }
  }

  return (
    <tr style={trStyle}>
      <Td>
        <div style={{ fontWeight: 600 }}>{tool.tool_name}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{tool.vendor}</div>
      </Td>
      <Td><code style={codeStyle}>{tool.data_residency || '—'}</code></Td>
      <Td style={{ maxWidth: 260 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tool.data_kinds_exposed.map(k => (
            <span key={k} style={kindPill}>
              {DATA_KIND_LABELS[k] || k}
              {k === 'other' && tool.data_kinds_other && `: ${tool.data_kinds_other}`}
            </span>
          ))}
        </div>
      </Td>
      <Td style={{ color: '#555', maxWidth: 280 }}>{tool.declared_use || <span style={{ color: '#bbb' }}>—</span>}</Td>
      <Td>
        <button disabled={busy} onClick={remove} style={dangerBtn}>Remove</button>
      </Td>
    </tr>
  );
  // (PATCH/edit UI is wired in Slice B alongside the residency-tweak / overrides editor.)
  void onUpdate;
}

function AddToolForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (t: Tool) => void }) {
  const [vendor, setVendor] = useState('');
  const [toolName, setToolName] = useState('');
  const [residency, setResidency] = useState('');
  const [declaredUse, setDeclaredUse] = useState('');
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleKind(k: string) {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setKinds(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/security/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: vendor.trim(),
          tool_name: toolName.trim(),
          data_residency: residency.trim().toUpperCase() || null,
          declared_use: declaredUse.trim() || null,
          data_kinds_exposed: [...kinds],
          data_kinds_other: kinds.has('other') ? other.trim() : null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || `HTTP ${res.status}`); return; }
      onCreated(j.tool);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <div style={formRow}>
        <Field label="Vendor *" required>
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="OpenAI" style={input} required />
        </Field>
        <Field label="Tool name *" required>
          <input value={toolName} onChange={e => setToolName(e.target.value)} placeholder="ChatGPT" style={input} required />
        </Field>
        <Field label="Data residency (ISO)">
          <input value={residency} onChange={e => setResidency(e.target.value)} placeholder="US" maxLength={2} style={{ ...input, width: 80, textTransform: 'uppercase' }} />
        </Field>
      </div>
      <Field label="Declared use">
        <input value={declaredUse} onChange={e => setDeclaredUse(e.target.value)} placeholder="Drafting social copy" style={input} />
      </Field>
      <Field label="Data kinds exposed">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {DATA_KIND_VALUES.map(k => (
            <label key={k} style={{ ...kindCheckbox, ...(kinds.has(k) ? kindCheckboxActive : {}) }}>
              <input
                type="checkbox"
                checked={kinds.has(k)}
                onChange={() => toggleKind(k)}
                style={{ marginRight: 6 }}
              />
              {DATA_KIND_LABELS[k]}
            </label>
          ))}
        </div>
      </Field>
      {kinds.has('other') && (
        <Field label="Other — please specify">
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. cohort survey responses" style={input} />
        </Field>
      )}
      <Field label="Notes (optional)">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...input, width: '100%', resize: 'vertical' }} />
      </Field>
      {error && <div style={errorBox}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Add tool'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </form>
  );
}

type Report = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  overall_risk_band: 'low' | 'medium' | 'high' | 'critical' | null;
  routing_window_days: number;
  started_at: string;
  finished_at: string | null;
  cost_usd: string | null;
  error: string | null;
  initiated_by_email: string | null;
};

function RunAuditPanel({ canEdit }: { canEdit: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/security/reports');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setReports(j.reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  async function runAudit() {
    setRunning(true); setError(null);
    try {
      const res = await fetch('/api/security/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`);
        if (j.reportId) window.location.href = `/security/reports/${j.reportId}`;
        return;
      }
      window.location.href = `/security/reports/${j.reportId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed');
    } finally { setRunning(false); }
  }

  return (
    <section style={{ ...panel, marginBottom: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Run an audit</h2>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            Scores the inventory above against your jurisdiction pack + reads what&rsquo;s been sent outside in the last 90 days + drafts a prioritised fix list. Typical run takes 2–6 seconds.
          </p>
        </div>
        {canEdit && (
          <button disabled={running} onClick={runAudit} style={{ ...primaryBtn, opacity: running ? 0.6 : 1 }}>
            {running ? 'Running audit…' : 'Run audit now'}
          </button>
        )}
      </header>

      {error && <div style={errorBox}>{error}</div>}

      <div>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Recent reports ({reports.length})</div>
        {loading ? (
          <p style={{ fontSize: 13, color: '#888' }}>Loading…</p>
        ) : reports.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888' }}>No audits run yet. Click <strong>Run audit now</strong> above.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th><Th>Status</Th><Th>Risk</Th><Th>Window</Th><Th>By</Th><Th>Cost</Th><Th>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} style={trStyle}>
                  <Td>{new Date(r.started_at).toLocaleString()}</Td>
                  <Td>{r.status}</Td>
                  <Td>{r.overall_risk_band || '—'}</Td>
                  <Td>{r.routing_window_days}d</Td>
                  <Td style={{ color: '#666' }}>{r.initiated_by_email || '—'}</Td>
                  <Td>{r.cost_usd ? `$${Number(r.cost_usd).toFixed(4)}` : '—'}</Td>
                  <Td><a href={`/security/reports/${r.id}`} style={{ color: '#0a5da0', fontSize: 12 }}>Open →</a></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  void required;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#666', borderBottom: '1px solid #ddd' }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, verticalAlign: 'top', ...style }}>{children}</td>;
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const trStyle: React.CSSProperties = {};
const codeStyle: React.CSSProperties = { fontSize: 11, background: '#f3f4f6', padding: '1px 6px', borderRadius: 3, color: '#333', fontFamily: 'ui-monospace, monospace' };
const kindPill: React.CSSProperties = { fontSize: 11, background: '#eef3fb', color: '#234', padding: '2px 8px', borderRadius: 10 };
const kindCheckbox: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 16, background: '#fff', cursor: 'pointer', userSelect: 'none' };
const kindCheckboxActive: React.CSSProperties = { background: '#eef6ff', borderColor: '#7aa8d8', color: '#0a5da0' };
const input: React.CSSProperties = { padding: '6px 10px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit' };
const primaryBtn: React.CSSProperties = { padding: '6px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '6px 14px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { padding: '4px 10px', background: '#fff', color: '#a02020', border: '1px solid #d8a8a8', borderRadius: 4, fontSize: 12, cursor: 'pointer' };
const errorBox: React.CSSProperties = { background: '#fdf0f0', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 };
const formStyle: React.CSSProperties = { background: '#fafbfd', border: '1px solid #e0e6ec', borderRadius: 6, padding: 16, marginBottom: 12 };
const formRow: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };
