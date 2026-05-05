// /builder/new — minimal form. Creates an empty workflow then redirects
// into the canvas editor at /builder/:id.

'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          definition: { nodes: [], edges: [], inputs: [], output: { node: '', field: '' } },
          is_shared: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create workflow');
        setSubmitting(false);
        return;
      }
      router.push(`/builder/${data.workflow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h1>New workflow</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Election fact-check"
            required
            autoFocus
            style={{ padding: 10, fontSize: 15, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-sentence summary shown in the workflow library"
            rows={3}
            style={{ padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, resize: 'vertical' }}
          />
        </label>
        {error && <p style={{ color: '#b00', fontSize: 14, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            style={{
              padding: '10px 16px',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Creating…' : 'Create and open canvas'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/builder')}
            style={{ padding: '10px 16px', background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
