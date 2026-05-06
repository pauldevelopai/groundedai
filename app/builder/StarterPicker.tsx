// StarterPicker — opens when the Builder clicks "+ New". Shows the catalog
// of newsroom problems-and-products grouped by category. Pick one (just one),
// the workflow is created with the starter's problem framing + starter graph,
// and the canvas opens.

'use client';

import { useEffect, useMemo, useState } from 'react';

export type Starter = {
  slug: string;
  title: string;
  description: string;
  problem_statement: string;
  problem_category: string;
  user_instructions: string;
  definition: unknown;
};

const CATEGORY_COLOURS: Record<string, { bg: string; fg: string }> = {
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
};

const CATEGORY_ORDER = [
  'Production',
  'Fact-checking',
  'Archive',
  'Audience research',
  'Social media',
  'Translation',
  'Personalisation',
  'Delivery',
  'Editorial operations',
  'Revenue',
];

export default function StarterPicker({
  onPick,
  onBlank,
  onCancel,
  picking,
}: {
  onPick: (s: Starter) => void;
  onBlank: () => void;
  onCancel: () => void;
  picking: boolean;
}) {
  const [starters, setStarters] = useState<Starter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/workflows/starters')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.starters) {
          setError(d.error || 'Could not load the catalog');
          return;
        }
        setStarters(d.starters as Starter[]);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!starters) return new Map<string, Starter[]>();
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? starters.filter(
          (s) =>
            s.title.toLowerCase().includes(f) ||
            s.description.toLowerCase().includes(f) ||
            s.problem_statement.toLowerCase().includes(f) ||
            s.problem_category.toLowerCase().includes(f)
        )
      : starters;
    const map = new Map<string, Starter[]>();
    for (const s of filtered) {
      if (!map.has(s.problem_category)) map.set(s.problem_category, []);
      map.get(s.problem_category)!.push(s);
    }
    return map;
  }, [starters, filter]);

  const orderedCategories = useMemo(() => {
    const present = [...grouped.keys()];
    return present.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [grouped]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 18, 28, 0.55)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: '4vh 24px 6vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: 'white',
          width: '100%',
          maxWidth: 1040,
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '28px 32px 18px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>What problem would you like to solve?</h1>
            <p style={{ margin: '6px 0 0', color: '#444', fontSize: 15 }}>
              <strong>What product would you like to build?</strong> Pick one. Anchor will set up the workflow with the right problem framing, instructions for your team, and a starter graph you can refine.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={picking}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer', padding: '4px 10px' }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: '14px 32px 0' }}>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by keyword (e.g. podcast, fact-check, donor, translation)…"
            style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ padding: '20px 32px 32px' }}>
          {error && <p style={{ color: '#b00', fontSize: 14 }}>{error}</p>}
          {!starters && !error && <p style={{ color: '#666', fontSize: 14 }}>Loading catalog…</p>}

          {orderedCategories.length === 0 && starters && !error && (
            <p style={{ color: '#666', fontSize: 14 }}>No starters match "{filter}".</p>
          )}

          {orderedCategories.map((category) => {
            const items = grouped.get(category) || [];
            const c = CATEGORY_COLOURS[category] || { bg: '#eee', fg: '#555' };
            return (
              <section key={category} style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: c.fg, margin: '0 0 8px' }}>
                  {category}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {items.map((s) => (
                    <button
                      key={s.slug}
                      disabled={picking}
                      onClick={() => onPick(s)}
                      style={{
                        textAlign: 'left',
                        background: 'white',
                        border: `1px solid ${c.bg}`,
                        borderRadius: 8,
                        padding: 14,
                        cursor: picking ? 'wait' : 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'transform 0.05s, box-shadow 0.1s',
                        opacity: picking ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (picking) return;
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = c.fg;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = c.bg;
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
                      <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.45 }}>{s.description}</p>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer
          style={{
            borderTop: '1px solid #eee',
            padding: '14px 32px',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <span style={{ color: '#666' }}>
            Don't see what you need? Start blank and use <em>Describe &amp; build</em> on the canvas — Anchor will compose a workflow from your description.
          </span>
          <button
            onClick={onBlank}
            disabled={picking}
            style={{ background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: picking ? 'wait' : 'pointer' }}
          >
            Start blank →
          </button>
        </footer>
      </div>
    </div>
  );
}
