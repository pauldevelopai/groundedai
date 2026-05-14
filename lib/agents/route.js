// Sensitivity-aware routing — V2 Step 5.
//
// Sits between an HTTP route handler and the actual agent invocation.
// Decides whether the call may proceed to Anthropic Claude or must be
// refused (Step 5 state) / dispatched to the newsroom appliance (Step 6
// state).
//
// Usage:
//
//   const { decideRoute } = require('@/lib/agents/route');
//
//   const decision = await decideRoute({
//     newsroomId: session.newsroomId,
//     inputText: body.articleText || JSON.stringify(body),
//     workflowSlug: 'verify-then-draft',
//   });
//
//   if (decision.refuse) {
//     return NextResponse.json({
//       error: decision.error,
//       sensitivity_label: decision.label,
//       sensitivity_reasons: decision.reasons,
//     }, { status: 400 });
//   }
//
//   // continue to verify() / draft() / etc with ctx.sensitivity set
//
// The env var GROUNDED_SENSITIVITY_ROUTING controls enforcement:
//   - 'enforce' (default) — sensitive jobs refused.
//   - 'log_only'          — classification still computed and logged
//                            on the workflow row, but the call proceeds.
//   - 'off'               — skip classification entirely; everything
//                            routes 'public'.

const { classify, getEffectiveRules } = require('../sensitivity/classify');
const { getActiveAppliance } = require('../appliance/dispatch');

function enforcementMode() {
  const v = (process.env.GROUNDED_SENSITIVITY_ROUTING || 'enforce').toLowerCase();
  if (v === 'off' || v === 'log_only') return v;
  return 'enforce';
}

function federationEnabled() {
  return (process.env.GROUNDED_FEDERATED_EXECUTION || 'on').toLowerCase() !== 'off';
}

/**
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.inputText        canonical text to classify (article body,
 *                                       chat message, workflow input summary)
 * @param {string} [args.workflowSlug]   when invoked through a saved workflow
 * @returns {Promise<{
 *   label: 'public' | 'internal' | 'sensitive',
 *   confidence: number,
 *   reasons: string[],
 *   refuse: boolean,
 *   error?: string,
 *   enforcement: 'enforce' | 'log_only' | 'off',
 * }>}
 */
async function decideRoute({ newsroomId, inputText, workflowSlug }) {
  const enforcement = enforcementMode();

  if (enforcement === 'off') {
    return {
      label: 'public', confidence: 1.0, reasons: ['enforcement disabled'],
      refuse: false, enforcement,
    };
  }

  const rules = await getEffectiveRules(newsroomId);
  const verdict = classify({ text: inputText || '', workflowSlug, rules });

  if (verdict.label === 'sensitive' && enforcement === 'enforce') {
    // V2 Step 6: route to the newsroom appliance if one is registered.
    // Otherwise fall back to the Step 5 refusal path.
    if (federationEnabled()) {
      const appliance = await getActiveAppliance(newsroomId);
      if (appliance) {
        return {
          ...verdict,
          refuse: false,
          executeOn: 'appliance',
          appliance: { id: appliance.id, display_name: appliance.display_name },
          enforcement,
        };
      }
    }
    return {
      ...verdict,
      refuse: true,
      error: 'sensitive_label_no_appliance',
      enforcement,
    };
  }

  return { ...verdict, refuse: false, executeOn: 'cloud', enforcement };
}

module.exports = { decideRoute, enforcementMode, federationEnabled };
