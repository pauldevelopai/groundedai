// File: app/components/GlobalNav.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ExternalToolLinks from '@/app/components/ExternalToolLinks';

export default function GlobalNav({
  currentApp,
  role = 'user',
  currentUserEmail,
  currentNewsroomName,
  children,
}: {
  currentApp: string | React.ReactNode;
  role?: 'user' | 'builder' | 'admin';
  currentUserEmail?: string;
  currentNewsroomName?: string;
  children?: React.ReactNode;
}) {
  const [agentsOpen, setAgentsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks outside it (or presses Escape).
  // Hover is still wired below for fast pointer access on desktop, but click
  // is the primary trigger — covers touch devices + users who click first.
  useEffect(() => {
    if (!agentsOpen) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setAgentsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAgentsOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [agentsOpen]);

  return (
    <header style={{ 
      background: '#fafafa', 
      borderBottom: '1px solid #e5e5e5', 
      padding: '10px 20px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12,
      minHeight: 52 
    }}>
      <Link href="/" style={{ fontSize: 16, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Grounded</Link>
      <span style={{ color: '#999' }}>/</span>
      <span style={{ fontSize: 14 }}>{currentApp}</span>

      <span style={{ flex: 1 }} />

      {children}

      {(currentUserEmail && currentNewsroomName) && (
        <span style={{ fontSize: 12, color: '#888', marginRight: 16 }}>
          {currentUserEmail} · {currentNewsroomName}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
        <Link href="/run" style={{ color: '#0066cc', textDecoration: 'none' }}>Run →</Link>

        {/* Dropdown for Agents & Tools — opens on click (touch-friendly)
            and on hover for fast desktop access. Closes on outside click,
            Escape, or item selection. */}
        <div
          ref={dropdownRef}
          style={{ position: 'relative' }}
          onMouseEnter={() => setAgentsOpen(true)}
          onMouseLeave={() => setAgentsOpen(false)}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={agentsOpen}
            onClick={() => setAgentsOpen((open) => !open)}
            style={{
              background: 'none', border: 'none', padding: '4px 0',
              color: '#0066cc', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            Agents & Tools <span style={{ fontSize: 10, opacity: 0.7 }}>{agentsOpen ? '▲' : '▼'}</span>
          </button>

          {agentsOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                background: 'white', border: '1px solid #ddd', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, width: 380,
                zIndex: 100, marginTop: 4
              }}
              onClick={() => setAgentsOpen(false)}
            >
              <MenuLink href="/verifier" title="Verifier" desc="Fact-check & verify claims" />
              <MenuLink href="/archive" title="Archivist" desc="Past coverage search" />
              <MenuLink href="/research" title="Research" desc="Topic dossiers & intel" />
              <MenuLink href="/translation" title="Translator" desc="Local language drafts" />
              <MenuLink href="/audience" title="Audience Analytics Manager" desc="Analytics & consultations" />
              <MenuLink href="/social" title="Social media listener" desc="Foreign-agent post detection" />
              <MenuLink href="/producer" title="Audio & Video Producer" desc="Scripts, audio, vertical video" />
              <MenuLink href="/fundraiser" title="Fundraiser" desc="Donor reports & grants" />
              <MenuLink href="/operations" title="Operations Manager" desc="Calendar, freelancers, finance" />
              <MenuLink href="/distribution" title="Digital News Gatherer" desc="Inbound submissions triage" />
              <MenuLink href="/learning" title="AI Legal & Regulation Tracker" desc="AI law, ethics, governance feed" />
            </div>
          )}
        </div>

        <Link href="/newsroom" style={{ color: '#0066cc', textDecoration: 'none' }}>Profile →</Link>
        
        {(role === 'builder' || role === 'admin') && (
          <Link href="/builder" style={{ color: '#0066cc', textDecoration: 'none', fontWeight: 500 }}>Builder →</Link>
        )}
        {role === 'admin' && (
          <Link href="/team" style={{ color: '#0066cc', textDecoration: 'none' }}>Team →</Link>
        )}

        <div style={{ display: 'flex', gap: 12, borderLeft: '1px solid #ddd', paddingLeft: 16 }}>
          <Link href="/learning" style={{ color: '#666', textDecoration: 'none' }}>Learning</Link>
          <Link href="/guide" style={{ color: '#666', textDecoration: 'none' }}>Help</Link>
        </div>

        <div style={{ display: 'flex', gap: 12, borderLeft: '1px solid #ddd', paddingLeft: 16 }}>
          <ExternalToolLinks size="md" marginLeft={0} />
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ 
      padding: '8px 12px', display: 'block', borderRadius: 6, textDecoration: 'none', color: 'inherit'
    }}
    onMouseEnter={e => e.currentTarget.style.background = '#f5f7fa'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{desc}</div>
    </Link>
  );
}
