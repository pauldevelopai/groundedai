// / — landing. Signed-out users see a brief intro + sign in. Signed-in users
// land on /run by default; builders/admins can jump straight to /builder.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/app/lib/session';

export default async function Home() {
  const session = await getCurrentSession();
  if (session) {
    if (session.role === 'user') redirect('/run');
    // Builders and admins go to Builder by default but the link to /run is everywhere.
    redirect('/builder');
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '60px auto' }}>
      <h1 style={{ marginTop: 0 }}>Anchor</h1>
      <p style={{ color: '#444', fontSize: 15 }}>
        Shared AI infrastructure for African newsrooms. Compose AI workflows from prebuilt agents; run them from a simple workflow list.
      </p>
      <p>
        <Link href="/login" style={{ color: '#0066cc', fontSize: 16 }}>Sign in →</Link>
      </p>
    </main>
  );
}
