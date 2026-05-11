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
  const [selected, setSelected] = useState<Starter | null>(null);

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
        {selected ? (
          <ConfirmStarter
            starter={selected}
            onConfirm={() => onPick(selected)}
            onBack={() => setSelected(null)}
            picking={picking}
          />
        ) : (
          <>
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
              <strong>What product would you like to build?</strong> Pick one. Grounded will set up the workflow with the right problem framing, instructions for your team, and a starter graph you can refine.
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
                      onClick={() => setSelected(s)}
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
            Don't see what you need? Start blank and use <em>Describe &amp; build</em> on the canvas — Grounded will compose a workflow from your description.
          </span>
          <button
            onClick={onBlank}
            disabled={picking}
            style={{ background: 'transparent', color: '#0066cc', border: '1px solid #0066cc', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: picking ? 'wait' : 'pointer' }}
          >
            Start blank →
          </button>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}

function ConfirmStarter({
  starter,
  onConfirm,
  onBack,
  picking,
}: {
  starter: Starter;
  onConfirm: () => void;
  onBack: () => void;
  picking: boolean;
}) {
  type WfDef = {
    nodes?: Array<{ id: string; agent_slug: string }>;
    edges?: Array<unknown>;
    inputs?: Array<{ name: string }>;
  };
  const def = starter.definition as WfDef;
  const nodeCount = def.nodes?.length ?? 0;
  const edgeCount = def.edges?.length ?? 0;
  const inputs = def.inputs ?? [];
  const inputNames = Array.from(new Set(inputs.map((i) => i.name)));

  const colour = CATEGORY_COLOURS[starter.problem_category] || { bg: '#eee', fg: '#555' };

  return (
    <>
      <header style={{ padding: '28px 32px 14px', borderBottom: '1px solid #eee' }}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 10px',
            background: colour.bg,
            color: colour.fg,
            borderRadius: 10,
            display: 'inline-block',
            marginBottom: 10,
          }}
        >
          {starter.problem_category}
        </span>
        <h1 style={{ margin: 0, fontSize: 24 }}>Do you want to create a workflow template to help with this problem?</h1>
      </header>

      <div style={{ padding: '20px 32px 8px' }}>
        <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>{starter.title}</h2>
        <p style={{ margin: '0 0 16px', color: '#555', fontSize: 14 }}>{starter.description}</p>

        <section style={{ background: '#f8f5ff', border: '1px solid #d6c8f5', borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5a3a99', margin: '0 0 6px' }}>
            The problem this solves
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: '#3d2c5e', lineHeight: 1.5 }}>{starter.problem_statement}</p>
        </section>

        <section style={{ background: '#f7f7f7', borderRadius: 8, padding: 14, marginBottom: 12, borderLeft: '3px solid #0066cc' }}>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 6px' }}>
            What the user will see when they run it
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{starter.user_instructions}</p>
        </section>

        <section style={{ background: '#fdfdfd', border: '1px solid #e5e5e5', borderRadius: 8, padding: 14 }}>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', margin: '0 0 6px' }}>
            What Grounded will set up
          </h3>
          {nodeCount > 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: '#333' }}>
              A starter graph with <strong>{nodeCount}</strong> agent node{nodeCount === 1 ? '' : 's'}
              {edgeCount > 0 ? <> wired by <strong>{edgeCount}</strong> connection{edgeCount === 1 ? '' : 's'}</> : ''}
              {inputNames.length > 0 ? (
                <>, taking <strong>{inputNames.length}</strong> input{inputNames.length === 1 ? '' : 's'} from the user (<code>{inputNames.join('</code>, <code>')}</code>)</>
              ) : null}
              . You can refine everything on the canvas after.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: '#333' }}>
              An empty canvas with the problem framing pre-filled. Use <em>Describe &amp; build</em> to have Grounded compose the graph for you, or drag agents in manually.
            </p>
          )}
        </section>
      </div>

      <footer
        style={{
          borderTop: '1px solid #eee',
          padding: '14px 32px',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={onBack}
          disabled={picking}
          style={{ background: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: picking ? 'wait' : 'pointer' }}
        >
          ← Pick a different one
        </button>
        <button
          onClick={onConfirm}
          disabled={picking}
          style={{
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 18px',
            fontSize: 14,
            cursor: picking ? 'wait' : 'pointer',
            opacity: picking ? 0.6 : 1,
          }}
        >
          {picking ? 'Creating…' : 'Yes, create this workflow template'}
        </button>
      </footer>
    </>
  );
}
