// DossierDetail — manage documents in a dossier, view extracted entities/
// relationships/findings (Slice 6b populates these via the agent), view raw
// text of any document. Auto-refreshes after upload/delete via a server
// route fetch. Slice 6b adds the "Analyze with Researcher" button.

'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Dossier = {
  id: string;
  name: string;
  topic: string | null;
  description: string | null;
  status: 'open' | 'archived' | 'closed';
};
type Doc = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source_url: string | null;
  status: 'pending' | 'parsed' | 'analyzed' | 'failed';
  parse_error: string | null;
  uploaded_at: string;
  analyzed_at: string | null;
  text_length: number;
};
type Entity = {
  id: string;
  kind: string;
  name: string;
  role: string | null;
  mention_count: number;
  first_seen_doc_id: string | null;
  metadata: Record<string, unknown>;
};
type Relationship = {
  id: string;
  kind: string;
  evidence: string | null;
  from_entity_id: string;
  from_name: string;
  from_kind: string;
  to_entity_id: string;
  to_name: string;
  to_kind: string;
};
type Finding = {
  id: string;
  kind: 'claim' | 'question' | 'record_to_pull' | 'gap' | 'summary';
  body: string;
  rationale: string | null;
  source_doc_id: string | null;
  confidence: string | number | null;
  metadata: Record<string, unknown>;
};

const ENTITY_KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  person: { bg: '#fde7f3', fg: '#a02b6f' },
  organisation: { bg: '#e0f0ff', fg: '#0044aa' },
  place: { bg: '#dbf3f3', fg: '#0a6363' },
  date: { bg: '#fff2d6', fg: '#8a5400' },
  amount: { bg: '#e7f6e7', fg: '#1a5d1a' },
  event: { bg: '#e8e3ff', fg: '#5a3a99' },
};

const FINDING_LABELS: Record<Finding['kind'], string> = {
  claim: 'Key claims',
  question: 'Follow-up questions',
  record_to_pull: 'Records to pull',
  gap: 'Gaps to fill',
  summary: 'Summary',
};

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function DossierDetail({
  dossier,
  initialDocuments,
  initialEntities,
  initialRelationships,
  initialFindings,
  canEdit,
  role,
}: {
  dossier: Dossier;
  initialDocuments: Doc[];
  initialEntities: Entity[];
  initialRelationships: Relationship[];
  initialFindings: Finding[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch(`/api/research/dossiers/${dossier.id}`);
    const data = await res.json();
    if (res.ok) {
      setDocuments(data.documents);
    }
    router.refresh();
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/research/dossiers/${dossier.id}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
      } else {
        setInfo(`Uploaded "${data.document.filename}" (${data.document.text_length} chars extracted)`);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onDeleteDoc(docId: string, filename: string) {
    if (!window.confirm(`Delete "${filename}"? Extracted entities and findings stay in the dossier; only this document is removed.`)) return;
    const res = await fetch(`/api/research/dossiers/${dossier.id}/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) {
      setDocuments((ds) => ds.filter((d) => d.id !== docId));
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Delete failed');
    }
  }

  const findingsByKind = new Map<Finding['kind'], Finding[]>();
  for (const f of initialFindings) {
    if (!findingsByKind.has(f.kind)) findingsByKind.set(f.kind, []);
    findingsByKind.get(f.kind)!.push(f);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e5e5',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link href="/research" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>← All dossiers</Link>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 26 }}>{dossier.name}</h1>
        {dossier.topic && <p style={{ color: '#666', fontSize: 14, margin: 0 }}>{dossier.topic}</p>}
        {dossier.description && <p style={{ color: '#444', fontSize: 14, marginTop: 8 }}>{dossier.description}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
          {/* LEFT: Documents */}
          <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Documents ({documents.length})</h2>
              {canEdit && (
                <label style={{ padding: '6px 12px', background: '#0066cc', color: '#fff', borderRadius: 6, fontSize: 13, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.5 : 1 }}>
                  {uploading ? 'Uploading…' : '+ Upload PDF/DOCX/TXT'}
                  <input
                    ref={fileInput}
                    type="file"
                    onChange={onFileChange}
                    accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown"
                    disabled={uploading}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
            {error && <p style={{ color: '#b00', fontSize: 13, marginBottom: 8 }}>{error}</p>}
            {info && <p style={{ color: '#0a0', fontSize: 13, marginBottom: 8 }}>{info}</p>}
            {documents.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                No documents yet. {canEdit ? 'Upload one to get started.' : 'A builder needs to upload one.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {documents.map((d) => (
                  <li key={d.id} style={{ padding: '10px 0', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {fmtBytes(d.size_bytes)} · {d.mime_type.split('/').pop()} ·
                        {' '}
                        <span style={{
                          color: d.status === 'failed' ? '#b00' : d.status === 'parsed' || d.status === 'analyzed' ? '#0a0' : '#888',
                        }}>{d.status}</span>
                        {d.text_length > 0 && ` · ${d.text_length.toLocaleString()} chars`}
                      </div>
                      {d.parse_error && (
                        <div style={{ fontSize: 11, color: '#b00', marginTop: 2 }}>{d.parse_error}</div>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => onDeleteDoc(d.id, d.filename)}
                        style={{ background: 'transparent', border: 'none', color: '#b00', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                      >
                        delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <p style={{ marginTop: 14, padding: '8px 10px', background: '#fff8e6', border: '1px dashed #d8c478', borderRadius: 6, fontSize: 12, color: '#6b5800' }}>
                ⏳ <strong>Coming next:</strong> Click "Analyze with Researcher" to extract entities, relationships, and follow-up questions across all parsed documents.
              </p>
            )}
          </section>

          {/* RIGHT: Findings + Entities */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
              <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Findings ({initialFindings.length})</h2>
              {initialFindings.length === 0 ? (
                <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                  Once documents are uploaded and analyzed, key claims, follow-up questions, suggested records, and gaps will appear here.
                </p>
              ) : (
                <>
                  {(['summary', 'claim', 'question', 'record_to_pull', 'gap'] as Finding['kind'][]).map((k) => {
                    const items = findingsByKind.get(k) || [];
                    if (items.length === 0) return null;
                    return (
                      <div key={k} style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 6px' }}>
                          {FINDING_LABELS[k]} ({items.length})
                        </h3>
                        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
                          {items.map((f) => (
                            <li key={f.id} style={{ marginBottom: 4 }}>
                              {f.body}
                              {f.confidence !== null && (
                                <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>
                                  {Math.round(Number(f.confidence) * 100)}%
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
              <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Entities ({initialEntities.length})</h2>
              {initialEntities.length === 0 ? (
                <p style={{ color: '#888', fontSize: 13, margin: 0 }}>People, organisations, places, dates, and amounts pulled from the documents will list here.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {initialEntities.map((e) => {
                    const c = ENTITY_KIND_COLORS[e.kind] || { bg: '#eee', fg: '#555' };
                    return (
                      <li key={e.id} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, padding: '1px 8px', background: c.bg, color: c.fg, borderRadius: 10 }}>{e.kind}</span>
                        <strong>{e.name}</strong>
                        {e.role && <span style={{ color: '#666', fontSize: 12 }}>· {e.role}</span>}
                        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 11 }}>{e.mention_count}×</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {initialRelationships.length > 0 && (
              <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18 }}>
                <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Relationships ({initialRelationships.length})</h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {initialRelationships.map((r) => (
                    <li key={r.id} style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
                      <strong>{r.from_name}</strong>
                      <span style={{ color: '#666', margin: '0 6px' }}>— {r.kind} →</span>
                      <strong>{r.to_name}</strong>
                      {r.evidence && <p style={{ fontSize: 12, color: '#666', margin: '2px 0 0' }}>{r.evidence}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
