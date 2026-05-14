// Agentic loop — V2 Step 4.
//
// Given { system, tools, input, parentInvocationId, ctx, maxSteps }, runs
// a bounded Claude tool-use loop:
//
//   1. Send the message with the tool palette declared.
//   2. If Claude returns a `tool_use` block, execute the matching tool.
//   3. Append the tool_result and call again.
//   4. Repeat until Claude returns stop_reason='end_turn', a tool fails
//      hard, or maxSteps is hit.
//
// Each tool execution writes a workflow_runs row with:
//   parent_invocation_id = parentInvocationId
//   kind = 'agentic_tool'
//   agent = `${parentAgentSlug}.${tool.name}`
//
// Costs from every Haiku call inside the loop are accumulated via the
// existing logClaudeCost path (the tool calls don't hit Claude — only
// the wrapping inference calls do).
//
// Hard limits: maxSteps default 5, ceiling 10. Tool recursion is bounded
// by each tool's own checks (e.g. invoke_agent.depth ≤ 2).

const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../../db');
const { GROUNDED_MODEL } = require('../../claude');
const { logClaudeCost } = require('../../costs');

const HARD_MAX_STEPS = 10;
const DEFAULT_MAX_STEPS = 5;

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set.');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * @typedef {object} Tool
 * @property {string} name
 * @property {string} description
 * @property {object} input_schema       JSON Schema for the tool input
 * @property {(args, ctx) => Promise<any>} run  must return a JSON-serialisable value
 *
 * @typedef {object} LoopOptions
 * @property {string} system
 * @property {Tool[]} tools
 * @property {string|Array} input        initial user message (string or content blocks)
 * @property {object} ctx                { newsroomId, userId, parentAgent, ... }
 * @property {string} [parentInvocationId]   workflow_runs.id of the calling agent
 * @property {number} [maxSteps]
 * @property {number} [maxTokensPerCall] default 4096
 */

/**
 * @param {LoopOptions} opts
 * @returns {Promise<{
 *   text: string,
 *   steps: Array<{ step: number, tool?: string, tool_input?: any, tool_output?: any, error?: string, duration_ms: number, cost_usd: number, invocation_id?: string }>,
 *   totalCost: { costUsd: number, inputTokens: number, outputTokens: number },
 *   stopReason: string,
 *   stepsTaken: number,
 *   stoppedBecause: 'end_turn' | 'step_limit' | 'tool_error' | 'fatal',
 * }>}
 */
async function runAgenticLoop({
  system,
  tools,
  input,
  ctx,
  parentInvocationId = null,
  maxSteps = DEFAULT_MAX_STEPS,
  maxTokensPerCall = 4096,
}) {
  const cap = Math.min(HARD_MAX_STEPS, Math.max(1, maxSteps));
  const toolMap = new Map();
  for (const t of tools) toolMap.set(t.name, t);

  const messages = [
    { role: 'user', content: typeof input === 'string' ? input : input },
  ];
  const steps = [];
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let stepIndex = 0;
  let stoppedBecause = 'end_turn';

  // Tool schemas in Anthropic's expected shape.
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  let finalText = '';
  let stopReason = 'end_turn';

  while (stepIndex < cap) {
    stepIndex += 1;
    const callStart = Date.now();
    let response;
    try {
      response = await client().messages.create({
        model: GROUNDED_MODEL,
        max_tokens: maxTokensPerCall,
        system,
        tools: toolDefs,
        messages,
      });
    } catch (err) {
      steps.push({
        step: stepIndex,
        error: `inference call failed: ${err.message}`,
        duration_ms: Date.now() - callStart,
        cost_usd: 0,
      });
      stoppedBecause = 'fatal';
      throw err;
    }

    // Log + accumulate cost for THIS inference call (not the tool itself —
    // tools log separately via writeToolInvocation).
    const cost = await logClaudeCost({
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      newsroomId: ctx.newsroomId,
      userId: ctx.userId,
      agent: ctx.parentAgent ? `${ctx.parentAgent}.agentic_inference` : 'agentic_inference',
      endpoint: ctx.endpoint || 'agentic_loop',
    });
    totalCostUsd += cost?.costUsd || 0;
    totalInputTokens += response.usage.input_tokens || 0;
    totalOutputTokens += response.usage.output_tokens || 0;
    stopReason = response.stop_reason;

    // Push assistant turn back into the conversation verbatim — Anthropic's
    // tool-use protocol requires assistant content to be replayed before
    // the next tool_result message.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      // Final text answer.
      finalText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      stoppedBecause = 'end_turn';
      break;
    }

    // One assistant turn can request multiple tools. Execute all, append
    // their results in the next user message.
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];
    for (const tu of toolUses) {
      const tool = toolMap.get(tu.name);
      const toolStart = Date.now();
      let output;
      let toolError = null;
      try {
        if (!tool) throw new Error(`unknown tool "${tu.name}"`);
        output = await tool.run(tu.input || {}, ctx);
      } catch (err) {
        toolError = err.message;
        output = { error: err.message };
      }
      const durationMs = Date.now() - toolStart;
      const invocationId = await writeToolInvocation({
        newsroomId: ctx.newsroomId,
        userId: ctx.userId,
        parentInvocationId,
        toolName: tu.name,
        parentAgent: ctx.parentAgent,
        input: tu.input,
        output,
        durationMs,
        error: toolError,
      });
      steps.push({
        step: stepIndex,
        tool: tu.name,
        tool_input: tu.input,
        tool_output: output,
        error: toolError,
        duration_ms: durationMs,
        cost_usd: 0,
        invocation_id: invocationId,
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(output).slice(0, 50_000),
        is_error: Boolean(toolError),
      });
      if (toolError) {
        // Soft policy: even on tool error, send the error back to Claude
        // so it can recover. We only break the loop on inference errors.
      }
    }
    messages.push({ role: 'user', content: toolResults });

    if (stepIndex >= cap) {
      stoppedBecause = 'step_limit';
      finalText = '(reached agentic step limit before reaching a final answer)';
      break;
    }
  }

  return {
    text: finalText,
    steps,
    totalCost: {
      costUsd: totalCostUsd,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    stopReason,
    stepsTaken: stepIndex,
    stoppedBecause,
  };
}

async function writeToolInvocation({
  newsroomId, userId, parentInvocationId, toolName, parentAgent,
  input, output, durationMs, error,
}) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO workflow_runs
         (newsroom_id, user_id, agent, status, kind, parent_invocation_id, input, output,
          duration_ms, error, completed_at)
       VALUES ($1, $2, $3, $4, 'agentic_tool', $5, $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        newsroomId, userId,
        parentAgent ? `${parentAgent}.${toolName}` : `agentic.${toolName}`,
        error ? 'failed' : 'completed',
        parentInvocationId || null,
        JSON.stringify(input || {}),
        JSON.stringify(output || {}).slice(0, 200_000),
        durationMs,
        error,
      ]
    );
    return rows[0].id;
  } catch (err) {
    console.error('writeToolInvocation failed:', err.message);
    return null;
  }
}

module.exports = {
  runAgenticLoop,
  HARD_MAX_STEPS,
  DEFAULT_MAX_STEPS,
};
