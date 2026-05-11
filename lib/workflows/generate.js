// generate — Claude composes a workflow definition from a Builder's
// natural-language description, given the live agent registry.
//
// Returns a parsed { name, trigger_phrase, definition } plus cost. The
// definition is validated against the registry before return; invalid
// graphs throw so the API route can surface them as 422.

const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const registry = require('../agents/registry');
const { validateDefinitionShape, normaliseSlug } = require('./validate');

const SYSTEM_PROMPT = `You compose Grounded workflows from a Builder's plain-English description.

Grounded is shared AI infrastructure for African newsrooms. A workflow is a directed graph of agent calls. Each node is one agent invocation; edges pipe an output field of one node into an input field of another. The workflow takes runtime inputs (named values supplied at run time, e.g. an article body or a topic) and produces a single output.

You are given the catalog of available agents below. Compose the smallest, most direct graph that fulfils the description. Use as few agents as the description requires — do not add agents that aren't needed.

GRAPH RULES
- Each node has a unique id. Use n1, n2, n3, … in topological order.
- agent_slug must be one of the agents in the catalog.
- Every required input on a node must be satisfied by ONE of:
  · a workflow input (entry in "inputs", with the same field name as the input port the runtime value should land in)
  · an upstream edge (entry in "edges" — the from.field must be in the source agent's outputs, the to.field in the target's inputs)
  · a static config value (entry in node.config keyed by the input field name)
- The workflow output is one node + one of its output fields. Pick the node that produces the user-facing result.
- No cycles. No dangling edge endpoints. No duplicate node ids.

OUTPUT FORMAT — return ONLY a JSON object matching this exact shape:

{
  "name": "<short, descriptive name (≤60 chars)>",
  "trigger_phrase": "<short phrase a journalist would type to trigger this in chat — keep it natural and 1–4 words>",
  "definition": {
    "nodes": [
      { "id": "n1", "agent_slug": "<slug>", "config": {} }
    ],
    "edges": [
      { "from": { "node": "n1", "field": "<source agent output field>" },
        "to":   { "node": "n2", "field": "<target agent input field>" } }
    ],
    "inputs": [
      { "name": "<runtime value name>", "to": { "node": "n2", "field": "<target input field>" } }
    ],
    "output": { "node": "n_final", "field": "<output field>" }
  }
}

No prose, no markdown fences — JSON only.`;

/**
 * @param {object} opts
 * @param {string} opts.description
 * @param {{ newsroomId: string, userId: string, endpoint: string }} opts.context
 * @returns {Promise<{ name: string, trigger_phrase: string|null, definition: object, suggestedSlug: string, cost: any, durationMs: number }>}
 */
async function generateFromDescription({ description, context }) {
  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    throw new Error('description must be at least 10 characters of plain text');
  }

  const agents = registry.list();
  const catalog = agents.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
    inputs: a.inputs,
    outputs: a.outputs,
  }));

  const userMessage = `Available agents:
${JSON.stringify(catalog, null, 2)}

Builder's description:
${description.trim()}

Compose the workflow now. JSON only.`;

  const startedAt = Date.now();
  const { text, cost } = await chat({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
    context: { ...context, agent: 'workflow-generator' },
  });

  const parsed = parseClaudeJson(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Generator returned non-object output');
  }
  if (!parsed.definition || typeof parsed.definition !== 'object') {
    throw new Error('Generator output missing "definition"');
  }

  const knownSlugs = new Set(agents.map((a) => a.slug));
  const v = validateDefinitionShape(parsed.definition, knownSlugs);
  if (!v.ok) {
    throw new Error(`Generator produced an invalid graph: ${v.error}`);
  }

  // Cross-check that every required input on every node is satisfied.
  const agentBySlug = new Map(agents.map((a) => [a.slug, a]));
  for (const node of parsed.definition.nodes) {
    const agent = agentBySlug.get(node.agent_slug);
    const cfgKeys = new Set(Object.keys(node.config || {}));
    const inEdges = new Set(
      parsed.definition.edges.filter((e) => e.to.node === node.id).map((e) => e.to.field)
    );
    const wfInputFields = new Set(
      parsed.definition.inputs.filter((i) => i.to.node === node.id).map((i) => i.to.field)
    );
    for (const [fieldName, schema] of Object.entries(agent.inputs)) {
      if (schema.required && !cfgKeys.has(fieldName) && !inEdges.has(fieldName) && !wfInputFields.has(fieldName)) {
        throw new Error(`Generator left node "${node.id}" (${node.agent_slug}) without a source for required input "${fieldName}"`);
      }
    }
  }

  return {
    name: typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 80) : 'Generated workflow',
    trigger_phrase: typeof parsed.trigger_phrase === 'string' && parsed.trigger_phrase.trim().length > 0
      ? parsed.trigger_phrase.trim().slice(0, 80)
      : null,
    definition: parsed.definition,
    cost,
    durationMs: Date.now() - startedAt,
    suggestedSlug: normaliseSlug(parsed.name || 'workflow'),
  };
}

module.exports = { generateFromDescription };
