// /run — User mode index. Mobile-friendly list of workflows the signed-in
// user is assigned to, grouped by problem category. Click one → /run/[id].
//
// Visibility: workflows where the current user has a row in
// workflow_assignments. No role-based bypass — even admins must self-assign
// to see a workflow in User mode. (They use /builder to inspect / test.)

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

type RunCard = {
  id: string;
  name: string;
  problem_statement: string | null;
  problem_category: string | null;
  newsroom_name: string;
  is_shared: boolean;
  is_own_newsroom: boolean;
};

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  Personalisation: { bg: '#fde7f3', fg: '#a02b6f' },
  Revenue: { bg: '#e7f6e7', fg: '#1a5d1a' },
  Production: { bg: '#fff2d6', fg: '#8a5400' },
  Delivery: { bg: '#e0f0ff', fg: '#0044aa' },
  'Social media': { bg: '#e8e3ff', fg: '#5a3a99' },
  'Audience research': { bg: '#dbf3f3', fg: '#0a6363' },
  'Fact-checking': { bg: '#ffe6e6', fg: '#a02020' },
  Translation: { bg: '#f0ebe0', fg: '#7a5800' },
  Archive: { bg: '#e8eef5', fg: '#3a4a5d' },
  'Editorial operations': { bg: '#f4f0e8', fg: '#5d4a3a' },
  Other: { bg: '#eee', fg: '#555' },
};

export default async function RunIndex() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/run');

  const { rows } = await pool.query<RunCard>(
    `SELECT w.id, w.name, w.problem_statement, w.problem_category,
            n.name AS newsroom_name, w.is_shared,
            (w.newsroom_id = $2) AS is_own_newsroom
       FROM workflow_assignments a
       JOIN workflows w ON w.id = a.workflow_id
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE a.user_id = $1
      ORDER BY w.problem_category NULLS LAST, w.updated_at DESC`,
    [session.userId, session.newsroomId]
  );

  const { rows: userRows } = await pool.query(
    `SELECT u.display_name, u.email, n.name AS newsroom_name
       FROM users u JOIN newsrooms n ON n.id = u.newsroom_id
      WHERE u.id = $1`,
    [session.userId]
  );
  const me = userRows[0];

  // Group by category, "Uncategorised" bucket for the rest.
  const grouped = new Map<string, RunCard[]>();
  for (const w of rows) {
    const key = w.problem_category || 'Uncategorised';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(w);
  }

  const isBuilderOrAdmin = session.role === 'builder' || session.role === 'admin';

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
        <strong style={{ fontSize: 16 }}>Anchor</strong>
        <span style={{ color: '#999' }}>/</span>
        <span style={{ fontSize: 14 }}>Run</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#666' }}>
          {me?.display_name || me?.email} · {me?.newsroom_name}
        </span>
        <Link href="/newsroom" style={{ fontSize: 13, color: '#0066cc' }}>Profile →</Link>
        <Link href="/verifier" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Verifier →</Link>
        <Link href="/research" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Research →</Link>
        <Link href="/translation" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Translator →</Link>
        <Link href="/producer" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Producer →</Link>
        <Link href="/audience" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Audience →</Link>
        <Link href="/fundraiser" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Fundraiser →</Link>
        <Link href="/operations" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Operations →</Link>
        <Link href="/distribution" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Distributor →</Link>
        <Link href="/social" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Social →</Link>
        {isBuilderOrAdmin && (
          <Link href="/builder" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Builder →</Link>
        )}
        <Link href="/learning" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Learning →</Link>
        <Link href="/guide" style={{ fontSize: 13, color: '#0066cc', marginLeft: 12 }}>Help →</Link>
        <span style={{ marginLeft: 14, paddingLeft: 12, borderLeft: '1px solid #ddd' }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </span>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>
          Hi{me?.display_name ? ` ${me.display_name.split(' ')[0]}` : ''} — pick a workflow
        </h1>
        <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
          These are the AI workflows your newsroom has set up for you. Pick one to get started.
        </p>

        {rows.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: 30, marginTop: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 15, margin: '0 0 8px' }}>No workflows assigned to you yet.</p>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
              Ask your newsroom's AI champion to add you to one. {isBuilderOrAdmin && (
                <>Or <Link href="/builder" style={{ color: '#0066cc' }}>open the Builder →</Link></>
              )}
            </p>
          </div>
        ) : (
          [...grouped.entries()].map(([category, items]) => (
            <section key={category} style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 13, textTransform: 'uppercase', color: '#666', letterSpacing: 0.5, margin: '0 0 10px' }}>
                {category}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {items.map((w) => {
                  const colour = CATEGORY_COLORS[w.problem_category || 'Other'] || CATEGORY_COLORS.Other;
                  return (
                    <Link
                      key={w.id}
                      href={`/run/${w.id}`}
                      style={{
                        display: 'block',
                        background: 'white',
                        border: '1px solid #e5e5e5',
                        borderRadius: 8,
                        padding: 14,
                        textDecoration: 'none',
                        color: 'inherit',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                      }}
                    >
                      {w.problem_category && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            background: colour.bg,
                            color: colour.fg,
                            borderRadius: 10,
                            display: 'inline-block',
                            marginBottom: 8,
                          }}
                        >
                          {w.problem_category}
                        </span>
                      )}
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{w.name}</div>
                      {w.problem_statement && (
                        <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.4 }}>{w.problem_statement}</p>
                      )}
                      {!w.is_own_newsroom && (
                        <p style={{ fontSize: 11, color: '#888', marginTop: 8, marginBottom: 0 }}>
                          shared from {w.newsroom_name}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
