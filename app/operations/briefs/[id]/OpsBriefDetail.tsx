// OpsBriefDetail — render the kind-specific structured output as readable
// sections. Shows the raw JSON inside a collapsed "raw" panel for the
// editor to copy / verify if they need to.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';
import GlobalNav from '@/app/components/GlobalNav';

type Brief = {
  id: string; title: string;
  kind: 'weekly_planning' | 'freelancer_check_in' | 'contributor_triage' | 'finance_summary' | 'performance_review';
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
  weekly_planning: 'Weekly planning',
  freelancer_check_in: 'Freelancer check-in',
  contributor_triage: 'Contributor triage',
  finance_summary: 'Finance summary',
  performance_review: 'Performance review',
};

const STATUSES = ['generated', 'edited', 'shared', 'failed'];

export default function OpsBriefDetail({ brief, canEdit }: { brief: Brief; canEdit: boolean }) {
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
      const res = await fetch(`/api/operations/briefs/${brief.id}`, {
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
    const res = await fetch(`/api/operations/briefs/${brief.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Failed to delete'); return; }
    router.push('/operations');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <GlobalNav currentApp="🛠 Operations Manager" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{brief.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {KIND_LABELS[brief.kind]} · status: <strong>{brief.status}</strong>
          {brief.duration_ms && <> · generated in {(brief.duration_ms / 1000).toFixed(1)}s</>}
          {brief.cost_usd && <> · ${Number(brief.cost_usd).toFixed(4)}</>}
        </p>

        {brief.error && (
          <ErrorPanel msg={brief.error} />
        )}

        {brief.brief_input && (
          <Card title="Editor's framing">
            <p style={{ fontSize: 13, color: '#444', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{brief.brief_input}</p>
          </Card>
        )}

        {/* Headline */}
        {typeof view.headline === 'string' && (
          <Card title="Headline">
            <p style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>{view.headline}</p>
          </Card>
        )}

        {brief.kind === 'weekly_planning' && <WeeklyView v={view} />}
        {brief.kind === 'freelancer_check_in' && <FreelancerView v={view} />}
        {brief.kind === 'contributor_triage' && <ContributorView v={view} />}
        {brief.kind === 'finance_summary' && <FinanceView v={view} />}
        {brief.kind === 'performance_review' && <PerformanceView v={view} />}

        {/* Outstanding questions — every kind has them */}
        {Array.isArray(view.outstanding_questions) && view.outstanding_questions.length > 0 && (
          <Card title="Outstanding questions for the editor">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5a4400' }}>
              {(view.outstanding_questions as string[]).map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </Card>
        )}

        {/* Editor controls */}
        {canEdit && (
          <Card title="Editor notes & status">
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes — not part of the brief." style={textarea} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#555' }}>
                Status:&nbsp;
                <select value={status} onChange={e => setStatus(e.target.value)} style={select}>
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

        <button onClick={() => setShowRaw(s => !s)} style={{ ...miniBtn, marginTop: 12 }}>
          {showRaw ? 'Hide' : 'Show'} raw JSON
        </button>
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

function WeeklyView({ v }: { v: Record<string, unknown> }) {
  const inProd = (v.in_production_now as Array<{ title: string; owner: string; deadline: string | null; status_note: string }>) || [];
  const shipping = (v.shipping_this_week as Array<{ title: string; publish_date: string; format: string; owner: string }>) || [];
  const atRisk = (v.at_risk as Array<{ title: string; concern: string; action: string }>) || [];
  const ideas = (v.ideas_to_progress as Array<{ title: string; next_step: string }>) || [];
  return (
    <>
      {inProd.length > 0 && (
        <Card title="In production now">
          <ItemList items={inProd.map(i => ({ primary: i.title, secondary: `${i.owner || 'unassigned'}${i.deadline ? ` · deadline ${i.deadline}` : ''}`, tertiary: i.status_note }))} />
        </Card>
      )}
      {shipping.length > 0 && (
        <Card title="Shipping this week">
          <ItemList items={shipping.map(s => ({ primary: s.title, secondary: `${s.format || ''} · publish ${s.publish_date}`, tertiary: s.owner ? `owner: ${s.owner}` : '' }))} />
        </Card>
      )}
      {atRisk.length > 0 && (
        <Card title="At risk">
          <ItemList items={atRisk.map(a => ({ primary: a.title, secondary: a.concern, tertiary: `→ ${a.action}` }))} accent="#a02020" />
        </Card>
      )}
      {ideas.length > 0 && (
        <Card title="Ideas to progress">
          <ItemList items={ideas.map(i => ({ primary: i.title, secondary: i.next_step }))} />
        </Card>
      )}
    </>
  );
}

function FreelancerView({ v }: { v: Record<string, unknown> }) {
  const payables = (v.outstanding_payments as Array<{ name: string; currency: string; amount_pending: number; action: string }>) || [];
  const idle = (v.idle_freelancers as Array<{ name: string; beats: string[]; suggestion: string }>) || [];
  const recent = (v.new_or_recent_commissions as Array<{ name: string; title: string; deadline: string | null }>) || [];
  return (
    <>
      {payables.length > 0 && (
        <Card title="Outstanding payments">
          <ItemList items={payables.map(p => ({ primary: p.name, secondary: `${p.amount_pending} ${p.currency} pending`, tertiary: `→ ${p.action}` }))} accent="#a02020" />
        </Card>
      )}
      {idle.length > 0 && (
        <Card title="Idle freelancers (with suggestions)">
          <ItemList items={idle.map(f => ({ primary: f.name, secondary: Array.isArray(f.beats) ? f.beats.join(', ') : '', tertiary: f.suggestion }))} />
        </Card>
      )}
      {recent.length > 0 && (
        <Card title="New / recent commissions">
          <ItemList items={recent.map(r => ({ primary: r.name, secondary: r.title, tertiary: r.deadline ? `deadline ${r.deadline}` : '' }))} />
        </Card>
      )}
      {typeof v.overall_health === 'string' && (
        <Card title="Overall health">
          <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.5 }}>{v.overall_health}</p>
        </Card>
      )}
    </>
  );
}

function ContributorView({ v }: { v: Record<string, unknown> }) {
  const toVet = (v.to_vet_this_week as Array<{ name: string; contact_kind: string; submissions: number; trust_score_pct: number | null; recommended_action: string; reason: string }>) || [];
  const promotable = (v.promotable as Array<{ name: string; evidence: string; suggestion: string }>) || [];
  const concerns = (v.moderation_concerns as Array<{ name: string; concern: string; action: string }>) || [];
  const audit = (v.attribution_audit as Array<{ name: string; issue: string; fix: string }>) || [];
  return (
    <>
      {toVet.length > 0 && (
        <Card title="To vet this week">
          <ItemList items={toVet.map(c => ({ primary: c.name, secondary: `${c.contact_kind} · ${c.submissions} submissions${typeof c.trust_score_pct === 'number' ? ` · trust ${c.trust_score_pct}%` : ''}`, tertiary: `→ ${c.recommended_action}: ${c.reason}` }))} />
        </Card>
      )}
      {promotable.length > 0 && (
        <Card title="Promotable">
          <ItemList items={promotable.map(c => ({ primary: c.name, secondary: c.evidence, tertiary: `→ ${c.suggestion}` }))} accent="#1a5d1a" />
        </Card>
      )}
      {concerns.length > 0 && (
        <Card title="Moderation concerns">
          <ItemList items={concerns.map(c => ({ primary: c.name, secondary: c.concern, tertiary: `→ ${c.action}` }))} accent="#a02020" />
        </Card>
      )}
      {audit.length > 0 && (
        <Card title="Attribution audit">
          <ItemList items={audit.map(a => ({ primary: a.name, secondary: a.issue, tertiary: `→ ${a.fix}` }))} />
        </Card>
      )}
    </>
  );
}

function FinanceView({ v }: { v: Record<string, unknown> }) {
  const income = (v.income_observed as Array<{ category: string; currency: string; paid: number; pending: number; note: string }>) || [];
  const expense = (v.expense_observed as Array<{ category: string; currency: string; paid: number; pending: number; note: string }>) || [];
  const payables = (v.freelancer_payables as Array<{ name: string; currency: string; pending: number }>) || [];
  const concerns = (v.concerns as string[]) || [];
  const opps = (v.opportunities as string[]) || [];
  return (
    <>
      {income.length > 0 && (
        <Card title="Income observed">
          <ItemList items={income.map(r => ({ primary: r.category, secondary: `paid ${r.paid} ${r.currency} · pending ${r.pending} ${r.currency}`, tertiary: r.note }))} accent="#1a5d1a" />
        </Card>
      )}
      {expense.length > 0 && (
        <Card title="Expense observed">
          <ItemList items={expense.map(r => ({ primary: r.category, secondary: `paid ${r.paid} ${r.currency} · pending ${r.pending} ${r.currency}`, tertiary: r.note }))} accent="#a02020" />
        </Card>
      )}
      {payables.length > 0 && (
        <Card title="Freelancer payables">
          <ItemList items={payables.map(p => ({ primary: p.name, secondary: `${p.pending} ${p.currency} pending` }))} accent="#a02020" />
        </Card>
      )}
      {concerns.length > 0 && <Card title="Concerns"><BulletList items={concerns} /></Card>}
      {opps.length > 0 && <Card title="Opportunities"><BulletList items={opps} /></Card>}
    </>
  );
}

function PerformanceView({ v }: { v: Record<string, unknown> }) {
  const movements = (v.movements as Array<{ metric: string; from: string; to: string; change: string; interpretation: string }>) || [];
  const wins = (v.wins as string[]) || [];
  const concerns = (v.concerns as string[]) || [];
  const tests = (v.what_to_test_next as string[]) || [];
  return (
    <>
      {movements.length > 0 && (
        <Card title="Movements">
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#666' }}><th style={th}>Metric</th><th style={th}>From → To</th><th style={th}>Change</th><th style={th}>What it means</th></tr></thead>
            <tbody>
              {movements.map((m, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={td}><code>{m.metric}</code></td>
                  <td style={td}>{m.from} → {m.to}</td>
                  <td style={td}>{m.change}</td>
                  <td style={td}>{m.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {wins.length > 0 && <Card title="Wins"><BulletList items={wins} accent="#1a5d1a" /></Card>}
      {concerns.length > 0 && <Card title="Concerns"><BulletList items={concerns} accent="#a02020" /></Card>}
      {tests.length > 0 && <Card title="What to test next"><BulletList items={tests} /></Card>}
    </>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginTop: 14 }}>
      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </section>
  );
}

function ItemList({ items, accent }: { items: Array<{ primary: string; secondary?: string; tertiary?: string }>; accent?: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((it, i) => (
        <li key={i} style={{ padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: accent || 'inherit' }}>{it.primary}</div>
          {it.secondary && <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{it.secondary}</div>}
          {it.tertiary && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{it.tertiary}</div>}
        </li>
      ))}
    </ul>
  );
}

function BulletList({ items, accent }: { items: string[]; accent?: string }) {
  return (
    <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5, color: accent || '#444' }}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function ErrorPanel({ msg }: { msg: string }) {
  return (
    <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
      <strong>Error:</strong> {msg}
    </p>
  );
}

const textarea: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical',
};
const select: React.CSSProperties = {
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
const th: React.CSSProperties = { fontWeight: 500, fontSize: 12, padding: '4px 6px', borderBottom: '1px solid #eee' };
const td: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'top', fontSize: 13 };
