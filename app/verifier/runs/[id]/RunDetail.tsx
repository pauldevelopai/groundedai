// RunDetail — claim text, claim-by-claim verdicts, AI-likelihood,
// matched-outlet findings panel, editor notes, raw-JSON toggle.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

type Run = {
  id: string;
  title: string;
  claim_text: string;
  context_brief: string | null;
  source_kind: string;
  source_id: string | null;
  matched_outlet_findings: Record<string, {
    outlet_id: string; name: string; country: string;
    credibility_score: number | null; ownership: string | null;
    alignment_notes: string | null; known_issues: string[]; notes: string | null;
  }>;
  output: {
    claims?: Array<{ claim: string; verdict: string; confidence: number; evidence: string; sources: string[] }>;
    ai_likelihood?: number | null;
    ai_indicators?: string[];
    overall_assessment?: string;
  };
  edited_output: Record<string, unknown> | null;
  notes: string | null;
  status: string;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = ['verified', 'edited', 'failed'];

export default function RunDetail({ run, canEdit }: { run: Run; canEdit: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState(run.notes || '');
  const [status, setStatus] = useState(run.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const view = (run.edited_output as Run['output']) || run.output;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/verifier/runs/${run.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function deleteRun() {
    if (!confirm('Delete this run?')) return;
    const res = await fetch(`/api/verifier/runs/${run.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/verifier');
  }

  const claims = Array.isArray(view?.claims) ? view.claims : [];
  const findings = Object.entries(run.matched_outlet_findings || {});
  const aiLikelihood = view?.ai_likelihood;
  const aiIndicators = Array.isArray(view?.ai_indicators) ? view.ai_indicators : [];

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="🛡 Verifier" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{run.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          status: <strong>{run.status}</strong>
          {run.source_kind !== 'manual' && <> · via <strong>{run.source_kind.replace(/_/g, ' ')}</strong></>}
          {run.duration_ms && <> · ran in {(run.duration_ms / 1000).toFixed(1)}s</>}
          {run.cost_usd && <> · ${Number(run.cost_usd).toFixed(4)}</>}
        </p>

        {run.error && (
          <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
            <strong>Error:</strong> {run.error}
          </p>
        )}

        <Card title="Article / claim text">
          <p style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{run.claim_text}</p>
          {run.context_brief && (
            <>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', margin: '12px 0 4px' }}>Context</h3>
              <p style={{ fontSize: 13, color: '#444', margin: 0, whiteSpace: 'pre-wrap' }}>{run.context_brief}</p>
            </>
          )}
        </Card>

        {findings.length > 0 && (
          <Card title="Outlet credibility map matches">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {findings.map(([host, info]) => (
                <li key={host} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {info.name} <span style={{ color: '#666', fontWeight: 400 }}>· {host} · {info.country}</span>
                    <CredibilityBadge value={info.credibility_score} />
                  </div>
                  {info.ownership && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{info.ownership}</div>}
                  {Array.isArray(info.known_issues) && info.known_issues.length > 0 && (
                    <ul style={{ marginTop: 4, paddingLeft: 18, fontSize: 12, color: '#a02020' }}>
                      {info.known_issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {claims.length > 0 && (
          <Card title={`Claims (${claims.length})`}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {claims.map((c, i) => (
                <li key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13 }}>{c.claim}</strong>
                    <VerdictBadge verdict={c.verdict} confidence={c.confidence} />
                  </div>
                  <p style={{ fontSize: 13, color: '#444', margin: '4px 0 0', lineHeight: 1.5 }}>{c.evidence}</p>
                  {Array.isArray(c.sources) && c.sources.length > 0 && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      Sources: {c.sources.map((s, j) => (
                        <span key={j}>{j > 0 ? '; ' : ''}
                          {/^https?:\/\//.test(s) ? <a href={s} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>{s}</a> : s}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(aiLikelihood != null || aiIndicators.length > 0) && (
          <Card title="AI-generated content score">
            {aiLikelihood != null && (
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                Likelihood: <strong>{(aiLikelihood * 100).toFixed(0)}%</strong>
              </div>
            )}
            {aiIndicators.length > 0 && (
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
                {aiIndicators.map((ind, i) => <li key={i}>{ind}</li>)}
              </ul>
            )}
          </Card>
        )}

        {view?.overall_assessment && (
          <Card title="Overall assessment">
            <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{view.overall_assessment}</p>
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
              <button onClick={deleteRun} style={dangerBtn}>Delete</button>
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

function VerdictBadge({ verdict, confidence }: { verdict: string; confidence: number }) {
  const map: Record<string, { bg: string; fg: string }> = {
    supported: { bg: '#e7f6e7', fg: '#1a5d1a' },
    disputed: { bg: '#ffe6e6', fg: '#a02020' },
    unverifiable: { bg: '#fff8e6', fg: '#8a5400' },
    likely_ai_generated: { bg: '#e8e3ff', fg: '#5a3a99' },
  };
  const c = map[verdict] || { bg: '#eee', fg: '#555' };
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {verdict.replace(/_/g, ' ')} {typeof confidence === 'number' ? `· ${Math.round(confidence * 100)}%` : ''}
    </span>
  );
}

function CredibilityBadge({ value }: { value: number | null }) {
  if (value == null) return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 6, background: '#eef0f3', color: '#555' }}>unscored</span>;
  let bg, fg;
  if (value >= 0.85) { bg = '#e7f6e7'; fg = '#1a5d1a'; }
  else if (value >= 0.7) { bg = '#dbf3f3'; fg = '#0a6363'; }
  else if (value >= 0.55) { bg = '#fff8e6'; fg = '#8a5400'; }
  else { bg = '#ffe6e6'; fg = '#a02020'; }
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 6, background: bg, color: fg, fontWeight: 600 }}>{(value * 100).toFixed(0)}%</span>;
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
