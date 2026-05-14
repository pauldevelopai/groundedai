// CrawlRulesEditor — Researcher deep-crawl rules. Flat object override at
// newsroom_profile.metadata.crawl_rules. Affects how /api/research/dossiers/
// [id]/crawl behaves: which paths get walked, how aggressively, robots.txt.

'use client';

import { useState } from 'react';

type Rules = {
  exclude_paths?: string[];
  include_paths_only?: string[] | null;
  priority_paths?: string[];
  max_links_per_crawl?: number;
  respect_robots?: boolean;
  same_host_only?: boolean;
};

export default function CrawlRulesEditor({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState<Rules | null>(null);
  const [effective, setEffective] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Working state — populated from `effective` on load
  const [excludePaths, setExcludePaths] = useState<string[]>([]);
  const [includePathsOnly, setIncludePathsOnly] = useState<string[]>([]);
  const [priorityPaths, setPriorityPaths] = useState<string[]>([]);
  const [maxLinks, setMaxLinks] = useState<number>(10);
  const [respectRobots, setRespectRobots] = useState<boolean>(true);
  const [sameHostOnly, setSameHostOnly] = useState<boolean>(true);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/crawl-rules/effective');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDefaults(j.defaults);
      setEffective(j.effective);
      setExcludePaths(j.effective.exclude_paths || []);
      setIncludePathsOnly(j.effective.include_paths_only || []);
      setPriorityPaths(j.effective.priority_paths || []);
      setMaxLinks(typeof j.effective.max_links_per_crawl === 'number' ? j.effective.max_links_per_crawl : 10);
      setRespectRobots(j.effective.respect_robots !== false);
      setSameHostOnly(j.effective.same_host_only !== false);
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
      // Only persist deltas from default — keeps the override JSON small
      const override: Rules = {};
      if (defaults) {
        if (excludePaths.length > 0) override.exclude_paths = [...excludePaths];
        if (includePathsOnly.length > 0) override.include_paths_only = [...includePathsOnly];
        if (priorityPaths.length > 0) override.priority_paths = [...priorityPaths];
        if (maxLinks !== defaults.max_links_per_crawl) override.max_links_per_crawl = maxLinks;
        if (respectRobots !== defaults.respect_robots) override.respect_robots = respectRobots;
        if (sameHostOnly !== defaults.same_host_only) override.same_host_only = sameHostOnly;
      }
      const value = Object.keys(override).length === 0 ? null : override;
      const res = await fetch('/api/newsroom/metadata/crawl_rules', {
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
          <h2 style={sectionHeadStyle}>Crawl rules (advanced)</h2>
          <button onClick={toggleOpen} style={chevronBtnStyle}>Expand ▾</button>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
          Researcher's deep-crawler honours these per-newsroom rules. Pan-African defaults; override here.
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionHeadStyle}>Crawl rules (advanced)</h2>
        <button onClick={toggleOpen} style={chevronBtnStyle}>Collapse ▴</button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '6px 0 12px' }}>
        Affects every Researcher crawl this newsroom starts. Editor-supplied <code>maxLinks</code> at crawl time still wins.
      </p>
      {loading && <div style={{ fontSize: 13, color: '#666' }}>Loading rules…</div>}
      {error && <div style={{ color: '#900', fontSize: 13, margin: '6px 0' }}>{error}</div>}

      {effective && (
        <div style={{ display: 'grid', gap: 14 }}>
          <PathChipField
            label="Exclude paths"
            hint="URL path substrings to skip (e.g. /podcasts/, /sponsored/, /amp/)."
            value={excludePaths}
            disabled={!canEdit}
            onChange={setExcludePaths}
            placeholder="/podcasts/"
          />
          <PathChipField
            label="Include paths only"
            hint="If set, the crawler only walks URLs containing one of these substrings (e.g. /investigations/)."
            value={includePathsOnly}
            disabled={!canEdit}
            onChange={setIncludePathsOnly}
            placeholder="/investigations/"
          />
          <PathChipField
            label="Priority paths"
            hint="URLs containing these substrings get crawled first (e.g. /breaking/, /investigations/)."
            value={priorityPaths}
            disabled={!canEdit}
            onChange={setPriorityPaths}
            placeholder="/breaking/"
          />

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Max links per crawl</span>
              <span style={{ fontSize: 12, color: '#666' }}>Default: {defaults?.max_links_per_crawl ?? 10}</span>
              <input
                type="number" min={1} max={100} value={maxLinks}
                disabled={!canEdit}
                onChange={(e) => setMaxLinks(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 10)))}
                style={{ width: 100, padding: 6, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Behaviour</span>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={respectRobots} disabled={!canEdit} onChange={(e) => setRespectRobots(e.target.checked)} />
                {' '}Respect robots.txt
              </label>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={sameHostOnly} disabled={!canEdit} onChange={(e) => setSameHostOnly(e.target.checked)} />
                {' '}Same host only
              </label>
            </label>
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={save} disabled={saving || loading}
            style={{ padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save crawl rules'}
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#0a0' }}>Saved at {savedAt}.</span>}
        </div>
      )}
    </section>
  );
}

function PathChipField({
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
          type="text" placeholder={placeholder ? placeholder + ' — Enter to add' : 'Enter to add'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
          }}
          style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, width: 280 }}
        />
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: 0 };
const chevronBtnStyle: React.CSSProperties = { fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: '#666' };
const chipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#e0eaff', color: '#003a99', borderRadius: 4, display: 'inline-flex', alignItems: 'center' };
