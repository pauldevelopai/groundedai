// AudienceWorkspace — three-region UI: personas, signals, focus groups.
// Functional > polished — same design language as /research and /translation.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Persona = {
  id: string;
  name: string;
  archetype: string;
  description: string | null;
  age_range: string | null;
  location: string | null;
  languages: string[];
  device: string | null;
  reading_habits: string | null;
  primary_platforms: string[];
  trust_signals: string | null;
  interests: string[];
  source: string;
  is_default: boolean;
};

type SignalRow = {
  id: string;
  source: string;
  filename: string | null;
  signals: { landed_topics?: Array<{ topic: string; evidence: string; why_it_landed: string }>; gaps?: Array<{ topic_or_audience: string; evidence: string; implication: string }>; bounced_stories?: Array<{ headline_or_url: string; drop_off_signal: string; diagnosis: string }>; drift_notes?: string };
  total_pageviews: number | null;
  unique_visitors: number | null;
  analysis_summary: string | null;
  status: 'pending' | 'analyzed' | 'failed';
  duration_ms: number | null;
  error: string | null;
  notes: string | null;
  created_at: string;
};

type FocusGroupRow = {
  id: string;
  title: string;
  test_material_kind: 'headline' | 'lede' | 'angle' | 'full_draft';
  context_brief: string | null;
  persona_ids: string[];
  summary: string | null;
  recommendations: string[];
  status: 'pending' | 'completed' | 'failed';
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

const KIND_LABELS: Record<FocusGroupRow['test_material_kind'], string> = {
  headline: 'Headline',
  lede: 'Lede',
  angle: 'Angle',
  full_draft: 'Full draft',
};

export default function AudienceWorkspace({
  initialPersonas,
  initialSignals,
  initialSessions,
  canEdit,
  role,
}: {
  initialPersonas: Persona[];
  initialSignals: SignalRow[];
  initialSessions: FocusGroupRow[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [personas, setPersonas] = useState(initialPersonas);
  const [signals, setSignals] = useState(initialSignals);
  const [sessions, setSessions] = useState(initialSessions);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>👥 Audience</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Producer →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Distributor →</Link>
        <Link href="/social" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Social →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Audience</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Test stories against synthetic personas grounded in your real readers — defaults for low-data, vernacular-first, and feature-phone segments are seeded for every newsroom. Upload analytics to refine and produce actionable editorial signals.
        </p>

        <PersonasSection personas={personas} canEdit={canEdit} onChange={setPersonas} onRefresh={() => router.refresh()} />
        <FocusGroupsSection sessions={sessions} personas={personas} onChange={setSessions} />
        <SignalsSection signals={signals} canEdit={canEdit} onChange={setSignals} />
      </div>
    </main>
  );
}

// ─── Personas ──────────────────────────────────────────────────────────────

function PersonasSection({
  personas,
  canEdit,
  onChange,
  onRefresh,
}: {
  personas: Persona[];
  canEdit: boolean;
  onChange: (next: Persona[]) => void;
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    archetype: 'custom',
    description: '',
    age_range: '',
    location: '',
    languages: '',
    device: '',
    reading_habits: '',
    primary_platforms: '',
    trust_signals: '',
    interests: '',
  });

  function listToArr(s: string) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/audience/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          archetype: draft.archetype.trim() || 'custom',
          description: draft.description.trim() || null,
          age_range: draft.age_range.trim() || null,
          location: draft.location.trim() || null,
          languages: listToArr(draft.languages),
          device: draft.device.trim() || null,
          reading_habits: draft.reading_habits.trim() || null,
          primary_platforms: listToArr(draft.primary_platforms),
          trust_signals: draft.trust_signals.trim() || null,
          interests: listToArr(draft.interests),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add persona');
        return;
      }
      onChange([...personas, data.persona]);
      setShowAdd(false);
      setDraft({ name: '', archetype: 'custom', description: '', age_range: '', location: '', languages: '', device: '', reading_habits: '', primary_platforms: '', trust_signals: '', interests: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`Remove "${name}" from your personas?`)) return;
    const res = await fetch(`/api/audience/personas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onChange(personas.filter((p) => p.id !== id));
      onRefresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Delete failed');
    }
  }

  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Personas ({personas.length})</h2>
        {canEdit && (
          <button onClick={() => setShowAdd((s) => !s)} style={{ padding: '6px 12px', background: showAdd ? 'transparent' : '#111', color: showAdd ? '#666' : '#fff', border: showAdd ? '1px solid #ccc' : 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {showAdd ? 'Cancel' : '+ Add persona'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Defaults for low-data, vernacular-first, and feature-phone readers are auto-seeded for every newsroom — refine them to match your actual audience or add your own.
      </p>

      {showAdd && canEdit && (
        <form onSubmit={onAdd} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input type="text" required placeholder="Name (e.g. Township youth)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={textInput} />
          <input type="text" placeholder="Archetype (e.g. youth)" value={draft.archetype} onChange={(e) => setDraft({ ...draft, archetype: e.target.value })} style={textInput} />
          <textarea placeholder="Description — who is this reader?" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} style={{ ...textInput, gridColumn: '1 / span 2', fontFamily: 'inherit', resize: 'vertical' }} />
          <input type="text" placeholder="Age range (e.g. 18-24)" value={draft.age_range} onChange={(e) => setDraft({ ...draft, age_range: e.target.value })} style={textInput} />
          <input type="text" placeholder="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} style={textInput} />
          <input type="text" placeholder="Languages (comma-separated codes: zu,xh,en)" value={draft.languages} onChange={(e) => setDraft({ ...draft, languages: e.target.value })} style={textInput} />
          <input type="text" placeholder="Device (e.g. smartphone, feature_phone)" value={draft.device} onChange={(e) => setDraft({ ...draft, device: e.target.value })} style={textInput} />
          <textarea placeholder="Reading habits" value={draft.reading_habits} onChange={(e) => setDraft({ ...draft, reading_habits: e.target.value })} rows={2} style={{ ...textInput, gridColumn: '1 / span 2', fontFamily: 'inherit', resize: 'vertical' }} />
          <input type="text" placeholder="Platforms (comma-separated)" value={draft.primary_platforms} onChange={(e) => setDraft({ ...draft, primary_platforms: e.target.value })} style={textInput} />
          <input type="text" placeholder="Interests (comma-separated)" value={draft.interests} onChange={(e) => setDraft({ ...draft, interests: e.target.value })} style={textInput} />
          <textarea placeholder="Trust signals — what makes them believe a story?" value={draft.trust_signals} onChange={(e) => setDraft({ ...draft, trust_signals: e.target.value })} rows={2} style={{ ...textInput, gridColumn: '1 / span 2', fontFamily: 'inherit', resize: 'vertical' }} />
          {error && <p style={{ color: '#b00', fontSize: 12, gridColumn: '1 / span 2', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting || !draft.name.trim()} style={{ gridColumn: '1 / span 2', padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', justifySelf: 'flex-start' }}>
            {submitting ? 'Adding…' : 'Add persona'}
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {personas.map((p) => (
          <div key={p.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              {p.is_default && <span style={{ fontSize: 10, padding: '1px 6px', background: '#fff8e6', color: '#8a5400', borderRadius: 8 }}>default</span>}
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 6px' }}>{p.archetype}{p.age_range ? ` · ${p.age_range}` : ''}{p.location ? ` · ${p.location}` : ''}</p>
            {p.description && <p style={{ fontSize: 12, color: '#444', margin: '0 0 6px', lineHeight: 1.4 }}>{p.description}</p>}
            <div style={{ fontSize: 11, color: '#666' }}>
              {p.languages?.length > 0 && <div>Languages: {p.languages.join(', ')}</div>}
              {p.device && <div>Device: {p.device}</div>}
              {p.primary_platforms?.length > 0 && <div>Platforms: {p.primary_platforms.join(', ')}</div>}
            </div>
            {canEdit && (
              <button onClick={() => onDelete(p.id, p.name)} style={{ marginTop: 8, background: 'transparent', border: 'none', color: '#b00', fontSize: 11, cursor: 'pointer', padding: 0 }}>remove</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Focus groups ──────────────────────────────────────────────────────────

function FocusGroupsSection({
  sessions,
  personas,
  onChange,
}: {
  sessions: FocusGroupRow[];
  personas: Persona[];
  onChange: (next: FocusGroupRow[]) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<FocusGroupRow['test_material_kind']>('headline');
  const [material, setMaterial] = useState('');
  const [brief, setBrief] = useState('');
  const [selected, setSelected] = useState<string[]>(personas.filter((p) => p.is_default).map((p) => p.id));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function onRun(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/audience/focus-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          test_material: material.trim(),
          test_material_kind: kind,
          context_brief: brief.trim() || undefined,
          persona_ids: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Focus group failed'); return; }
      // Refresh the list from server
      const list = await fetch('/api/audience/focus-groups').then((r) => r.json());
      onChange(list.sessions || []);
      setInfo(`Completed in ${(data.durationMs / 1000).toFixed(1)}s · cost $${(data.cost?.costUsd ?? 0).toFixed(4)}`);
      setMaterial(''); setBrief(''); setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Focus groups ({sessions.length})</h2>
        <button onClick={() => setShowNew((s) => !s)} style={{ padding: '6px 12px', background: showNew ? 'transparent' : '#0066cc', color: showNew ? '#666' : '#fff', border: showNew ? '1px solid #ccc' : 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
          {showNew ? 'Cancel' : '+ Run a focus group'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Test a headline, lede, angle, or full draft against your personas. Each persona reacts in first person; Anchor summarises where the piece lands and recommends specific changes.
      </p>

      {showNew && (
        <form onSubmit={onRun} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as FocusGroupRow['test_material_kind'])} style={textInput}>
              {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="text" placeholder="Session title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={textInput} />
          </div>
          <textarea required minLength={5} placeholder="What to test (paste the headline / lede / angle / full draft)…" value={material} onChange={(e) => setMaterial(e.target.value)} rows={4} style={{ ...textInput, fontFamily: 'inherit', resize: 'vertical' }} />
          <textarea placeholder="Editor brief (optional) — what you want stress-tested" value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} style={{ ...textInput, fontFamily: 'inherit', resize: 'vertical' }} />
          <div>
            <p style={{ fontSize: 12, color: '#444', margin: '0 0 4px' }}>Pick personas (cap 6)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {personas.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} style={{ fontSize: 12, padding: '5px 10px', background: on ? '#0066cc' : 'white', color: on ? 'white' : '#444', border: `1px solid ${on ? '#0066cc' : '#ccc'}`, borderRadius: 12, cursor: 'pointer' }}>
                    {p.is_default && '🔸 '}{p.name}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p style={{ color: '#b00', fontSize: 12, margin: 0 }}>{error}</p>}
          {info && <p style={{ color: '#0a0', fontSize: 12, margin: 0 }}>{info}</p>}
          <button type="submit" disabled={submitting || !material.trim() || selected.length === 0 || selected.length > 6} style={{ padding: '8px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', alignSelf: 'flex-start' }}>
            {submitting ? 'Running focus group — about 10–20s…' : 'Run focus group'}
          </button>
        </form>
      )}

      {sessions.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No focus groups yet. Run one above to test a piece against your personas.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sessions.map((s) => (
            <li key={s.id} style={{ borderTop: '1px solid #f0f0f0', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <Link href={`/audience/focus-groups/${s.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                  {s.title}
                </Link>
                <span style={{ fontSize: 11, padding: '2px 8px', background: s.status === 'completed' ? '#e7f6e7' : s.status === 'failed' ? '#ffe6e6' : '#eee', color: s.status === 'completed' ? '#1a5d1a' : s.status === 'failed' ? '#a02020' : '#555', borderRadius: 10 }}>{s.status}</span>
              </div>
              <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>
                {KIND_LABELS[s.test_material_kind]} · {s.persona_ids.length} persona{s.persona_ids.length === 1 ? '' : 's'}{s.duration_ms ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : ''} · {new Date(s.created_at).toLocaleString()}
              </p>
              {s.summary && <p style={{ fontSize: 13, color: '#333', margin: '6px 0 0', lineHeight: 1.4 }}>{s.summary}</p>}
              {s.error && <p style={{ fontSize: 12, color: '#b00', marginTop: 4 }}>{s.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Signals ───────────────────────────────────────────────────────────────

function SignalsSection({
  signals,
  canEdit,
  onChange,
}: {
  signals: SignalRow[];
  canEdit: boolean;
  onChange: (next: SignalRow[]) => void;
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, raw_csv: rawCsv.trim(), filename: filename.trim() || undefined, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Upload failed'); return; }
      // Refresh list
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
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Analytics signals ({signals.length})</h2>
        {canEdit && (
          <button onClick={() => setShowNew((s) => !s)} style={{ padding: '6px 12px', background: showNew ? 'transparent' : '#111', color: showNew ? '#666' : '#fff', border: showNew ? '1px solid #ccc' : 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {showNew ? 'Cancel' : '+ Upload analytics'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
        Paste an export from Plausible, Umami, or Google Analytics. Anchor turns the rows into editorial signals — what landed, what got missed, what bounced — instead of a vanity-metric dump.
      </p>

      {showNew && canEdit && (
        <form onSubmit={onUpload} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} style={textInput}>
              <option value="csv">CSV (any source)</option>
              <option value="plausible">Plausible</option>
              <option value="umami">Umami</option>
              <option value="ga">Google Analytics</option>
              <option value="manual">Manual notes</option>
            </select>
            <input type="text" placeholder="Filename / period label (optional)" value={filename} onChange={(e) => setFilename(e.target.value)} style={textInput} />
          </div>
          <textarea required minLength={10} placeholder="Paste rows — pageviews, dwell time, bounce rate, top stories, etc." value={rawCsv} onChange={(e) => setRawCsv(e.target.value)} rows={6} style={{ ...textInput, fontFamily: 'monospace', resize: 'vertical' }} />
          <input type="text" placeholder="Notes for the agent (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={textInput} />
          {error && <p style={{ color: '#b00', fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting || rawCsv.trim().length < 10} style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>
            {submitting ? 'Analysing…' : 'Upload + analyse'}
          </button>
        </form>
      )}

      {signals.length === 0 ? (
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No signals uploaded yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {signals.map((s) => (
            <li key={s.id} style={{ borderTop: '1px solid #f0f0f0', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{s.filename || s.source}</strong>
                <span style={{ fontSize: 11, padding: '2px 8px', background: s.status === 'analyzed' ? '#e7f6e7' : s.status === 'failed' ? '#ffe6e6' : '#eee', color: s.status === 'analyzed' ? '#1a5d1a' : s.status === 'failed' ? '#a02020' : '#555', borderRadius: 10 }}>{s.status}</span>
              </div>
              <p style={{ fontSize: 11, color: '#666', margin: '4px 0' }}>
                {s.source} · {new Date(s.created_at).toLocaleString()}
                {s.total_pageviews ? ` · ${s.total_pageviews.toLocaleString()} pageviews` : ''}
                {s.unique_visitors ? ` · ${s.unique_visitors.toLocaleString()} uniques` : ''}
              </p>
              {s.analysis_summary && <p style={{ fontSize: 13, color: '#333', margin: '4px 0 0', lineHeight: 1.4 }}>{s.analysis_summary}</p>}
              {s.signals?.gaps && s.signals.gaps.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 12, color: '#666', cursor: 'pointer' }}>Gaps to fill ({s.signals.gaps.length})</summary>
                  <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 12 }}>
                    {s.signals.gaps.map((g, i) => <li key={i}><strong>{g.topic_or_audience}</strong>: {g.implication}</li>)}
                  </ul>
                </details>
              )}
              {s.error && <p style={{ fontSize: 12, color: '#b00', marginTop: 4 }}>{s.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const textInput: React.CSSProperties = {
  fontSize: 13,
  padding: 8,
  border: '1px solid #ccc',
  borderRadius: 4,
  boxSizing: 'border-box',
  width: '100%',
};
