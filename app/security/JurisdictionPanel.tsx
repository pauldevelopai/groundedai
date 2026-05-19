'use client';

import { useEffect, useState } from 'react';

type Source = {
  title: string;
  url?: string | null;
  evidence_kind?: string | null;
  cite?: string | null;
};

type Entry = {
  vendor?: string | null;
  tool_name?: string | null;
  severity?: 'warn' | 'avoid' | 'prohibit';
  reason?: string;
  sources?: Source[];
  last_verified?: string | null;
};

type Pack = {
  audit_depth?: 'deep' | 'light';
  last_verified?: string | null;
  data_law_summary: string;
  data_law_sources?: Source[];
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#555', letterSpacing: 0.5 }}>Data-law summary</strong>
            <DepthBadge depth={data.pack.audit_depth} />
            {data.pack.last_verified && (
              <span style={{ fontSize: 10, color: '#888' }}>verified {data.pack.last_verified}</span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#333', margin: '4px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.pack.data_law_summary}</p>
          {data.pack.data_law_sources && data.pack.data_law_sources.length > 0 && (
            <Sources sources={data.pack.data_law_sources} />
          )}
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
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map((e, i) => (
            <div key={i} style={entryRow}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12 }}>{e.vendor || ''}{e.vendor && e.tool_name ? ' · ' : ''}{e.tool_name || ''}</strong>
                {e.severity && <span style={tone === 'allow' ? severityPillAllow(e.severity) : severityPill(e.severity)}>{e.severity}</span>}
                {e.last_verified && <span style={{ fontSize: 10, color: '#888' }}>verified {e.last_verified}</span>}
              </div>
              {e.reason && (
                <p style={{ fontSize: 12, color: '#444', margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{e.reason}</p>
              )}
              {e.sources && e.sources.length > 0 && <Sources sources={e.sources} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>
        Sources ({sources.length})
      </summary>
      <ul style={{ margin: '4px 0 0 0', padding: '0 0 0 16px', fontSize: 11, color: '#666', lineHeight: 1.5 }}>
        {sources.map((s, i) => (
          <li key={i}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0a5da0' }}>{s.title}</a>
            ) : (
              <span>{s.title}</span>
            )}
            {s.evidence_kind && <EvidencePill kind={s.evidence_kind} />}
            {s.cite && <span style={{ color: '#888' }}> — {s.cite}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EvidencePill({ kind }: { kind: string }) {
  const labels: Record<string, string> = {
    primary_legislation: 'primary legislation',
    regulator_guidance: 'regulator guidance',
    regulator_action: 'regulator action',
    case_law: 'case law',
    reputable_press: 'press',
    industry_analysis: 'industry analysis',
    vendor_documentation: 'vendor docs',
  };
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', marginLeft: 6, borderRadius: 8,
      background: '#eef3fb', color: '#234', textTransform: 'uppercase', letterSpacing: 0.3,
    }}>
      {labels[kind] || kind}
    </span>
  );
}

function DepthBadge({ depth }: { depth?: 'deep' | 'light' }) {
  if (!depth) return null;
  const isDeep = depth === 'deep';
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 8, textTransform: 'uppercase', fontWeight: 600,
      background: isDeep ? '#e7f6e7' : '#fff4d6',
      color: isDeep ? '#1a5d1a' : '#8a5400',
    }}>
      {isDeep ? 'deep research' : 'light — pending deep research'}
    </span>
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
