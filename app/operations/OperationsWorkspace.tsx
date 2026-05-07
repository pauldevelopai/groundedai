// OperationsWorkspace — single-screen ops dashboard with six regions.
// Same design language as /audience and /fundraiser.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type CalItem = {
  id: string; title: string; summary: string | null; beat: string | null; format: string | null;
  priority: string; status: string;
  assigned_user_id: string | null; assigned_user_name: string | null;
  assigned_freelancer_id: string | null; assigned_freelancer_name: string | null;
  assigned_contributor_id: string | null; assigned_contributor_name: string | null;
  deadline_at: string | null; scheduled_publish_at: string | null;
  notes: string | null; created_at: string; updated_at: string;
};
type Freelancer = {
  id: string; name: string; preferred_currency: string;
  pending_cents: number | string; paid_cents: number | string;
  beats?: string[]; status?: string;
};
type Contributor = {
  id: string; name: string; contact: string | null; contact_kind: string | null; location: string | null;
  vetting_status: 'unvetted' | 'in_review' | 'vetted' | 'blocked';
  trust_score: number | null; attribution_name: string | null; payment_kind: string;
  total_paid_cents: number; submissions_count: number; submissions_published: number;
  last_submission_at: string | null; notes: string | null;
};
type FinanceEntry = {
  id: string; occurred_on: string; direction: 'income' | 'expense'; category: string;
  description: string; amount_cents: number; currency: string; status: string;
  freelancer_name: string | null; contributor_name: string | null; calendar_title: string | null;
};
type FinanceTotal = {
  direction: 'income' | 'expense'; category: string; status: string; currency: string; n: number; total_cents: string;
};
type Snapshot = {
  id: string; period_start: string; period_end: string; label: string | null;
  metrics: Record<string, unknown>; notes: string | null; created_at: string;
};
type BriefRow = {
  id: string; title: string;
  kind: 'weekly_planning' | 'freelancer_check_in' | 'contributor_triage' | 'finance_summary' | 'performance_review';
  status: string; duration_ms: number | null; cost_usd: string | number | null; error: string | null;
  created_at: string; updated_at: string;
};

const KIND_LABELS: Record<BriefRow['kind'], string> = {
  weekly_planning: 'Weekly planning',
  freelancer_check_in: 'Freelancer check-in',
  contributor_triage: 'Contributor triage',
  finance_summary: 'Finance summary',
  performance_review: 'Performance review',
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['idea', 'commissioned', 'in_progress', 'in_review', 'scheduled', 'published', 'killed'];

export default function OperationsWorkspace({
  initialItems, initialFreelancers, initialContributors,
  initialFinanceEntries, initialFinanceTotals, initialSnapshots, initialBriefs,
  canEdit, role,
}: {
  initialItems: CalItem[];
  initialFreelancers: Freelancer[];
  initialContributors: Contributor[];
  initialFinanceEntries: FinanceEntry[];
  initialFinanceTotals: FinanceTotal[];
  initialSnapshots: Snapshot[];
  initialBriefs: BriefRow[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [freelancers, setFreelancers] = useState(initialFreelancers);
  const [contributors, setContributors] = useState(initialContributors);
  const [entries, setEntries] = useState(initialFinanceEntries);
  const [totals] = useState(initialFinanceTotals);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [briefs, setBriefs] = useState(initialBriefs);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🛠 Operations</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Producer →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Operations</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          The whole-org operational surface — editorial calendar, freelancer roster, community contributors, light finance, and performance metrics. Operations briefs (top) read these tables directly so you don&apos;t copy-paste anything.
        </p>

        <BriefsSection briefs={briefs} canEdit={canEdit} onChange={setBriefs} onRefresh={() => router.refresh()} />
        <CalendarSection items={items} freelancers={freelancers} contributors={contributors} canEdit={canEdit} onChange={setItems} />
        <PeopleSection
          freelancers={freelancers} contributors={contributors}
          canEdit={canEdit}
          onFreelancersChange={setFreelancers} onContributorsChange={setContributors}
        />
        <FinanceSection entries={entries} totals={totals} freelancers={freelancers} contributors={contributors} items={items} canEdit={canEdit} onChange={setEntries} />
        <MetricsSection snapshots={snapshots} canEdit={canEdit} onChange={setSnapshots} />
      </div>
    </main>
  );
}

// ─── Briefs (agent outputs, top) ───────────────────────────────────────────

function BriefsSection({
  briefs, canEdit, onChange, onRefresh,
}: {
  briefs: BriefRow[];
  canEdit: boolean;
  onChange: (rows: BriefRow[]) => void;
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 20 }}>
      <SectionHeader title="📋 Operations briefs" subtitle="Agent-generated reads of the live tables below — weekly plans, freelancer check-ins, contributor triage, finance summaries, performance reviews.">
        {canEdit && (
          <button onClick={() => setCreating(c => !c)} style={primaryBtn}>{creating ? 'Cancel' : '+ New brief'}</button>
        )}
      </SectionHeader>
      {creating && canEdit && <NewBriefForm onCancel={() => setCreating(false)} onCreated={(row) => { onChange([row, ...briefs]); setCreating(false); onRefresh(); }} />}
      {briefs.length === 0 ? <Empty text="No briefs yet. Click + New brief." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {briefs.map(b => (
            <Link key={b.id} href={`/operations/briefs/${b.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{b.title}</strong>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {KIND_LABELS[b.kind]} · {new Date(b.created_at).toLocaleString()}
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

function NewBriefForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (row: BriefRow) => void }) {
  const [kind, setKind] = useState<BriefRow['kind']>('weekly_planning');
  const [briefInput, setBriefInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/operations/briefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, brief_input: briefInput || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      // Refresh list to get the canonical row shape
      const list = await fetch('/api/operations/briefs').then(r => r.json());
      const newest = (list.briefs || []).find((b: BriefRow) => b.id === data.briefId) || list.briefs?.[0];
      if (newest) onCreated(newest);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Kind">
        <select value={kind} onChange={e => setKind(e.target.value as BriefRow['kind'])} style={inputStyle}>
          <option value="weekly_planning">Weekly planning — calendar + capacity</option>
          <option value="freelancer_check_in">Freelancer check-in — payables + idle</option>
          <option value="contributor_triage">Contributor triage — vet, moderate, promote</option>
          <option value="finance_summary">Finance summary — 90-day runway-style read</option>
          <option value="performance_review">Performance review — recent metric snapshots</option>
        </select>
      </Field>
      <Field label="Editor's framing (optional)">
        <textarea rows={3} value={briefInput} onChange={e => setBriefInput(e.target.value)} placeholder="What to focus on this week, anything to skip, etc." style={{ ...inputStyle, fontFamily: 'inherit' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Generating…' : 'Generate brief'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Calendar ──────────────────────────────────────────────────────────────

function CalendarSection({
  items, freelancers, contributors, canEdit, onChange,
}: {
  items: CalItem[]; freelancers: Freelancer[]; contributors: Contributor[];
  canEdit: boolean; onChange: (rows: CalItem[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🗓 Editorial calendar" subtitle="Story ideas, in-production pieces, and scheduled publishes — assignees and deadlines visible at a glance.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add story'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddCalendarForm
          freelancers={freelancers} contributors={contributors}
          onCancel={() => setAdding(false)}
          onCreated={(item) => { onChange([item, ...items]); setAdding(false); }}
        />
      )}
      {items.length === 0 ? <Empty text="Calendar is empty." /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map(c => (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
                  {c.summary && <p style={{ fontSize: 13, color: '#444', margin: '2px 0 0', lineHeight: 1.4 }}>{c.summary}</p>}
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {c.beat && <Tag>{c.beat}</Tag>}
                    {c.format && <Tag muted>{c.format}</Tag>}
                    <span>priority: <strong>{c.priority}</strong></span>
                    {(c.assigned_user_name || c.assigned_freelancer_name || c.assigned_contributor_name) && (
                      <span>assigned: <strong>{c.assigned_user_name || c.assigned_freelancer_name || c.assigned_contributor_name}</strong></span>
                    )}
                    {c.deadline_at && <span>deadline: <strong>{shortDate(c.deadline_at)}</strong></span>}
                    {c.scheduled_publish_at && <span>publish: <strong>{shortDate(c.scheduled_publish_at)}</strong></span>}
                  </div>
                </div>
                {canEdit ? (
                  <CalendarStatusEditor item={c} onChange={(updated) => onChange(items.map(i => i.id === updated.id ? updated : i))} />
                ) : (
                  <span style={statusBadge(c.status)}>{c.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddCalendarForm({
  freelancers, contributors, onCancel, onCreated,
}: {
  freelancers: Freelancer[]; contributors: Contributor[];
  onCancel: () => void; onCreated: (item: CalItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [beat, setBeat] = useState('');
  const [format, setFormat] = useState('');
  const [priority, setPriority] = useState('normal');
  const [status, setStatus] = useState('idea');
  const [assigneeKind, setAssigneeKind] = useState<'none' | 'freelancer' | 'contributor'>('none');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [publish, setPublish] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {
        title, summary: summary || undefined, beat: beat || undefined, format: format || undefined,
        priority, status,
        deadline_at: deadline ? new Date(deadline).toISOString() : null,
        scheduled_publish_at: publish ? new Date(publish).toISOString() : null,
      };
      if (assigneeKind === 'freelancer' && assigneeId) body.assigned_freelancer_id = assigneeId;
      if (assigneeKind === 'contributor' && assigneeId) body.assigned_contributor_id = assigneeId;
      const res = await fetch('/api/operations/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.item);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Title"><input required value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></Field>
      <Field label="Summary"><textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Beat"><input value={beat} onChange={e => setBeat(e.target.value)} style={inputStyle} /></Field>
        <Field label="Format">
          <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            <option value="article">Article</option>
            <option value="radio">Radio</option>
            <option value="podcast">Podcast</option>
            <option value="video">Video</option>
            <option value="newsletter">Newsletter</option>
          </select>
        </Field>
        <Field label="Priority"><select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 6 }}>
        <Field label="Assign to">
          <select value={assigneeKind} onChange={e => { setAssigneeKind(e.target.value as 'none' | 'freelancer' | 'contributor'); setAssigneeId(''); }} style={inputStyle}>
            <option value="none">— unassigned —</option>
            <option value="freelancer">Freelancer</option>
            <option value="contributor">Community contributor</option>
          </select>
        </Field>
        {assigneeKind !== 'none' && (
          <Field label="Person">
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {(assigneeKind === 'freelancer' ? freelancers : contributors).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Deadline"><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} /></Field>
        <Field label="Scheduled publish"><input type="datetime-local" value={publish} onChange={e => setPublish(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !title.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add story'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

function CalendarStatusEditor({ item, onChange }: { item: CalItem; onChange: (i: CalItem) => void }) {
  const [busy, setBusy] = useState(false);
  async function update(status: string) {
    setBusy(true);
    const res = await fetch(`/api/operations/calendar/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { alert(data.error || 'Update failed'); return; }
    onChange({ ...item, ...data.item, assigned_user_name: item.assigned_user_name, assigned_freelancer_name: item.assigned_freelancer_name, assigned_contributor_name: item.assigned_contributor_name });
  }
  return (
    <select value={item.status} onChange={e => update(e.target.value)} disabled={busy} style={{ ...statusBadge(item.status), padding: '2px 8px', fontSize: 11, border: 'none' }}>
      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// ─── People (Freelancers + Contributors side by side) ──────────────────────

function PeopleSection({
  freelancers, contributors, canEdit, onFreelancersChange, onContributorsChange,
}: {
  freelancers: Freelancer[]; contributors: Contributor[];
  canEdit: boolean;
  onFreelancersChange: (rows: Freelancer[]) => void;
  onContributorsChange: (rows: Contributor[]) => void;
}) {
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="👥 People" subtitle="Freelancers (paid) and community contributors (vetting + moderation)." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FreelancersPanel rows={freelancers} canEdit={canEdit} onChange={onFreelancersChange} />
        <ContributorsPanel rows={contributors} canEdit={canEdit} onChange={onContributorsChange} />
      </div>
    </section>
  );
}

function FreelancersPanel({ rows, canEdit, onChange }: { rows: Freelancer[]; canEdit: boolean; onChange: (rows: Freelancer[]) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 13, margin: 0 }}>💼 Freelancers</h3>
        {canEdit && <button onClick={() => setAdding(a => !a)} style={miniBtn}>{adding ? 'Cancel' : '+ Add'}</button>}
      </div>
      {adding && canEdit && (
        <AddFreelancerForm onCancel={() => setAdding(false)} onCreated={(f) => { onChange([f, ...rows]); setAdding(false); }} />
      )}
      {rows.length === 0 ? <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0' }}>No freelancers on roster.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
          {rows.map(f => (
            <li key={f.id} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{f.name}</strong>
                <span style={{ color: Number(f.pending_cents) > 0 ? '#a02020' : '#666' }}>
                  {Number(f.pending_cents) > 0 && <>pending {(Number(f.pending_cents) / 100).toFixed(2)} {f.preferred_currency} · </>}
                  paid {(Number(f.paid_cents) / 100).toFixed(2)} {f.preferred_currency}
                </span>
              </div>
              {Array.isArray(f.beats) && f.beats.length > 0 && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{f.beats.join(', ')}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddFreelancerForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (f: Freelancer) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [beats, setBeats] = useState('');
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/operations/freelancers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email: email || undefined,
          beats: beats.split(',').map(s => s.trim()).filter(Boolean),
          rate_per_piece_cents: rate ? Math.round(parseFloat(rate) * 100) : undefined,
          preferred_currency: currency || 'USD',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Re-load to get payables-shape row
      const lr = await fetch('/api/operations/freelancers?with_payables=1').then(r => r.json());
      onCreated((lr.freelancers || []).find((f: Freelancer) => f.id === data.freelancer.id) || data.freelancer);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 8 }}>
      <Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
      <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Field>
      <Field label="Beats (comma-separated)"><input value={beats} onChange={e => setBeats(e.target.value)} style={inputStyle} placeholder="investigations, climate" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Field label="Piece rate"><input type="number" min={0} step="0.01" value={rate} onChange={e => setRate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Currency"><input value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle} maxLength={5} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

function ContributorsPanel({ rows, canEdit, onChange }: { rows: Contributor[]; canEdit: boolean; onChange: (rows: Contributor[]) => void }) {
  const [adding, setAdding] = useState(false);
  async function setVetting(id: string, vetting_status: Contributor['vetting_status']) {
    const res = await fetch(`/api/operations/contributors/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vetting_status }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Update failed'); return; }
    onChange(rows.map(r => r.id === id ? { ...r, ...data.contributor } : r));
  }
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 13, margin: 0 }}>🌐 Community contributors</h3>
        {canEdit && <button onClick={() => setAdding(a => !a)} style={miniBtn}>{adding ? 'Cancel' : '+ Add'}</button>}
      </div>
      {adding && canEdit && (
        <AddContributorForm onCancel={() => setAdding(false)} onCreated={(c) => { onChange([c, ...rows]); setAdding(false); }} />
      )}
      {rows.length === 0 ? <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0' }}>No contributors yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
          {rows.slice(0, 20).map(c => (
            <li key={c.id} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{c.name}</strong>
                  {c.contact_kind && <span style={{ color: '#666', marginLeft: 6 }}>· {c.contact_kind}</span>}
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    {c.submissions_count} submissions · {c.submissions_published} published
                    {c.trust_score !== null && c.trust_score !== undefined && <> · trust {Math.round(parseFloat(String(c.trust_score)) * 100)}%</>}
                  </div>
                </div>
                {canEdit ? (
                  <select value={c.vetting_status} onChange={e => setVetting(c.id, e.target.value as Contributor['vetting_status'])} style={{ ...vettingBadge(c.vetting_status), padding: '2px 8px', fontSize: 11, border: 'none' }}>
                    <option value="unvetted">unvetted</option>
                    <option value="in_review">in_review</option>
                    <option value="vetted">vetted</option>
                    <option value="blocked">blocked</option>
                  </select>
                ) : (
                  <span style={vettingBadge(c.vetting_status)}>{c.vetting_status}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddContributorForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: Contributor) => void }) {
  const [name, setName] = useState('');
  const [contactKind, setContactKind] = useState('whatsapp');
  const [contact, setContact] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/operations/contributors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact: contact || undefined, contact_kind: contactKind, location: location || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.contributor);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 8 }}>
      <Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Field label="Contact via">
          <select value={contactKind} onChange={e => setContactKind(e.target.value)} style={inputStyle}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="twitter">Twitter</option>
            <option value="fb">Facebook</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Contact"><input value={contact} onChange={e => setContact(e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Location"><input value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Finance ───────────────────────────────────────────────────────────────

function FinanceSection({
  entries, totals, freelancers, contributors, items, canEdit, onChange,
}: {
  entries: FinanceEntry[]; totals: FinanceTotal[];
  freelancers: Freelancer[]; contributors: Contributor[]; items: CalItem[];
  canEdit: boolean; onChange: (rows: FinanceEntry[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="💰 Finance (light ledger)" subtitle="90-day income / expense view. Freelancer payouts that show up as 'pending' here flow into freelancer_check_in briefs.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add entry'}</button>}
      </SectionHeader>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
        <FinanceSummaryCard label="Income (last 90 days)" totals={totals.filter(t => t.direction === 'income')} />
        <FinanceSummaryCard label="Expense (last 90 days)" totals={totals.filter(t => t.direction === 'expense')} />
      </div>

      {adding && canEdit && (
        <AddFinanceForm
          freelancers={freelancers} contributors={contributors} items={items}
          onCancel={() => setAdding(false)}
          onCreated={(e) => { onChange([e, ...entries]); setAdding(false); }}
        />
      )}

      {entries.length === 0 ? <Empty text="No entries yet." /> : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#fafbfc', textAlign: 'left' }}>
            <tr>
              <th style={th}>Date</th><th style={th}>Direction</th><th style={th}>Category</th>
              <th style={th}>Description</th><th style={th}>Amount</th><th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={td}>{shortDate(e.occurred_on)}</td>
                <td style={td}>{e.direction === 'income' ? '↘ in' : '↗ out'}</td>
                <td style={td}>{e.category}</td>
                <td style={td}>
                  {e.description}
                  {e.freelancer_name && <span style={{ color: '#666' }}> · {e.freelancer_name}</span>}
                  {e.contributor_name && <span style={{ color: '#666' }}> · {e.contributor_name}</span>}
                  {e.calendar_title && <span style={{ color: '#666' }}> · {e.calendar_title}</span>}
                </td>
                <td style={td}>{(e.amount_cents / 100).toFixed(2)} {e.currency}</td>
                <td style={td}>
                  {canEdit ? (
                    <FinanceStatusEditor entry={e} onChange={(updated) => onChange(entries.map(x => x.id === updated.id ? { ...x, ...updated } : x))} />
                  ) : (
                    <span style={statusBadge(e.status)}>{e.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FinanceSummaryCard({ label, totals }: { label: string; totals: FinanceTotal[] }) {
  const byCurrency = new Map<string, { paid: number; pending: number }>();
  for (const t of totals) {
    const cur = byCurrency.get(t.currency) || { paid: 0, pending: 0 };
    if (t.status === 'paid') cur.paid += Number(t.total_cents);
    else if (t.status === 'pending') cur.pending += Number(t.total_cents);
    else cur.paid += Number(t.total_cents);
    byCurrency.set(t.currency, cur);
  }
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      {byCurrency.size === 0 ? (
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>(none)</div>
      ) : (
        [...byCurrency.entries()].map(([currency, b]) => (
          <div key={currency} style={{ marginTop: 4, fontSize: 14 }}>
            <strong>{(b.paid / 100).toFixed(2)} {currency}</strong>
            {b.pending > 0 && <span style={{ color: '#8a5400', marginLeft: 8 }}>+ {(b.pending / 100).toFixed(2)} pending</span>}
          </div>
        ))
      )}
    </div>
  );
}

function AddFinanceForm({
  freelancers, contributors, items, onCancel, onCreated,
}: {
  freelancers: Freelancer[]; contributors: Contributor[]; items: CalItem[];
  onCancel: () => void; onCreated: (e: FinanceEntry) => void;
}) {
  const [direction, setDirection] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('freelancer_payout');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState('pending');
  const [freelancerId, setFreelancerId] = useState('');
  const [contributorId, setContributorId] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/operations/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction, category: category.trim(), description, currency,
          amount_cents: Math.round(parseFloat(amount) * 100),
          status,
          freelancer_id: freelancerId || undefined,
          contributor_id: contributorId || undefined,
          calendar_id: calendarId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.entry);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
        <Field label="Direction"><select value={direction} onChange={e => setDirection(e.target.value as 'income' | 'expense')} style={inputStyle}><option value="expense">expense</option><option value="income">income</option></select></Field>
        <Field label="Category"><input value={category} onChange={e => setCategory(e.target.value)} style={inputStyle} placeholder="freelancer_payout / grant / sponsor / rent" /></Field>
        <Field label="Description"><input required value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Amount"><input required type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></Field>
        <Field label="Currency"><input value={currency} onChange={e => setCurrency(e.target.value)} maxLength={5} style={inputStyle} /></Field>
        <Field label="Status">
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            <option value="recorded">recorded</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="reconciled">reconciled</option>
            <option value="cancelled">cancelled</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
        <Field label="Freelancer (optional)">
          <select value={freelancerId} onChange={e => setFreelancerId(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {freelancers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Contributor (optional)">
          <select value={contributorId} onChange={e => setContributorId(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {contributors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Story (optional)">
          <select value={calendarId} onChange={e => setCalendarId(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="submit" disabled={busy || !description.trim() || !amount} style={primaryBtn}>{busy ? 'Saving…' : 'Add entry'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

function FinanceStatusEditor({ entry, onChange }: { entry: FinanceEntry; onChange: (e: FinanceEntry) => void }) {
  const [busy, setBusy] = useState(false);
  async function update(status: string) {
    setBusy(true);
    const res = await fetch(`/api/operations/finance/${entry.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { alert(data.error || 'Update failed'); return; }
    onChange({ ...entry, ...data.entry });
  }
  return (
    <select value={entry.status} onChange={e => update(e.target.value)} disabled={busy} style={{ ...statusBadge(entry.status), padding: '2px 8px', fontSize: 11, border: 'none' }}>
      <option value="recorded">recorded</option>
      <option value="pending">pending</option>
      <option value="paid">paid</option>
      <option value="reconciled">reconciled</option>
      <option value="cancelled">cancelled</option>
    </select>
  );
}

// ─── Metrics ───────────────────────────────────────────────────────────────

function MetricsSection({
  snapshots, canEdit, onChange,
}: {
  snapshots: Snapshot[]; canEdit: boolean; onChange: (rows: Snapshot[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="📈 Metric snapshots" subtitle="Periodic snapshots of org-level performance — stories published, reach, subscribers, revenue. Free-form: record what you actually care about.">
        {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add snapshot'}</button>}
      </SectionHeader>
      {adding && canEdit && (
        <AddSnapshotForm onCancel={() => setAdding(false)} onCreated={(s) => { onChange([s, ...snapshots]); setAdding(false); }} />
      )}
      {snapshots.length === 0 ? <Empty text="No snapshots yet." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {snapshots.map(s => (
            <div key={s.id} style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label || `${shortDate(s.period_start)} → ${shortDate(s.period_end)}`}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{shortDate(s.period_start)} → {shortDate(s.period_end)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, marginTop: 8 }}>
                {Object.entries(s.metrics || {}).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, padding: 6, background: '#fafbfc', borderRadius: 4 }}>
                    <div style={{ color: '#666' }}>{k}</div>
                    <div style={{ fontWeight: 600 }}>{formatMetric(k, v)}</div>
                  </div>
                ))}
              </div>
              {s.notes && <p style={{ fontSize: 12, color: '#444', margin: '6px 0 0' }}>{s.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddSnapshotForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Snapshot) => void }) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [label, setLabel] = useState('');
  const [json, setJson] = useState('{\n  "stories_published": 0,\n  "total_reach": 0,\n  "subscribers": 0,\n  "revenue_cents": 0\n}');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const metrics = JSON.parse(json);
      const res = await fetch('/api/operations/metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, label: label || undefined, metrics, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.snapshot);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
        <Field label="Period start"><input required type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={inputStyle} /></Field>
        <Field label="Period end"><input required type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={inputStyle} /></Field>
        <Field label="Label (optional)"><input value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} placeholder="Week 19 / Q2 2026" /></Field>
      </div>
      <Field label="Metrics (JSON object)">
        <textarea rows={6} value={json} onChange={e => setJson(e.target.value)} style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </Field>
      <Field label="Notes"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Add snapshot'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

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
function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: muted ? '#eef0f3' : '#e6f0ff', color: muted ? '#555' : '#0044aa' }}>{children}</span>;
}
function shortDate(d: string | Date | null | undefined) {
  if (!d) return '';
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10);
  } catch { return String(d); }
}
function formatMetric(k: string, v: unknown) {
  if (typeof v !== 'number') return String(v);
  if (k.endsWith('_cents')) return (v / 100).toFixed(2);
  if (k.endsWith('_pct') || k.endsWith('_percent')) return `${v.toFixed(1)}%`;
  return v.toLocaleString();
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
  padding: '3px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};
const th: React.CSSProperties = { fontWeight: 500, fontSize: 12, padding: '8px 10px', color: '#666' };
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top', fontSize: 13 };

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fff8e6', fg: '#8a5400' },
    recorded: { bg: '#eef0f3', fg: '#555' },
    paid: { bg: '#e7f6e7', fg: '#1a5d1a' },
    reconciled: { bg: '#dbf3f3', fg: '#0a6363' },
    cancelled: { bg: '#eee', fg: '#777' },
    generated: { bg: '#e0f0ff', fg: '#0044aa' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    shared: { bg: '#dbf3f3', fg: '#0a6363' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
    idea: { bg: '#eef0f3', fg: '#555' },
    commissioned: { bg: '#e0f0ff', fg: '#0044aa' },
    in_progress: { bg: '#fff8e6', fg: '#8a5400' },
    in_review: { bg: '#e8e3ff', fg: '#5a3a99' },
    scheduled: { bg: '#dbf3f3', fg: '#0a6363' },
    published: { bg: '#e7f6e7', fg: '#1a5d1a' },
    killed: { bg: '#eee', fg: '#777' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
function vettingBadge(v: Contributor['vetting_status']): React.CSSProperties {
  const map = {
    unvetted: { bg: '#eef0f3', fg: '#555' },
    in_review: { bg: '#fff8e6', fg: '#8a5400' },
    vetted: { bg: '#e7f6e7', fg: '#1a5d1a' },
    blocked: { bg: '#ffe6e6', fg: '#a02020' },
  };
  const c = map[v];
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
