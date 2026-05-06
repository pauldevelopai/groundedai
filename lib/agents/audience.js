// Audience agent — synthetic focus groups grounded in the newsroom's
// real personas. Run a piece of test material (headline, lede, angle,
// or full draft) past N personas; persists transcript + summary +
// recommendations. Reads the newsroom profile so reactions are
// grounded in who the newsroom actually serves.
//
// Slice 10 ships the focus-group runner. Analytics ingestion lives in
// lib/audience/signals.js (separate so the analytics path doesn't pull
// in persona-loading code unnecessarily).

const { pool } = require('../db');
const { chat } = require('../claude');
const { parseClaudeJson } = require('../parse-claude-json');
const { loadPersonas, formatPersonaForPrompt } = require('../audience/personas');
const { loadProfile, formatForPrompt: formatProfileForPrompt } = require('../newsroom-profile');

const KIND_HINT = {
  headline: 'a headline',
  lede: 'a lede',
  angle: 'a story angle / framing',
  full_draft: 'a full story draft',
};

const SYSTEM_PROMPT = `You are Anchor's Audience agent — the newsroom's synthetic focus group.

You are given:
- The newsroom's context (their tagline, mission, beats, audience).
- A set of audience personas — each grounded in a real reader segment.
- A piece of test material the editor wants stress-tested.

Run a focus group: each persona reacts in first person to the material as if it were their first encounter with it. Then summarise across the group.

Hard constraints:
1. STAY IN PERSONA. Each reaction must read like the persona, not a generic test reader. Use language and concerns this persona would use; reference their specific platform, language, device, trust signals.
2. CANDID. Personas can dislike the material, find it boring, find it patronising, miss the point, or share enthusiastically. Surface what each one would actually do.
3. NO INVENTED PERSONAS. Only react with the personas given.
4. EVIDENCE ABOUT THE PIECE. Recommendations must point to specific lines / phrases / framings in the test material that should change.

Return ONLY valid JSON matching this schema:

{
  "transcript": [
    {
      "persona_id": "<UUID, exactly as given>",
      "persona_name": "<exactly as given>",
      "first_reaction": "<3–5 sentences in first person, in this persona's voice>",
      "would_share": <boolean>,
      "would_finish_reading": <boolean>,
      "confidence": <0.0–1.0 — how confident this persona is in the piece>,
      "concerns": ["<short bullet>", "..."]
    }
  ],
  "summary": "<2–4 sentence editor-facing summary of where the piece lands and where it fails>",
  "recommendations": ["<actionable change to the piece>", "..."]
}

JSON only — no preamble, no markdown fences.`;

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.testMaterial
 * @param {string} opts.testMaterialKind  — 'headline' | 'lede' | 'angle' | 'full_draft'
 * @param {string} [opts.contextBrief]
 * @param {string[]} opts.personaIds      — UUIDs of audience_personas in the same newsroom
 * @param {{ newsroomId: string, userId?: string, endpoint?: string }} opts.context
 */
async function runFocusGroup({ title, testMaterial, testMaterialKind, contextBrief, personaIds, context }) {
  if (!testMaterial || testMaterial.trim().length < 5) {
    throw new Error('testMaterial is required.');
  }
  if (!KIND_HINT[testMaterialKind]) {
    throw new Error(`testMaterialKind must be one of: ${Object.keys(KIND_HINT).join(', ')}`);
  }
  if (!Array.isArray(personaIds) || personaIds.length === 0) {
    throw new Error('Pick at least one persona for the focus group.');
  }
  if (personaIds.length > 6) {
    throw new Error('Cap the focus group at 6 personas — beyond that, signal turns to noise.');
  }

  const personas = await loadPersonas(context.newsroomId, personaIds);
  if (personas.length !== personaIds.length) {
    throw new Error('One or more personas were not found in this newsroom.');
  }

  const insert = await pool.query(
    `INSERT INTO focus_group_sessions
       (newsroom_id, created_by, title, test_material, test_material_kind,
        context_brief, persona_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id`,
    [
      context.newsroomId,
      context.userId || null,
      (title || `Focus group — ${KIND_HINT[testMaterialKind]} — ${new Date().toLocaleDateString()}`).slice(0, 200),
      testMaterial,
      testMaterialKind,
      contextBrief || null,
      personaIds,
    ]
  );
  const sessionId = insert.rows[0].id;

  let profileBlock = null;
  try {
    const profile = await loadProfile(context.newsroomId);
    profileBlock = formatProfileForPrompt(profile);
  } catch (e) {
    console.error('audience focus-group: profile load failed', e);
  }

  const personaBlock = personas
    .map((p) => `[id: ${p.id}]\n${formatPersonaForPrompt(p)}`)
    .join('\n\n');

  const userBlocks = [];
  if (profileBlock) userBlocks.push(`--- NEWSROOM CONTEXT ---\n${profileBlock}`);
  userBlocks.push(`--- PERSONAS (${personas.length}) ---\n${personaBlock}`);
  userBlocks.push(`--- TEST MATERIAL — ${KIND_HINT[testMaterialKind]} ---\n${testMaterial}`);
  if (contextBrief) userBlocks.push(`--- EDITOR'S BRIEF ---\n${contextBrief}`);
  userBlocks.push('Run the focus group now. Return JSON only.');

  const startedAt = Date.now();
  try {
    const { text, cost } = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userBlocks.join('\n\n') }],
      maxTokens: 3072,
      context: { ...context, agent: 'audience-focus-group', endpoint: context.endpoint || '/api/audience/focus-groups' },
    });
    const parsed = parseClaudeJson(text);
    parsed.transcript = Array.isArray(parsed.transcript) ? parsed.transcript : [];
    parsed.recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const durationMs = Date.now() - startedAt;

    await pool.query(
      `UPDATE focus_group_sessions
          SET transcript = $2,
              summary = $3,
              recommendations = $4,
              cost_usd = $5,
              duration_ms = $6,
              status = 'completed',
              updated_at = NOW()
        WHERE id = $1`,
      [
        sessionId,
        JSON.stringify(parsed.transcript),
        parsed.summary || null,
        parsed.recommendations,
        cost?.costUsd ?? null,
        durationMs,
      ]
    );

    return { sessionId, transcript: parsed.transcript, summary: parsed.summary, recommendations: parsed.recommendations, cost, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE focus_group_sessions SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [sessionId, message]
    );
    throw err;
  }
}

module.exports = { runFocusGroup };

// ─── Agent registry entry ──────────────────────────────────────────────────
const { register, resolveConfig } = require('./registry');
register({
  slug: 'audience',
  name: 'Audience',
  icon: '👥',
  description: 'Tests headlines, ledes, and drafts against synthetic audience personas grounded in your real readers — including default low-data, vernacular-first, and feature-phone segments per the AGENTS.md spec. Also reads analytics CSVs (Plausible, Umami, GA, raw exports) at /audience and converts them into editorial signals.',
  triggers: ['audience', 'focus group', 'test headline', 'test angle'],
  inputs: {
    testMaterial: {
      type: 'longtext',
      required: true,
      label: 'What to test',
      description: 'A headline, lede, framing/angle note, or a full draft. Keep it short for headlines; supply more for full drafts.',
    },
    title: {
      type: 'string',
      label: 'Session title',
      description: 'Optional. Defaults to "Focus group — <kind> — <today\'s date>".',
    },
    contextBrief: {
      type: 'string',
      label: 'Editor brief',
      description: 'Optional. What you want stress-tested specifically (e.g. "is this too jargon-heavy for our township readers?").',
    },
  },
  config: {
    test_material_kind: {
      type: 'select',
      default: 'headline',
      label: 'What kind of material',
      options: [
        { value: 'headline', label: 'Headline' },
        { value: 'lede', label: 'Lede' },
        { value: 'angle', label: 'Story angle / framing' },
        { value: 'full_draft', label: 'Full draft' },
      ],
    },
    persona_archetypes: {
      type: 'select',
      default: 'defaults',
      label: 'Personas to use',
      description:
        'Workflow runs use a fixed persona set chosen here. The default trio (low-data, vernacular-first, feature-phone) is the spec\'s required baseline. Pick "all" to include every persona the newsroom has set up. Use /audience for ad-hoc focus groups with custom selections.',
      options: [
        { value: 'defaults', label: 'Default trio (low-data, vernacular-first, feature-phone)' },
        { value: 'all', label: 'All newsroom personas' },
      ],
    },
  },
  outputs: {
    summary: { type: 'longtext', description: 'Editor-facing summary of where the piece lands and where it fails.' },
    transcript: { type: 'json', description: 'Per-persona reactions with would_share + would_finish_reading + confidence + concerns.' },
    recommendations: { type: 'json', description: 'Actionable changes to the piece.' },
    sessionId: { type: 'string', description: 'Persisted focus_group_sessions row id.' },
  },
  route: '/api/audience/focus-groups',
  async run(input, ctx) {
    const cfg = resolveConfig('audience', input);
    const { listPersonas } = require('../audience/personas');
    const all = await listPersonas(ctx.newsroomId);
    const selected = cfg.persona_archetypes === 'all'
      ? all
      : all.filter((p) => p.is_default);
    if (selected.length === 0) {
      throw new Error('No personas available — visit /audience to set them up.');
    }
    const out = await runFocusGroup({
      title: input.title,
      testMaterial: input.testMaterial,
      testMaterialKind: cfg.test_material_kind,
      contextBrief: input.contextBrief,
      personaIds: selected.map((p) => p.id),
      context: { ...ctx, endpoint: '/api/agents/audience' },
    });
    return {
      result: {
        sessionId: out.sessionId,
        summary: out.summary,
        transcript: out.transcript,
        recommendations: out.recommendations,
      },
      cost: out.cost,
      durationMs: out.durationMs,
    };
  },
});
