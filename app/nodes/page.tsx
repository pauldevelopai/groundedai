// /nodes — the Nodes directory. An open, growing list of AI functions for
// newsrooms: run the latest online inside GROUNDED, or clone the repo to run on
// a laptop. Driven by docs/nodes/registry.yaml. Per the 2026-05-25 product
// model, the operations tools Grounded ships with are surfaced here too — used
// directly, not (usually) as Builder workflow steps. (N5)
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentSession } from '@/app/lib/session';
import { listNodes } from '@/lib/nodes/registry';

export const dynamic = 'force-dynamic';

type RegistryNode = {
  slug: string;
  name?: string;
  repo?: string;
  status?: string;
  current_version?: string;
  born?: string;
  storage?: string;
  description?: string;
};

// Operations tools that ship with GROUNDED. Code lives in the Builder registry
// (category:'tool'); here they're presented as Nodes-directory entries the
// newsroom uses directly. Re-home is presentation-only — see HUB_TRACKER_NODES_PLAN.md.
const SHIPPED_TOOLS = [
  { name: 'Fundraiser', href: '/fundraiser', desc: 'Grant-writing: funder library + newsroom profile → first-draft applications with budget scaffolding.' },
  { name: 'Audience Analytics Manager', href: '/audience', desc: 'Interrogate your analytics; test a headline and sense-check a story angle against what has worked.' },
  { name: 'Operations Manager', href: '/operations', desc: 'Editorial calendar, freelancers, finance, performance metrics, contributor management — whole-org.' },
  { name: 'Digital Security Audit', href: '/security', desc: 'Audit the external AI/data tools you use against your jurisdiction’s data-protection law.' },
];

export default async function NodesDirectoryPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const nodes = listNodes() as RegistryNode[];

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 920, margin: '40px auto' }}>
      <p style={{ marginBottom: 18 }}>
        <Link href="/" style={{ color: '#0066cc', fontSize: 13, textDecoration: 'none' }}>← Grounded</Link>
      </p>
      <h1 style={{ margin: '0 0 4px' }}>Nodes</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 28, maxWidth: 680 }}>
        AI functions for newsrooms. Run the latest of each <b>online</b> inside Grounded, or{' '}
        <b>clone the repo</b> to run it on a laptop — same code, two runtimes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {nodes.map((n) => {
          const online = existsSync(join(process.cwd(), 'app', 'nodes', n.slug, 'page.tsx'));
          const repoUrl = n.repo ? `https://github.com/${n.repo}` : null;
          const repoName = n.repo ? n.repo.split('/').pop() : n.slug;
          return (
            <div key={n.slug} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: '#111' }}>{n.name ?? n.slug}</span>
                {n.status && <span style={statusBadge(n.status)}>{n.status}</span>}
              </div>
              <p style={{ fontSize: 13, color: '#666', margin: '8px 0 12px', lineHeight: 1.5 }}>
                {n.description ?? ''}
              </p>
              <div style={{ fontSize: 11, color: '#999', fontFamily: 'ui-monospace, monospace', marginBottom: 12 }}>
                {n.slug}{n.current_version ? ` · v${n.current_version}` : ''}{n.storage ? ` · ${n.storage}` : ''}
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {online ? (
                  <Link href={`/nodes/${n.slug}`} style={primaryLink}>Run online →</Link>
                ) : (
                  <span style={{ fontSize: 12, color: '#a06a00' }}>Online soon · standalone today</span>
                )}
                {repoUrl && (
                  <a href={repoUrl} target="_blank" rel="noopener noreferrer" style={secondaryLink}>
                    Repo ↗
                  </a>
                )}
              </div>

              {repoUrl && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>Clone &amp; run locally</summary>
                  <pre style={preStyle}>
{`git clone ${repoUrl}.git
cd ${repoName}
npm install
npm start`}
                  </pre>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <h2 style={{ margin: '40px 0 4px', fontSize: 18 }}>Ships with Grounded</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 18, maxWidth: 680 }}>
        Operations tools every newsroom gets out of the box. Use them directly, or wire them into a Builder workflow.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {SHIPPED_TOOLS.map((t) => (
          <Link key={t.href} href={t.href} style={{ ...cardStyle, textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{t.name}</span>
            <p style={{ fontSize: 13, color: '#666', margin: '8px 0 0', lineHeight: 1.5 }}>{t.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e5e5', borderRadius: 12, padding: '18px 20px', background: 'white',
};
const primaryLink: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#0066cc', textDecoration: 'none',
};
const secondaryLink: React.CSSProperties = {
  fontSize: 12, color: '#666', textDecoration: 'none',
};
const preStyle: React.CSSProperties = {
  background: '#f6f6f6', border: '1px solid #eee', borderRadius: 8, padding: '10px 12px',
  fontSize: 11.5, lineHeight: 1.6, marginTop: 8, overflowX: 'auto', fontFamily: 'ui-monospace, monospace',
};

function statusBadge(status: string): React.CSSProperties {
  const map: Record<string, string> = {
    pilot: '#0a7f3f', build: '#a06a00', graduated: '#5b21b6', concept: '#666', sunset: '#999',
  };
  const color = map[status] ?? '#666';
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    color, background: '#f3f3f3', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
  };
}
