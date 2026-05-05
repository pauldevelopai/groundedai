// /builder — Builder mode index. Lists workflows visible to the user
// (own newsroom + cross-newsroom shared) and offers "+ New workflow".

import Link from 'next/link';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

type WorkflowRow = {
  id: string;
  newsroom_id: string;
  newsroom_name: string;
  name: string;
  slug: string;
  trigger_phrase: string | null;
  description: string | null;
  is_shared: boolean;
  updated_at: string;
};

export default async function BuilderIndex() {
  const session = await getCurrentSession();
  if (!session) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
        <h1>Builder</h1>
        <p>You need to sign in to use the Builder.</p>
        <p style={{ color: '#666', fontSize: 14 }}>
          POST your credentials to <code>/api/auth/login</code> first. (A login page lands in Slice 6.)
        </p>
      </main>
    );
  }

  const { rows } = await pool.query<WorkflowRow>(
    `SELECT w.id, w.newsroom_id, n.name AS newsroom_name, w.name, w.slug,
            w.trigger_phrase, w.description, w.is_shared, w.updated_at
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.newsroom_id = $1 OR w.is_shared = TRUE
      ORDER BY (w.newsroom_id = $1) DESC, w.updated_at DESC`,
    [session.newsroomId]
  );

  const own = rows.filter((r) => r.newsroom_id === session.newsroomId);
  const shared = rows.filter((r) => r.newsroom_id !== session.newsroomId);

  const canEdit = session.role === 'builder' || session.role === 'admin';

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Builder</h1>
        {canEdit && (
          <Link
            href="/builder/new"
            style={{
              padding: '8px 14px',
              background: '#111',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            + New workflow
          </Link>
        )}
      </header>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Your workflows</h2>
        {own.length === 0 ? (
          <p style={{ color: '#666' }}>No workflows yet. {canEdit ? 'Click "+ New workflow" to start.' : 'Ask your AI champion to build one.'}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {own.map((w) => (
              <WorkflowCard key={w.id} w={w} editable={canEdit} />
            ))}
          </ul>
        )}
      </section>

      {shared.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Shared library</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {shared.map((w) => (
              <WorkflowCard key={w.id} w={w} editable={false} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function WorkflowCard({ w, editable }: { w: WorkflowRow; editable: boolean }) {
  return (
    <li style={{ border: '1px solid #ddd', borderRadius: 6, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong style={{ fontSize: 16 }}>{w.name}</strong>
          <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>
            {w.is_shared ? 'shared' : 'private'} · {w.newsroom_name}
          </span>
        </div>
        <Link href={`/builder/${w.id}`} style={{ fontSize: 13, color: '#0066cc' }}>
          {editable ? 'Edit →' : 'View →'}
        </Link>
      </div>
      {w.description && <p style={{ color: '#444', margin: '6px 0 0', fontSize: 14 }}>{w.description}</p>}
      {w.trigger_phrase && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#666' }}>
          Trigger: <code style={{ background: '#f3f3f3', padding: '2px 6px', borderRadius: 3 }}>{w.trigger_phrase}</code>
        </p>
      )}
    </li>
  );
}
