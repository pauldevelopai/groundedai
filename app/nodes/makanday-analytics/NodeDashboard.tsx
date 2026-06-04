'use client';

// Renders the vendored node's own vanilla-JS dashboard inside GROUNDED.
// Strategy: the server component (page.tsx) hands us the node's inline <style>,
// its <body> markup, and its app.js source. We mount the markup, install a
// fetch shim so the node's absolute /api/* calls reach the node-scoped,
// session-authenticated routes, then execute app.js (a classic script that
// reads the now-present DOM and calls boot()). GROUNDED chrome replaces the
// standalone runtime chrome.
import { useEffect } from 'react';

const API_BASE = '/nodes/makanday-analytics';

type Props = { styles: string; body: string; appJs: string };

export default function NodeDashboard({ styles, body, appJs }: Props) {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        return original(API_BASE + input, init);
      }
      return original(input, init);
    }) as typeof window.fetch;

    // app.js touches DOM elements at top level and calls boot() at the end, so
    // it must run after the markup is mounted and after the shim is installed.
    const script = document.createElement('script');
    script.textContent = appJs;
    document.body.appendChild(script);

    return () => {
      window.fetch = original;
      script.remove();
    };
  }, [appJs]);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#a89e88',
          background: '#16140f',
          borderBottom: '1px solid #3a352a',
          padding: '10px 26px',
        }}
      >
        <a href="/" style={{ color: '#e8a13a', textDecoration: 'none' }}>
          ← GROUNDED
        </a>
        <span> · Nodes · MakanDay Audience Signal</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
