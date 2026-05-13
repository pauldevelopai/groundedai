// BriefDetail — renders a fundraiser brief and allows section-level editing.
// edited_output is a JSONB blob keyed by section index; the editor edits
// the prose in place and PATCHes the whole edited_output back.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

type Section = { title: string; word_limit?: number; content: string; editor_notes?: string };
type BudgetLine = { category: string; amount_usd: number; rationale: string };
type Output = {
  title?: string;
  executive_summary?: string;
  period?: string;
  headline_outcomes?: string[];
  sections?: Section[];
  budget_scaffold?: { total_request_usd?: number; duration_months?: number; lines?: BudgetLine[]; co_funding_notes?: string };
  metrics?: Array<{ label: string; value: string; context: string }>;
  stories_to_highlight?: Array<{ headline: string; why_it_mattered: string }>;
  challenges_and_learning?: string;
  outstanding_questions?: string[];
  // LOI shape
  subject?: string;
  salutation?: string;
  opening?: string;
  the_work?: string;
  fit_with_funder?: string;
  ask?: string;
  closing?: string;
  // concept-note shape
  the_idea?: string;
  the_problem?: string;
  the_approach?: string;
  why_us?: string;
  expected_outputs?: string[];
  expected_outcomes?: string[];
  duration_months?: number;
  budget_estimate_usd?: number;
};

type Brief = {
  id: string;
  title: string;
  kind: 'grant_application' | 'donor_report' | 'concept_note' | 'loi';
  status: string;
  funder_id: string | null;
  funder_name: string | null;
  funder_url: string | null;
  budget_request_usd: number | null;
  duration_months: number | null;
  brief_input: string;
  output: Output;
  edited_output: Output | null;
  notes: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const KIND_LABELS: Record<Brief['kind'], string> = {
  grant_application: 'Grant application',
  donor_report: 'Donor report',
  concept_note: 'Concept note',
  loi: 'Letter of inquiry',
};

const STATUS_OPTIONS = ['generated', 'edited', 'submitted', 'won', 'lost'];

export default function BriefDetail({ brief, canEdit, role }: { brief: Brief; canEdit: boolean; role: string }) {
  const router = useRouter();
  const initial = brief.edited_output || brief.output;
  const [output, setOutput] = useState<Output>(initial);
  const [notes, setNotes] = useState(brief.notes || '');
  const [status, setStatus] = useState(brief.status);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/fundraiser/briefs/${brief.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_output: output, notes, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function deleteBrief() {
    if (!confirm('Delete this brief?')) return;
    const res = await fetch(`/api/fundraiser/briefs/${brief.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/fundraiser');
  }

  function setSection(i: number, patch: Partial<Section>) {
    const sections = [...(output.sections || [])];
    sections[i] = { ...sections[i], ...patch };
    setOutput({ ...output, sections });
  }

  function setBudgetLine(i: number, patch: Partial<BudgetLine>) {
    const lines = [...(output.budget_scaffold?.lines || [])];
    lines[i] = { ...lines[i], ...patch };
    setOutput({ ...output, budget_scaffold: { ...output.budget_scaffold, lines } });
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="💰 Fundraiser" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{output.title || brief.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {KIND_LABELS[brief.kind]}
          {brief.funder_name ? ` · ${brief.funder_name}` : ''}
          {brief.funder_url ? <> · <a href={brief.funder_url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>application page</a></> : null}
          {brief.budget_request_usd ? ` · $${brief.budget_request_usd.toLocaleString()} request` : ''}
          {brief.duration_months ? ` · ${brief.duration_months} mo` : ''}
        </p>

        {brief.error && <ErrorPanel msg={brief.error} />}

        {/* Editor's brief — read-only */}
        <Card title="Editor's brief">
          <p style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{brief.brief_input}</p>
        </Card>

        {output.executive_summary !== undefined && (
          <Card title="Executive summary">
            <Textarea value={output.executive_summary} onChange={v => setOutput({ ...output, executive_summary: v })} disabled={!canEdit} rows={3} />
          </Card>
        )}

        {/* Concept-note specific fields */}
        {brief.kind === 'concept_note' && (
          <>
            {ConceptField('The idea', output.the_idea, v => setOutput({ ...output, the_idea: v }), canEdit)}
            {ConceptField('The problem', output.the_problem, v => setOutput({ ...output, the_problem: v }), canEdit)}
            {ConceptField('The approach', output.the_approach, v => setOutput({ ...output, the_approach: v }), canEdit)}
            {ConceptField('Why us', output.why_us, v => setOutput({ ...output, why_us: v }), canEdit)}
            <Card title="Expected outputs & outcomes">
              <ListEditor label="Outputs" items={output.expected_outputs || []} onChange={items => setOutput({ ...output, expected_outputs: items })} disabled={!canEdit} />
              <ListEditor label="Outcomes" items={output.expected_outcomes || []} onChange={items => setOutput({ ...output, expected_outcomes: items })} disabled={!canEdit} />
            </Card>
          </>
        )}

        {/* LOI specific fields */}
        {brief.kind === 'loi' && (
          <>
            {ConceptField('Subject line', output.subject, v => setOutput({ ...output, subject: v }), canEdit, 1)}
            {ConceptField('Salutation', output.salutation, v => setOutput({ ...output, salutation: v }), canEdit, 1)}
            {ConceptField('Opening', output.opening, v => setOutput({ ...output, opening: v }), canEdit)}
            {ConceptField('The work', output.the_work, v => setOutput({ ...output, the_work: v }), canEdit)}
            {ConceptField('Fit with funder', output.fit_with_funder, v => setOutput({ ...output, fit_with_funder: v }), canEdit)}
            {ConceptField('The ask', output.ask, v => setOutput({ ...output, ask: v }), canEdit)}
            {ConceptField('Closing', output.closing, v => setOutput({ ...output, closing: v }), canEdit, 2)}
          </>
        )}

        {/* Donor-report specific fields */}
        {brief.kind === 'donor_report' && (
          <>
            {ConceptField('Reporting period', output.period, v => setOutput({ ...output, period: v }), canEdit, 1)}
            {output.headline_outcomes && (
              <Card title="Headline outcomes">
                <ListEditor label="" items={output.headline_outcomes} onChange={items => setOutput({ ...output, headline_outcomes: items })} disabled={!canEdit} />
              </Card>
            )}
            {output.metrics && output.metrics.length > 0 && (
              <Card title="Metrics">
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#666' }}>
                      <th style={thStyle}>Metric</th><th style={thStyle}>Value</th><th style={thStyle}>Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.metrics.map((m, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{m.label}</td>
                        <td style={tdStyle}>{m.value}</td>
                        <td style={tdStyle}>{m.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            {ConceptField('Challenges and learning', output.challenges_and_learning, v => setOutput({ ...output, challenges_and_learning: v }), canEdit, 4)}
          </>
        )}

        {/* Sections (grant_application + donor_report) */}
        {output.sections && output.sections.length > 0 && (
          <Card title="Sections">
            {output.sections.map((s, i) => (
              <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #eee', paddingTop: i === 0 ? 0 : 14, marginTop: i === 0 ? 0 : 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <input
                    value={s.title}
                    disabled={!canEdit}
                    onChange={e => setSection(i, { title: e.target.value })}
                    style={{ ...inputStyle, fontSize: 14, fontWeight: 600, border: 'none', padding: '2px 0', background: 'transparent', flex: 1 }}
                  />
                  {s.word_limit && (
                    <span style={{ fontSize: 11, color: countWords(s.content) > s.word_limit ? '#a02020' : '#666' }}>
                      {countWords(s.content)} / {s.word_limit} words
                    </span>
                  )}
                </div>
                <Textarea value={s.content} onChange={v => setSection(i, { content: v })} disabled={!canEdit} rows={6} />
                {s.editor_notes && (
                  <p style={{ fontSize: 12, color: '#8a5400', background: '#fff8e6', padding: 6, borderRadius: 4, marginTop: 6 }}>
                    📝 {s.editor_notes}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* Budget scaffold */}
        {output.budget_scaffold && Array.isArray(output.budget_scaffold.lines) && (
          <Card title="Budget scaffold">
            <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
              {output.budget_scaffold.total_request_usd
                ? <>Total request: <strong>${output.budget_scaffold.total_request_usd.toLocaleString()}</strong></>
                : null}
              {output.budget_scaffold.duration_months
                ? <> · {output.budget_scaffold.duration_months} months</>
                : null}
            </div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666' }}>
                  <th style={thStyle}>Category</th>
                  <th style={{ ...thStyle, width: 110 }}>Amount (USD)</th>
                  <th style={thStyle}>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {output.budget_scaffold.lines.map((line, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>
                      <input value={line.category} disabled={!canEdit} onChange={e => setBudgetLine(i, { category: e.target.value })} style={{ ...inputStyle, padding: '3px 6px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" value={line.amount_usd} disabled={!canEdit}
                             onChange={e => setBudgetLine(i, { amount_usd: Number(e.target.value) })}
                             style={{ ...inputStyle, padding: '3px 6px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input value={line.rationale} disabled={!canEdit} onChange={e => setBudgetLine(i, { rationale: e.target.value })} style={{ ...inputStyle, padding: '3px 6px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {output.budget_scaffold.co_funding_notes && (
              <p style={{ fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' }}>{output.budget_scaffold.co_funding_notes}</p>
            )}
          </Card>
        )}

        {/* Outstanding questions */}
        {output.outstanding_questions && output.outstanding_questions.length > 0 && (
          <Card title="Outstanding questions for the editor">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5a4400' }}>
              {output.outstanding_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </Card>
        )}

        {/* Editor notes + status + save */}
        <Card title="Editor notes & status">
          <Textarea value={notes} onChange={setNotes} disabled={!canEdit} rows={3} placeholder="Internal notes — not part of the brief." />
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#555' }}>
                Status:&nbsp;
                <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button onClick={save} disabled={busy} style={primaryBtnStyle}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button onClick={deleteBrief} style={dangerBtnStyle}>Delete</button>
              {savedAt && <span style={{ fontSize: 12, color: '#1a5d1a' }}>Saved at {savedAt}</span>}
              {err && <span style={{ fontSize: 12, color: '#b00' }}>{err}</span>}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function ConceptField(label: string, value: string | undefined, onChange: (v: string) => void, canEdit: boolean, rows: number = 3) {
  if (value === undefined) return null;
  return (
    <Card title={label}>
      <Textarea value={value} onChange={onChange} disabled={!canEdit} rows={rows} />
    </Card>
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

function Textarea({ value, onChange, disabled, rows = 4, placeholder }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value || ''}
      disabled={disabled}
      placeholder={placeholder}
      rows={rows}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
        border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
        background: disabled ? '#fafafa' : 'white',
        resize: 'vertical',
      }}
    />
  );
}

function ListEditor({ label, items, onChange, disabled }: { label: string; items: string[]; onChange: (items: string[]) => void; disabled?: boolean }) {
  return (
    <div style={{ marginTop: label ? 8 : 0 }}>
      {label && <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>{label}</div>}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input value={it} disabled={disabled} onChange={e => {
            const next = [...items]; next[i] = e.target.value; onChange(next);
          }} style={inputStyle} />
          {!disabled && (
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} style={miniBtnStyle}>×</button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={() => onChange([...items, ''])} style={{ ...miniBtnStyle, marginTop: 2 }}>+ add</button>
      )}
    </div>
  );
}

function ErrorPanel({ msg }: { msg: string }) {
  return (
    <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
      <strong>Error:</strong> {msg}
    </p>
  );
}

function countWords(s: string | undefined) {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'white', color: '#a02020', border: '1px solid #f5a4a4',
  padding: '6px 12px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};

const miniBtnStyle: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '3px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  fontWeight: 500, fontSize: 12, padding: '4px 6px', borderBottom: '1px solid #eee',
};
const tdStyle: React.CSSProperties = {
  padding: '4px 6px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'top',
};
