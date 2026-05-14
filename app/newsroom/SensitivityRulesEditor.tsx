// SensitivityRulesEditor — V2 Step 5.
//
// Per-newsroom overrides for the sensitivity classifier. Stored at
// newsroom_profile.metadata.sensitivity_rules via the generic metadata
// PATCH endpoint. The classifier consumes them on every Claude-bound
// call; sensitive inputs are refused (Step 5) or routed to the appliance
// (Step 6).

'use client';

import { useState } from 'react';

type Rules = {
  always_sensitive_keywords?: string[];
  always_sensitive_workflows?: string[];
  regex_patterns?: string[];
  default_label?: 'public' | 'internal';
};

export default function SensitivityRulesEditor({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState<Rules | null>(null);
  const [effective, setEffective] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [regexes, setRegexes] = useState<string[]>([]);
  const [defaultLabel, setDefaultLabel] = useState<'public' | 'internal'>('public');

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/sensitivity-rules/effective');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDefaults(j.defaults);
      setEffective(j.effective);
      setKeywords(j.effective.always_sensitive_keywords || []);
      setWorkflows(j.effective.always_sensitive_workflows || []);
      setRegexes(j.effective.regex_patterns || []);
      setDefaultLabel((j.effective.default_label || 'public') as 'public' | 'internal');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !defaults) load();
  }

  async function save() {
    setSaving(true); setError(null); setSavedAt(null);
    try {
      // Only persist deltas from default to keep the override JSON small.
      const override: Rules = {};
      if (defaults) {
        const extraKeywords = keywords.filter((k) => !(defaults.always_sensitive_keywords || []).includes(k));
        if (extraKeywords.length > 0) override.always_sensitive_keywords = extraKeywords;
        if (workflows.length > 0) override.always_sensitive_workflows = [...workflows];
        if (regexes.length > 0) override.regex_patterns = [...regexes];
        if (defaultLabel !== (defaults.default_label || 'public')) override.default_label = defaultLabel;
      }
      const value = Object.keys(override).length === 0 ? null : override;
      const res = await fetch('/api/newsroom/metadata/sensitivity_rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={sectionHeadStyle}>Sensitivity rules (V2)</h2>
          <button onClick={toggleOpen} style={chevronBtnStyle}>Expand ▾</button>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
          Per-newsroom rules for what counts as <em>sensitive</em> material. Sensitive jobs are refused (V2 Step 5) and will route to your newsroom appliance (Step 6).
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionHeadStyle}>Sensitivity rules (V2)</h2>
        <button onClick={toggleOpen} style={chevronBtnStyle}>Collapse ▴</button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '6px 0 12px' }}>
        The classifier merges these with platform defaults at runtime. Hard keywords + custom regex patterns escalate input to <strong>sensitive</strong>. Sensitive material is not sent to Anthropic.
      </p>
      {loading && <div style={{ fontSize: 13, color: '#666' }}>Loading rules…</div>}
      {error && <div style={{ color: '#900', fontSize: 13, margin: '6px 0' }}>{error}</div>}

      {effective && (
        <div style={{ display: 'grid', gap: 14 }}>
          <ChipField
            label="Additional always-sensitive keywords"
            hint="Free-text terms. Match is case-insensitive substring."
            placeholder="off-record  — Enter to add"
            value={keywords}
            disabled={!canEdit}
            onChange={setKeywords}
          />
          <ChipField
            label="Always-sensitive workflow slugs"
            hint="Saved-workflow slugs that should always classify sensitive regardless of input text. Useful for e.g. leaked-document triage workflows."
            placeholder="leaked-document-triage  — Enter to add"
            value={workflows}
            disabled={!canEdit}
            onChange={setWorkflows}
          />
          <ChipField
            label="Custom regex patterns"
            hint="JS regex strings (case-insensitive). Match anywhere in the input → sensitive. Malformed regexes are silently skipped at runtime — validate yours before saving."
            placeholder="\bACME-\d{4}\b  — Enter to add"
            value={regexes}
            disabled={!canEdit}
            onChange={setRegexes}
          />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Default label when no signal hits</span>
            <span style={{ fontSize: 12, color: '#666' }}>
              <code style={codeStyle}>public</code> — safe to send to Anthropic.{' '}
              <code style={codeStyle}>internal</code> — still allowed to Anthropic but logged as internal.
            </span>
            <select
              value={defaultLabel}
              disabled={!canEdit}
              onChange={(e) => setDefaultLabel(e.target.value as 'public' | 'internal')}
              style={{ width: 200, padding: 6, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
            >
              <option value="public">public</option>
              <option value="internal">internal</option>
            </select>
          </label>

          <div style={{ background: '#fafbfd', border: '1px solid #e1e4e8', borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>Platform defaults (always on)</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <code style={codeStyle}>{(defaults?.always_sensitive_keywords || []).join(', ')}</code>
              {' · '}built-in: SA ID number pattern, email addresses (soft → internal).
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={save} disabled={saving || loading}
            style={{ padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save sensitivity rules'}
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#0a0' }}>Saved at {savedAt}.</span>}
        </div>
      )}
    </section>
  );
}

function ChipField({
  label, hint, value, disabled, onChange, placeholder,
}: {
  label: string; hint?: string;
  value: string[]; disabled: boolean;
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  function commit() {
    const clean = draft.trim();
    if (!clean) return;
    if (value.some((x) => x === clean)) { setDraft(''); return; }
    onChange([...value, clean]);
    setDraft('');
  }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {value.map((p) => (
          <span key={p} style={chipStyle}>
            {p}
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((x) => x !== p))}
                style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: '0 0 0 4px' }}>×</button>
            )}
          </span>
        ))}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>None.</span>}
      </div>
      {!disabled && (
        <input
          type="text" placeholder={placeholder || 'Enter to add'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, width: 320 }}
        />
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: 0 };
const chevronBtnStyle: React.CSSProperties = { fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: '#666' };
const chipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#e0eaff', color: '#003a99', borderRadius: 4, display: 'inline-flex', alignItems: 'center' };
const codeStyle: React.CSSProperties = { fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, color: '#555' };
