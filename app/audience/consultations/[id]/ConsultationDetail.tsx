// ConsultationDetail — kind-specific renderers (headline_test / angle_check
// / analytics_query) + a referenced-signals panel showing what data the
// agent reasoned over. Editor can edit notes / status / delete.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Consultation = {
  id: string; title: string;
  kind: 'headline_test' | 'angle_check' | 'analytics_query';
  input_text: string;
  context_brief: string | null;
  referenced_signal_ids: string[];
  output: Record<string, unknown>;
  edited_output: Record<string, unknown> | null;
  notes: string | null;
  status: string;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
type SignalRow = {
  id: string; source: string; filename: string | null;
  signals: Record<string, unknown>;
  analysis_summary: string | null;
  created_at: string;
};

const KIND_LABELS: Record<Consultation['kind'], string> = {
  headline_test: 'Headline test',
  angle_check: 'Angle sense-check',
  analytics_query: 'Analytics query',
};
const STATUSES = ['generated', 'edited', 'shared', 'failed'];

export default function ConsultationDetail({
  consultation, referencedSignals, canEdit,
}: { consultation: Consultation; referencedSignals: SignalRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(consultation.notes || '');
  const [status, setStatus] = useState(consultation.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const view = (consultation.edited_output as Record<string, unknown>) || (consultation.output as Record<string, unknown>);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/audience/consultations/${consultation.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function deleteConsultation() {
    if (!confirm('Delete this consultation?')) return;
    const res = await fetch(`/api/audience/consultations/${consultation.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/audience');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/audience" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>← Audience</Link>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{consultation.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {KIND_LABELS[consultation.kind]} · status: <strong>{consultation.status}</strong>
          {consultation.duration_ms && <> · generated in {(consultation.duration_ms / 1000).toFixed(1)}s</>}
          {consultation.cost_usd && <> · ${Number(consultation.cost_usd).toFixed(4)}</>}
          {' · grounded in '}{consultation.referenced_signal_ids.length} signal{consultation.referenced_signal_ids.length === 1 ? '' : 's'}
        </p>

        {consultation.error && (
          <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
            <strong>Error:</strong> {consultation.error}
          </p>
        )}

        <Card title={consultation.kind === 'analytics_query' ? "Editor's question" : consultation.kind === 'angle_check' ? 'Angle under review' : 'Headline under test'}>
          <p style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{consultation.input_text}</p>
          {consultation.context_brief && (
            <>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', margin: '12px 0 4px' }}>Additional context</h3>
              <p style={{ fontSize: 13, color: '#444', margin: 0, whiteSpace: 'pre-wrap' }}>{consultation.context_brief}</p>
            </>
          )}
        </Card>

        {consultation.kind === 'headline_test' && <HeadlineTestView v={view} />}
        {consultation.kind === 'angle_check' && <AngleCheckView v={view} />}
        {consultation.kind === 'analytics_query' && <AnalyticsQueryView v={view} />}

        {Array.isArray(view.outstanding_questions) && (view.outstanding_questions as string[]).length > 0 && (
          <Card title="Outstanding questions for the editor">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5a4400' }}>
              {(view.outstanding_questions as string[]).map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </Card>
        )}

        {referencedSignals.length > 0 && (
          <Card title={`Grounded in (${referencedSignals.length} analytics signal${referencedSignals.length === 1 ? '' : 's'})`}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {referencedSignals.map(s => (
                <li key={s.id} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', fontSize: 12 }}>
                  <strong>{s.filename || s.source}</strong>
                  <span style={{ color: '#666', marginLeft: 6 }}>
                    {s.source} · {new Date(s.created_at).toLocaleString()}
                  </span>
                  {s.analysis_summary && <p style={{ fontSize: 12, color: '#444', margin: '4px 0 0' }}>{s.analysis_summary}</p>}
                </li>
              ))}
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
              <button onClick={deleteConsultation} style={dangerBtn}>Delete</button>
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

// ─── Per-kind views ────────────────────────────────────────────────────────

function HeadlineTestView({ v }: { v: Record<string, unknown> }) {
  const predictedPerf = typeof v.predicted_performance === 'string' ? v.predicted_performance : '';
  const reasoning = typeof v.reasoning === 'string' ? v.reasoning : '';
  const comparable = (v.comparable_pieces as Array<{ headline_or_url: string; what_happened: string; what_it_implies_for_this_headline: string }>) || [];
  const concerns = (v.concerns as string[]) || [];
  const alts = (v.alternative_phrasings as Array<{ alternative: string; why_it_might_perform_better: string }>) || [];
  return (
    <>
      {(predictedPerf || reasoning) ? (
        <Card title="Verdict">
          {predictedPerf ? (
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              Predicted performance: <PerformanceBadge value={predictedPerf} />
            </div>
          ) : null}
          {reasoning ? <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{reasoning}</p> : null}
        </Card>
      ) : null}
      {comparable.length > 0 && (
        <Card title={`Comparable past pieces (${comparable.length})`}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {comparable.map((c, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.headline_or_url}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>What happened: {c.what_happened}</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{c.what_it_implies_for_this_headline}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {concerns.length > 0 && <Card title="Concerns"><BulletList items={concerns} accent="#a02020" /></Card>}
      {alts.length > 0 && (
        <Card title="Alternative phrasings">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {alts.map((a, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.alternative}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{a.why_it_might_perform_better}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function AngleCheckView({ v }: { v: Record<string, unknown> }) {
  const summary = typeof v.summary === 'string' ? v.summary : '';
  const comparable = (v.comparable_past_pieces as Array<{ headline_or_url: string; framing_overlap: string; actual_performance: string; lesson: string }>) || [];
  const willEngage = (v.audience_segments_likely_to_engage as string[]) || [];
  const willSkip = (v.audience_segments_likely_to_skip as string[]) || [];
  const adjustments = (v.framing_adjustments as Array<{ current_framing: string; suggested_adjustment: string; rationale: string }>) || [];
  return (
    <>
      {summary ? (
        <Card title="Verdict">
          <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{summary}</p>
        </Card>
      ) : null}
      {comparable.length > 0 && (
        <Card title={`Comparable past pieces (${comparable.length})`}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {comparable.map((c, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.headline_or_url}</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}><em>Framing overlap:</em> {c.framing_overlap}</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}><em>Actual performance:</em> {c.actual_performance}</div>
                <div style={{ fontSize: 12, color: '#1a5d1a', marginTop: 2 }}>→ {c.lesson}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {willEngage.length > 0 && (
          <Card title="Likely to engage"><BulletList items={willEngage} accent="#1a5d1a" /></Card>
        )}
        {willSkip.length > 0 && (
          <Card title="Likely to skip"><BulletList items={willSkip} accent="#a02020" /></Card>
        )}
      </div>
      {adjustments.length > 0 && (
        <Card title="Suggested framing adjustments">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {adjustments.map((a, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 12, color: '#666' }}>Currently: <em>{a.current_framing}</em></div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>→ {a.suggested_adjustment}</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{a.rationale}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function AnalyticsQueryView({ v }: { v: Record<string, unknown> }) {
  const directAnswer = typeof v.direct_answer === 'string' ? v.direct_answer : '';
  const dataLimits = typeof v.what_data_does_not_show === 'string' ? v.what_data_does_not_show : '';
  const evidence = (v.supporting_evidence as Array<{ signal: string; evidence: string; interpretation: string }>) || [];
  const followUps = (v.follow_up_questions_for_data as string[]) || [];
  const actions = (v.recommended_editor_actions as string[]) || [];
  return (
    <>
      {directAnswer ? (
        <Card title="Answer">
          <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{directAnswer}</p>
        </Card>
      ) : null}
      {evidence.length > 0 && (
        <Card title={`Supporting evidence (${evidence.length})`}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {evidence.map((e, i) => (
              <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>{e.signal}</div>
                <div style={{ fontSize: 13, color: '#333', marginTop: 2 }}>{e.evidence}</div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 2, fontStyle: 'italic' }}>{e.interpretation}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {dataLimits ? (
        <Card title="What the data does not show">
          <p style={{ fontSize: 13, color: '#5a4400', margin: 0, lineHeight: 1.5 }}>{dataLimits}</p>
        </Card>
      ) : null}
      {actions.length > 0 && <Card title="Recommended editor actions"><BulletList items={actions} accent="#1a5d1a" /></Card>}
      {followUps.length > 0 && <Card title="Follow-up data questions"><BulletList items={followUps} /></Card>}
    </>
  );
}

function PerformanceBadge({ value }: { value: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    strong: { bg: '#e7f6e7', fg: '#1a5d1a' },
    moderate: { bg: '#fff8e6', fg: '#8a5400' },
    weak: { bg: '#ffe6e6', fg: '#a02020' },
    uncertain: { bg: '#eef0f3', fg: '#555' },
  };
  const c = map[value.toLowerCase()] || { bg: '#eee', fg: '#555' };
  return <span style={{ fontSize: 13, padding: '2px 10px', borderRadius: 12, background: c.bg, color: c.fg, fontWeight: 600 }}>{value}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 14 }}>
      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items, accent }: { items: string[]; accent?: string }) {
  return (
    <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: accent || '#444' }}>
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
