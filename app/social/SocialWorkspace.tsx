// SocialWorkspace — single-screen social-listener workspace.
// Same design language as /operations and /distribution.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Signal = {
  id: string; ingestion_kind: string; platform: string;
  post_url: string | null; author_handle: string | null; author_display_name: string | null;
  source_domain: string | null; raw_text: string;
  posted_at: string | null;
  matched_keywords: string[];
  analysis: {
    lang?: { code: string; name: string; confidence: number; secondary?: { code: string; name: string; confidence: number } | null };
    entities?: { persons: string[]; orgs: string[]; locations: string[]; misc: string[] };
    origin_signals?: {
      source_match?: { source_id: string; identifier: string; alignment: string; confidence: number } | null;
      domain?: string | null;
      hints?: string[];
    };
    severity_seed?: 'low' | 'medium' | 'high' | 'critical';
  };
  status: 'new' | 'analysing' | 'analysed' | 'flagged' | 'cleared' | 'reported' | 'failed';
  notes: string | null;
  created_at: string;
};
type Keyword = {
  id: string; term: string; match_kind: 'phrase' | 'regex' | 'name';
  scope: string; severity_floor: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'paused' | 'archived'; notes: string | null;
};
type Source = {
  id: string; identifier: string; identifier_kind: string;
  display_name: string | null;
  alignment: 'uncategorised' | 'state_russia' | 'state_china' | 'state_other' | 'cib_network' | 'extremist' | 'commercial' | 'reputable';
  alignment_confidence: number | string | null;
  country: string | null; notes: string | null;
  is_default: boolean;
};
type BriefRow = {
  id: string; title: string;
  kind: 'signal_analysis' | 'keyword_sweep' | 'coordinated_pattern';
  signal_ids: string[]; status: string;
  duration_ms: number | null; cost_usd: string | number | null; error: string | null;
  created_at: string;
};

const KIND_LABELS: Record<BriefRow['kind'], string> = {
  signal_analysis: 'Signal analysis',
  keyword_sweep: 'Keyword sweep',
  coordinated_pattern: 'Coordinated pattern',
};

export default function SocialWorkspace({
  initialSignals, initialKeywords, initialSources, initialBriefs, canEdit, role,
}: {
  initialSignals: Signal[];
  initialKeywords: Keyword[];
  initialSources: Source[];
  initialBriefs: BriefRow[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [sources, setSources] = useState(initialSources);
  const [briefs, setBriefs] = useState(initialBriefs);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🛰 Social Listener</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Producer →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Distributor →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Social Listener</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Track Facebook + cross-platform posts for narratives that matter to your newsroom. Open-source language detection (xlm-roberta) + multilingual NER (wikineural) attach to every ingested signal automatically — strong on Russian and Chinese signals. The agent on top reasons about origin attribution and recommended response.
        </p>

        <BriefsSection briefs={briefs} signals={signals} canEdit={canEdit} onChange={setBriefs} onRefresh={() => router.refresh()} />
        <SignalsSection signals={signals} canEdit={canEdit} onChange={setSignals} />
        <KeywordsSection keywords={keywords} canEdit={canEdit} onChange={setKeywords} />
        <SourcesSection sources={sources} canEdit={canEdit} onChange={setSources} />
      </div>
    </main>
  );
}

// ─── Briefs ────────────────────────────────────────────────────────────────

function BriefsSection({
  briefs, signals, canEdit, onChange, onRefresh,
}: {
  briefs: BriefRow[]; signals: Signal[]; canEdit: boolean;
  onChange: (rows: BriefRow[]) => void; onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 20 }}>
      <SectionHeader title="📋 Listener briefs" subtitle="Agent-generated signal-analysis / keyword-sweep / coordinated-pattern reports.">
        {canEdit && <button onClick={() => setCreating(c => !c)} style={primaryBtn}>{creating ? 'Cancel' : '+ New brief'}</button>}
      </SectionHeader>
      {creating && canEdit && (
        <NewBriefForm
          signals={signals}
          onCancel={() => setCreating(false)}
          onCreated={(row) => { onChange([row, ...briefs]); setCreating(false); onRefresh(); }}
        />
      )}
      {briefs.length === 0 ? <Empty text="No briefs yet. Ingest signals first, then click + New brief." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {briefs.map(b => (
            <Link key={b.id} href={`/social/briefs/${b.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{b.title}</strong>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {KIND_LABELS[b.kind]} · {b.signal_ids.length} signal{b.signal_ids.length === 1 ? '' : 's'} · {new Date(b.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span style={statusBadge(b.status)}>{b.status}</span>
                </div>
                {b.error && <p style={{ color: '#b00', fontSize: 12, margin: '6px 0 0' }}>{b.error}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NewBriefForm({ signals, onCancel, onCreated }: { signals: Signal[]; onCancel: () => void; onCreated: (row: BriefRow) => void }) {
  const [kind, setKind] = useState<BriefRow['kind']>('signal_analysis');
  const [briefInput, setBriefInput] = useState('');
  const [signalIds, setSignalIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/social/briefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, brief_input: briefInput || undefined,
          signal_ids: signalIds.length > 0 ? signalIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      const list = await fetch('/api/social/briefs').then(r => r.json());
      const newest = (list.briefs || []).find((b: BriefRow) => b.id === data.briefId) || list.briefs?.[0];
      if (newest) onCreated(newest);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Kind">
        <select value={kind} onChange={e => setKind(e.target.value as BriefRow['kind'])} style={inputStyle}>
          <option value="signal_analysis">Signal analysis — origin attribution + recommended response</option>
          <option value="keyword_sweep">Keyword sweep — group recent signals by watchlist term</option>
          <option value="coordinated_pattern">Coordinated pattern — shared phrasing / timing / domains</option>
        </select>
      </Field>
      <Field label="Signals (optional — leave empty to use the most recent)">
        <select multiple value={signalIds} onChange={e => setSignalIds(Array.from(e.target.selectedOptions).map(o => o.value))} style={{ ...inputStyle, height: 120 }}>
          {signals.slice(0, 30).map(s => (
            <option key={s.id} value={s.id}>
              [{s.platform}] {(s.author_handle || s.author_display_name || s.source_domain || 'unknown')} — {(s.raw_text || '').slice(0, 80)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Editor's framing (optional)">
        <textarea rows={3} value={briefInput} onChange={e => setBriefInput(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="What should the agent focus on?" />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Generating…' : 'Generate brief'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Signals ───────────────────────────────────────────────────────────────

function SignalsSection({
  signals, canEdit, onChange,
}: {
  signals: Signal[]; canEdit: boolean; onChange: (rows: Signal[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="📡 Signals" subtitle="Ingested posts. Each has language detection, NER, and source-reputation match attached automatically.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Ingest signal'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <IngestForm onCancel={() => setAdding(false)} onCreated={(s) => { onChange([s, ...signals]); setAdding(false); }} />
      )}
      {signals.length === 0 ? <Empty text="No signals yet. Click + Ingest signal to paste a Facebook post." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {signals.map(s => <SignalCard key={s.id} signal={s} canEdit={canEdit} onChange={(updated) => onChange(signals.map(x => x.id === updated.id ? updated : x))} />)}
        </div>
      )}
    </section>
  );
}

function SignalCard({ signal: s, canEdit, onChange }: { signal: Signal; canEdit: boolean; onChange: (s: Signal) => void }) {
  const [busy, setBusy] = useState(false);
  async function route(action: string) {
    setBusy(true);
    const res = await fetch(`/api/social/signals/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_action: action }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { alert(data.error || 'Routing failed'); return; }
    onChange(data.signal);
  }
  const a = s.analysis || {};
  const sourceMatch = a.origin_signals?.source_match;
  const hints = a.origin_signals?.hints || [];
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong>{s.author_display_name || s.author_handle || s.source_domain || 'Unknown source'}</strong>
            <Tag muted>{s.platform}</Tag>
            {a.lang && <Tag muted>{a.lang.name} {(a.lang.confidence * 100).toFixed(0)}%</Tag>}
            {sourceMatch && <Tag accent={alignmentTone(sourceMatch.alignment)}>{sourceMatch.alignment}</Tag>}
            <span style={statusBadge(s.status)}>{s.status}</span>
            {a.severity_seed && <Tag accent={severityTone(a.severity_seed)}>severity {a.severity_seed}</Tag>}
          </div>
          {s.post_url && (
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <a href={s.post_url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>{s.post_url}</a>
              {s.posted_at && <span style={{ color: '#666', marginLeft: 8 }}>posted {new Date(s.posted_at).toLocaleString()}</span>}
            </div>
          )}
          <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.raw_text.slice(0, 600)}{s.raw_text.length > 600 ? '…' : ''}</p>
          {(a.entities && (a.entities.persons.length + a.entities.locations.length + a.entities.orgs.length) > 0) && (
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              {a.entities.persons.length > 0 && <span>persons: {a.entities.persons.slice(0, 4).join(', ')} · </span>}
              {a.entities.locations.length > 0 && <span>places: {a.entities.locations.slice(0, 4).join(', ')} · </span>}
              {a.entities.orgs.length > 0 && <span>orgs: {a.entities.orgs.slice(0, 4).join(', ')}</span>}
            </div>
          )}
          {hints.length > 0 && (
            <div style={{ fontSize: 11, color: '#5a3a99', marginTop: 4 }}>
              {hints.map((h, i) => <span key={i}>· {h}{i < hints.length - 1 ? ' ' : ''}</span>)}
            </div>
          )}
        </div>
        {canEdit && s.status !== 'reported' && s.status !== 'cleared' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.status !== 'flagged' && <button disabled={busy} onClick={() => route('flag')} style={miniBtn}>Flag</button>}
            <button disabled={busy} onClick={() => route('refer-to-calendar')} style={miniBtn}>→ Story idea</button>
            <button disabled={busy} onClick={() => route('refer-to-distributor')} style={miniBtn}>→ Context note</button>
            <button disabled={busy} onClick={() => route('clear')} style={{ ...miniBtn, color: '#1a5d1a' }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}

function IngestForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Signal) => void }) {
  const [platform, setPlatform] = useState('facebook');
  const [postUrl, setPostUrl] = useState('');
  const [authorHandle, setAuthorHandle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [postedAt, setPostedAt] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/social/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingestion_kind: 'manual', platform,
          post_url: postUrl || undefined,
          author_handle: authorHandle || undefined,
          author_display_name: authorName || undefined,
          posted_at: postedAt ? new Date(postedAt).toISOString() : undefined,
          raw_text: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.signal);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
        First ingest may take 30-60s while the language + NER models cold-load (~280 MB downloaded once into the HuggingFace cache). Cached after that.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8 }}>
        <Field label="Platform">
          <select value={platform} onChange={e => setPlatform(e.target.value)} style={inputStyle}>
            <option value="facebook">Facebook</option>
            <option value="twitter">Twitter / X</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp (forwarded)</option>
            <option value="web">Web (article / blog)</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Post URL (optional but improves attribution)"><input value={postUrl} onChange={e => setPostUrl(e.target.value)} style={inputStyle} placeholder="https://facebook.com/..." /></Field>
        <Field label="Posted at (optional)"><input type="datetime-local" value={postedAt} onChange={e => setPostedAt(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Author handle"><input value={authorHandle} onChange={e => setAuthorHandle(e.target.value)} style={inputStyle} placeholder="@SputnikAfrica" /></Field>
        <Field label="Author display name"><input value={authorName} onChange={e => setAuthorName(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Post body"><textarea required rows={5} value={text} onChange={e => setText(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="Paste the post text exactly as it appears." /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !text.trim()} style={primaryBtn}>{busy ? 'Analysing…' : 'Ingest + analyse'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Keywords ──────────────────────────────────────────────────────────────

function KeywordsSection({ keywords, canEdit, onChange }: { keywords: Keyword[]; canEdit: boolean; onChange: (rows: Keyword[]) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🔎 Keyword watchlist" subtitle="Phrases / regex / names the listener flags incoming posts against.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add keyword'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddKeywordForm onCancel={() => setAdding(false)} onCreated={(k) => { onChange([k, ...keywords]); setAdding(false); }} />
      )}
      {keywords.length === 0 ? <Empty text="No keywords on the watchlist." /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {keywords.map(k => (
            <div key={k.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{k.term}</strong>
                  <Tag muted>{k.match_kind}</Tag>
                  {k.scope !== 'all' && <Tag muted>{k.scope}</Tag>}
                  <Tag accent={severityTone(k.severity_floor)}>severity {k.severity_floor}</Tag>
                </div>
                <span style={statusBadge(k.status)}>{k.status}</span>
              </div>
              {k.notes && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{k.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddKeywordForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (k: Keyword) => void }) {
  const [term, setTerm] = useState('');
  const [matchKind, setMatchKind] = useState('phrase');
  const [scope, setScope] = useState('all');
  const [severity, setSeverity] = useState('low');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/social/keywords', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, match_kind: matchKind, scope, severity_floor: severity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.keyword);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
        <Field label="Term"><input required value={term} onChange={e => setTerm(e.target.value)} style={inputStyle} placeholder="Wagner / Prigozhin / load shedding sabotage" /></Field>
        <Field label="Match kind">
          <select value={matchKind} onChange={e => setMatchKind(e.target.value)} style={inputStyle}>
            <option value="phrase">phrase (substring)</option>
            <option value="regex">regex</option>
            <option value="name">name (substring + NER)</option>
          </select>
        </Field>
        <Field label="Scope">
          <select value={scope} onChange={e => setScope(e.target.value)} style={inputStyle}>
            <option value="all">all platforms</option>
            <option value="facebook">facebook</option>
            <option value="twitter">twitter</option>
            <option value="instagram">instagram</option>
            <option value="tiktok">tiktok</option>
            <option value="telegram">telegram</option>
            <option value="whatsapp">whatsapp</option>
            <option value="web">web</option>
          </select>
        </Field>
        <Field label="Severity floor">
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={inputStyle}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !term.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add keyword'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Sources ───────────────────────────────────────────────────────────────

function SourcesSection({ sources, canEdit, onChange }: { sources: Source[]; canEdit: boolean; onChange: (rows: Source[]) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🏛 Source-reputation list" subtitle={`${sources.length} known source${sources.length === 1 ? '' : 's'} — Russian-aligned and Chinese-aligned state media seeded by default. Edit any to tighten or revise.`}>
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add source'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddSourceForm onCancel={() => setAdding(false)} onCreated={(s) => { onChange([s, ...sources]); setAdding(false); }} />
      )}
      {sources.length === 0 ? <Empty text="No sources yet — defaults will seed on first load." /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {sources.map(s => (
            <div key={s.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{s.identifier}</strong>
                  {s.display_name && <span style={{ color: '#666', marginLeft: 6 }}>{s.display_name}</span>}
                  {s.is_default && <Tag muted>default</Tag>}
                  <Tag accent={alignmentTone(s.alignment)}>{s.alignment}</Tag>
                  {s.country && <Tag muted>{s.country}</Tag>}
                  {s.alignment_confidence != null && <span style={{ fontSize: 11, color: '#666', marginLeft: 6 }}>conf {(parseFloat(String(s.alignment_confidence)) * 100).toFixed(0)}%</span>}
                </div>
              </div>
              {s.notes && <p style={{ fontSize: 12, color: '#444', margin: '4px 0 0' }}>{s.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddSourceForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Source) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [kind, setKind] = useState('domain');
  const [displayName, setDisplayName] = useState('');
  const [alignment, setAlignment] = useState('uncategorised');
  const [country, setCountry] = useState('');
  const [confidence, setConfidence] = useState('0.7');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/social/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier, identifier_kind: kind, display_name: displayName || undefined,
          alignment, country: country || undefined,
          alignment_confidence: confidence ? Number(confidence) : undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.source);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
        <Field label="Identifier"><input required value={identifier} onChange={e => setIdentifier(e.target.value)} style={inputStyle} placeholder="rt.com / @SputnikAfrica" /></Field>
        <Field label="Kind">
          <select value={kind} onChange={e => setKind(e.target.value)} style={inputStyle}>
            <option value="domain">domain</option>
            <option value="fb_page">fb_page</option>
            <option value="twitter_handle">twitter_handle</option>
            <option value="tg_channel">tg_channel</option>
            <option value="youtube_channel">youtube_channel</option>
            <option value="other">other</option>
          </select>
        </Field>
        <Field label="Country (ISO)"><input value={country} onChange={e => setCountry(e.target.value)} maxLength={3} style={inputStyle} placeholder="RU" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Display name"><input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Alignment">
          <select value={alignment} onChange={e => setAlignment(e.target.value)} style={inputStyle}>
            <option value="uncategorised">uncategorised</option>
            <option value="state_russia">state_russia</option>
            <option value="state_china">state_china</option>
            <option value="state_other">state_other</option>
            <option value="cib_network">cib_network</option>
            <option value="extremist">extremist</option>
            <option value="commercial">commercial</option>
            <option value="reputable">reputable</option>
          </select>
        </Field>
        <Field label="Confidence (0..1)"><input type="number" min={0} max={1} step="0.05" value={confidence} onChange={e => setConfidence(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !identifier.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add source'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 4 }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: 18, background: 'white', border: '1px dashed #d0d0d0', borderRadius: 8, color: '#777', fontSize: 13, textAlign: 'center' }}>{text}</div>;
}
function Tag({ children, muted = false, accent }: { children: React.ReactNode; muted?: boolean; accent?: { bg: string; fg: string } }) {
  const style = accent
    ? { background: accent.bg, color: accent.fg }
    : muted ? { background: '#eef0f3', color: '#555' } : { background: '#e6f0ff', color: '#0044aa' };
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginRight: 4, ...style }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8,
  padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
};
const primaryBtn: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'white', color: '#0066cc', border: '1px solid #0066cc',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
};

function alignmentTone(a: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    state_russia: { bg: '#ffe6e6', fg: '#a02020' },
    state_china: { bg: '#fff2d6', fg: '#8a5400' },
    state_other: { bg: '#fff8e6', fg: '#8a5400' },
    cib_network: { bg: '#e8e3ff', fg: '#5a3a99' },
    extremist: { bg: '#ffd6d6', fg: '#7a0000' },
    commercial: { bg: '#eef0f3', fg: '#555' },
    reputable: { bg: '#e7f6e7', fg: '#1a5d1a' },
    uncategorised: { bg: '#eef0f3', fg: '#555' },
  };
  return map[a] || { bg: '#eee', fg: '#555' };
}
function severityTone(s: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    low: { bg: '#e7f6e7', fg: '#1a5d1a' },
    medium: { bg: '#fff8e6', fg: '#8a5400' },
    high: { bg: '#ffe6e6', fg: '#a02020' },
    critical: { bg: '#ffd6d6', fg: '#7a0000' },
  };
  return map[s] || { bg: '#eee', fg: '#555' };
}
function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    new: { bg: '#fff8e6', fg: '#8a5400' },
    analysing: { bg: '#e8e3ff', fg: '#5a3a99' },
    analysed: { bg: '#e0f0ff', fg: '#0044aa' },
    flagged: { bg: '#ffe6e6', fg: '#a02020' },
    cleared: { bg: '#e7f6e7', fg: '#1a5d1a' },
    reported: { bg: '#dbf3f3', fg: '#0a6363' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
    active: { bg: '#e7f6e7', fg: '#1a5d1a' },
    paused: { bg: '#fff8e6', fg: '#8a5400' },
    archived: { bg: '#eee', fg: '#777' },
    pending: { bg: '#fff8e6', fg: '#8a5400' },
    generated: { bg: '#e0f0ff', fg: '#0044aa' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    shared: { bg: '#dbf3f3', fg: '#0a6363' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
