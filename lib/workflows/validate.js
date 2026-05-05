// Light shape validation for a workflow's `definition` graph.
// Catches the shapes-of-things mistakes (missing required keys, unknown agent
// slugs, dangling node references) at the API boundary so the runner doesn't
// have to handle them. Type-compat between connected ports is intentionally
// NOT checked here — the runner re-validates at run time using the live
// agent registry, which is the source of truth.

/**
 * @typedef {{ ok: true } | { ok: false, error: string }} ValidationResult
 */

/**
 * @param {unknown} def
 * @param {Set<string>} knownAgentSlugs
 * @returns {ValidationResult}
 */
function validateDefinitionShape(def, knownAgentSlugs) {
  if (!def || typeof def !== 'object') return { ok: false, error: 'definition must be an object' };

  const d = /** @type {any} */ (def);
  if (!Array.isArray(d.nodes)) return { ok: false, error: 'definition.nodes must be an array' };
  if (!Array.isArray(d.edges)) return { ok: false, error: 'definition.edges must be an array' };
  if (!Array.isArray(d.inputs)) return { ok: false, error: 'definition.inputs must be an array' };
  if (!d.output || typeof d.output !== 'object') {
    return { ok: false, error: 'definition.output must be an object { node, field }' };
  }

  const nodeIds = new Set();
  for (const n of d.nodes) {
    if (!n || typeof n !== 'object') return { ok: false, error: 'each node must be an object' };
    if (typeof n.id !== 'string' || n.id.length === 0) {
      return { ok: false, error: 'each node must have a non-empty string id' };
    }
    if (nodeIds.has(n.id)) return { ok: false, error: `duplicate node id "${n.id}"` };
    nodeIds.add(n.id);
    if (typeof n.agent_slug !== 'string') {
      return { ok: false, error: `node "${n.id}" missing agent_slug` };
    }
    if (!knownAgentSlugs.has(n.agent_slug)) {
      return { ok: false, error: `node "${n.id}" references unknown agent "${n.agent_slug}"` };
    }
    if (n.config !== undefined && (typeof n.config !== 'object' || n.config === null)) {
      return { ok: false, error: `node "${n.id}" config must be an object if present` };
    }
  }

  for (const e of d.edges) {
    if (!e || typeof e !== 'object') return { ok: false, error: 'each edge must be an object' };
    if (!e.from || !e.to) return { ok: false, error: 'each edge needs from and to' };
    if (typeof e.from.node !== 'string' || typeof e.from.field !== 'string') {
      return { ok: false, error: 'edge.from must be { node, field } strings' };
    }
    if (typeof e.to.node !== 'string' || typeof e.to.field !== 'string') {
      return { ok: false, error: 'edge.to must be { node, field } strings' };
    }
    if (!nodeIds.has(e.from.node)) {
      return { ok: false, error: `edge.from references unknown node "${e.from.node}"` };
    }
    if (!nodeIds.has(e.to.node)) {
      return { ok: false, error: `edge.to references unknown node "${e.to.node}"` };
    }
  }

  for (const inp of d.inputs) {
    if (!inp || typeof inp !== 'object') return { ok: false, error: 'each input must be an object' };
    if (typeof inp.name !== 'string' || inp.name.length === 0) {
      return { ok: false, error: 'each input must have a non-empty name' };
    }
    if (!inp.to || typeof inp.to.node !== 'string' || typeof inp.to.field !== 'string') {
      return { ok: false, error: `input "${inp.name}" must have to: { node, field }` };
    }
    if (!nodeIds.has(inp.to.node)) {
      return { ok: false, error: `input "${inp.name}" references unknown node "${inp.to.node}"` };
    }
  }

  if (typeof d.output.node !== 'string' || typeof d.output.field !== 'string') {
    return { ok: false, error: 'output must be { node: string, field: string }' };
  }
  if (!nodeIds.has(d.output.node)) {
    return { ok: false, error: `output references unknown node "${d.output.node}"` };
  }

  return { ok: true };
}

/**
 * Normalise a slug: lowercase, hyphenate, strip non-[a-z0-9-]. Length-cap at 64.
 * @param {string} raw
 * @returns {string}
 */
function normaliseSlug(raw) {
  const s = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return s || 'workflow';
}

module.exports = { validateDefinitionShape, normaliseSlug };
