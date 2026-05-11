// Workflow runner — executes a `definition` graph against a runtime input map.
//
// Pure function: takes a definition + inputs + ctx, returns output + per-node
// outputs + accumulated cost. No DB I/O. The route handler wraps this with
// workflow_runs persistence; per-Claude-call costs are still auto-logged via
// lib/claude.js → lib/costs.js into api_costs.
//
// Topological order via Kahn's algorithm. Cycles raise. Each node's input is
// assembled in this priority order (later overrides earlier):
//   1. node.config         — static defaults baked into the workflow definition
//   2. workflow inputs     — runtime values supplied by the caller, mapped via
//                            definition.inputs onto target node fields
//   3. incoming edges      — outputs of upstream nodes piped into this node
//
// After assembly, agent.inputs[*].required fields are checked from the registry.

const registry = require('../agents/registry');
const { isFallbackModel } = require('../claude');

/**
 * @typedef {{ id: string, agent_slug: string, config?: Record<string, any> }} WfNode
 * @typedef {{ from: { node: string, field: string }, to: { node: string, field: string } }} WfEdge
 * @typedef {{ name: string, to: { node: string, field: string } }} WfInput
 * @typedef {{
 *   nodes: WfNode[],
 *   edges: WfEdge[],
 *   inputs: WfInput[],
 *   output: { node: string, field: string }
 * }} WfDefinition
 */

/**
 * @param {WfDefinition} definition
 * @returns {string[]} node ids in execution order
 */
function topoSort(definition) {
  const incoming = new Map();
  for (const n of definition.nodes) incoming.set(n.id, new Set());
  for (const e of definition.edges) {
    incoming.get(e.to.node).add(e.from.node);
  }

  const order = [];
  const ready = definition.nodes.filter((n) => incoming.get(n.id).size === 0).map((n) => n.id);
  const remaining = new Set(definition.nodes.map((n) => n.id));

  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    remaining.delete(id);
    for (const n of definition.nodes) {
      const inSet = incoming.get(n.id);
      if (inSet.has(id)) {
        inSet.delete(id);
        if (inSet.size === 0 && remaining.has(n.id)) ready.push(n.id);
      }
    }
  }

  if (remaining.size > 0) {
    throw new Error(`Workflow has a cycle. Unsorted nodes: ${[...remaining].join(', ')}`);
  }
  return order;
}

/**
 * Execute a workflow definition.
 *
 * @param {WfDefinition} definition
 * @param {Record<string, any>} runtimeInputs   Mapped by definition.inputs[*].name
 * @param {{ newsroomId: string, userId: string, endpoint: string }} ctx
 * @returns {Promise<{
 *   output: any,
 *   nodeOutputs: Record<string, any>,
 *   nodeCosts: { nodeId: string, agent_slug: string, cost: any, durationMs: number }[],
 *   totalCost: { costUsd: number, inputTokens: number, outputTokens: number },
 *   durationMs: number
 * }>}
 */
async function runWorkflow(definition, runtimeInputs, ctx) {
  const order = topoSort(definition);
  const nodeOutputs = {};
  const nodeCosts = [];
  const startedAt = Date.now();

  for (const nodeId of order) {
    const node = definition.nodes.find((n) => n.id === nodeId);
    const agent = registry.get(node.agent_slug);
    if (!agent) {
      throw new Error(`Unknown agent slug "${node.agent_slug}" on node "${nodeId}"`);
    }

    const nodeInput = { ...(node.config || {}) };

    for (const wfInput of definition.inputs) {
      if (wfInput.to.node === nodeId && runtimeInputs[wfInput.name] !== undefined) {
        nodeInput[wfInput.to.field] = runtimeInputs[wfInput.name];
      }
    }

    for (const e of definition.edges) {
      if (e.to.node !== nodeId) continue;
      const upstream = nodeOutputs[e.from.node];
      if (!upstream) {
        throw new Error(`Edge ${e.from.node}.${e.from.field} → ${e.to.node}.${e.to.field}: upstream output missing (topo bug?)`);
      }
      if (!(e.from.field in upstream)) {
        throw new Error(
          `Edge ${e.from.node}.${e.from.field} → ${e.to.node}.${e.to.field}: ` +
            `field "${e.from.field}" not in upstream output. Available: ${Object.keys(upstream).join(', ') || '(none)'}`
        );
      }
      nodeInput[e.to.field] = upstream[e.from.field];
    }

    for (const [fieldName, schema] of Object.entries(agent.inputs)) {
      if (schema.required && (nodeInput[fieldName] === undefined || nodeInput[fieldName] === null || nodeInput[fieldName] === '')) {
        throw new Error(`Node "${nodeId}" (${node.agent_slug}) missing required input "${fieldName}"`);
      }
    }

    const { result, cost, durationMs } = await agent.run(nodeInput, ctx);
    nodeOutputs[nodeId] = result;
    nodeCosts.push({ nodeId, agent_slug: node.agent_slug, cost, durationMs });
  }

  const terminal = nodeOutputs[definition.output.node];
  if (!terminal) {
    throw new Error(`Workflow output node "${definition.output.node}" produced no output`);
  }
  if (!(definition.output.field in terminal)) {
    throw new Error(
      `Workflow output ${definition.output.node}.${definition.output.field} not in terminal output. ` +
        `Available: ${Object.keys(terminal).join(', ') || '(none)'}`
    );
  }

  const usedFallback = nodeCosts.some((c) => isFallbackModel(c.cost?.model));

  return {
    output: terminal[definition.output.field],
    nodeOutputs,
    nodeCosts,
    totalCost: {
      costUsd: nodeCosts.reduce((s, c) => s + (c.cost?.costUsd || 0), 0),
      inputTokens: nodeCosts.reduce((s, c) => s + (c.cost?.inputTokens || 0), 0),
      outputTokens: nodeCosts.reduce((s, c) => s + (c.cost?.outputTokens || 0), 0),
    },
    usedFallback,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = { runWorkflow, topoSort };
