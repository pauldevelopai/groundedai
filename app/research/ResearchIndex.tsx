// ResearchIndex — list of research dossiers in the caller's newsroom plus an
// inline "+ New dossier" form. Click a dossier to open it.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type DossierRow = {
  id: string;
  name: string;
  topic: string | null;
  description: string | null;
  status: 'open' | 'archived' | 'closed';
  document_count: number;
  entity_count: number;
  finding_count: number;
  updated_at: string;
};

export default function ResearchIndex({
  initialDossiers,
  canCreate,
  role,
}: {
  initialDossiers: DossierRow[];
  canCreate: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [dossiers, setDossiers] = useState(initialDossiers);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/research/dossiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), topic: topic.trim() || null, description: description.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create dossier');
        setCreating(false);
        return;
      }
      router.push(`/research/dossiers/${data.dossier.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setCreating(false);
    }
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
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
          Grounded
        </Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🔎 Research</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Research dossiers</h1>
          {canCreate && (
            <button
              onClick={() => setShowNew((s) => !s)}
              style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              {showNew ? 'Cancel' : '+ New dossier'}
            </button>
          )}
        </div>
        <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
          A dossier is the home for one investigation, story, or topic. Upload court filings, regulatory disclosures, financial documents, or any text you're researching — Grounded extracts entities, relationships, key claims, and follow-up questions you can act on.
        </p>

        {showNew && canCreate && (
          <form onSubmit={onCreate} style={{ background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Lusaka housing scandal" style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Topic (optional)</span>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Land tenure, public housing" style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Description (optional)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What you're trying to find out" style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical' }} />
            </label>
            {error && <p style={{ color: '#b00', fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={creating || !name.trim()} style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>
                {creating ? 'Creating…' : 'Create dossier'}
              </button>
            </div>
          </form>
        )}

        {dossiers.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 30, marginTop: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 15, margin: '0 0 8px' }}>No research dossiers yet.</p>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{canCreate ? 'Click "+ New dossier" above to start one.' : 'Ask a builder or admin to create one.'}</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
            {dossiers.map((d) => (
              <li key={d.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <Link href={`/research/dossiers/${d.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{d.name}</strong>
                    {d.topic && <span style={{ fontSize: 12, color: '#666' }}>· {d.topic}</span>}
                    {d.status !== 'open' && (
                      <span style={{ fontSize: 11, padding: '1px 8px', background: '#eee', color: '#666', borderRadius: 10 }}>
                        {d.status}
                      </span>
                    )}
                  </div>
                  {d.description && <p style={{ color: '#444', margin: '6px 0 0', fontSize: 13, lineHeight: 1.4 }}>{d.description}</p>}
                  <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#666' }}>
                    {d.document_count} doc{d.document_count === 1 ? '' : 's'} · {d.entity_count} entit{d.entity_count === 1 ? 'y' : 'ies'} · {d.finding_count} finding{d.finding_count === 1 ? '' : 's'} · last updated {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
