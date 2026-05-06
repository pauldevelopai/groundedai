// /audience/focus-groups/:id — full focus-group transcript view.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABELS: Record<string, string> = {
  headline: 'Headline',
  lede: 'Lede',
  angle: 'Angle',
  full_draft: 'Full draft',
};

type TranscriptEntry = {
  persona_id?: string;
  persona_name?: string;
  first_reaction?: string;
  would_share?: boolean;
  would_finish_reading?: boolean;
  confidence?: number;
  concerns?: string[];
};

export default async function FocusGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/audience/focus-groups/${id}`);
  if (!UUID_RE.test(id)) notFound();

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, title, test_material, test_material_kind, context_brief,
            persona_ids, transcript, summary, recommendations, status,
            duration_ms, cost_usd, error, created_at, updated_at
       FROM focus_group_sessions WHERE id = $1`,
    [id]
  );
  const s = rows[0];
  if (!s || s.newsroom_id !== session.newsroomId) notFound();

  // Hydrate persona names
  let personaById = new Map<string, { name: string; archetype: string }>();
  if (Array.isArray(s.persona_ids) && s.persona_ids.length > 0) {
    const pRes = await pool.query(
      `SELECT id, name, archetype FROM audience_personas WHERE id = ANY($1::uuid[])`,
      [s.persona_ids]
    );
    personaById = new Map(pRes.rows.map((r: { id: string; name: string; archetype: string }) => [r.id, { name: r.name, archetype: r.archetype }]));
  }

  const transcript = (Array.isArray(s.transcript) ? s.transcript : []) as TranscriptEntry[];
  const recommendations = (Array.isArray(s.recommendations) ? s.recommendations : []) as string[];

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f7f8fa' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/audience" style={{ fontSize: 14, color: '#0066cc', textDecoration: 'none' }}>← Audience</Link>
        <span style={{ flex: 1 }} />
        <Link href="/run" style={{ fontSize: 13, color: '#0066cc' }}>Run →</Link>
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>{s.title}</h1>
        <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
          {KIND_LABELS[s.test_material_kind] || s.test_material_kind} · {transcript.length} persona reaction{transcript.length === 1 ? '' : 's'}
          {s.duration_ms ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : ''}
          {' · status: '}
          <strong>{s.status}</strong>
        </p>

        <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 8px' }}>What was tested</h2>
          <pre style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>{s.test_material}</pre>
          {s.context_brief && (
            <>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', margin: '14px 0 6px' }}>Editor's brief</h3>
              <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.5 }}>{s.context_brief}</p>
            </>
          )}
        </section>

        {s.summary && (
          <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
            <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 8px' }}>Editor summary</h2>
            <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{s.summary}</p>
            {recommendations.length > 0 && (
              <>
                <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', margin: '14px 0 6px' }}>Recommended changes</h3>
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                  {recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            )}
          </section>
        )}

        <section style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 12px' }}>Persona reactions</h2>
          {transcript.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>No reactions captured.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {transcript.map((t, i) => {
                const meta = t.persona_id ? personaById.get(t.persona_id) : null;
                const name = meta?.name || t.persona_name || 'Persona';
                return (
                  <li key={i} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{name}{meta?.archetype ? <span style={{ color: '#666', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>· {meta.archetype}</span> : null}</strong>
                      <span style={{ fontSize: 11, color: '#666' }}>
                        {typeof t.confidence === 'number' && <>confidence {Math.round(t.confidence * 100)}%</>}
                      </span>
                    </div>
                    {t.first_reaction && <p style={{ fontSize: 14, margin: '6px 0', lineHeight: 1.5, color: '#333', fontStyle: 'italic' }}>"{t.first_reaction}"</p>}
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#444', marginTop: 4 }}>
                      {typeof t.would_share === 'boolean' && (
                        <span style={{ padding: '2px 8px', borderRadius: 10, background: t.would_share ? '#e7f6e7' : '#ffe6e6', color: t.would_share ? '#1a5d1a' : '#a02020' }}>
                          {t.would_share ? '✓ would share' : '✗ would not share'}
                        </span>
                      )}
                      {typeof t.would_finish_reading === 'boolean' && (
                        <span style={{ padding: '2px 8px', borderRadius: 10, background: t.would_finish_reading ? '#e0f0ff' : '#fff8e6', color: t.would_finish_reading ? '#0044aa' : '#8a5400' }}>
                          {t.would_finish_reading ? '✓ would finish' : '✗ would bounce'}
                        </span>
                      )}
                    </div>
                    {Array.isArray(t.concerns) && t.concerns.length > 0 && (
                      <ul style={{ paddingLeft: 18, margin: '6px 0 0', fontSize: 12, color: '#666' }}>
                        {t.concerns.map((c, j) => <li key={j}>{c}</li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {s.error && (
          <p style={{ color: '#b00', fontSize: 13, marginTop: 16, padding: 10, background: '#ffe6e6', border: '1px solid #f5a4a4', borderRadius: 6 }}>
            <strong>Error:</strong> {s.error}
          </p>
        )}
      </div>
    </main>
  );
}
