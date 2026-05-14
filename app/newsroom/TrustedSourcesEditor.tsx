// TrustedSourcesEditor — collapsible sub-section for editing
// newsroom_profile.metadata.trusted_sources. Pan-African default ⊕
// per-newsroom override; same diff-view pattern as TopicTagsEditor.
//
// Talks to:
//   GET   /api/newsroom/trusted-sources/effective    defaults + effective + override
//   PATCH /api/newsroom/metadata/trusted_sources    save override

'use client';

import { useState } from 'react';

type Allowlist = Record<string, string[]>;

const CATEGORY_LABELS: Record<string, string> = {
  pan_continental: 'Pan-continental',
  south_africa: 'South Africa',
  zimbabwe: 'Zimbabwe',
  zambia: 'Zambia',
  kenya: 'Kenya',
  nigeria: 'Nigeria',
  ghana: 'Ghana',
  official_records: 'Official records',
  global_reference: 'Global reference',
};

export default function TrustedSourcesEditor({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState<Allowlist | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Working state — { category: [extra-domains...] }
  const [workingExtras, setWorkingExtras] = useState<Record<string, string[]>>({});
  // Custom categories the newsroom added (not in defaults)
  const [customCategories, setCustomCategories] = useState<Array<{ name: string; domains: string[] }>>([]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/trusted-sources/effective');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDefaults(j.defaults);

      const extras: Record<string, string[]> = {};
      const custom: typeof customCategories = [];
      if (j.override && typeof j.override === 'object') {
        for (const [cat, domains] of Object.entries(j.override as Allowlist)) {
          if (!Array.isArray(domains)) continue;
          if (j.defaults[cat]) {
            // Existing category — these are the editor's additions
            extras[cat] = [...domains];
          } else {
            custom.push({ name: cat, domains: [...domains] });
          }
        }
      }
      setWorkingExtras(extras);
      setCustomCategories(custom);
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

  function addDomain(cat: string, raw: string) {
    const clean = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!clean || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return;
    setWorkingExtras((cur) => {
      const existing = cur[cat] || [];
      if (existing.includes(clean)) return cur;
      return { ...cur, [cat]: [...existing, clean] };
    });
  }
  function removeDomain(cat: string, domain: string) {
    setWorkingExtras((cur) => {
      const list = (cur[cat] || []).filter((x) => x !== domain);
      const next = { ...cur, [cat]: list };
      if (list.length === 0) delete next[cat];
      return next;
    });
  }
  function addCustomCategory() {
    setCustomCategories((cur) => [...cur, { name: '', domains: [] }]);
  }
  function setCustomCatName(i: number, name: string) {
    setCustomCategories((cur) => cur.map((c, idx) => idx === i ? { ...c, name } : c));
  }
  function setCustomCatDomains(i: number, domains: string[]) {
    setCustomCategories((cur) => cur.map((c, idx) => idx === i ? { ...c, domains } : c));
  }
  function removeCustomCategory(i: number) {
    setCustomCategories((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true); setError(null); setSavedAt(null);
    try {
      const override: Allowlist = {};
      for (const [cat, extras] of Object.entries(workingExtras)) {
        if (extras.length > 0) override[cat] = extras;
      }
      for (const c of customCategories) {
        const name = c.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!name || c.domains.length === 0) continue;
        if (override[name]) continue;
        override[name] = [...c.domains];
      }
      const value = Object.keys(override).length === 0 ? null : override;
      const res = await fetch('/api/newsroom/metadata/trusted_sources', {
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
          <h2 style={sectionHeadStyle}>Trusted sources (advanced)</h2>
          <button onClick={toggleOpen} style={chevronBtnStyle}>Expand ▾</button>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
          Pan-African default ⊕ your additions. Researcher tags scraped URLs as <code>trustedSource: true</code> when they match. Editable here.
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionHeadStyle}>Trusted sources (advanced)</h2>
        <button onClick={toggleOpen} style={chevronBtnStyle}>Collapse ▴</button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '6px 0 12px' }}>
        Annotation only — Researcher will still scrape non-listed URLs, but
        matched URLs get a <code>trustedSource: true</code> hint. Add your
        local outlets or remove ones that don't fit (removal is a future
        upgrade — for now, the default list is additive).
      </p>
      {loading && <div style={{ fontSize: 13, color: '#666' }}>Loading allowlist…</div>}
      {error && <div style={{ color: '#900', fontSize: 13, margin: '6px 0' }}>{error}</div>}

      {defaults && (
        <div>
          <h3 style={subHeadStyle}>Default categories ({Object.keys(defaults).length})</h3>
          {Object.entries(defaults).map(([cat, domains]) => {
            const extras = workingExtras[cat] || [];
            const isExpanded = expanded[cat];
            return (
              <div key={cat} style={{ border: '1px solid #eee', borderRadius: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setExpanded((cur) => ({ ...cur, [cat]: !cur[cat] }))}
                  style={catHeadBtnStyle}
                >
                  <span><strong>{CATEGORY_LABELS[cat] || cat}</strong> <code style={{ fontSize: 11, color: '#666' }}>{cat}</code></span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {domains.length} default · {extras.length > 0 && <span style={{ color: '#0066cc' }}>+{extras.length} yours · </span>}
                    {isExpanded ? '▴' : '▾'}
                  </span>
                </button>
                {isExpanded && (
                  <div style={{ padding: 10 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Defaults (read-only):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                      {domains.map((d) => (
                        <span key={d} style={defaultChipStyle}>{d}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Your additions:</div>
                    <DomainChips
                      value={extras}
                      disabled={!canEdit}
                      onAdd={(d) => addDomain(cat, d)}
                      onRemove={(d) => removeDomain(cat, d)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h3 style={subHeadStyle}>Custom categories ({customCategories.length})</h3>
      {customCategories.map((c, i) => (
        <div key={i} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="text" placeholder="category name (e.g. malawi)"
              value={c.name} disabled={!canEdit}
              onChange={(e) => setCustomCatName(i, e.target.value)}
              style={{ flex: 1, padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 }}
            />
            {canEdit && (
              <button type="button" onClick={() => removeCustomCategory(i)}
                style={{ padding: '6px 10px', fontSize: 12, background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
          <DomainChips
            value={c.domains}
            disabled={!canEdit}
            onAdd={(d) => setCustomCatDomains(i, [...c.domains, d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')])}
            onRemove={(d) => setCustomCatDomains(i, c.domains.filter((x) => x !== d))}
          />
        </div>
      ))}
      {canEdit && (
        <button type="button" onClick={addCustomCategory} style={addBtnStyle}>+ Add custom category</button>
      )}

      {canEdit && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={save} disabled={saving || loading}
            style={{ padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save trusted-sources overrides'}
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#0a0' }}>Saved at {savedAt}.</span>}
        </div>
      )}
    </section>
  );
}

function DomainChips({
  value, disabled, onAdd, onRemove,
}: { value: string[]; disabled: boolean; onAdd: (s: string) => void; onRemove: (s: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {value.map((d) => (
          <span key={d} style={overrideChipStyle}>
            {d}
            {!disabled && (
              <button type="button" onClick={() => onRemove(d)}
                style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: '0 0 0 4px' }}>×</button>
            )}
          </span>
        ))}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>None yet.</span>}
      </div>
      {!disabled && (
        <input
          type="text"
          placeholder="e.g. theherald.co.zw — Enter to add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              onAdd(draft);
              setDraft('');
            }
          }}
          style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, width: 260 }}
        />
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: 0 };
const subHeadStyle: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '16px 0 8px' };
const chevronBtnStyle: React.CSSProperties = { fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: '#666' };
const catHeadBtnStyle: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fafafa', border: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13 };
const defaultChipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#f0f0f0', color: '#444', borderRadius: 4 };
const overrideChipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#e0eaff', color: '#003a99', borderRadius: 4, display: 'inline-flex', alignItems: 'center' };
const addBtnStyle: React.CSSProperties = { padding: '6px 12px', fontSize: 13, background: 'none', border: '1px dashed #aaa', borderRadius: 4, cursor: 'pointer', marginBottom: 12 };
