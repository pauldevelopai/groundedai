// / — the GROUNDED Hub. Signed-out users see a brief intro + sign in.
// Signed-in users see the three pillars: Builder (the existing app), Nodes
// (newsroom mini-apps, run online or cloned locally), and Tracker (the AI
// Legal front). Builder is live today; Nodes and Tracker light up as their
// integration tracks land (see docs/HUB_TRACKER_NODES_PLAN.md).

import Link from 'next/link';
import { getCurrentSession } from '@/app/lib/session';

export default async function Home() {
  const session = await getCurrentSession();

  if (!session) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '60px auto' }}>
        <h1 style={{ marginTop: 0 }}>Grounded</h1>
        <p style={{ color: '#444', fontSize: 15 }}>
          Shared AI infrastructure for African newsrooms. Compose AI workflows from prebuilt agents; run them from a simple workflow list.
        </p>
        <p>
          <Link href="/login" style={{ color: '#0066cc', fontSize: 16 }}>Sign in →</Link>
        </p>
      </main>
    );
  }

  // Builder is the existing GROUNDED app. Users land in run-mode; builders and
  // admins get the authoring canvas.
  const builderHref = session.role === 'user' ? '/run' : '/builder';

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 920, margin: '48px auto' }}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Grounded</h1>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 28 }}>
        Shared AI infrastructure for African newsrooms.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <PillarCard
          href={builderHref}
          title="Builder"
          desc="Compose and run AI workflows from prebuilt agents — the core Grounded platform."
        />
        <PillarCard
          href="/nodes"
          title="Nodes"
          desc="Newsroom mini-apps. Run the latest online, or clone the repo to run on a laptop."
        />
        <PillarCard
          href="/tracker/legal"
          title="Tracker"
          desc="The AI Legal tracker — lawsuits, regulations, and use-cases across jurisdictions."
        />
      </div>
    </main>
  );
}

function PillarCard({
  href,
  title,
  desc,
  comingSoon = false,
}: {
  href?: string;
  title: string;
  desc: string;
  comingSoon?: boolean;
}) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>{title}</span>
        {comingSoon && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            color: '#a06a00', background: '#fff4e0', borderRadius: 999, padding: '2px 8px',
          }}>
            Coming soon
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#666', margin: '8px 0 0', lineHeight: 1.5 }}>{desc}</p>
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: 'block', border: '1px solid #e5e5e5', borderRadius: 12,
    padding: '20px 22px', minHeight: 120, background: 'white',
  };

  if (comingSoon || !href) {
    return <div style={{ ...baseStyle, opacity: 0.65, cursor: 'default' }}>{inner}</div>;
  }

  return (
    <Link href={href} style={{ ...baseStyle, textDecoration: 'none', color: 'inherit' }}>
      {inner}
    </Link>
  );
}
