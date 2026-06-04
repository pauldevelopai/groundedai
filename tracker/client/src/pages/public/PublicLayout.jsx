import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';

// Lazy so the chatbot bundle doesn't block first paint — it's only used
// once a visitor clicks the 💬 button.
const PublicChatbot = lazy(() => import('./PublicChatbot.jsx'));

const navStyle = ({ isActive }) => ({
  padding: '8px 12px',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  fontWeight: isActive ? 600 : 500,
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
  background: isActive ? '#EEF2FF' : 'transparent',
  textDecoration: 'none',
});

export default function PublicLayout() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Grounded: AI Legal — Global AI Lawsuits & Regulations Tracker';
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--content-bg)', color: 'var(--text-primary)',
    }}>
      <header style={{
        borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <Link to="/legal" style={{ textDecoration: 'none', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Grounded: AI&nbsp;Legal</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Global AI lawsuits &amp; regulations tracker
              </span>
            </div>
          </Link>
          <nav style={{ display: 'flex', gap: 4 }}>
            <NavLink to="/legal" end style={navStyle}>Home</NavLink>
            <NavLink to="/legal/lawsuits" style={navStyle}>Lawsuits</NavLink>
            <NavLink to="/legal/regulations" style={navStyle}>Regulations</NavLink>
            <NavLink to="/legal/explore" style={navStyle}>Connections</NavLink>
            <NavLink to="/legal/use-cases" style={navStyle}>Use cases</NavLink>
            <NavLink to="/legal/sources" style={navStyle}>Sources</NavLink>
            <NavLink to="/legal/submit" style={navStyle}>Submit</NavLink>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <Outlet />
      </main>

      <Suspense fallback={null}><PublicChatbot /></Suspense>

      <footer style={{
        borderTop: '1px solid var(--border-color)', background: 'var(--card-bg)',
        padding: '20px 24px', marginTop: 48,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span>© Grounded · <a href="https://grounded.developai.co.za" style={{ color: 'var(--text-secondary)' }}>grounded.developai.co.za</a></span>
          <span>Tracking global AI lawsuits and regulations</span>
        </div>
      </footer>
    </div>
  );
}
