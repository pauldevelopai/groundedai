// AiCrawlerPolicyEditor — V1.3.
//
// The Archive workspace's "Crawler policy" tab. Per-newsroom toggles for
// the major AI training crawlers (GPTBot, ClaudeBot, Google-Extended, etc.)
// plus a free-form disallow-paths list. Renders downloadable robots.txt /
// ai.txt / llms.txt snippets the newsroom hosts on their public site.
//
// The platform itself does not enforce these rules — they're an advisory
// the newsroom publishes externally. This editor is one of the consumers
// of the generic /api/newsroom/metadata/[key] endpoint (key:
// ai_crawler_policy).

'use client';

import { useEffect, useState } from 'react';

type Bot = { name: string; label: string; purpose: string };
type Policy = {
  bots: Record<string, boolean>;
  default_allow: boolean;
  disallow_paths: string[];
};
type EffectiveResponse = {
  known_bots: Bot[];
  defaults: Policy;
  effective: Policy;
  override: Policy | null;
  snippets: { robots_txt: string; ai_txt: string; llms_txt: string };
};

export default function AiCrawlerPolicyEditor({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<EffectiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [bots, setBots] = useState<Record<string, boolean>>({});
  const [defaultAllow, setDefaultAllow] = useState(false);
  const [disallowPaths, setDisallowPaths] = useState<string[]>([]);
  const [pathDraft, setPathDraft] = useState('');

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/ai-crawler-policy/effective');
      const j: EffectiveResponse = await res.json();
      if (!res.ok) throw new Error((j as any).error || `HTTP ${res.status}`);
      setData(j);
      setBots({ ...j.effective.bots });
      setDefaultAllow(j.effective.default_allow);
      setDisallowPaths([...(j.effective.disallow_paths || [])]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!data) return;
    setSaving(true); setError(null); setSavedAt(null);
    try {
      // Only persist deltas from default — keeps the override JSON small.
      const override: Partial<Policy> = {};
      const botDeltas: Record<string, boolean> = {};
      for (const bot of data.known_bots) {
        const def = data.defaults.bots[bot.name];
        const cur = bots[bot.name];
        if (cur !== def) botDeltas[bot.name] = cur;
      }
      if (Object.keys(botDeltas).length > 0) override.bots = botDeltas;
      if (defaultAllow !== data.defaults.default_allow) override.default_allow = defaultAllow;
      if (disallowPaths.length > 0) override.disallow_paths = [...disallowPaths];

      const value = Object.keys(override).length === 0 ? null : override;
      const res = await fetch('/api/newsroom/metadata/ai_crawler_policy', {
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

  async function resetToDefault() {
    if (!data) return;
    if (!confirm('Reset to platform default? This removes your newsroom override.')) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/newsroom/metadata/ai_crawler_policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function addPath() {
    const p = pathDraft.trim();
    if (!p) return;
    if (!p.startsWith('/')) { setError('Paths must start with /'); return; }
    if (disallowPaths.includes(p)) { setPathDraft(''); return; }
    setDisallowPaths([...disallowPaths, p]);
    setPathDraft('');
    setError(null);
  }

  if (loading && !data) return <div style={{ fontSize: 13, color: '#666' }}>Loading crawler policy…</div>;
  if (error && !data) return <div style={{ color: '#900', fontSize: 13 }}>{error}</div>;
  if (!data) return null;

  return (
    <div>
      <section style={panelStyle}>
        <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>AI-crawler policy</h2>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
          Decide which AI training crawlers may scrape your public archive. Grounded does <em>not</em> enforce this —
          you publish the generated <code>robots.txt</code> / <code>ai.txt</code> / <code>llms.txt</code> at the root of
          your site, and well-behaved crawlers honour it.
        </p>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          Platform default: <strong>block all known LLM training crawlers</strong>. Override per-bot below.
        </p>
      </section>

      {error && <div style={errorStyle}>{error}</div>}

      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Per-bot rules</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {data.known_bots.map((bot) => {
            const allow = bots[bot.name] ?? data.defaults.bots[bot.name] ?? data.defaults.default_allow;
            return (
              <label key={bot.name} style={botRowStyle}>
                <input
                  type="checkbox"
                  checked={allow}
                  disabled={!canEdit}
                  onChange={(e) => setBots({ ...bots, [bot.name]: e.target.checked })}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {bot.label}{' '}
                    <code style={codeStyle}>{bot.name}</code>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{bot.purpose}</div>
                </div>
                <span style={{ fontSize: 12, color: allow ? '#0a7d2a' : '#a00', minWidth: 70, textAlign: 'right' }}>
                  {allow ? 'Allowed' : 'Blocked'}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Catch-all for unlisted bots</h3>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={defaultAllow}
            disabled={!canEdit}
            onChange={(e) => setDefaultAllow(e.target.checked)}
          />
          Allow AI crawlers we don't know about yet
        </label>
        <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
          New AI crawlers appear regularly. If unchecked, the rendered <code>robots.txt</code> assumes "block first;
          we'll explicitly add support later". If checked, unknown crawlers are allowed by default.
        </p>
      </section>

      <section style={panelStyle}>
        <h3 style={subHeadStyle}>Always-blocked paths</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
          URL path prefixes you never want any AI crawler to walk — e.g. <code>/investigations/</code>,
          <code>/exclusive/</code>, <code>/draft/</code>. Applied to <em>all</em> AI crawlers, even ones you allow.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {disallowPaths.map((p) => (
            <span key={p} style={chipStyle}>
              {p}
              {canEdit && (
                <button type="button" onClick={() => setDisallowPaths(disallowPaths.filter((x) => x !== p))}
                  style={chipXStyle}>×</button>
              )}
            </span>
          ))}
          {disallowPaths.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>None.</span>}
        </div>
        {canEdit && (
          <input
            type="text"
            placeholder="/investigations/  — Enter to add"
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPath(); } }}
            style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, width: 320 }}
          />
        )}
      </section>

      {canEdit && (
        <section style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={save} disabled={saving || loading} style={primaryBtnStyle}>
            {saving ? 'Saving…' : 'Save policy'}
          </button>
          <button type="button" onClick={resetToDefault} disabled={saving || loading || !data.override} style={secondaryBtnStyle}>
            Reset to platform default
          </button>
          {savedAt && <span style={{ fontSize: 12, color: '#0a0' }}>Saved at {savedAt}.</span>}
          {data.override && !savedAt && <span style={{ fontSize: 12, color: '#888' }}>Newsroom override is active.</span>}
        </section>
      )}

      <SnippetBlock title="robots.txt" body={data.snippets.robots_txt} filename="robots.txt" />
      <SnippetBlock title="ai.txt" body={data.snippets.ai_txt} filename="ai.txt" />
      <SnippetBlock title="llms.txt" body={data.snippets.llms_txt} filename="llms.txt" />

      <section style={{ ...panelStyle, background: '#fafbfd' }}>
        <h3 style={subHeadStyle}>How to use these</h3>
        <ol style={{ fontSize: 13, color: '#444', lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li><strong>robots.txt</strong> — host at <code>https://your-site/robots.txt</code>. Append the snippet to your existing rules (don't replace; web-search bots like Googlebot need their own entries).</li>
          <li><strong>ai.txt</strong> — host at <code>https://your-site/ai.txt</code>. New convention; respected by Spawning, Have I Been Trained, and a growing list of AI crawlers.</li>
          <li><strong>llms.txt</strong> — host at <code>https://your-site/llms.txt</code>. Positive signpost for LLMs that <em>do</em> visit your site — points them at your content and the policy.</li>
        </ol>
        <p style={{ fontSize: 12, color: '#888', margin: '10px 0 0' }}>
          The snippets refresh after Save. Re-download whenever your policy changes.
        </p>
      </section>
    </div>
  );
}

function SnippetBlock({ title, body, filename }: { title: string; body: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore — UI just won't tick */
    }
  }

  function download() {
    const blob = new Blob([body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ ...subHeadStyle, margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={copy} style={secondaryBtnStyle}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={download} style={secondaryBtnStyle}>
            Download
          </button>
        </div>
      </div>
      <pre style={preStyle}>{body}</pre>
    </section>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16,
};
const subHeadStyle: React.CSSProperties = {
  fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px',
};
const botRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
  border: '1px solid #eee', borderRadius: 6, cursor: 'pointer',
};
const codeStyle: React.CSSProperties = {
  fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, color: '#555',
};
const errorStyle: React.CSSProperties = {
  background: '#fff3f3', border: '1px solid #f5b1b1', color: '#900', padding: 10, borderRadius: 6,
  fontSize: 13, marginBottom: 16,
};
const chipStyle: React.CSSProperties = {
  fontSize: 12, padding: '2px 8px', background: '#e0eaff', color: '#003a99', borderRadius: 4,
  display: 'inline-flex', alignItems: 'center',
};
const chipXStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: '0 0 0 4px',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4,
  fontSize: 13, cursor: 'pointer',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '6px 12px', background: 'white', color: '#444', border: '1px solid #ccc', borderRadius: 4,
  fontSize: 12, cursor: 'pointer',
};
const preStyle: React.CSSProperties = {
  background: '#f6f8fa', border: '1px solid #e1e4e8', borderRadius: 6, padding: 12, fontSize: 12,
  lineHeight: 1.5, overflowX: 'auto', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  maxHeight: 280,
};
