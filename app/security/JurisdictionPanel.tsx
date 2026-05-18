'use client';

import { useEffect, useState } from 'react';

type Entry = {
  vendor?: string | null;
  tool_name?: string | null;
  severity?: 'warn' | 'avoid' | 'prohibit';
  reason?: string;
};

type Pack = {
  data_law_summary: string;
  safe_residencies: string[];
  risky_residencies: string[];
  tool_avoid_list: Entry[];
  tool_allow_list: Entry[];
};

type Overrides = {
  safe_residencies?: string[];
  risky_residencies?: string[];
  tool_avoid_list?: Entry[];
  tool_allow_list?: Entry[];
} | null;

type EffectiveResponse = {
  jurisdiction: string;
  pack: Pack;
  overrides: Overrides;
  effective: Pack;
};

const JURISDICTION_OPTIONS = [
  { value: 'default', label: 'Default (conservative)' },
  { value: 'ZA', label: 'South Africa (POPIA)' },
  { value: 'ZW', label: 'Zimbabwe' },
  { value: 'ZM', label: 'Zambia' },
  { value: 'KE', label: 'Kenya' },
  { value: 'EU', label: 'European Union (GDPR)' },
  { value: 'US', label: 'United States' },
];

export default function JurisdictionPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<EffectiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingJur, setSavingJur] = useState(false);
  const [overridesDraft, setOverridesDraft] = useState('');
  const [savingOverrides, setSavingOverrides] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/security/jurisdiction/effective');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
      setOverridesDraft(j.overrides ? JSON.stringify(j.overrides, null, 2) : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jurisdiction');
    }
  }

  async function saveJurisdiction(value: string) {
    setSavingJur(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/metadata/jurisdiction', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value === 'default' ? null : value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingJur(false); }
  }

  async function saveOverrides() {
    setSavingOverrides(true); setError(null);
    try {
      let parsed: unknown = null;
      if (overridesDraft.trim()) {
        try { parsed = JSON.parse(overridesDraft); }
        catch { setError('Overrides must be valid JSON'); setSavingOverrides(false); return; }
      }
      const res = await fetch('/api/newsroom/metadata/jurisdiction_overrides', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsed }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingOverrides(false); }
  }

  if (!data) return <section style={panel}><p style={{ color: '#888', fontSize: 13 }}>Loading jurisdiction…</p></section>;

  return (
    <section style={panel}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Jurisdiction & overrides</h2>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          The audit scores each external tool against the rulebook for this jurisdiction. You can override specific entries below.
        </p>
      </header>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#444' }}>This newsroom is in:</label>
        <select
          disabled={!canEdit || savingJur}
          value={data.jurisdiction}
          onChange={(e) => saveJurisdiction(e.target.value)}
          style={select}
        >
          {JURISDICTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {savingJur && <span style={{ fontSize: 11, color: '#888' }}>saving…</span>}
      </div>

      {data.pack.data_law_summary && (
        <div style={lawBlock}>
          <strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#555', letterSpacing: 0.5 }}>Data-law summary</strong>
          <p style={{ fontSize: 13, color: '#333', margin: '4px 0 0', lineHeight: 1.5 }}>{data.pack.data_law_summary}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ResidencyList title="Safe residencies (effective)" items={data.effective.safe_residencies} tone="safe" />
        <ResidencyList title="Risky residencies (effective)" items={data.effective.risky_residencies} tone="risky" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <ListBlock title="Avoid list (effective)" items={data.effective.tool_avoid_list} tone="avoid" />
      </div>

      {data.effective.tool_allow_list.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ListBlock title="Allow list (your overrides)" items={data.effective.tool_allow_list} tone="allow" />
        </div>
      )}

      <details style={{ marginTop: 16 }}>
        <summary style={{ fontSize: 13, cursor: 'pointer', color: '#0a5da0' }}>
          {canEdit ? 'Edit overrides (JSON)' : 'View raw overrides (JSON)'}
        </summary>
        <p style={{ fontSize: 11, color: '#888', margin: '6px 0' }}>
          Shape: <code style={codeStyle}>{`{ safe_residencies?: string[], risky_residencies?: string[], tool_avoid_list?: Entry[], tool_allow_list?: Entry[] }`}</code> where Entry is <code style={codeStyle}>{`{ vendor?, tool_name?, severity?: 'warn'|'avoid'|'prohibit', reason? }`}</code>. Leave blank to clear.
        </p>
        <textarea
          value={overridesDraft}
          onChange={(e) => setOverridesDraft(e.target.value)}
          rows={10}
          readOnly={!canEdit}
          style={{ ...input, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          placeholder='e.g. { "tool_allow_list": [{ "vendor": "OpenAI", "reason": "EU-residency enterprise contract" }] }'
        />
        {canEdit && (
          <button onClick={saveOverrides} disabled={savingOverrides} style={{ ...primaryBtn, marginTop: 8 }}>
            {savingOverrides ? 'Saving…' : 'Save overrides'}
          </button>
        )}
      </details>
    </section>
  );
}

function ResidencyList({ title, items, tone }: { title: string; items: string[]; tone: 'safe' | 'risky' }) {
  return (
    <div>
      <div style={sectionLabel}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.length === 0 ? (
          <span style={{ color: '#bbb', fontSize: 12 }}>none</span>
        ) : items.map(r => (
          <span key={r} style={tone === 'safe' ? safePill : riskyPill}>{r}</span>
        ))}
      </div>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: Entry[]; tone: 'avoid' | 'allow' }) {
  return (
    <div>
      <div style={sectionLabel}>{title} <span style={{ color: '#aaa', fontWeight: 400 }}>({items.length})</span></div>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: '#bbb', margin: 4 }}>—</p>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {items.map((e, i) => (
            <div key={i} style={entryRow}>
              <strong style={{ fontSize: 12 }}>{e.vendor || ''}{e.vendor && e.tool_name ? ' · ' : ''}{e.tool_name || ''}</strong>
              {e.severity && <span style={tone === 'allow' ? severityPillAllow(e.severity) : severityPill(e.severity)}>{e.severity}</span>}
              {e.reason && <span style={{ fontSize: 12, color: '#666' }}>{e.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 };
const select: React.CSSProperties = { padding: '4px 8px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4 };
const lawBlock: React.CSSProperties = { background: '#fafbfd', border: '1px solid #eef0f3', padding: 10, borderRadius: 6, marginBottom: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 11, color: '#666', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600, letterSpacing: 0.3 };
const safePill: React.CSSProperties = { fontSize: 11, background: '#e7f6e7', color: '#1a5d1a', padding: '2px 8px', borderRadius: 10 };
const riskyPill: React.CSSProperties = { fontSize: 11, background: '#fdf0e0', color: '#a06000', padding: '2px 8px', borderRadius: 10 };
const entryRow: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 6px', background: '#fafafa', borderRadius: 4 };
const codeStyle: React.CSSProperties = { fontSize: 11, background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 };
const input: React.CSSProperties = { padding: '6px 10px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4 };
const primaryBtn: React.CSSProperties = { padding: '6px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' };
const errorBox: React.CSSProperties = { background: '#fdf0f0', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 };

function severityPill(sev: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    warn: { background: '#fffbe6', color: '#a07000' },
    avoid: { background: '#fdf0e0', color: '#a04000' },
    prohibit: { background: '#fdf0f0', color: '#a02020' },
  };
  return { fontSize: 10, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', fontWeight: 600, ...(map[sev] || {}) };
}
function severityPillAllow(sev: string): React.CSSProperties {
  // Allow-list entries don't really have a severity, but render gracefully.
  void sev;
  return { fontSize: 10, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', fontWeight: 600, background: '#e7f6e7', color: '#1a5d1a' };
}
