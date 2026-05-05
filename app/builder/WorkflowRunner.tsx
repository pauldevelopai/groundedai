// WorkflowRunner — the User-mode-style runner UI. Renders the workflow's
// problem statement, user-facing instructions, an input form (one field per
// exposed workflow input), a Run button, and the rendered output.
//
// Used inside the Builder as a Test-as-user side panel, AND will be reused
// in /run (Slice 5c) for the actual User mode. Same component, two callers.

'use client';

import { useEffect, useState, FormEvent } from 'react';

export type RunnerWorkflow = {
  id: string;
  name: string;
  problem_statement: string | null;
  problem_category: string | null;
  user_instructions: string | null;
  definition: {
    inputs: { name: string; to: { node: string; field: string } }[];
    nodes?: { id: string; agent_slug: string }[];
  };
};

export type AgentInputMeta = Record<string, {
  required?: boolean;
  label?: string;
  description?: string;
  type?: string;
}>;

export type AgentCatalogEntry = {
  slug: string;
  inputs: AgentInputMeta;
};

export default function WorkflowRunner({
  workflow,
  agents,
  unsavedDraftDefinition,
  onClose,
  compact,
}: {
  workflow: RunnerWorkflow;
  /**
   * The agent catalog so the runner can look up label/required/type per
   * input. Builder passes its in-memory list; User mode loads it from
   * /api/agents on mount if not supplied.
   */
  agents?: AgentCatalogEntry[];
  /**
   * If provided, run uses this in-memory definition instead of the persisted
   * one. Builder uses this so testing reflects unsaved canvas changes.
   * User mode passes nothing — runs the persisted definition.
   */
  unsavedDraftDefinition?: { inputs: { name: string; to: { node: string; field: string } }[]; nodes?: { id: string; agent_slug: string }[] };
  onClose?: () => void;
  compact?: boolean;
}) {
  const def = unsavedDraftDefinition || workflow.definition;
  const inputDefs = def.inputs || [];

  // Look up { required, label, description, type } per workflow-input field
  // by following the mapping back to the target node's agent + input.
  const [agentCatalog, setAgentCatalog] = useState<AgentCatalogEntry[] | null>(agents ?? null);
  useEffect(() => {
    if (agentCatalog) return;
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => setAgentCatalog(d.agents || []))
      .catch(() => setAgentCatalog([]));
  }, [agentCatalog]);

  // Per workflow input name (deduped), pick the strictest required + first label/desc found.
  const inputMeta = new Map<string, { required: boolean; label: string; description: string; type: string }>();
  if (agentCatalog) {
    const agentBySlug = new Map(agentCatalog.map((a) => [a.slug, a]));
    const nodes = def.nodes || workflow.definition.nodes || [];
    const nodeBySlug = new Map(nodes.map((n) => [n.id, n.agent_slug]));
    for (const inp of inputDefs) {
      const slug = nodeBySlug.get(inp.to.node);
      if (!slug) continue;
      const agent = agentBySlug.get(slug);
      if (!agent) continue;
      const fld = agent.inputs[inp.to.field];
      if (!fld) continue;
      const cur = inputMeta.get(inp.name);
      const label = fld.label || inp.name;
      if (cur) {
        inputMeta.set(inp.name, {
          required: cur.required || !!fld.required,
          label: cur.label,
          description: cur.description,
          type: cur.type,
        });
      } else {
        inputMeta.set(inp.name, {
          required: !!fld.required,
          label,
          description: fld.description || '',
          type: fld.type || 'longtext',
        });
      }
    }
  }
  // Fallback for input names without resolved meta (no catalog yet, or unknown agent).
  const inputNames = Array.from(new Set(inputDefs.map((i) => i.name)));
  for (const n of inputNames) {
    if (!inputMeta.has(n)) inputMeta.set(n, { required: true, label: n, description: '', type: 'longtext' });
  }

  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ output: unknown; durationMs: number; totalCost: { costUsd: number } } | null>(null);

  const missingRequired = inputNames.some((n) => {
    const meta = inputMeta.get(n);
    return meta?.required && !values[n]?.trim();
  });

  async function onRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRunning(true);
    setResult(null);
    try {
      // Strip empty optional values so the agent can apply its own defaults.
      const submitInputs: Record<string, string> = {};
      for (const n of inputNames) {
        const v = values[n]?.trim();
        if (v) submitInputs[n] = v;
      }
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: submitInputs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Run failed');
      } else {
        setResult({ output: data.output, durationMs: data.durationMs, totalCost: data.totalCost });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, sans-serif', background: '#fff' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' }}>
        <strong style={{ fontSize: 14 }}>{workflow.name}</strong>
        {workflow.problem_category && (
          <span style={{ fontSize: 11, padding: '2px 8px', background: '#e8f1ff', color: '#0044aa', borderRadius: 10 }}>
            {workflow.problem_category}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 14, color: '#666', cursor: 'pointer' }}>
            ✕
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? 14 : 20 }}>
        {workflow.problem_statement && (
          <section style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '0 0 6px' }}>
              What this solves
            </h4>
            <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5 }}>{workflow.problem_statement}</p>
          </section>
        )}

        {workflow.user_instructions && (
          <section style={{ marginBottom: 18, padding: 12, background: '#f7f7f7', borderRadius: 6, borderLeft: '3px solid #0066cc' }}>
            <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '0 0 6px' }}>
              How to use this
            </h4>
            <p style={{ fontSize: 14, color: '#333', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{workflow.user_instructions}</p>
          </section>
        )}

        <form onSubmit={onRun}>
          {inputNames.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>This workflow takes no inputs — just press Run.</p>
          ) : (
            inputNames.map((name) => {
              const meta = inputMeta.get(name) || { required: true, label: name, description: '', type: 'longtext' };
              return (
                <label key={name} style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                    {meta.label}
                    {!meta.required && <span style={{ color: '#999', fontWeight: 400, marginLeft: 6 }}>(optional)</span>}
                  </span>
                  {meta.description && (
                    <span style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>{meta.description}</span>
                  )}
                  <textarea
                    value={values[name] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                    rows={meta.type === 'string' ? 1 : 4}
                    required={meta.required}
                    placeholder={meta.required ? `Provide ${meta.label.toLowerCase()}…` : 'Leave blank to skip'}
                    style={{ width: '100%', fontSize: 14, padding: 10, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </label>
              );
            })
          )}
          <button
            type="submit"
            disabled={running || missingRequired}
            style={{
              padding: '10px 18px',
              background: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: running ? 'wait' : 'pointer',
              opacity: running || missingRequired ? 0.5 : 1,
            }}
          >
            {running ? 'Running…' : 'Run'}
          </button>
          {error && <p style={{ color: '#b00', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </form>

        {result && (
          <section style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777', margin: '0 0 8px' }}>
              Output
            </h4>
            <RenderedOutput output={result.output} />
            <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
              Completed in {(result.durationMs / 1000).toFixed(1)}s · cost ${result.totalCost.costUsd.toFixed(4)}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function RenderedOutput({ output }: { output: unknown }) {
  // Pretty rendering for known agent shapes; JSON fallback otherwise.
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    // Drafter-style: { drafts: [{text, rationale}], editorial_note }
    if (Array.isArray(o.drafts)) {
      return (
        <div>
          {(o.drafts as Array<{ text?: string; rationale?: string }>).map((d, i) => (
            <div key={i} style={{ padding: 12, marginBottom: 10, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' }}>
              <p style={{ fontSize: 14, margin: '0 0 6px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{d.text}</p>
              {d.rationale && <p style={{ fontSize: 12, color: '#666', margin: 0, fontStyle: 'italic' }}>{d.rationale}</p>}
            </div>
          ))}
          {typeof o.editorial_note === 'string' && o.editorial_note.length > 0 && (
            <p style={{ fontSize: 12, color: '#888', marginTop: 8, fontStyle: 'italic' }}>{o.editorial_note}</p>
          )}
        </div>
      );
    }
    // Verifier-style: { claims: [{claim, verdict, confidence, evidence, sources}], ai_likelihood, overall_assessment }
    if (Array.isArray(o.claims)) {
      return (
        <div>
          {typeof o.overall_assessment === 'string' && o.overall_assessment.length > 0 && (
            <p style={{ fontSize: 14, marginBottom: 12 }}>{o.overall_assessment}</p>
          )}
          {(o.claims as Array<{ claim?: string; verdict?: string; confidence?: number; evidence?: string }>).map((c, i) => (
            <div key={i} style={{ padding: 10, marginBottom: 8, border: '1px solid #ddd', borderRadius: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.claim}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                <strong style={{ color: c.verdict === 'supported' ? '#0a0' : c.verdict === 'disputed' ? '#b00' : '#888' }}>
                  {c.verdict}
                </strong> {typeof c.confidence === 'number' ? `(${(c.confidence * 100).toFixed(0)}%)` : ''}
              </div>
              {c.evidence && <p style={{ fontSize: 12, color: '#444', margin: '6px 0 0' }}>{c.evidence}</p>}
            </div>
          ))}
        </div>
      );
    }
  }
  return (
    <pre style={{ fontSize: 12, background: '#111', color: '#0f0', padding: 12, borderRadius: 4, overflow: 'auto', maxHeight: 400 }}>
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}
