// ArchiveWorkspace — knowledge-graph workspace.
// Three regions:
//   - Ask the archive: natural-language Q&A over claims + entities
//   - Entities: browse / search / filter / merge canonical entities
//   - Documents: list with per-pass ingestion status + re-ingest action

'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type EntityType = {
  id: string;
  slug: string;
  label: string;
  prompt_hint: string;
  kind: 'universal' | 'newsroom';
  source_model: string;
  description: string | null;
};

type EntityRow = {
  id: string;
  canonical_name: string;
  surface_forms: string[];
  mention_count: number;
  type_slug: string;
  type_label: string;
  type_kind: 'universal' | 'newsroom';
  score?: number;
  trgm_sim?: number;
  cos_sim?: number;
};

type EntityProfile = {
  entity: EntityRow & { metadata: any; first_seen_at: string; last_seen_at: string };
  relationships: Array<{
    predicate: string;
    confidence: string | number;
    evidence_text: string;
    document_id: string;
    document_title: string;
    published_at: string | null;
    byline: string[] | null;
    direction: 'outgoing' | 'incoming';
    other_id: string;
    other_name: string;
    other_type: string;
  }>;
  claims: Array<{
    id: string;
    claim_text: string;
    evidence_text: string;
    confidence: string | number;
    asserted_at: string | null;
    byline: string[] | null;
    document_id: string;
    document_title: string;
  }>;
  documents: Array<{
    id: string;
    title: string | null;
    published_at: string | null;
    byline: string[] | null;
    beat: string | null;
    story_type: string | null;
    mentions_in_doc: string;
  }>;
};

type Citation = {
  n: number;
  doc_id: string;
  title: string | null;
  byline: string[] | null;
  published_at: string | null;
  quote: string;
  kind: string;
  claim_id: string | null;
};

type AnswerResponse = {
  answer: string;
  citations: Citation[];
  matched_entities: Array<{ id: string; canonical_name: string; score: number }>;
  unmatched_names: string[];
  intent: { question_type: string; entity_names: string[]; as_of: string | null };
  fallback_used: 'entity' | 'semantic_claims' | 'semantic_chunks' | 'none';
  evidence_count: number;
  cost: { costUsd: number };
};

type DocumentRow = {
  id: string;
  filename: string;
  title: string | null;
  beat: string | null;
  story_type: string | null;
  byline: string[] | null;
  published_at: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
  mention_count: string;
  relationship_count: string;
  claim_count: string;
  ingestion: Record<string, { status: string; rows_added: number; completed_at: string | null; error: string | null }>;
};

const TAB_LABELS: Record<string, string> = {
  ask: 'Ask the archive',
  entities: 'Entities',
  documents: 'Documents',
  types: 'Entity types',
};

function shortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return '—'; }
}

function panel(): React.CSSProperties {
  return { background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16 };
}

export default function ArchiveWorkspace({
  role, entityTypes: initialTypes, counts,
}: {
  role: 'user' | 'builder' | 'admin';
  entityTypes: EntityType[];
  counts: { documents: number; entities: number; claims: number };
}) {
  const [tab, setTab] = useState<keyof typeof TAB_LABELS>('ask');
  const [entityTypes, setEntityTypes] = useState(initialTypes);
  const canEdit = role === 'builder' || role === 'admin';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Grounded</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>📚 Archivist</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>
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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Archivist</h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 4 }}>
          Your newsroom's archive as a queryable dataset. Every document is mined for entities (people, organisations, places, plus newsroom-defined types), relationships, and atomic claims — with full provenance back to the source piece and byline. Ask natural-language questions; the answer cites the underlying claims.
        </p>

        {/* Counts strip */}
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#666', marginTop: 12, marginBottom: 16 }}>
          <span><strong style={{ color: '#222' }}>{counts.documents}</strong> documents</span>
          <span><strong style={{ color: '#222' }}>{counts.entities}</strong> entities</span>
          <span><strong style={{ color: '#222' }}>{counts.claims}</strong> claims</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #ddd' }}>
          {(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                background: tab === t ? '#0066cc' : 'transparent',
                color: tab === t ? 'white' : '#444',
                border: 'none',
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'ask' && <AskRegion />}
        {tab === 'entities' && <EntitiesRegion entityTypes={entityTypes} canEdit={canEdit} />}
        {tab === 'documents' && <DocumentsRegion canEdit={canEdit} />}
        {tab === 'types' && <TypesRegion entityTypes={entityTypes} canEdit={canEdit} onTypeAdded={(t) => setEntityTypes([...entityTypes, t])} />}
      </div>
    </main>
  );
}

// ─── Ask the archive ───────────────────────────────────────────────────────

function AskRegion() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch('/api/archive/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setAnswer(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={panel()}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Ask the archive</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        Natural-language Q&A over what your newsroom has reported. The answer cites the underlying claims, with byline and date.
      </p>
      <form onSubmit={ask}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "What do we know about Cyril Ramaphosa?" or "Has Anglo American sold any businesses?"'
          rows={2}
          style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 6, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{ padding: '8px 16px', fontSize: 14, background: loading ? '#999' : '#0066cc', color: 'white', border: 'none', borderRadius: 6, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Searching the archive…' : 'Ask'}
          </button>
          {answer && (
            <span style={{ fontSize: 12, color: '#666' }}>
              {answer.evidence_count} citation{answer.evidence_count === 1 ? '' : 's'} · fallback: {answer.fallback_used}
              {answer.matched_entities.length > 0 && ` · matched: ${answer.matched_entities.map((e) => e.canonical_name).join(', ')}`}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div style={{ marginTop: 12, padding: 10, background: '#fee', border: '1px solid #fcc', borderRadius: 6, color: '#900', fontSize: 13 }}>
          {error}
        </div>
      )}

      {answer && (
        <div style={{ marginTop: 16 }}>
          <div style={{ background: '#f9fbff', border: '1px solid #d4e3f5', padding: 14, borderRadius: 6, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {answer.answer}
          </div>
          {answer.citations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Citations</strong>
              <ol style={{ marginTop: 6, paddingLeft: 22, fontSize: 13, color: '#444' }}>
                {answer.citations.map((c) => (
                  <li key={c.n} style={{ marginBottom: 8 }}>
                    <span style={{ color: '#0066cc' }}>{c.title || 'Untitled'}</span>
                    {c.byline && c.byline.length > 0 && <> · by {c.byline.join(', ')}</>}
                    {c.published_at && <> · {shortDate(c.published_at)}</>}
                    <br />
                    <span style={{ color: '#666', fontStyle: 'italic' }}>"{c.quote.slice(0, 200)}{c.quote.length > 200 ? '…' : ''}"</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {answer.unmatched_names.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
              Names not found in this archive: {answer.unmatched_names.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Entities tab ──────────────────────────────────────────────────────────

function EntitiesRegion({ entityTypes, canEdit }: { entityTypes: EntityType[]; canEdit: boolean }) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EntityRow | null>(null);
  const [profile, setProfile] = useState<EntityProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<EntityRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (typeFilter) params.set('type', typeFilter);
      params.set('pageSize', '50');
      const res = await fetch('/api/archive/entities?' + params.toString());
      const j = await res.json();
      setEntities(j.entities || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [typeFilter]);

  async function openProfile(e: EntityRow) {
    setSelected(e);
    setProfile(null);
    setProfileLoading(true);
    try {
      const res = await fetch('/api/archive/entities/' + e.id);
      const j = await res.json();
      setProfile(j);
    } finally {
      setProfileLoading(false);
    }
  }

  async function doMerge() {
    if (!selected || !mergeCandidate) return;
    if (!confirm(`Merge "${mergeCandidate.canonical_name}" INTO "${selected.canonical_name}"? This re-points every mention/claim/relationship and deletes "${mergeCandidate.canonical_name}".`)) return;
    const res = await fetch('/api/archive/entities/' + selected.id + '/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mergeId: mergeCandidate.id }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert('Merge failed: ' + (j.error || res.status));
      return;
    }
    setMergeCandidate(null);
    await load();
    await openProfile(selected);
  }

  return (
    <div>
      <div style={panel()}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search entities…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            style={{ flex: 1, minWidth: 200, padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}>
            <option value="">All types</option>
            {entityTypes.map((t) => (
              <option key={t.id} value={t.slug}>{t.label} {t.kind === 'newsroom' && '★'}</option>
            ))}
          </select>
          <button onClick={load} style={{ padding: '8px 12px', fontSize: 14, background: '#0066cc', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Entity list */}
        <div style={{ flex: 1, ...panel() }}>
          {loading && <div style={{ color: '#666', fontSize: 13 }}>Loading…</div>}
          {!loading && entities.length === 0 && (
            <div style={{ color: '#666', fontSize: 13 }}>
              No entities yet. Upload documents and run ingestion to populate the knowledge graph.
            </div>
          )}
          {!loading && entities.length > 0 && (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th style={{ padding: '8px 6px' }}>Type</th>
                  <th style={{ padding: '8px 6px' }}>Mentions</th>
                  <th style={{ padding: '8px 6px' }}>Forms</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => openProfile(e)}
                    style={{ cursor: 'pointer', background: selected?.id === e.id ? '#eaf2fb' : 'transparent', borderBottom: '1px solid #f5f5f5' }}
                  >
                    <td style={{ padding: '8px 6px', fontWeight: 500 }}>{e.canonical_name}</td>
                    <td style={{ padding: '8px 6px', color: '#666' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: e.type_kind === 'newsroom' ? '#fef3c7' : '#e5e7eb', borderRadius: 4 }}>
                        {e.type_label}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', color: '#666' }}>{e.mention_count}</td>
                    <td style={{ padding: '8px 6px', color: '#999' }}>{e.surface_forms.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Profile panel */}
        {selected && (
          <div style={{ width: 480, ...panel() }}>
            <button onClick={() => { setSelected(null); setProfile(null); }} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#999' }}>×</button>
            <h3 style={{ marginTop: 0, fontSize: 17 }}>{selected.canonical_name}</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              {selected.type_label} · {selected.mention_count} mention{selected.mention_count === 1 ? '' : 's'}
            </div>

            {profileLoading && <div style={{ color: '#666', fontSize: 13 }}>Loading profile…</div>}

            {profile && (
              <>
                {profile.entity.surface_forms.length > 1 && (
                  <div style={{ marginBottom: 10, fontSize: 12 }}>
                    <strong>Surface forms:</strong> {profile.entity.surface_forms.join(', ')}
                  </div>
                )}

                {canEdit && (
                  <details style={{ marginBottom: 12 }}>
                    <summary style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>Merge another entity into this one…</summary>
                    <div style={{ marginTop: 8, padding: 10, background: '#fafafa', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                        Pick from the list on the left, then click Merge. Useful for combining acronym/expansion pairs (e.g. "ANC" → "African National Congress").
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        Candidate: {mergeCandidate ? <strong>{mergeCandidate.canonical_name}</strong> : <em style={{ color: '#999' }}>(none)</em>}
                      </div>
                      <button
                        disabled={!mergeCandidate || mergeCandidate.id === selected.id}
                        onClick={doMerge}
                        style={{ padding: '6px 10px', fontSize: 12, background: mergeCandidate ? '#dc2626' : '#ccc', color: 'white', border: 'none', borderRadius: 4, cursor: mergeCandidate ? 'pointer' : 'not-allowed' }}
                      >
                        Merge into {selected.canonical_name}
                      </button>
                      <button onClick={() => setMergeCandidate(null)} style={{ marginLeft: 8, padding: '6px 10px', fontSize: 12, background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>Clear</button>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                        Tip: Cmd-click an entity row to pick it as the merge candidate.
                      </div>
                    </div>
                  </details>
                )}

                <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 13 }}>Relationships ({profile.relationships.length})</h4>
                {profile.relationships.length === 0 ? (
                  <div style={{ color: '#999', fontSize: 12 }}>No relationships extracted yet.</div>
                ) : (
                  <ul style={{ paddingLeft: 0, listStyle: 'none', fontSize: 12 }}>
                    {profile.relationships.slice(0, 10).map((r, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        <span style={{ color: '#0066cc' }}>{r.direction === 'outgoing' ? '→' : '←'} {r.predicate}</span>{' '}
                        <strong>{r.other_name}</strong> <span style={{ color: '#999' }}>({r.other_type})</span>
                        <div style={{ color: '#666', marginTop: 2 }}>{r.evidence_text.slice(0, 140)}{r.evidence_text.length > 140 ? '…' : ''}</div>
                        <div style={{ color: '#999', fontSize: 11 }}>{shortDate(r.published_at)} · {r.document_title || 'untitled'}</div>
                      </li>
                    ))}
                  </ul>
                )}

                <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 13 }}>Claim timeline ({profile.claims.length})</h4>
                {profile.claims.length === 0 ? (
                  <div style={{ color: '#999', fontSize: 12 }}>No claims extracted yet.</div>
                ) : (
                  <ol style={{ paddingLeft: 18, fontSize: 12 }}>
                    {profile.claims.map((c) => (
                      <li key={c.id} style={{ marginBottom: 8 }}>
                        <div style={{ color: '#999', fontSize: 11 }}>
                          {shortDate(c.asserted_at)} {c.byline && c.byline.length > 0 && `· by ${c.byline.join(', ')}`}
                        </div>
                        <div>{c.claim_text}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Documents tab ─────────────────────────────────────────────────────────

function DocumentsRegion({ canEdit }: { canEdit: boolean }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pendingOnly) params.set('pending', '1');
      const res = await fetch('/api/archive/documents?' + params.toString());
      const j = await res.json();
      setDocuments(j.documents || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pendingOnly]);

  async function runIngestion(id: string, force = false) {
    setIngestingId(id);
    try {
      const url = '/api/archive/documents/' + id + '/ingest' + (force ? '?force=1' : '');
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json();
        alert('Ingestion failed: ' + (j.error || res.status));
      }
      await load();
    } finally {
      setIngestingId(null);
    }
  }

  function passChip(passStatus: any) {
    if (!passStatus) return <span style={{ fontSize: 10, padding: '1px 5px', background: '#eee', color: '#666', borderRadius: 3 }}>—</span>;
    const colors: Record<string, [string, string]> = {
      completed: ['#dcfce7', '#166534'],
      running: ['#fef9c3', '#854d0e'],
      failed: ['#fee2e2', '#991b1b'],
      pending: ['#e5e7eb', '#374151'],
    };
    const [bg, fg] = colors[passStatus.status] || ['#eee', '#666'];
    return <span title={passStatus.error || ''} style={{ fontSize: 10, padding: '1px 5px', background: bg, color: fg, borderRadius: 3 }}>{passStatus.status}</span>;
  }

  return (
    <div style={panel()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Documents</h2>
        <label style={{ fontSize: 13, color: '#666' }}>
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Pending ingestion only
        </label>
      </div>
      {loading && <div style={{ color: '#666', fontSize: 13 }}>Loading…</div>}
      {!loading && documents.length === 0 && (
        <div style={{ color: '#666', fontSize: 13 }}>No documents{pendingOnly && ' pending'}.</div>
      )}
      {!loading && documents.length > 0 && (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '6px 4px' }}>Title / file</th>
              <th style={{ padding: '6px 4px' }}>Byline</th>
              <th style={{ padding: '6px 4px' }}>Date</th>
              <th style={{ padding: '6px 4px' }}>Beat</th>
              <th style={{ padding: '6px 4px' }}>Counts</th>
              <th style={{ padding: '6px 4px' }}>Ingestion</th>
              {canEdit && <th style={{ padding: '6px 4px' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '6px 4px' }}>
                  <div style={{ fontWeight: 500 }}>{d.title || d.filename}</div>
                  {d.title && <div style={{ color: '#999', fontSize: 11 }}>{d.filename}</div>}
                </td>
                <td style={{ padding: '6px 4px', color: '#666' }}>
                  {d.byline && d.byline.length > 0 ? d.byline.join(', ') : '—'}
                </td>
                <td style={{ padding: '6px 4px', color: '#666' }}>{shortDate(d.published_at)}</td>
                <td style={{ padding: '6px 4px', color: '#666' }}>{d.beat || '—'}</td>
                <td style={{ padding: '6px 4px', color: '#666', fontSize: 11 }}>
                  {d.mention_count}m / {d.relationship_count}r / {d.claim_count}c
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {['metadata', 'ner', 'relations', 'claims'].map((p) => (
                      <span key={p} title={p}>{passChip(d.ingestion?.[p])}</span>
                    ))}
                  </div>
                </td>
                {canEdit && (
                  <td style={{ padding: '6px 4px' }}>
                    <button
                      disabled={ingestingId === d.id}
                      onClick={() => runIngestion(d.id, false)}
                      style={{ padding: '3px 8px', fontSize: 11, background: '#0066cc', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                    >
                      {ingestingId === d.id ? '…' : 'Ingest'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Entity types tab ──────────────────────────────────────────────────────

function TypesRegion({ entityTypes, canEdit, onTypeAdded }: { entityTypes: EntityType[]; canEdit: boolean; onTypeAdded: (t: EntityType) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [promptHint, setPromptHint] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/archive/entity-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, label, promptHint, description }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      onTypeAdded(j);
      setShowForm(false);
      setSlug(''); setLabel(''); setPromptHint(''); setDescription('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const universal = entityTypes.filter((t) => t.kind === 'universal');
  const newsroom = entityTypes.filter((t) => t.kind === 'newsroom');

  return (
    <div style={panel()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Entity types</h2>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} style={{ padding: '6px 12px', fontSize: 13, background: '#0066cc', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>+ Add custom type</button>
        )}
      </div>

      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        Universal types are extracted by wikineural on every document. Newsroom-specific types are extracted by Haiku using your prompt hint — useful for beat-specific entities (e.g. "mining company", "court case", "tribal authority").
      </p>

      {showForm && (
        <form onSubmit={submit} style={{ marginBottom: 16, padding: 14, background: '#fafafa', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: 12 }}>Slug<br />
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mining_company" required style={{ width: '100%', padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }} />
              <span style={{ fontSize: 11, color: '#999' }}>lowercase, alphanumeric + underscore</span>
            </label>
            <label style={{ fontSize: 12 }}>Label<br />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mining company" required style={{ width: '100%', padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }} />
            </label>
          </div>
          <label style={{ fontSize: 12, display: 'block', marginTop: 10 }}>Prompt hint (zero-shot label for Haiku)<br />
            <input value={promptHint} onChange={(e) => setPromptHint(e.target.value)} placeholder='mining or extractives company headquartered in or operating in Africa' required style={{ width: '100%', padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }} />
          </label>
          <label style={{ fontSize: 12, display: 'block', marginTop: 10 }}>Description (optional)<br />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What kind of entity this covers" style={{ width: '100%', padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, marginTop: 2 }} />
          </label>
          {error && <div style={{ marginTop: 10, color: '#900', fontSize: 12 }}>{error}</div>}
          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={saving} style={{ padding: '6px 12px', fontSize: 13, background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Add type'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ marginLeft: 8, padding: '6px 12px', fontSize: 13, background: 'none', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Newsroom-specific ({newsroom.length})</h3>
      {newsroom.length === 0 ? (
        <div style={{ color: '#999', fontSize: 12, marginBottom: 14 }}>None yet. Add one above to extract beat-specific entities on the next ingestion run.</div>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: 'none', fontSize: 13, marginBottom: 14 }}>
          {newsroom.map((t) => (
            <li key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <strong>{t.label}</strong> <code style={{ fontSize: 11, color: '#666' }}>({t.slug})</code>
              <div style={{ color: '#666', fontSize: 12 }}>{t.prompt_hint}</div>
              {t.description && <div style={{ color: '#999', fontSize: 11 }}>{t.description}</div>}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Universal ({universal.length})</h3>
      <ul style={{ paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
        {universal.map((t) => (
          <li key={t.id} style={{ padding: '4px 0', color: '#666' }}>
            <strong style={{ color: '#222' }}>{t.label}</strong> <code style={{ fontSize: 11 }}>({t.slug})</code> <span style={{ fontSize: 11, color: '#999' }}>· {t.source_model}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
