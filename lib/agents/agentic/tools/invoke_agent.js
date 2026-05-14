// Tool: invoke_agent
//
// Calls another registered agent. Recursion-bounded: the calling
// agentic ctx must carry an _agenticDepth counter; we refuse to invoke
// further once depth ≥ MAX_DEPTH (2). Self-invocation also refused (no
// A → A loops).

const registry = require('../../registry');

const MAX_DEPTH = 2;
// The agentic layer should never reach inward to invoke itself indirectly.
// Tracker / Researcher fan-out is fine; bouncing back to the parent is not.
const FORBIDDEN_FOR_INNER_INVOKE = new Set();

const tool = {
  name: 'invoke_agent',
  description:
    'Invoke another registered Grounded agent (e.g. researcher, archivist, legal_tracker). Use when the task genuinely needs a different agent\'s output. Recursion is capped at depth 2; you cannot re-invoke yourself.',
  input_schema: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'The agent slug (e.g. "researcher", "legal_tracker", "archivist").',
      },
      input: {
        type: 'object',
        description: 'The agent\'s input map, keyed by field name. Must satisfy the agent\'s required inputs.',
      },
    },
    required: ['slug', 'input'],
  },
  async run({ slug, input }, ctx) {
    if (typeof slug !== 'string' || !slug) return { error: 'slug required' };
    if (ctx.parentAgent && slug === ctx.parentAgent) {
      return { error: `refused: agent "${slug}" attempted to invoke itself` };
    }
    if (FORBIDDEN_FOR_INNER_INVOKE.has(slug)) {
      return { error: `refused: "${slug}" is not callable from inside an agentic loop` };
    }
    const depth = (ctx._agenticDepth || 0) + 1;
    if (depth > MAX_DEPTH) {
      return { error: `refused: agentic recursion depth ${depth} exceeds max ${MAX_DEPTH}` };
    }
    const agent = registry.get(slug);
    if (!agent) return { error: `unknown agent "${slug}"` };

    const childCtx = {
      newsroomId: ctx.newsroomId,
      userId: ctx.userId,
      endpoint: 'agentic.invoke_agent',
      _agenticDepth: depth,
    };
    try {
      const { result, cost, durationMs } = await agent.run(input || {}, childCtx);
      return {
        slug,
        result,
        cost_usd: cost?.costUsd || 0,
        duration_ms: durationMs,
        depth,
      };
    } catch (err) {
      return { error: err.message, slug };
    }
  },
};

module.exports = { ...tool, MAX_DEPTH };
