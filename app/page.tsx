import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
      <h1>Anchor</h1>
      <p>Newsroom AI platform — GROUNDED, Develop AI.</p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <li>
          <Link href="/builder" style={{ color: '#0066cc', fontSize: 16 }}>Builder mode →</Link>
          <span style={{ color: '#666', fontSize: 13, marginLeft: 8 }}>compose workflows from agents</span>
        </li>
      </ul>
    </main>
  );
}
