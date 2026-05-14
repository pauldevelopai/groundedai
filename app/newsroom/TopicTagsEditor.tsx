// TopicTagsEditor — collapsible sub-section for editing
// newsroom_profile.metadata.topic_tags. Pan-African default ⊕ per-newsroom
// override; this component renders the merged view and lets the AI champion
// add extra keywords to each existing bucket OR add custom buckets.
//
// Talks to:
//   GET  /api/newsroom/topic-tags/effective    defaults + effective + override
//   PATCH /api/newsroom/metadata/topic_tags    save override
//
// Save semantics: writes the OVERRIDE only (default stays in the YAML). The
// override is computed by diffing each bucket: keywords in the editor's list
// that aren't in the default → that's what goes into override.keywords.

'use client';

import { useEffect, useState } from 'react';

type Bucket = { label?: string; keywords?: string[]; prompt_hint?: string };
type TopicTags = {
  topics?: Record<string, Bucket>;
  strong_verbs?: string[];
  attribution_words?: string[];
};

export default function TopicTagsEditor({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState<TopicTags | null>(null);
  const [effective, setEffective] = useState<TopicTags | null>(null);
  const [override, setOverride] = useState<TopicTags | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Working state — edits live here until the user clicks Save
  const [workingExtras, setWorkingExtras] = useState<Record<string, string[]>>({});
  const [customBuckets, setCustomBuckets] = useState<Array<{ slug: string; label: string; keywords: string[] }>>([]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/topic-tags/effective');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDefaults(j.defaults);
      setEffective(j.effective);
      setOverride(j.override);

      // Seed working state from the existing override
      const extras: Record<string, string[]> = {};
      const custom: typeof customBuckets = [];
      if (j.override?.topics) {
        for (const [slug, b] of Object.entries(j.override.topics as Record<string, Bucket>)) {
          if (j.defaults?.topics?.[slug]) {
            // Existing-bucket override: editor added keywords
            extras[slug] = Array.isArray(b.keywords) ? [...b.keywords] : [];
          } else {
            // Brand new bucket
            custom.push({ slug, label: b.label || slug, keywords: Array.isArray(b.keywords) ? [...b.keywords] : [] });
          }
        }
      }
      setWorkingExtras(extras);
      setCustomBuckets(custom);
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

  function addKeyword(slug: string, kw: string) {
    const clean = kw.trim();
    if (!clean) return;
    setWorkingExtras((cur) => {
      const existing = cur[slug] || [];
      if (existing.some((x) => x.toLowerCase() === clean.toLowerCase())) return cur;
      return { ...cur, [slug]: [...existing, clean] };
    });
  }
  function removeKeyword(slug: string, kw: string) {
    setWorkingExtras((cur) => {
      const list = (cur[slug] || []).filter((x) => x !== kw);
      const next = { ...cur, [slug]: list };
      if (list.length === 0) delete next[slug];
      return next;
    });
  }
  function addCustomBucket() {
    setCustomBuckets((cur) => [...cur, { slug: '', label: '', keywords: [] }]);
  }
  function setCustomBucketField(i: number, field: 'slug' | 'label', value: string) {
    setCustomBuckets((cur) => cur.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
  }
  function setCustomBucketKeywords(i: number, keywords: string[]) {
    setCustomBuckets((cur) => cur.map((b, idx) => idx === i ? { ...b, keywords } : b));
  }
  function removeCustomBucket(i: number) {
    setCustomBuckets((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true); setError(null); setSavedAt(null);
    try {
      // Build the override object — only non-empty bucket extras + valid custom buckets
      const overrideTopics: Record<string, Bucket> = {};
      for (const [slug, extras] of Object.entries(workingExtras)) {
        if (extras.length > 0) overrideTopics[slug] = { keywords: extras };
      }
      for (const b of customBuckets) {
        const slug = b.slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const label = b.label.trim();
        if (!slug || !label || b.keywords.length === 0) continue;
        if (overrideTopics[slug]) continue; // collision with a default bucket — skip silently
        overrideTopics[slug] = { label, keywords: [...b.keywords] };
      }

      const value: TopicTags | null = Object.keys(overrideTopics).length === 0 ? null : { topics: overrideTopics };
      const res = await fetch('/api/newsroom/metadata/topic_tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSavedAt(new Date().toLocaleTimeString());
      // Reload so the diff reflects what's now stored
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
          <h2 style={sectionHeadStyle}>Topic taxonomy (advanced)</h2>
          <button onClick={toggleOpen} style={chevronBtnStyle}>Expand ▾</button>
        </div>
        <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
          Pan-African default ⊕ your additions. Copywriter sees a "Topic match:" hint per article. Editable here.
        </p>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionHeadStyle}>Topic taxonomy (advanced)</h2>
        <button onClick={toggleOpen} style={chevronBtnStyle}>Collapse ▴</button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '6px 0 12px' }}>
        Universal buckets ship with the platform. Add keywords to refine an
        existing bucket, or add a custom bucket below if your beat doesn't fit
        one of the universal ones.
      </p>
      {loading && <div style={{ fontSize: 13, color: '#666' }}>Loading taxonomy…</div>}
      {error && <div style={{ color: '#900', fontSize: 13, margin: '6px 0' }}>{error}</div>}

      {defaults?.topics && (
        <div>
          <h3 style={subHeadStyle}>Universal buckets ({Object.keys(defaults.topics).length})</h3>
          {Object.entries(defaults.topics).map(([slug, bucket]) => {
            const extra = workingExtras[slug] || [];
            const isExpanded = expanded[slug];
            return (
              <div key={slug} style={{ border: '1px solid #eee', borderRadius: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setExpanded((cur) => ({ ...cur, [slug]: !cur[slug] }))}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#fafafa', border: 'none', cursor: 'pointer',
                    borderRadius: 6, fontSize: 13,
                  }}
                >
                  <span><strong>{bucket.label || slug}</strong> <code style={{ fontSize: 11, color: '#666' }}>{slug}</code></span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {bucket.keywords?.length || 0} default · {extra.length > 0 && <span style={{ color: '#0066cc' }}>+{extra.length} yours · </span>}
                    {isExpanded ? '▴' : '▾'}
                  </span>
                </button>
                {isExpanded && (
                  <div style={{ padding: 10 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Defaults (read-only):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                      {(bucket.keywords || []).map((kw) => (
                        <span key={kw} style={defaultChipStyle}>{kw}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Your additions:</div>
                    <ExtraChips
                      value={extra}
                      disabled={!canEdit}
                      onAdd={(kw) => addKeyword(slug, kw)}
                      onRemove={(kw) => removeKeyword(slug, kw)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h3 style={subHeadStyle}>Custom buckets ({customBuckets.length})</h3>
      {customBuckets.map((b, i) => (
        <div key={i} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              type="text" placeholder="slug (e.g. mining_extractives)"
              value={b.slug} disabled={!canEdit}
              onChange={(e) => setCustomBucketField(i, 'slug', e.target.value)}
              style={{ flex: 1, padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 }}
            />
            <input
              type="text" placeholder="Label (e.g. Mining & extractives)"
              value={b.label} disabled={!canEdit}
              onChange={(e) => setCustomBucketField(i, 'label', e.target.value)}
              style={{ flex: 2, padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 }}
            />
            {canEdit && (
              <button type="button" onClick={() => removeCustomBucket(i)}
                style={{ padding: '6px 10px', fontSize: 12, background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
          <ExtraChips
            value={b.keywords}
            disabled={!canEdit}
            onAdd={(kw) => setCustomBucketKeywords(i, [...b.keywords, kw])}
            onRemove={(kw) => setCustomBucketKeywords(i, b.keywords.filter((x) => x !== kw))}
          />
        </div>
      ))}
      {canEdit && (
        <button type="button" onClick={addCustomBucket} style={{ padding: '6px 12px', fontSize: 13, background: 'none', border: '1px dashed #aaa', borderRadius: 4, cursor: 'pointer', marginBottom: 12 }}>
          + Add custom bucket
        </button>
      )}

      {canEdit && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={save} disabled={saving || loading}
            style={{ padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save taxonomy overrides'}
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#0a0' }}>Saved at {savedAt}.</span>}
        </div>
      )}
    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ExtraChips({
  value, disabled, onAdd, onRemove,
}: { value: string[]; disabled: boolean; onAdd: (s: string) => void; onRemove: (s: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {value.map((kw) => (
          <span key={kw} style={overrideChipStyle}>
            {kw}
            {!disabled && (
              <button type="button" onClick={() => onRemove(kw)}
                style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: '0 0 0 4px' }}>×</button>
            )}
          </span>
        ))}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>None yet.</span>}
      </div>
      {!disabled && (
        <input
          type="text"
          placeholder="Add keyword + Enter…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              onAdd(draft);
              setDraft('');
            }
          }}
          style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, width: 240 }}
        />
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: 0 };
const subHeadStyle: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '16px 0 8px' };
const chevronBtnStyle: React.CSSProperties = { fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: '#666' };
const defaultChipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#f0f0f0', color: '#444', borderRadius: 4 };
const overrideChipStyle: React.CSSProperties = { fontSize: 12, padding: '2px 8px', background: '#e0eaff', color: '#003a99', borderRadius: 4, display: 'inline-flex', alignItems: 'center' };
