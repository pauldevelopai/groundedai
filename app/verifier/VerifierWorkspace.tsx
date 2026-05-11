// VerifierWorkspace — runs (top, primary action) + credibility map (bottom).

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type RunRow = {
  id: string;
  title: string;
  claim_text: string;
  source_kind: 'manual' | 'inbound_submission' | 'social_signal' | 'production' | 'translation' | 'other';
  source_id: string | null;
  matched_outlet_findings: Record<string, { name: string; country: string; credibility_score: number | null; ownership: string | null; known_issues: string[] }>;
  status: 'pending' | 'verified' | 'edited' | 'failed';
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type OutletRow = {
  id: string;
  name: string;
  country: 'ZA' | 'ZW' | 'ZM' | 'KE' | 'other';
  url: string | null;
  alt_urls: string[];
  ownership: string | null;
  alignment_notes: string | null;
  credibility_score: number | string | null;
  beat_strengths: string[];
  beat_weaknesses: string[];
  known_issues: string[];
  notes: string | null;
  public_sources: Array<{ publisher?: string; title?: string; url?: string; year?: number }>;
  is_default: boolean;
};

const COUNTRY_LABELS: Record<OutletRow['country'], string> = {
  ZA: '🇿🇦 South Africa',
  ZW: '🇿🇼 Zimbabwe',
  ZM: '🇿🇲 Zambia',
  KE: '🇰🇪 Kenya',
  other: 'Other',
};

export default function VerifierWorkspace({
  initialRuns, initialOutlets, canEdit, role,
}: {
  initialRuns: RunRow[];
  initialOutlets: OutletRow[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [outlets, setOutlets] = useState(initialOutlets);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Grounded</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🛡 Verifier</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audio & Video Producer →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience Analytics Manager →</Link>
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
        <h1 style={{ margin: 0, fontSize: 24 }}>Verifier</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Multi-source claim verification with an Africa-grounded credibility map (SA / ZW / ZM / KE outlets seeded by default; editable). Inbound submissions from the Digital News Gatherer and flagged social-media signals can be referred here for fact-check; the credibility map weights sources automatically when URLs are present.
        </p>

        <RunsSection runs={runs} canEdit={canEdit} onChange={setRuns} onRefresh={() => router.refresh()} />
        <OutletsSection outlets={outlets} canEdit={canEdit} onChange={setOutlets} />
      </div>
    </main>
  );
}

// ─── Runs ──────────────────────────────────────────────────────────────────

function RunsSection({
  runs, canEdit, onChange, onRefresh,
}: {
  runs: RunRow[]; canEdit: boolean;
  onChange: (rows: RunRow[]) => void; onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>📋 Verification runs</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            Persistent verifications — manual paste, or auto-created when an editor refers an inbound submission / social signal here.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setCreating(c => !c)} style={primaryBtn}>{creating ? 'Cancel' : '+ New run'}</button>
        )}
      </div>
      {creating && canEdit && (
        <NewRunForm
          onCancel={() => setCreating(false)}
          onCreated={(row) => { onChange([row, ...runs]); setCreating(false); onRefresh(); }}
        />
      )}
      {runs.length === 0 ? <Empty text="No runs yet. Click + New run to verify a piece of text." /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {runs.map(r => (
            <Link key={r.id} href={`/verifier/runs/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ ...cardStyle, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{r.title}</strong>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {r.source_kind !== 'manual' && <Tag muted>via {r.source_kind.replace(/_/g, ' ')}</Tag>}
                      {Object.keys(r.matched_outlet_findings || {}).length > 0 && (
                        <Tag accent={alignmentTone('cib_network')}>{Object.keys(r.matched_outlet_findings).length} outlet{Object.keys(r.matched_outlet_findings).length === 1 ? '' : 's'} matched</Tag>
                      )}
                      {' · '}{new Date(r.created_at).toLocaleString()}
                    </div>
                    <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0', lineHeight: 1.4 }}>
                      {r.claim_text.slice(0, 220)}{r.claim_text.length > 220 ? '…' : ''}
                    </p>
                  </div>
                  <span style={statusBadge(r.status)}>{r.status}</span>
                </div>
                {r.error && <p style={{ color: '#b00', fontSize: 12, margin: '6px 0 0' }}>{r.error}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NewRunForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (r: RunRow) => void }) {
  const [title, setTitle] = useState('');
  const [claim, setClaim] = useState('');
  const [contextBrief, setContextBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/verifier/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_text: claim,
          title: title || undefined,
          context_brief: contextBrief || undefined,
          source_kind: 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      const list = await fetch('/api/verifier/runs').then(r => r.json());
      const newest = (list.runs || []).find((r: RunRow) => r.id === data.runId) || list.runs?.[0];
      if (newest) onCreated(newest);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <Field label="Title (optional)">
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder='e.g. "Pre-publication fact-check — Polokwane water cuts"' />
      </Field>
      <Field label="Article / claim text (≥ 50 chars)">
        <textarea required minLength={50} rows={6} value={claim} onChange={e => setClaim(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="Paste the article. The verifier identifies the main factual claims and weights URL sources against your credibility map automatically." />
      </Field>
      <Field label="Context (optional)">
        <textarea rows={2} value={contextBrief} onChange={e => setContextBrief(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="What you want the verifier to weigh — e.g. 'this is a community submission, treat with extra caution'." />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || claim.trim().length < 50} style={primaryBtn}>{busy ? 'Verifying…' : 'Verify'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 13 }}>{err}</span>}
      </div>
    </form>
  );
}

// ─── Outlets (credibility map) ─────────────────────────────────────────────

function OutletsSection({
  outlets, canEdit, onChange,
}: {
  outlets: OutletRow[]; canEdit: boolean; onChange: (rows: OutletRow[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | OutletRow['country']>('all');

  const counts = {
    ZA: outlets.filter(o => o.country === 'ZA').length,
    ZW: outlets.filter(o => o.country === 'ZW').length,
    ZM: outlets.filter(o => o.country === 'ZM').length,
    KE: outlets.filter(o => o.country === 'KE').length,
    other: outlets.filter(o => o.country === 'other').length,
  };
  const filtered = filter === 'all' ? outlets : outlets.filter(o => o.country === filter);

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>🗺 Credibility map</h2>
          <p style={{ fontSize: 13, color: '#666', margin: '2px 0 0' }}>
            {outlets.length} outlets — {counts.ZA} ZA, {counts.ZW} ZW, {counts.ZM} ZM, {counts.KE} KE{counts.other > 0 ? `, ${counts.other} other` : ''}. The Verifier consults this when URLs appear in source text.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'ZA', 'ZW', 'ZM', 'KE'] as const).map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              ...miniBtn, fontWeight: filter === c ? 600 : 400,
              background: filter === c ? '#0066cc' : 'white',
              color: filter === c ? 'white' : '#444',
              borderColor: filter === c ? '#0066cc' : '#d0d0d0',
            }}>
              {c === 'all' ? 'All' : COUNTRY_LABELS[c].slice(0, 4) /* flag */}
            </button>
          ))}
          {canEdit && <button onClick={() => setAdding(a => !a)} style={ghostBtn}>{adding ? 'Cancel' : '+ Add outlet'}</button>}
        </div>
      </div>
      {adding && canEdit && (
        <AddOutletForm onCancel={() => setAdding(false)} onCreated={(o) => { onChange([o, ...outlets]); setAdding(false); }} />
      )}
      {filtered.length === 0 ? <Empty text="No outlets match this filter." /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {filtered.map(o => (
            <div key={o.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{o.name}</strong>
                  <Tag muted>{COUNTRY_LABELS[o.country]}</Tag>
                  {o.is_default && <Tag muted>default</Tag>}
                  <CredibilityBadge value={o.credibility_score} />
                  {o.url && (
                    <a href={`https://${o.url}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0066cc', marginLeft: 6 }}>
                      {o.url} ↗
                    </a>
                  )}
                  {o.ownership && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{o.ownership}</div>}
                  {o.notes && <p style={{ fontSize: 13, color: '#444', margin: '4px 0 0', lineHeight: 1.4 }}>{o.notes}</p>}
                </div>
                <button onClick={() => setOpenId(openId === o.id ? null : o.id)} style={miniBtn}>
                  {openId === o.id ? 'Hide' : 'Details'}
                </button>
              </div>
              {openId === o.id && (
                <div style={{ marginTop: 8, padding: 10, background: '#fafbfc', borderRadius: 6, fontSize: 12 }}>
                  {o.alt_urls?.length > 0 && <div>Also at: {o.alt_urls.join(', ')}</div>}
                  {o.alignment_notes && <div style={{ marginTop: 4 }}><em>Alignment:</em> {o.alignment_notes}</div>}
                  {o.beat_strengths?.length > 0 && (
                    <div style={{ marginTop: 4 }}>Strong on: {o.beat_strengths.join(', ')}</div>
                  )}
                  {o.beat_weaknesses?.length > 0 && (
                    <div style={{ marginTop: 4 }}>Weak on: {o.beat_weaknesses.join(', ')}</div>
                  )}
                  {o.known_issues?.length > 0 && (
                    <ul style={{ marginTop: 6, paddingLeft: 18, color: '#a02020' }}>
                      {o.known_issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                  )}
                  {o.public_sources?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      Sources: {o.public_sources.map((s, i) => (
                        <span key={i}>
                          {i > 0 ? '; ' : ''}
                          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>{s.publisher} — {s.title}{s.year ? ` (${s.year})` : ''}</a> : `${s.publisher} — ${s.title}${s.year ? ` (${s.year})` : ''}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddOutletForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (o: OutletRow) => void }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState<OutletRow['country']>('ZA');
  const [url, setUrl] = useState('');
  const [ownership, setOwnership] = useState('');
  const [score, setScore] = useState('0.7');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/verifier/outlets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, country, url: url || undefined, ownership: ownership || undefined,
          credibility_score: score ? Number(score) : undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.outlet);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
        <Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Country">
          <select value={country} onChange={e => setCountry(e.target.value as OutletRow['country'])} style={inputStyle}>
            <option value="ZA">South Africa</option>
            <option value="ZW">Zimbabwe</option>
            <option value="ZM">Zambia</option>
            <option value="KE">Kenya</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Credibility (0..1)">
          <input type="number" min={0} max={1} step="0.05" value={score} onChange={e => setScore(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <Field label="URL (apex domain)"><input value={url} onChange={e => setUrl(e.target.value)} style={inputStyle} placeholder="example.co.za" /></Field>
      <Field label="Ownership"><input value={ownership} onChange={e => setOwnership(e.target.value)} style={inputStyle} /></Field>
      <Field label="Notes"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="submit" disabled={busy || !name.trim()} style={primaryBtn}>{busy ? 'Saving…' : 'Add outlet'}</button>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
      </div>
    </form>
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
function Tag({ children, muted = false, accent }: { children: React.ReactNode; muted?: boolean; accent?: { bg: string; fg: string } }) {
  const style = accent
    ? { background: accent.bg, color: accent.fg }
    : muted ? { background: '#eef0f3', color: '#555' } : { background: '#e6f0ff', color: '#0044aa' };
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 4, ...style }}>{children}</span>;
}
function CredibilityBadge({ value }: { value: number | string | null }) {
  if (value == null) return <Tag muted>unscored</Tag>;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return <Tag muted>unscored</Tag>;
  let bg, fg;
  if (n >= 0.85) { bg = '#e7f6e7'; fg = '#1a5d1a'; }
  else if (n >= 0.7) { bg = '#dbf3f3'; fg = '#0a6363'; }
  else if (n >= 0.55) { bg = '#fff8e6'; fg = '#8a5400'; }
  else { bg = '#ffe6e6'; fg = '#a02020'; }
  return <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 4, background: bg, color: fg, fontWeight: 600 }}>{(n * 100).toFixed(0)}%</span>;
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
  padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
};

function alignmentTone(a: string) {
  const map: Record<string, { bg: string; fg: string }> = {
    cib_network: { bg: '#e8e3ff', fg: '#5a3a99' },
  };
  return map[a] || { bg: '#eef0f3', fg: '#555' };
}
function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fff8e6', fg: '#8a5400' },
    verified: { bg: '#e7f6e7', fg: '#1a5d1a' },
    edited: { bg: '#e8e3ff', fg: '#5a3a99' },
    failed: { bg: '#ffe6e6', fg: '#a02020' },
  };
  const c = map[status] || { bg: '#eee', fg: '#555' };
  return { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 };
}
