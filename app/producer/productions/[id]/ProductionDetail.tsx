// ProductionDetail — render the structured Producer output per format,
// offer status transitions (generated → edited → approved → published)
// and a delete action. Edit-the-output is intentionally not a textarea;
// the structured-JSON detail panel lets editors see the script as the
// studio team will use it. Free-form editor notes live alongside.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type Format = 'radio_script' | 'podcast_outline' | 'video_brief' | 'audio_assembly' | 'vertical_video' | 'audiogram';
type Status = 'pending' | 'generated' | 'edited' | 'approved' | 'published' | 'failed';

type Production = {
  id: string;
  title: string;
  format: Format;
  source_text: string;
  archive_context: string | null;
  output: Record<string, unknown>;
  edited_output: Record<string, unknown> | null;
  duration_estimate_seconds: number | null;
  notes: string | null;
  status: Status;
  duration_ms: number | null;
  cost_usd: string | number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const FORMAT_LABELS: Record<Format, string> = {
  radio_script: '🎙️ Radio script',
  podcast_outline: '🎧 Podcast outline',
  video_brief: '🎬 Video brief',
  audio_assembly: '🔊 Audio assembly',
  vertical_video: '📱 Vertical video',
  audiogram: '📊 Audiogram',
};

type Asset = {
  id: string;
  kind: 'audio' | 'video' | 'image';
  format: string;
  storage_path: string;
  bytes: number | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function ProductionDetail({
  production,
  assets,
  canEdit,
  role,
}: {
  production: Production;
  assets: Asset[];
  canEdit: boolean;
  role: 'user' | 'builder' | 'admin';
}) {
  const router = useRouter();
  const [p, setP] = useState(production);
  const [assetList, setAssetList] = useState<Asset[]>(assets);
  const [notes, setNotes] = useState(production.notes || '');
  const [busy, setBusy] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/producer/productions/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Save failed');
        return;
      }
      setP(data.production);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/producer/productions/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/producer');
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Delete failed');
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setBusy(false);
    }
  }

  const view = (p.edited_output as Record<string, unknown>) || (p.output as Record<string, unknown>);

  async function generateRender(format: 'audio_assembly' | 'audiogram' | 'vertical_video') {
    setAssembling(true);
    setError(null);
    try {
      const res = await fetch('/api/producer/productions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, source_production_id: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssembling(false);
    }
  }
  void setAssetList; // surface helper for future inline mutations

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/producer" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>← All productions</Link>
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

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>{p.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {FORMAT_LABELS[p.format]} · status: <strong>{p.status}</strong>
          {p.duration_estimate_seconds && <> · ~{Math.round(p.duration_estimate_seconds / 60)} min</>}
          {p.duration_ms && <> · generated in {(p.duration_ms / 1000).toFixed(1)}s</>}
        </p>

        {p.error && (
          <p style={{ color: '#b00', fontSize: 13, marginTop: 14, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
            <strong>Error:</strong> {p.error}
          </p>
        )}

        {/* Structured output, per-format renderer */}
        <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
          {p.format === 'radio_script' && <RadioScriptView output={view} />}
          {p.format === 'podcast_outline' && <PodcastOutlineView output={view} />}
          {p.format === 'video_brief' && <VideoBriefView output={view} />}
          {!['radio_script', 'podcast_outline', 'video_brief'].includes(p.format) && (
            <pre style={{ fontSize: 12, background: '#fafafa', padding: 14, borderRadius: 4, overflow: 'auto' }}>{JSON.stringify(view, null, 2)}</pre>
          )}
        </section>

        {/* Render & assets: per-format generate buttons + inline players */}
        {(p.format === 'radio_script' || p.format === 'video_brief' ||
          p.format === 'audio_assembly' || p.format === 'audiogram' || p.format === 'vertical_video' ||
          assetList.length > 0) && (
          <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
            <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>
              Render &amp; preview
            </h2>

            {canEdit && p.format === 'radio_script' && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => generateRender('audio_assembly')}
                  disabled={assembling}
                  style={{ padding: '8px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', opacity: assembling ? 0.5 : 1 }}
                >
                  {assembling ? 'Working…' : '🔊 Generate audio'}
                </button>
                <button
                  onClick={() => generateRender('audiogram')}
                  disabled={assembling || !assetList.some(a => a.kind === 'audio')}
                  title={!assetList.some(a => a.kind === 'audio') ? 'Generate audio first' : ''}
                  style={{ padding: '8px 14px', background: 'white', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 4, fontSize: 13, cursor: 'pointer', opacity: assembling ? 0.5 : 1 }}
                >
                  📊 Generate audiogram
                </button>
              </div>
            )}

            {canEdit && p.format === 'video_brief' && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: '#444', margin: '0 0 6px' }}>
                  Render the shot list as a 1080×1920 MP4. Uses local-only TTS for voice-over and procedural gradient backgrounds + on-screen text. Replace with real B-roll later by uploading.
                </p>
                <button
                  onClick={() => generateRender('vertical_video')}
                  disabled={assembling}
                  style={{ padding: '8px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', opacity: assembling ? 0.5 : 1 }}
                >
                  {assembling ? 'Rendering…' : '📱 Generate vertical video'}
                </button>
              </div>
            )}

            {canEdit && p.format === 'audio_assembly' && (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => generateRender('audiogram')}
                  disabled={assembling}
                  style={{ padding: '8px 14px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', opacity: assembling ? 0.5 : 1 }}
                >
                  {assembling ? 'Rendering…' : '📊 Generate audiogram'}
                </button>
              </div>
            )}

            {error && <p style={{ color: '#b00', fontSize: 12, margin: '0 0 8px' }}>{error}</p>}

            {assetList.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No assets generated yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assetList.map(a => (
                  <li key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                      <strong style={{ marginRight: 6 }}>{a.kind === 'video' ? (a.format === 'mp4' ? '🎬' : '📽') : '🔊'} {a.kind}/{a.format}</strong>
                      {a.duration_seconds && <>{Math.round(a.duration_seconds)}s · </>}
                      {a.bytes ? <>{a.bytes >= 1024 * 1024 ? `${(a.bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(a.bytes / 1024)} KB`}</> : null}
                      {(() => {
                        const log = (a.metadata as { segment_log?: Array<{ engine?: string; tts_engine?: string }> }).segment_log;
                        if (!Array.isArray(log) || log.length === 0) return null;
                        const engines = [...new Set(log.map(s => s.engine || s.tts_engine).filter(Boolean))];
                        return engines.length ? <> · TTS: {engines.join(', ')}</> : null;
                      })()}
                      {(() => {
                        const cs = (a.metadata as { caption_source?: string }).caption_source;
                        return cs ? <> · captions: {cs}</> : null;
                      })()}
                      {' · '}
                      <a href={`/api/producer/assets/${a.id}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>download</a>
                    </div>
                    {a.kind === 'audio' ? (
                      <audio controls preload="metadata" style={{ width: '100%' }}>
                        <source src={`/api/producer/assets/${a.id}`} type={a.format === 'wav' ? 'audio/wav' : 'audio/mpeg'} />
                      </audio>
                    ) : a.kind === 'video' ? (
                      <video controls preload="metadata" style={{ width: '100%', maxHeight: 540, background: '#000', borderRadius: 4 }}>
                        <source src={`/api/producer/assets/${a.id}`} type="video/mp4" />
                      </video>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Editor notes + status actions */}
        {canEdit && (
          <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
            <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>Editor</h2>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What still needs work? Cuts, pickups, follow-ups."
                style={{ width: '100%', fontSize: 13, padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginTop: 4 }}
              />
              <button
                onClick={() => patch({ notes })}
                disabled={busy || notes === (p.notes || '')}
                style={{ marginTop: 6, padding: '6px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', opacity: notes === (p.notes || '') ? 0.5 : 1 }}
              >
                Save notes
              </button>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <StatusButton current={p.status} target="approved" label="Mark approved" onClick={() => patch({ status: 'approved' })} disabled={busy} />
              <StatusButton current={p.status} target="published" label="Mark published" onClick={() => patch({ status: 'published' })} disabled={busy} />
              <button onClick={onDelete} disabled={busy} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', color: '#b00', border: '1px solid #b00', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                Delete production
              </button>
            </div>
            {error && <p style={{ color: '#b00', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
          </section>
        )}

        {/* Source + archive context for reference */}
        <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 10px' }}>Source</h2>
          <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{p.source_text}</p>
          {p.archive_context && (
            <>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', margin: '14px 0 6px' }}>Archive context the producer wove in</h3>
              <pre style={{ fontSize: 12, color: '#444', background: '#fafafa', padding: 10, borderRadius: 4, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{p.archive_context}</pre>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusButton({
  current,
  target,
  label,
  onClick,
  disabled,
}: {
  current: Status;
  target: Status;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const isCurrent = current === target;
  return (
    <button
      onClick={onClick}
      disabled={disabled || isCurrent}
      style={{
        padding: '6px 12px',
        background: isCurrent ? '#1a5d1a' : '#0066cc',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        fontSize: 12,
        cursor: disabled || isCurrent ? 'not-allowed' : 'pointer',
        opacity: disabled || isCurrent ? 0.6 : 1,
      }}
    >
      {isCurrent ? `✓ ${target}` : label}
    </button>
  );
}

// ─── Per-format renderers ──────────────────────────────────────────────────

function RadioScriptView({ output }: { output: Record<string, unknown> }) {
  const o = output as {
    title?: string;
    estimated_duration_seconds?: number;
    intro?: string;
    segments?: Array<{ type?: string; speaker?: string; duration_seconds?: number; text?: string; description?: string; cue_in?: string; cue_out?: string }>;
    outro?: string;
    production_notes?: string;
  };
  return (
    <div>
      {o.title && <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>{o.title}</h2>}
      {o.estimated_duration_seconds !== undefined && <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Target runtime: ~{Math.round(o.estimated_duration_seconds / 60)} min ({o.estimated_duration_seconds}s)</p>}
      {o.intro && (
        <Block label="Intro">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{o.intro}</p>
        </Block>
      )}
      {Array.isArray(o.segments) && o.segments.length > 0 && (
        <Block label={`Segments (${o.segments.length})`}>
          {o.segments.map((s, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #eee' }}>
              <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {s.type === 'host' ? 'Host' : s.type === 'actuality' ? 'Actuality' : s.type === 'music_sting' ? 'Music sting' : s.type || 'Segment'}
                {s.speaker && <> · {s.speaker}</>}
                {s.duration_seconds !== undefined && <> · {s.duration_seconds}s</>}
              </div>
              {s.text && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', lineHeight: 1.5, fontSize: 14 }}>{s.text}</p>}
              {s.description && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#444', fontStyle: 'italic' }}>{s.description}</p>}
              {(s.cue_in || s.cue_out) && (
                <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>
                  Cue in: <em>{s.cue_in || '—'}</em> · Cue out: <em>{s.cue_out || '—'}</em>
                </p>
              )}
            </div>
          ))}
        </Block>
      )}
      {o.outro && <Block label="Outro"><p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{o.outro}</p></Block>}
      {o.production_notes && <Block label="Production notes"><p style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#444', fontSize: 13 }}>{o.production_notes}</p></Block>}
    </div>
  );
}

function PodcastOutlineView({ output }: { output: Record<string, unknown> }) {
  const o = output as {
    title?: string;
    show_format?: string;
    estimated_duration_minutes?: number;
    cold_open?: string;
    segments?: Array<{ title?: string; duration_minutes?: number; talking_points?: string[]; tape_or_b_roll?: string; transition?: string }>;
    sponsor_break_after_segment_indices?: number[];
    outro?: string;
    show_notes_draft?: string;
  };
  return (
    <div>
      {o.title && <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>{o.title}</h2>}
      <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
        {o.show_format && <>Format: {o.show_format} · </>}
        {o.estimated_duration_minutes && <>~{o.estimated_duration_minutes} min</>}
      </p>
      {o.cold_open && <Block label="Cold open"><p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{o.cold_open}</p></Block>}
      {Array.isArray(o.segments) && o.segments.length > 0 && (
        <Block label={`Segments (${o.segments.length})`}>
          {o.segments.map((s, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #eee' }}>
              <h4 style={{ fontSize: 14, margin: '0 0 4px' }}>{i + 1}. {s.title || `Segment ${i + 1}`}{s.duration_minutes !== undefined && <span style={{ color: '#666', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>({s.duration_minutes} min)</span>}</h4>
              {Array.isArray(s.talking_points) && s.talking_points.length > 0 && (
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                  {s.talking_points.map((tp, j) => <li key={j}>{tp}</li>)}
                </ul>
              )}
              {s.tape_or_b_roll && <p style={{ fontSize: 13, color: '#444', margin: '6px 0 0' }}>📼 <em>{s.tape_or_b_roll}</em></p>}
              {s.transition && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>→ {s.transition}</p>}
              {Array.isArray(o.sponsor_break_after_segment_indices) && o.sponsor_break_after_segment_indices.includes(i) && (
                <p style={{ fontSize: 12, color: '#8a5400', margin: '6px 0 0', fontStyle: 'italic' }}>⏸ Sponsor break</p>
              )}
            </div>
          ))}
        </Block>
      )}
      {o.outro && <Block label="Outro"><p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{o.outro}</p></Block>}
      {o.show_notes_draft && <Block label="Show notes (draft)"><p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, color: '#444' }}>{o.show_notes_draft}</p></Block>}
    </div>
  );
}

function VideoBriefView({ output }: { output: Record<string, unknown> }) {
  const o = output as {
    title?: string;
    format?: string;
    estimated_duration_seconds?: number;
    hook?: string;
    shots?: Array<{ index?: number; duration_seconds?: number; visual?: string; voiceover?: string; on_screen_text?: string; source_note?: string }>;
    broll_notes?: string;
    music_mood?: string;
    captions_style?: string;
    outro_card?: string;
  };
  return (
    <div>
      {o.title && <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>{o.title}</h2>}
      <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
        {o.format && <>Format: {o.format} · </>}
        {o.estimated_duration_seconds !== undefined && <>{o.estimated_duration_seconds}s</>}
      </p>
      {o.hook && <Block label="Hook (first 3 seconds)"><p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{o.hook}</p></Block>}
      {Array.isArray(o.shots) && o.shots.length > 0 && (
        <Block label={`Shot list (${o.shots.length})`}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, textTransform: 'uppercase', color: '#666', letterSpacing: 0.5 }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 30 }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 50 }}>Sec</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Visual</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Voice / on-screen</th>
              </tr>
            </thead>
            <tbody>
              {o.shots.map((s, i) => (
                <tr key={i} style={{ verticalAlign: 'top' }}>
                  <td style={{ padding: '6px', borderTop: '1px solid #eee', color: '#666' }}>{s.index ?? i + 1}</td>
                  <td style={{ padding: '6px', borderTop: '1px solid #eee', color: '#666' }}>{s.duration_seconds ?? '—'}</td>
                  <td style={{ padding: '6px', borderTop: '1px solid #eee' }}>
                    <div>{s.visual}</div>
                    {s.source_note && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>📁 {s.source_note}</div>}
                  </td>
                  <td style={{ padding: '6px', borderTop: '1px solid #eee' }}>
                    {s.voiceover && <div><strong style={{ fontSize: 11, color: '#0044aa' }}>VO:</strong> {s.voiceover}</div>}
                    {s.on_screen_text && <div style={{ marginTop: 4 }}><strong style={{ fontSize: 11, color: '#8a5400' }}>Caption:</strong> {s.on_screen_text}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}
      {o.broll_notes && <Block label="B-roll notes"><p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13, color: '#444' }}>{o.broll_notes}</p></Block>}
      {(o.music_mood || o.captions_style) && (
        <Block label="Style">
          {o.music_mood && <p style={{ margin: '0 0 4px', fontSize: 13 }}><strong>Music mood:</strong> {o.music_mood}</p>}
          {o.captions_style && <p style={{ margin: 0, fontSize: 13 }}><strong>Captions:</strong> {o.captions_style}</p>}
        </Block>
      )}
      {o.outro_card && <Block label="Outro card"><p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>{o.outro_card}</p></Block>}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #eee' }}>
      <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 6px' }}>{label}</h3>
      {children}
    </div>
  );
}
