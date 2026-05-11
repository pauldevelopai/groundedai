// ProducerIndex — list of productions + inline new-production form.

'use client';

import { useState, useEffect, FormEvent } from 'react';
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
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Distributor →</Link>
        <Link href="/social" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Social →</Link>
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/learning" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Learning →</Link>
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
          Producer turns articles into broadcast-ready scripts, podcast outlines, and video briefs — written in your newsroom&apos;s voice (from your <Link href="/newsroom" style={{ color: '#0066cc' }}>profile</Link>). Open any radio script and click <strong>Generate audio</strong> to assemble it into a WAV using local-only TTS + procedural music stings. Vertical video and audiograms land in Slice 13.
        </p>

        {canCreate && <TranscribePanel />}

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

// ─── Transcribe panel (one-off Whisper) ────────────────────────────────────
type TranscriptRow = {
  id: string;
  filename: string | null;
  duration_seconds: number | null;
  language: string | null;
  status: 'pending' | 'transcribed' | 'failed';
  duration_ms: number | null;
  error: string | null;
  text_length: number;
  created_at: string;
};

function TranscribePanel() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<TranscriptRow[]>([]);
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  const [openText, setOpenText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/producer/transcribe');
      const data = await res.json();
      if (!cancelled && res.ok) setList(data.transcripts || []);
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('language', language);
      const res = await fetch('/api/producer/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      // Reload list
      const lr = await fetch('/api/producer/transcribe');
      const ld = await lr.json();
      setList(ld.transcripts || []);
      setOpenTranscript(data.transcriptId);
      setOpenText(data.text);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function viewTranscript(id: string) {
    setOpenTranscript(id);
    setOpenText('Loading…');
    const res = await fetch(`/api/producer/transcripts/${id}`);
    const data = await res.json();
    setOpenText(res.ok ? (data.transcript?.text || '(empty)') : (data.error || 'Failed to load'));
  }

  return (
    <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 style={{ fontSize: 14, margin: 0 }}>🎤 Transcribe audio</h2>
          <p style={{ fontSize: 12, color: '#666', margin: '2px 0 0' }}>
            Whisper-base runs locally — first run downloads ~150 MB into the HuggingFace cache, then everything stays on your machine.
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)} style={{ padding: '6px 12px', background: 'white', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
          {open ? 'Hide' : 'Open'}
        </button>
      </div>
      {open && (
        <>
          <form onSubmit={submit} style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span>Audio file</span>
              <input type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.aac" onChange={e => setFile(e.target.files?.[0] || null)} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span>Language</span>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: 6, fontSize: 12, border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="en">English</option>
                <option value="zu">isiZulu</option>
                <option value="xh">isiXhosa</option>
                <option value="af">Afrikaans</option>
                <option value="sn">Shona</option>
                <option value="ny">Chichewa</option>
                <option value="auto">Auto-detect</option>
              </select>
            </label>
            <button type="submit" disabled={!file || busy} style={{ padding: '6px 14px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Transcribing…' : 'Transcribe'}
            </button>
            {err && <span style={{ color: '#b00', fontSize: 12 }}>{err}</span>}
          </form>

          {list.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
              {list.map(t => (
                <li key={t.id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong>{t.filename || '(untitled)'}</strong>
                    <span style={{ color: '#666', marginLeft: 6 }}>
                      {t.language || '?'} · {t.duration_seconds ? `${Math.round(t.duration_seconds)}s` : 'unknown'}
                      {t.duration_ms ? ` · ran in ${(t.duration_ms / 1000).toFixed(1)}s` : ''}
                      {t.text_length > 0 ? ` · ${t.text_length} chars` : ''}
                    </span>
                    {t.error && <div style={{ color: '#b00', marginTop: 2 }}>{t.error}</div>}
                  </div>
                  <button onClick={() => viewTranscript(t.id)} style={{ background: 'white', border: '1px solid #d0d0d0', padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}

          {openTranscript && openText && (
            <div style={{ marginTop: 12, padding: 10, background: '#fafbfc', borderRadius: 4, maxHeight: 280, overflow: 'auto' }}>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{openText}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
