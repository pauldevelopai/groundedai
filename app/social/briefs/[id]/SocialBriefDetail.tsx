// SocialBriefDetail — kind-specific renderers (signal_analysis / keyword_sweep
// / coordinated_pattern). Includes inline signal previews so the editor can
// see what the agent reasoned over.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

type Brief = {
  id: string; title: string;
  kind: 'signal_analysis' | 'keyword_sweep' | 'coordinated_pattern';
  status: string;
  brief_input: string | null;
  signal_ids: string[];
  output: Record<string, unknown>;
  edited_output: Record<string, unknown> | null;
  notes: string | null;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string; updated_at: string;
};
type Signal = {
  id: string; platform: string; post_url: string | null;
  author_handle: string | null; author_display_name: string | null;
  raw_text: string; posted_at: string | null; source_domain: string | null;
  analysis: Record<string, unknown>; status: string;
};
const KIND_LABELS: Record<Brief['kind'], string> = {
  signal_analysis: 'Signal analysis',
  keyword_sweep: 'Keyword sweep',
  coordinated_pattern: 'Coordinated pattern',
};
const STATUSES = ['generated', 'edited', 'shared', 'failed'];

export default function SocialBriefDetail({ brief, signals, canEdit }: { brief: Brief; signals: Signal[]; canEdit: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(brief.notes || '');
  const [status, setStatus] = useState(brief.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const view = (brief.edited_output as Record<string, unknown>) || (brief.output as Record<string, unknown>);
  const sigById = new Map(signals.map(s => [s.id, s]));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/social/briefs/${brief.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function deleteBrief() {
    if (!confirm('Delete this brief?')) return;
    const res = await fetch(`/api/social/briefs/${brief.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/social');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="🛰 Social media listener" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{brief.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {KIND_LABELS[brief.kind]} · status: <strong>{brief.status}</strong>
          {brief.duration_ms && <> · generated in {(brief.duration_ms / 1000).toFixed(1)}s</>}
          {brief.cost_usd && <> · ${Number(brief.cost_usd).toFixed(4)}</>}
        </p>
        {brief.error && (
          <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
            <strong>Error:</strong> {brief.error}
          </p>
        )}
        {brief.brief_input && (
          <Card title="Editor's framing">
            <p style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{brief.brief_input}</p>
          </Card>
        )}
        {typeof view.headline === 'string' && (
          <Card title="Headline"><p style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>{view.headline}</p></Card>
        )}

        {brief.kind === 'signal_analysis' && <SignalAnalysisView v={view} sigById={sigById} />}
        {brief.kind === 'keyword_sweep' && <KeywordSweepView v={view} sigById={sigById} />}
        {brief.kind === 'coordinated_pattern' && <CoordinatedPatternView v={view} sigById={sigById} />}

        {Array.isArray(view.outstanding_questions) && (view.outstanding_questions as string[]).length > 0 && (
          <Card title="Outstanding questions for the editor">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5a4400' }}>
              {(view.outstanding_questions as string[]).map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </Card>
        )}

        {canEdit && (
          <Card title="Editor notes & status">
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={textarea} placeholder="Internal notes" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#555' }}>
                Status:&nbsp;
                <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button onClick={save} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
              <button onClick={deleteBrief} style={dangerBtn}>Delete</button>
              {savedAt && <span style={{ fontSize: 12, color: '#1a5d1a' }}>Saved at {savedAt}</span>}
              {err && <span style={{ fontSize: 12, color: '#b00' }}>{err}</span>}
            </div>
          </Card>
        )}
        <button onClick={() => setShowRaw(s => !s)} style={{ ...miniBtn, marginTop: 12 }}>{showRaw ? 'Hide' : 'Show'} raw JSON</button>
        {showRaw && (
          <pre style={{ marginTop: 8, padding: 12, background: '#fafbfc', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 400 }}>
            {JSON.stringify(view, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}

function SignalAnalysisView({ v, sigById }: { v: Record<string, unknown>; sigById: Map<string, Signal> }) {
  const items = (v.signals as Array<{ signal_id: string; what_was_said: string; language_assessment: string; origin_attribution: { primary_signal: string; supporting_signals: string[]; confidence: string; alignment: string }; why_damaging: string; severity: string; recommended_response: string }>) || [];
  const patterns = (v.patterns as string[]) || [];
  return (
    <>
      {items.map((it, i) => {
        const sig = sigById.get(it.signal_id);
        return (
          <Card key={i} title={`Signal ${i + 1}`}>
            {sig && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                {sig.author_display_name || sig.author_handle || sig.source_domain || '(unknown source)'} ·
                {sig.post_url ? <a href={sig.post_url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: '#0066cc' }}>open ↗</a> : null}
              </div>
            )}
            <p style={{ fontSize: 14, margin: '0 0 8px', lineHeight: 1.5 }}><strong>What was said:</strong> {it.what_was_said}</p>
            <p style={{ fontSize: 13, color: '#444', margin: '0 0 6px' }}>{it.language_assessment}</p>
            <div style={{ background: '#fafbfc', borderRadius: 6, padding: 10, fontSize: 13 }}>
              <div><strong>Origin attribution:</strong> {it.origin_attribution.alignment} · confidence <strong>{it.origin_attribution.confidence}</strong></div>
              <div style={{ marginTop: 4 }}>{it.origin_attribution.primary_signal}</div>
              {it.origin_attribution.supporting_signals?.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {it.origin_attribution.supporting_signals.map((s, j) => <li key={j}>{s}</li>)}
                </ul>
              )}
            </div>
            <p style={{ fontSize: 13, margin: '8px 0 4px' }}><strong>Why damaging:</strong> {it.why_damaging}</p>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              severity <strong>{it.severity}</strong> · recommended <strong>{it.recommended_response}</strong>
            </div>
          </Card>
        );
      })}
      {patterns.length > 0 && (
        <Card title="Patterns"><ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5 }}>{patterns.map((p, i) => <li key={i}>{p}</li>)}</ul></Card>
      )}
    </>
  );
}

function KeywordSweepView({ v, sigById }: { v: Record<string, unknown>; sigById: Map<string, Signal> }) {
  const groups = (v.by_keyword as Array<{ keyword: string; hit_count: number; top_signals: Array<{ signal_id: string; snippet: string; alignment: string }>; trend_note: string }>) || [];
  const outliers = (v.outliers as Array<{ signal_id: string; reason: string }>) || [];
  return (
    <>
      {groups.map((g, i) => (
        <Card key={i} title={`${g.keyword} — ${g.hit_count} hit${g.hit_count === 1 ? '' : 's'}`}>
          <p style={{ fontSize: 13, color: '#444', margin: '0 0 8px' }}>{g.trend_note}</p>
          {g.top_signals?.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {g.top_signals.map((s, j) => {
                const sig = sigById.get(s.signal_id);
                return (
                  <li key={j} style={{ padding: '6px 0', borderTop: j === 0 ? 'none' : '1px solid #f0f0f0', fontSize: 13 }}>
                    <div style={{ fontSize: 11, color: '#666' }}>
                      {sig?.author_display_name || sig?.author_handle || sig?.source_domain || s.signal_id.slice(0, 8)} · alignment: <strong>{s.alignment}</strong>
                    </div>
                    <div style={{ marginTop: 2 }}>&ldquo;{s.snippet}&rdquo;</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}
      {outliers.length > 0 && (
        <Card title="Outliers">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {outliers.map((o, i) => {
              const sig = sigById.get(o.signal_id);
              return <li key={i} style={{ padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0', fontSize: 13 }}>
                <strong>{sig?.author_display_name || sig?.author_handle || o.signal_id.slice(0, 8)}:</strong> {o.reason}
              </li>;
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function CoordinatedPatternView({ v, sigById }: { v: Record<string, unknown>; sigById: Map<string, Signal> }) {
  const clusters = (v.candidate_clusters as Array<{ label: string; signal_ids: string[]; shared_phrasing: string[]; shared_domains: string[]; shared_handles: string[]; time_window: string; alignment_assessment: string; confidence: string; evidence_summary: string }>) || [];
  const outliers = (v.single_outliers as Array<{ signal_id: string; note: string }>) || [];
  const next = (v.next_steps as string[]) || [];
  return (
    <>
      {clusters.map((c, i) => (
        <Card key={i} title={c.label}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
            alignment: <strong>{c.alignment_assessment}</strong> · confidence: <strong>{c.confidence}</strong> · window: {c.time_window}
          </div>
          <p style={{ fontSize: 13, color: '#444', margin: '0 0 8px', lineHeight: 1.5 }}>{c.evidence_summary}</p>
          {c.shared_phrasing?.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>Shared phrasing ({c.shared_phrasing.length})</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {c.shared_phrasing.map((p, j) => <li key={j}>&ldquo;{p}&rdquo;</li>)}
              </ul>
            </details>
          )}
          {c.shared_domains?.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Shared domains: {c.shared_domains.join(', ')}</div>}
          {c.shared_handles?.length > 0 && <div style={{ fontSize: 12, marginTop: 2 }}>Shared handles: {c.shared_handles.join(', ')}</div>}
          {c.signal_ids?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
              signals in cluster: {c.signal_ids.map((id) => sigById.get(id)?.author_handle || id.slice(0, 8)).join(', ')}
            </div>
          )}
        </Card>
      ))}
      {outliers.length > 0 && <Card title="Single outliers"><ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>{outliers.map((o, i) => <li key={i}><strong>{sigById.get(o.signal_id)?.author_handle || o.signal_id.slice(0, 8)}:</strong> {o.note}</li>)}</ul></Card>}
      {next.length > 0 && <Card title="Next steps"><ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>{next.map((s, i) => <li key={i}>{s}</li>)}</ul></Card>}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 14 }}>
      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  );
}

const textarea: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical',
};
const selectStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: 12, border: '1px solid #d0d0d0', borderRadius: 4, marginLeft: 4,
};
const primaryBtn: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const dangerBtn: React.CSSProperties = {
  background: 'white', color: '#a02020', border: '1px solid #f5a4a4',
  padding: '6px 12px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
