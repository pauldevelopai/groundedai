// DistBriefDetail — kind-specific renderers (inbound triage / outbound plan
// / correction draft) with raw-JSON toggle.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Brief = {
  id: string; title: string;
  kind: 'inbound_triage' | 'outbound_plan' | 'correction_draft';
  status: string;
  brief_input: string | null;
  output: Record<string, unknown>;
  edited_output: Record<string, unknown> | null;
  notes: string | null;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string; updated_at: string;
};
const KIND_LABELS: Record<Brief['kind'], string> = {
  inbound_triage: 'Inbound triage',
  outbound_plan: 'Outbound plan',
  correction_draft: 'Correction draft',
};
const STATUSES = ['generated', 'edited', 'applied', 'failed'];

export default function DistBriefDetail({ brief, canEdit }: { brief: Brief; canEdit: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(brief.notes || '');
  const [status, setStatus] = useState(brief.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const view = (brief.edited_output as Record<string, unknown>) || (brief.output as Record<string, unknown>);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/distribution/briefs/${brief.id}`, {
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
    const res = await fetch(`/api/distribution/briefs/${brief.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/distribution');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/distribution" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>← Digital News Gatherer</Link>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

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

        {brief.kind === 'inbound_triage' && <InboundTriageView v={view} />}
        {brief.kind === 'outbound_plan' && <OutboundPlanView v={view} />}
        {brief.kind === 'correction_draft' && <CorrectionDraftView v={view} />}

        {Array.isArray(view.outstanding_questions) && view.outstanding_questions.length > 0 && (
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

function InboundTriageView({ v }: { v: Record<string, unknown> }) {
  const decisions = (v.decisions as Array<{ submission_id: string; suggested_classification: string; suggested_route: string; rationale: string; urgency_score: number; drafted_reply: string }>) || [];
  const patterns = (v.patterns_observed as string[]) || [];
  return (
    <>
      {decisions.length > 0 && (
        <Card title={`Decisions (${decisions.length})`}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {decisions.map((d, i) => (
              <li key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, color: '#666' }}>submission {d.submission_id}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                  {d.suggested_classification} → {d.suggested_route}
                  {typeof d.urgency_score === 'number' && <span style={{ marginLeft: 6, color: d.urgency_score > 0.7 ? '#a02020' : '#666' }}>urgency {Math.round(d.urgency_score * 100)}%</span>}
                </div>
                <p style={{ fontSize: 13, color: '#444', margin: '4px 0 0', lineHeight: 1.5 }}>{d.rationale}</p>
                {d.drafted_reply && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>Drafted reply</summary>
                    <p style={{ fontSize: 13, marginTop: 4, padding: 8, background: '#fafbfc', borderRadius: 4 }}>{d.drafted_reply}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {patterns.length > 0 && <Card title="Patterns observed"><BulletList items={patterns} /></Card>}
    </>
  );
}

function OutboundPlanView({ v }: { v: Record<string, unknown> }) {
  const channels = (v.channels as Array<{ channel_id: string; channel_name: string; channel_kind: string; draft: { title: string; body: string; hashtags: string[]; media_note: string }; rationale: string; publish_window: string }>) || [];
  return (
    <>
      {channels.map((c, i) => (
        <Card key={i} title={`${c.channel_name} (${c.channel_kind})`}>
          {c.draft?.title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{c.draft.title}</div>}
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{c.draft?.body}</p>
          {Array.isArray(c.draft?.hashtags) && c.draft.hashtags.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#0066cc' }}>{c.draft.hashtags.map(t => '#' + t.replace(/^#/, '')).join(' ')}</div>
          )}
          {c.draft?.media_note && <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0', fontStyle: 'italic' }}>media: {c.draft.media_note}</p>}
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            {c.publish_window && <>publish: <strong>{c.publish_window}</strong>{' · '}</>}
            <em>{c.rationale}</em>
          </div>
        </Card>
      ))}
      {typeof v.cross_post_notes === 'string' && (
        <Card title="Cross-post notes"><p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.5 }}>{v.cross_post_notes}</p></Card>
      )}
    </>
  );
}

function CorrectionDraftView({ v }: { v: Record<string, unknown> }) {
  const perChannel = (v.per_channel as Array<{ send_id: string; channel_kind: string; draft: string; tone: string; should_pin: boolean }>) || [];
  const internal = (v.internal_actions as string[]) || [];
  return (
    <>
      {typeof v.core_correction === 'string' && (
        <Card title="Core correction"><p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{v.core_correction}</p></Card>
      )}
      {perChannel.length > 0 && (
        <Card title="Per-channel drafts">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {perChannel.map((c, i) => (
              <li key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 12, color: '#666' }}>send {c.send_id} · {c.channel_kind} · tone: {c.tone}{c.should_pin && ' · 📌 pin'}</div>
                <p style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{c.draft}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {internal.length > 0 && <Card title="Internal actions"><BulletList items={internal} /></Card>}
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

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: '#444' }}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
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
