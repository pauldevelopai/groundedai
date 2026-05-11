// AudienceWorkspace — analytics + AI query layer (post-2026-05-07).
// Two regions:
//   - Analytics signals (the foundation): upload Plausible / Umami / GA / CSV
//   - Consultations: headline_test / angle_check / analytics_query, all
//                    grounded in the analytics signals above
// Synthetic personas + focus-groups are out of scope; their tables remain
// for backward compat but the UI no longer surfaces them.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type SignalRow = {
  id: string;
  source: string;
  filename: string | null;
  signals: {
    landed_topics?: Array<{ topic: string; evidence: string; why_it_landed: string }>;
    gaps?: Array<{ topic_or_audience: string; evidence: string; implication: string }>;
    bounced_stories?: Array<{ headline_or_url: string; drop_off_signal: string; diagnosis: string }>;
    drift_notes?: string;
  };
  total_pageviews: number | null;
  unique_visitors: number | null;
  analysis_summary: string | null;
  status: 'pending' | 'analyzed' | 'failed';
  duration_ms: number | null;
  error: string | null;
  notes: string | null;
  created_at: string;
};

type ConsultationRow = {
  id: string;
  title: string;
  kind: 'headline_test' | 'angle_check' | 'analytics_query';
  input_text: string;
  referenced_signal_ids: string[];
  status: 'pending' | 'generated' | 'edited' | 'shared' | 'failed';
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const KIND_LABELS: Record<ConsultationRow['kind'], string> = {
  headline_test: 'Headline test',
  angle_check: 'Angle sense-check',
  analytics_query: 'Analytics query',
};

export default function AudienceWorkspace({
  initialSignals, initialConsultations, canEdit, role,
}: {
  initialSignals: SignalRow[];
  initialConsultations: ConsultationRow[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [signals, setSignals] = useState(initialSignals);
  const [consultations, setConsultations] = useState(initialConsultations);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Grounded</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>👥 Audience Analytics Manager</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audio & Video Producer →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations Manager →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Digital News Gatherer →</Link>
        <Link href="/social" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Social media listener →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/learning" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Learning →</Link>
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Audience</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Collect analytics across the newsroom and interrogate them. Test a headline, sense-check a story angle, or ask free-form questions about what&apos;s landing, what&apos;s missing, what&apos;s bouncing — every answer grounded in your real past performance.
        </p>

        <ConsultationsSection
          consultations={consultations} signals={signals}
          canEdit={canEdit}
          onChange={setConsultations}
          onRefresh={() => router.refresh()}
        />
        <SignalsSection signals={signals} canEdit={canEdit} onChange={setSignals} />
      </div>
    </main>
  );
}

// ─── Consultations ─────────────────────────────────────────────────────────

function ConsultationsSection({
  consultations, signals, canEdit, onChange, onRefresh,
}: {
  consultations: ConsultationRow[]; signals: SignalRow[];
  canEdit: boolean;
  onChange: (rows: ConsultationRow[]) => void;
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>📋 Consultations</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            Headline tests, angle sense-checks, and analytics queries — all backtested against your newsroom&apos;s past performance.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setCreating(c => !c)} style={primaryBtn}>
            {creating ? 'Cancel' : '+ New consultation'}
          </button>
        )}
      </div>
      {creating && canEdit && (
        <NewConsultationForm
          signalsCount={signals.length}
          onCancel={() => setCreating(false)}
          onCreated={(row) => { onChange([row, ...consultations]); setCreating(false); onRefresh(); }}
        />
      )}
      {consultations.length === 0 ? (
        <Empty text={signals.length === 0
          ? 'No consultations yet. Upload some analytics in the section below first, then ask a question.'
          : 'No consultations yet. Click + New consultation to test a headline.'} />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {consultations.map(c => (
            <Link key={c.id} href={`/audience/consultations/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: 14 }}>{c.title}</strong>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {KIND_LABELS[c.kind]} · grounded in {c.referenced_signal_ids.length} signal{c.referenced_signal_ids.length === 1 ? '' : 's'} · {new Date(c.created_at).toLocaleString()}
                    </div>
                    <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.4 }}>
                      {c.input_text.slice(0, 240)}{c.input_text.length > 240 ? '…' : ''}
                    </p>
                  </div>
                  <span style={statusBadge(c.status)}>{c.status}</span>
                </div>
                {c.error && <p style={{ color: '#b00', fontSize: 12, margin: '6px 0 0' }}>{c.error}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NewConsultationForm({ signalsCount, onCancel, onCreated }: { signalsCount: number; onCancel: () => void; onCreated: (row: ConsultationRow) => void }) {
  const [kind, setKind] = useState<ConsultationRow['kind']>('headline_test');
  const [inputText, setInputText] = useState('');
  const [contextBrief, setContextBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/audience/consultations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, input_text: inputText,
          context_brief: contextBrief || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      const list = await fetch('/api/audience/consultations').then(r => r.json());
      const newest = (list.consultations || []).find((c: ConsultationRow) => c.id === data.consultationId) || list.consultations?.[0];
      if (newest) onCreated(newest);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const placeholders = {
    headline_test: 'Paste the proposed headline. Example: "Zambia\'s ruling party loses ground in copperbelt by-elections — early results"',
    angle_check: 'Paste your story angle / lede / framing. Example: "We\'re framing this as the third strike on local copper miners — the angle leans on the long-running tension between FQM and the unions"',
    analytics_query: 'Type a free-form question. Examples: "What\'s been bouncing this month?" / "Are vernacular pieces landing?" / "Which beat has grown most over the last quarter?"',
  };

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      {signalsCount === 0 && (
        <p style={{ fontSize: 12, color: '#8a5400', background: '#fff8e6', padding: 8, borderRadius: 4, margin: '0 0 10px' }}>
          You haven&apos;t uploaded any analytics yet. The consultation will run, but its grounding will be thin until you give it real data to read.
        </p>
      )}
      <Field label="Consultation kind">
        <select value={kind} onChange={e => setKind(e.target.value as ConsultationRow['kind'])} style={inputStyle}>
          <option value="headline_test">Headline test — will this headline land, based on past performance</option>
          <option value="angle_check">Angle sense-check — how has this kind of angle performed before</option>
          <option value="analytics_query">Analytics query — free-form question about what&apos;s landing/bouncing/missing</option>
        </select>
      </Field>
      <Field label={kind === 'headline_test' ? 'Headline to test' : kind === 'angle_check' ? 'Story angle to sense-check' : 'Your question'}>
        <textarea
          required minLength={4} rows={4}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={placeholders[kind]}
          style={{ ...inputStyle, fontFamily: 'inherit' }}
        />
      </Field>
      <Field label="Additional context (optional)">
        <textarea rows={2} value={contextBrief} onChange={e => setContextBrief(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="Draft body, target audience, or anything you want the agent to weigh." />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || inputText.trim().length < 4} style={primaryBtn}>{busy ? 'Generating…' : 'Run consultation'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Analytics signals (kept from slice 10) ────────────────────────────────

function SignalsSection({
  signals, canEdit, onChange,
}: {
  signals: SignalRow[]; canEdit: boolean; onChange: (next: SignalRow[]) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [source, setSource] = useState<'plausible' | 'umami' | 'ga' | 'csv' | 'manual'>('csv');
  const [filename, setFilename] = useState('');
  const [rawCsv, setRawCsv] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/audience/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, raw_csv: rawCsv.trim(), filename: filename.trim() || undefined, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      const list = await fetch('/api/audience/signals').then((r) => r.json());
      onChange(list.signals || []);
      setShowNew(false); setRawCsv(''); setFilename(''); setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>📈 Analytics signals ({signals.length})</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            The foundation for every consultation. Paste an export from Plausible / Umami / GA / a raw CSV — Grounded turns it into editorial signals.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew((s) => !s)} style={ghostBtn}>
            {showNew ? 'Cancel' : '+ Upload analytics'}
          </button>
        )}
      </div>

      {showNew && canEdit && (
        <form onSubmit={onUpload} style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <Field label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} style={inputStyle}>
                <option value="csv">CSV (any source)</option>
                <option value="plausible">Plausible</option>
                <option value="umami">Umami</option>
                <option value="ga">Google Analytics</option>
                <option value="manual">Manual notes</option>
              </select>
            </Field>
            <Field label="Filename / period label (optional)">
              <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Paste rows / export">
            <textarea required minLength={10} rows={6} value={rawCsv} onChange={(e) => setRawCsv(e.target.value)} style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} placeholder="Pageviews, dwell time, bounce rate, top stories, etc." />
          </Field>
          <Field label="Notes for the agent (optional)">
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="submit" disabled={submitting || rawCsv.trim().length < 10} style={primaryBtn}>{submitting ? 'Analysing…' : 'Upload + analyse'}</button>
            <button type="button" onClick={() => setShowNew(false)} style={ghostBtn}>Cancel</button>
            {error && <span style={{ color: '#b00', fontSize: 12 }}>{error}</span>}
          </div>
        </form>
      )}

      {signals.length === 0 ? (
        <Empty text="No signals uploaded yet. Click + Upload analytics." />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {signals.map((s) => (
            <li key={s.id} style={{ ...cardStyle, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{s.filename || s.source}</strong>
                <span style={statusBadge(s.status)}>{s.status}</span>
              </div>
              <p style={{ fontSize: 11, color: '#666', margin: '4px 0' }}>
                {s.source} · {new Date(s.created_at).toLocaleString()}
                {s.total_pageviews ? ` · ${s.total_pageviews.toLocaleString()} pageviews` : ''}
                {s.unique_visitors ? ` · ${s.unique_visitors.toLocaleString()} uniques` : ''}
              </p>
              {s.analysis_summary && <p style={{ fontSize: 13, color: '#333', margin: '4px 0 0', lineHeight: 1.4 }}>{s.analysis_summary}</p>}
              {s.signals?.landed_topics && s.signals.landed_topics.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 12, color: '#1a5d1a', cursor: 'pointer' }}>Landed topics ({s.signals.landed_topics.length})</summary>
                  <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 12 }}>
                    {s.signals.landed_topics.map((t, i) => <li key={i}><strong>{t.topic}</strong>: {t.why_it_landed}</li>)}
                  </ul>
                </details>
              )}
              {s.signals?.gaps && s.signals.gaps.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, color: '#8a5400', cursor: 'pointer' }}>Gaps to fill ({s.signals.gaps.length})</summary>
                  <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 12 }}>
                    {s.signals.gaps.map((g, i) => <li key={i}><strong>{g.topic_or_audience}</strong>: {g.implication}</li>)}
                  </ul>
                </details>
              )}
              {s.signals?.bounced_stories && s.signals.bounced_stories.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, color: '#a02020', cursor: 'pointer' }}>Bounced stories ({s.signals.bounced_stories.length})</summary>
                  <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 12 }}>
                    {s.signals.bounced_stories.map((b, i) => <li key={i}><strong>{b.headline_or_url}</strong>: {b.diagnosis}</li>)}
                  </ul>
                </details>
              )}
              {s.signals?.drift_notes && <p style={{ fontSize: 12, color: '#5a3a99', margin: '6px 0 0' }}>{s.signals.drift_notes}</p>}
              {s.error && <p style={{ fontSize: 12, color: '#b00', marginTop: 4 }}>{s.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

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

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fff8e6', fg: '#8a5400' },
    generated: { bg: '#e0f0ff', fg: '#0044aa' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    shared: { bg: '#dbf3f3', fg: '#0a6363' },
    analyzed: { bg: '#e7f6e7', fg: '#1a5d1a' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
