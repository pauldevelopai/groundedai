// FundraiserWorkspace — three-region UI: funders, briefs, cohort matches.
// Same design language as /audience and /research.

'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Funder = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  focus_areas: string[];
  geography: string[];
  typical_grant_range: string | null;
  application_url: string | null;
  application_structure: Array<{ section: string; word_limit?: number; prompt?: string }>;
  deadlines: Array<{ label: string; date: string }>;
  notes: string | null;
  source: string;
  is_default: boolean;
};

type BriefRow = {
  id: string;
  title: string;
  kind: 'grant_application' | 'donor_report' | 'concept_note' | 'loi';
  status: string;
  funder_id: string | null;
  funder_name: string | null;
  budget_request_usd: number | null;
  duration_months: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  funder_id: string | null;
  funder_name: string;
  partner_newsroom_id: string;
  partner_newsroom_name: string | null;
  rationale: string;
  match_score: number;
  shared_strengths: string[];
  shared_geography: string[];
  status: 'proposed' | 'accepted' | 'declined' | 'expired';
  responded_at: string | null;
  created_at: string;
};

const KIND_LABELS: Record<BriefRow['kind'], string> = {
  grant_application: 'Grant application',
  donor_report: 'Donor report',
  concept_note: 'Concept note',
  loi: 'Letter of inquiry',
};

export default function FundraiserWorkspace({
  initialFunders,
  initialBriefs,
  initialMatches,
  hasProfile,
  canEdit,
  role,
}: {
  initialFunders: Funder[];
  initialBriefs: BriefRow[];
  initialMatches: MatchRow[];
  hasProfile: boolean;
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [funders, setFunders] = useState(initialFunders);
  const [briefs, setBriefs] = useState(initialBriefs);
  const [matches, setMatches] = useState(initialMatches);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Grounded</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>💰 Fundraiser</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>

        <Link href="/archive" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Archivist →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audio & Video Producer →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience Analytics Manager →</Link>
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
        <h1 style={{ margin: 0, fontSize: 24 }}>Fundraiser</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Drafts grant applications, donor reports, concept notes, and LOIs. The funder library is seeded with major media-development donors active in Africa — edit these to match your real programme history. Brief drafts are shaped to each funder&apos;s published application structure with word limits respected per section.
        </p>

        {!hasProfile && (
          <div style={{ marginTop: 14, padding: 12, background: '#fff8e6', border: '1px solid #f0d068', borderRadius: 8, fontSize: 13, color: '#5a4400' }}>
            Your newsroom profile is empty. Drafts will be thin until you fill it in.{' '}
            <Link href="/newsroom" style={{ color: '#0066cc' }}>Set up your profile →</Link>
          </div>
        )}

        <BriefsSection briefs={briefs} funders={funders} canEdit={canEdit} onChange={setBriefs} onRefresh={() => router.refresh()} />
        <FundersSection funders={funders} canEdit={canEdit} onChange={setFunders} onMatchesChange={setMatches} matches={matches} />
        <CohortSection matches={matches} canEdit={canEdit} onChange={setMatches} />
      </div>
    </main>
  );
}

// ─── Briefs ────────────────────────────────────────────────────────────────

function BriefsSection({
  briefs, funders, canEdit, onChange, onRefresh,
}: {
  briefs: BriefRow[];
  funders: Funder[];
  canEdit: boolean;
  onChange: (rows: BriefRow[]) => void;
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 24 }}>
      <SectionHeader title="📝 Briefs" subtitle="Drafts of grant applications, donor reports, concept notes, and LOIs.">
        {canEdit && (
          <button onClick={() => setCreating(v => !v)} style={primaryBtnStyle}>
            {creating ? 'Cancel' : '+ New brief'}
          </button>
        )}
      </SectionHeader>

      {creating && canEdit && (
        <NewBriefForm
          funders={funders}
          onCancel={() => setCreating(false)}
          onCreated={(row) => { onChange([row, ...briefs]); setCreating(false); onRefresh(); }}
        />
      )}

      {briefs.length === 0 ? (
        <Empty text="No briefs yet. Click + New brief to start one." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {briefs.map(b => (
            <Link key={b.id} href={`/fundraiser/briefs/${b.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{b.title}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {KIND_LABELS[b.kind]}
                      {b.funder_name ? ` · ${b.funder_name}` : ''}
                      {b.budget_request_usd ? ` · $${b.budget_request_usd.toLocaleString()} request` : ''}
                      {b.duration_months ? ` · ${b.duration_months} mo` : ''}
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
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

function NewBriefForm({
  funders,
  onCancel,
  onCreated,
}: {
  funders: Funder[];
  onCancel: () => void;
  onCreated: (row: BriefRow) => void;
}) {
  const [kind, setKind] = useState<BriefRow['kind']>('grant_application');
  const [funderId, setFunderId] = useState('');
  const [title, setTitle] = useState('');
  const [briefInput, setBriefInput] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/fundraiser/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          brief_input: briefInput,
          title: title.trim() || undefined,
          funder_id: funderId || undefined,
          budget_request_usd: budget ? Number(budget) : undefined,
          duration_months: duration ? Number(duration) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      // POST returns { briefId, kind, output, ... } but the LIST shape is different.
      // Reload via the GET to get the consistent row shape.
      const listRes = await fetch('/api/fundraiser/briefs');
      const listData = await listRes.json();
      const newest = (listData.briefs || []).find((b: BriefRow) => b.id === data.briefId) || listData.briefs?.[0];
      if (newest) onCreated(newest);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
        <Field label="Kind">
          <select value={kind} onChange={e => setKind(e.target.value as BriefRow['kind'])} style={inputStyle}>
            <option value="grant_application">Grant application</option>
            <option value="donor_report">Donor report</option>
            <option value="concept_note">Concept note</option>
            <option value="loi">Letter of inquiry</option>
          </select>
        </Field>
        <Field label="Funder (optional)">
          <select value={funderId} onChange={e => setFunderId(e.target.value)} style={inputStyle}>
            <option value="">— generic, no funder —</option>
            {funders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Title (optional)">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder='e.g. "Climate accountability series 2026"' style={inputStyle} />
      </Field>
      <Field label="Editor's brief (what is this for?)">
        <textarea
          required
          value={briefInput}
          onChange={e => setBriefInput(e.target.value)}
          rows={5}
          style={{ ...inputStyle, fontFamily: 'inherit' }}
          placeholder="A few sentences on the project, the reporting period, or what you want the funder to support. The agent will expand this using your newsroom profile."
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
        <Field label="Budget request (USD, optional)">
          <input type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)} style={inputStyle} placeholder="e.g. 150000" />
        </Field>
        <Field label="Duration (months, optional)">
          <input type="number" min={1} max={60} value={duration} onChange={e => setDuration(e.target.value)} style={inputStyle} placeholder="e.g. 12" />
        </Field>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy || !briefInput.trim()} style={primaryBtnStyle}>
          {busy ? 'Drafting…' : 'Draft brief'}
        </button>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
      </div>
      {err && <p style={{ color: '#b00', fontSize: 13, marginTop: 8 }}>{err}</p>}
    </form>
  );
}

// ─── Funders ───────────────────────────────────────────────────────────────

function FundersSection({
  funders, canEdit, onChange, onMatchesChange, matches,
}: {
  funders: Funder[];
  canEdit: boolean;
  onChange: (rows: Funder[]) => void;
  onMatchesChange: (rows: MatchRow[]) => void;
  matches: MatchRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [matchingFunderId, setMatchingFunderId] = useState<string | null>(null);

  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🏛 Funder library" subtitle={`${funders.length} funder${funders.length === 1 ? '' : 's'} — edit any to match your real history.`}>
        {canEdit && (
          <button onClick={() => setAdding(v => !v)} style={ghostBtnStyle}>
            {adding ? 'Cancel' : '+ Add funder'}
          </button>
        )}
      </SectionHeader>

      {adding && canEdit && (
        <AddFunderForm
          onCancel={() => setAdding(false)}
          onCreated={f => { onChange([f, ...funders]); setAdding(false); }}
        />
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {funders.map(f => (
          <div key={f.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {f.name}
                  {f.is_default && <span style={defaultBadgeStyle}>default</span>}
                  <span style={typeBadgeStyle}>{f.type}</span>
                </div>
                {f.description && <p style={{ fontSize: 13, color: '#444', margin: '4px 0 0' }}>{f.description}</p>}
                <div style={{ fontSize: 12, color: '#666', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {f.focus_areas?.slice(0, 5).map(a => <Tag key={a}>{a}</Tag>)}
                  {f.geography?.slice(0, 3).map(g => <Tag key={g} muted>{g}</Tag>)}
                  {f.typical_grant_range && <span>· {f.typical_grant_range}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setOpenId(openId === f.id ? null : f.id)} style={miniBtnStyle}>
                  {openId === f.id ? 'Hide' : 'Details'}
                </button>
                {canEdit && (
                  <button onClick={() => setMatchingFunderId(matchingFunderId === f.id ? null : f.id)} style={miniBtnStyle}>
                    {matchingFunderId === f.id ? 'Hide cohort' : 'Cohort'}
                  </button>
                )}
              </div>
            </div>
            {openId === f.id && <FunderDetails funder={f} />}
            {matchingFunderId === f.id && (
              <CohortMatcher funder={f} matches={matches} onMatchesChange={onMatchesChange} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FunderDetails({ funder }: { funder: Funder }) {
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#fafbfc', borderRadius: 6, fontSize: 12 }}>
      {funder.application_url && (
        <p style={{ margin: '0 0 6px' }}>
          <a href={funder.application_url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>Application page →</a>
        </p>
      )}
      {Array.isArray(funder.application_structure) && funder.application_structure.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Application structure</div>
          <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>
            {funder.application_structure.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong>{s.section}</strong>{s.word_limit ? ` (≤ ${s.word_limit} words)` : ''}
                {s.prompt && <div style={{ color: '#666' }}>{s.prompt}</div>}
              </li>
            ))}
          </ol>
        </>
      )}
      {funder.notes && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{funder.notes}</p>}
    </div>
  );
}

function AddFunderForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (f: Funder) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('foundation');
  const [description, setDescription] = useState('');
  const [focus, setFocus] = useState('');
  const [geo, setGeo] = useState('');
  const [range, setRange] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/fundraiser/funders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type, description: description || undefined,
          focus_areas: focus.split(',').map(s => s.trim()).filter(Boolean),
          geography: geo.split(',').map(s => s.trim()).filter(Boolean),
          typical_grant_range: range || undefined,
          application_url: url || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.funder);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 10 }}>
      <Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            <option value="foundation">Foundation</option>
            <option value="government">Government</option>
            <option value="corporate">Corporate</option>
            <option value="individual">Individual</option>
            <option value="cohort_pool">Cohort pool</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Typical grant size">
          <input value={range} onChange={e => setRange(e.target.value)} placeholder="$50k–$500k" style={inputStyle} />
        </Field>
      </div>
      <Field label="Description"><textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <Field label="Focus areas (comma-separated)"><input value={focus} onChange={e => setFocus(e.target.value)} style={inputStyle} placeholder="independent media, accountability" /></Field>
      <Field label="Geography (comma-separated)"><input value={geo} onChange={e => setGeo(e.target.value)} style={inputStyle} placeholder="Africa, Southern Africa" /></Field>
      <Field label="Application URL"><input type="url" value={url} onChange={e => setUrl(e.target.value)} style={inputStyle} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryBtnStyle}>{busy ? 'Saving…' : 'Add funder'}</button>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>Cancel</button>
      </div>
      {err && <p style={{ color: '#b00', fontSize: 13, marginTop: 6 }}>{err}</p>}
    </form>
  );
}

// ─── Cohort matcher (per-funder) ───────────────────────────────────────────

type Candidate = {
  partnerNewsroomId: string;
  partnerNewsroomName: string | null;
  partnerTagline: string | null;
  partnerMission: string | null;
  score: number;
  sharedStrengths: string[];
  sharedBeats: string[];
  sharedGeography: string[];
  partnerFocusHit: string[];
  existingMatch: { id: string; status: string } | null;
};

function CohortMatcher({
  funder, matches, onMatchesChange,
}: {
  funder: Funder;
  matches: MatchRow[];
  onMatchesChange: (rows: MatchRow[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/fundraiser/cohort?funder_id=${funder.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed');
        if (!cancelled) setCandidates(data.candidates || []);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [funder.id]);

  async function propose(c: Candidate) {
    const res = await fetch('/api/fundraiser/cohort', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funder_id: funder.id, partner_newsroom_id: c.partnerNewsroomId }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed'); return; }
    // Refresh candidate's existingMatch flag locally
    setCandidates(cands => cands.map(x =>
      x.partnerNewsroomId === c.partnerNewsroomId
        ? { ...x, existingMatch: { id: data.match.matchId, status: 'proposed' } }
        : x
    ));
    // Refresh top-level matches list
    const listRes = await fetch('/fundraiser', { method: 'GET' }).catch(() => null);
    void listRes;
    // Add to local matches optimistically
    onMatchesChange([
      {
        id: data.match.matchId,
        funder_id: funder.id,
        funder_name: funder.name,
        partner_newsroom_id: c.partnerNewsroomId,
        partner_newsroom_name: c.partnerNewsroomName,
        rationale: data.match.rationale || '',
        match_score: c.score,
        shared_strengths: c.sharedStrengths,
        shared_geography: c.sharedGeography,
        status: 'proposed',
        responded_at: null,
        created_at: new Date().toISOString(),
      },
      ...matches,
    ]);
  }

  return (
    <div style={{ marginTop: 10, padding: 12, background: '#fafbfc', borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Joint application opportunities</div>
      {loading && <p style={{ margin: 0, color: '#666' }}>Scanning cohort…</p>}
      {err && <p style={{ color: '#b00', margin: 0 }}>{err}</p>}
      {!loading && !err && candidates.length === 0 && (
        <p style={{ margin: 0, color: '#666' }}>No cohort partners with overlapping profile fit for this funder yet.</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {candidates.map(c => (
          <li key={c.partnerNewsroomId} style={{ padding: '8px 0', borderTop: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong>{c.partnerNewsroomName || c.partnerNewsroomId.slice(0, 8)}</strong>
                <span style={{ color: '#666', marginLeft: 6 }}>· score {Math.round(c.score * 100)}%</span>
                {c.partnerTagline && <div style={{ color: '#444' }}>{c.partnerTagline}</div>}
                <div style={{ color: '#666', marginTop: 4 }}>
                  {c.sharedGeography.length > 0 && <>shared geography: {c.sharedGeography.join(', ')}. </>}
                  {c.sharedBeats.length > 0 && <>shared beats: {c.sharedBeats.join(', ')}. </>}
                  {c.partnerFocusHit.length > 0 && <>partner aligned to funder priorities: {c.partnerFocusHit.join(', ')}.</>}
                </div>
              </div>
              <div>
                {c.existingMatch ? (
                  <span style={{ ...statusBadgeStyle(c.existingMatch.status) }}>{c.existingMatch.status}</span>
                ) : (
                  <button onClick={() => propose(c)} style={miniBtnStyle}>Propose match</button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Cohort matches (top-level summary) ────────────────────────────────────

function CohortSection({
  matches, canEdit, onChange,
}: {
  matches: MatchRow[];
  canEdit: boolean;
  onChange: (rows: MatchRow[]) => void;
}) {
  async function setStatus(id: string, status: 'accepted' | 'declined') {
    const res = await fetch('/api/fundraiser/cohort', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed'); return; }
    onChange(matches.map(m => m.id === id ? { ...m, status: data.match.status, responded_at: data.match.responded_at } : m));
  }

  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader title="🤝 Cohort opportunities" subtitle="Joint-application matches you've proposed across the cohort. Grounded surfaces overlap; you and the partner editor decide whether to pursue." />
      {matches.length === 0 ? (
        <Empty text="No cohort matches yet. Open any funder above and click Cohort to scan for partners." />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {matches.map(m => (
            <div key={m.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {m.funder_name} <span style={{ color: '#666', fontWeight: 400 }}>+</span> {m.partner_newsroom_name || m.partner_newsroom_id.slice(0, 8)}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#444' }}>{m.rationale}</p>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    score {Math.round((m.match_score || 0) * 100)}%
                    {m.shared_geography.length > 0 && ` · geography: ${m.shared_geography.join(', ')}`}
                    {m.shared_strengths.length > 0 && ` · strengths: ${m.shared_strengths.join(', ')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={statusBadgeStyle(m.status)}>{m.status}</span>
                  {canEdit && m.status === 'proposed' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setStatus(m.id, 'accepted')} style={miniBtnStyle}>Accept</button>
                      <button onClick={() => setStatus(m.id, 'declined')} style={miniBtnStyle}>Decline</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
    <label style={{ display: 'block', marginTop: 6 }}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: 20, background: 'white', border: '1px dashed #d0d0d0', borderRadius: 8, color: '#777', fontSize: 13, textAlign: 'center' }}>
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span style={statusBadgeStyle(status)}>{status}</span>;
}

function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '1px 7px',
      borderRadius: 10,
      background: muted ? '#eef0f3' : '#e6f0ff',
      color: muted ? '#555' : '#0044aa',
    }}>{children}</span>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e5e5', borderRadius: 8,
  padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 13,
  border: '1px solid #d0d0d0', borderRadius: 4, fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  background: '#0066cc', color: 'white', border: 'none',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'white', color: '#0066cc', border: '1px solid #0066cc',
  padding: '6px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};

const miniBtnStyle: React.CSSProperties = {
  background: 'white', color: '#444', border: '1px solid #d0d0d0',
  padding: '3px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
};

const defaultBadgeStyle: React.CSSProperties = {
  fontSize: 10, padding: '1px 6px', borderRadius: 9,
  background: '#eef4ff', color: '#0044aa', marginLeft: 8, fontWeight: 400,
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 10, padding: '1px 6px', borderRadius: 9,
  background: '#f0ebe0', color: '#7a5800', marginLeft: 6, fontWeight: 400,
};

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fff8e6', fg: '#8a5400' },
    generated: { bg: '#e0f0ff', fg: '#0044aa' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    submitted: { bg: '#dbf3f3', fg: '#0a6363' },
    won: { bg: '#e7f6e7', fg: '#1a5d1a' },
    lost: { bg: '#ffe6e6', fg: '#a02020' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
    proposed: { bg: '#fff8e6', fg: '#8a5400' },
    accepted: { bg: '#e7f6e7', fg: '#1a5d1a' },
    declined: { bg: '#eee', fg: '#555' },
    expired: { bg: '#eee', fg: '#777' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return {
    fontSize: 11, padding: '2px 8px', borderRadius: 10,
    background: c.bg, color: c.fg, fontWeight: 500,
  };
}
