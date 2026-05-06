// ProducerIndex — list of productions + inline new-production form.

'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Production = {
  id: string;
  title: string;
  format: 'radio_script' | 'podcast_outline' | 'video_brief' | 'audio_assembly' | 'vertical_video' | 'audiogram';
  status: 'pending' | 'generated' | 'edited' | 'approved' | 'published' | 'failed';
  duration_estimate_seconds: number | null;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const FORMAT_LABELS: Record<Production['format'], string> = {
  radio_script: '🎙️ Radio script',
  podcast_outline: '🎧 Podcast outline',
  video_brief: '🎬 Video brief',
  audio_assembly: '🔊 Audio assembly',
  vertical_video: '📱 Vertical video',
  audiogram: '📊 Audiogram',
};

const STATUS_COLOURS: Record<Production['status'], { bg: string; fg: string }> = {
  pending: { bg: '#eee', fg: '#555' },
  generated: { bg: '#e0f0ff', fg: '#0044aa' },
  edited: { bg: '#fff8e6', fg: '#8a5400' },
  approved: { bg: '#e7f6e7', fg: '#1a5d1a' },
  published: { bg: '#dbf3f3', fg: '#0a6363' },
  failed: { bg: '#ffe6e6', fg: '#a02020' },
};

export default function ProducerIndex({
  initialProductions,
  canCreate,
  role,
}: {
  initialProductions: Production[];
  canCreate: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [productions, setProductions] = useState(initialProductions);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<'radio_script' | 'podcast_outline' | 'video_brief'>('radio_script');
  const [sourceText, setSourceText] = useState('');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/producer/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          format,
          source_text: sourceText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not generate production');
        setSubmitting(false);
        return;
      }
      router.push(`/producer/productions/${data.productionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
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
        <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Anchor</Link>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>🎬 Producer</span>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Profile →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Productions</h1>
          {canCreate && (
            <button
              onClick={() => setShowNew((s) => !s)}
              style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              {showNew ? 'Cancel' : '+ New production'}
            </button>
          )}
        </div>
        <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
          Producer turns articles into broadcast-ready scripts, podcast outlines, and video briefs — written in your newsroom's voice (from your <Link href="/newsroom" style={{ color: '#0066cc' }}>profile</Link>). Audio assembly and vertical-video output land in Slices 12 and 13.
        </p>

        {showNew && canCreate && (
          <form onSubmit={onCreate} style={{ background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Format</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as 'radio_script' | 'podcast_outline' | 'video_brief')} style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, background: 'white' }}>
                <option value="radio_script">🎙️ Radio script — broadcast-ready</option>
                <option value="podcast_outline">🎧 Podcast outline — solo / two-host / interview</option>
                <option value="video_brief">🎬 Video brief — shot list + VO + on-screen text</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Title (optional)</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to '<format> — <today's date>'" style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span style={{ color: '#444' }}>Source article</span>
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={6} required minLength={30} placeholder="Paste the article, brief, or transcript Producer should work from." style={{ padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            </label>
            {error && <p style={{ color: '#b00', fontSize: 13, margin: 0 }}>{error}</p>}
            <button type="submit" disabled={submitting || sourceText.trim().length < 30} style={{ padding: '10px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: submitting ? 0.5 : 1, alignSelf: 'flex-start' }}>
              {submitting ? 'Generating — about 10–30s…' : 'Generate'}
            </button>
          </form>
        )}

        {productions.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 30, textAlign: 'center' }}>
            <p style={{ fontSize: 15, margin: '0 0 8px' }}>No productions yet.</p>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{canCreate ? 'Click "+ New production" to compose your first.' : 'A builder needs to compose one first.'}</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {productions.map((p) => {
              const c = STATUS_COLOURS[p.status];
              return (
                <li key={p.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                  <Link href={`/producer/productions/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 16 }}>{p.title}</strong>
                      <span style={{ fontSize: 11, padding: '2px 8px', background: c.bg, color: c.fg, borderRadius: 10 }}>{p.status}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
                      {FORMAT_LABELS[p.format]}
                      {p.duration_estimate_seconds && <> · ~{Math.round(p.duration_estimate_seconds / 60)} min</>}
                      {p.duration_ms && <> · generated in {(p.duration_ms / 1000).toFixed(1)}s</>}
                      {' · '}{new Date(p.created_at).toLocaleString()}
                    </p>
                    {p.error && <p style={{ fontSize: 11, color: '#b00', marginTop: 4 }}>{p.error}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
