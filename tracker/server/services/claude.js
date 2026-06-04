import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';

const MODEL       = 'claude-sonnet-4-6';
const MODEL_CHEAP = 'claude-sonnet-4-6';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// ── Classifier backend dispatch ─────────────────────────────────────────────
// LLM_BACKEND=ollama    → local Gemma via Ollama (free, requires local model)
// LLM_BACKEND=anthropic → Claude Sonnet with prompt caching (paid, ~$42/mo @ 100 items/day)
// LLM_BACKEND=groq      → openai/gpt-oss-120b on Groq (paid, ~$6/mo @ 100 items/day)
//
// Production currently runs LLM_BACKEND=groq — same Apache-2.0 OpenAI open-weight
// model, hosted (Lightsail can't run it locally), an order of magnitude cheaper.
const LLM_BACKEND  = process.env.LLM_BACKEND  || 'ollama';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:12b';
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL   = process.env.GROQ_MODEL   || 'openai/gpt-oss-120b';

async function callOllamaClassifier({ cachedSystem, userContent, maxTokens, temperature }) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: cachedSystem },
        { role: 'user', content: userContent },
      ],
      stream: false,
      // JSON mode: Ollama forces the model to emit strict JSON, saves us from
      // brittle regex extraction when the model decides to wrap output in
      // backticks or add commentary.
      format: 'json',
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.message?.content || '';
}

async function callAnthropicClassifier({ cachedSystem, userContent, maxTokens, temperature }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const message = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: maxTokens,
    temperature,
    system: [{ type: 'text', text: cachedSystem, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });
  return message.content[0].text;
}

// Process-global throttle: Groq free tier caps at 8K tokens/minute (sliding
// token bucket). Each triage call is ~4-5K tokens including the reserved
// max_tokens budget — Groq counts that against TPM even if unused. So 45s
// spacing keeps sustained rate ≈ 4500 × (60/45) = 6K TPM, comfortably under.
// Tune via GROQ_MIN_INTERVAL_MS=NN if you upgrade to Dev Tier (250K TPM).
let lastGroqCallAt = 0;
const GROQ_MIN_INTERVAL_MS = parseInt(process.env.GROQ_MIN_INTERVAL_MS || '45000', 10);
// Cap output budget for triage. Output JSON rarely exceeds 400 tokens; capping
// shaves the reserved-but-unused tokens that count against TPM.
const GROQ_MAX_OUTPUT_TOKENS = parseInt(process.env.GROQ_MAX_OUTPUT_TOKENS || '500', 10);

async function callGroqClassifier({ cachedSystem, userContent, maxTokens, temperature }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const wait = lastGroqCallAt + GROQ_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGroqCallAt = Date.now();

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: cachedSystem },
        { role: 'user',   content: userContent },
      ],
      temperature,
      max_tokens: Math.min(maxTokens, GROQ_MAX_OUTPUT_TOKENS),
      // JSON mode: forces strict JSON output, no markdown fences. Same guarantee
      // as Ollama's format:'json'. The triage prompt asks for a specific shape
      // and the parser downstream is unforgiving of preamble text.
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Classifier call — backend-agnostic. Returns just the text. Errors bubble up.
 *
 * Backends: ollama (local), anthropic (Claude Sonnet), groq (gpt-oss-120b).
 */
export async function callClaudeClassifier({ cachedSystem, userContent, maxTokens = 600, temperature = 0.1 }) {
  const args = { cachedSystem, userContent, maxTokens, temperature };
  if (LLM_BACKEND === 'anthropic') return callAnthropicClassifier(args);
  if (LLM_BACKEND === 'groq')      return callGroqClassifier(args);
  return callOllamaClassifier(args);
}

// Centralised API call with error handling and retries
export async function callClaude({ system, userContent, maxTokens = 2000, messages = null, temperature = undefined }) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured. Set it in your .env file.');
  }

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: messages || [{ role: 'user', content: userContent }],
  };
  if (temperature !== undefined) params.temperature = temperature;

  try {
    const message = await client.messages.create(params);
    return message.content[0].text;
  } catch (err) {
    if (err.status === 429) {
      // Rate limited — wait and retry once
      console.warn('Claude API rate limited, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      const message = await client.messages.create(params);
      return message.content[0].text;
    }
    console.error('Claude API error:', err.message || err);
    throw new Error(`AI service error: ${err.message || 'Unknown error'}`);
  }
}

/**
 * Public AI Legal chatbot.
 *
 * Answers questions about AI lawsuits + regulations, scoped strictly to what
 * we have in the database (passed in as `contextItems`). The caller is
 * responsible for retrieving the relevant items via FTS.
 *
 * Returns { reply, citations } where citations is an array of
 * {kind, id, name} for the items the model referenced.
 */
export async function chatAboutAiLegal({ history = [], message, contextItems = [] }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const contextBlock = contextItems.length === 0 ? '(no relevant items found in database)' :
    contextItems.map(c => {
      if (c.kind === 'lawsuit') {
        return [
          `## Lawsuit [id=${c.id}]: ${c.name}`,
          `Jurisdiction: ${c.jurisdiction} · Status: ${c.status} · Type: ${c.type}`,
          c.parties ? `Parties: ${c.parties}` : null,
          c.dates ? `Dates: ${c.dates}` : null,
          c.summary ? `Summary: ${c.summary}` : null,
        ].filter(Boolean).join('\n');
      }
      return [
        `## Regulation [id=${c.id}]: ${c.name}`,
        `Jurisdiction: ${c.jurisdiction} · Status: ${c.status} · Type: ${c.type}`,
        c.regulator ? `Regulator: ${c.regulator}` : null,
        c.dates ? `Dates: ${c.dates}` : null,
        c.summary ? `Summary: ${c.summary}` : null,
      ].filter(Boolean).join('\n');
    }).join('\n\n');

  const messages = history.map(m => ({ role: m.role, content: m.content }));
  messages.push({
    role: 'user',
    content: `Context from the AI Legal database:\n\n${contextBlock}\n\n# User question\n${message}`,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    temperature: 0.2,
    system: `You are the AI Legal research assistant for ailegal.co.za — a public tracker of AI lawsuits and AI regulations worldwide.

Your job: answer questions about AI law, AI regulations, and specific cases or regulations, using ONLY the context block provided. If the context doesn't contain the answer, say so and suggest what the user could browse on the site.

Rules:
- Stay strictly on topic: AI law, AI regulations, and the specific cases + regulations we track.
- If asked about anything else (general advice, personal legal help, unrelated topics), politely decline and redirect to the tracker.
- Do NOT offer legal advice. Clarify that you're summarising public records, not providing counsel.
- Cite items by their id in brackets: [lawsuit:<uuid>] or [regulation:<uuid>]. The frontend will render these as links.
- Be concise. 2-4 short paragraphs is usually enough.
- Use plain text — no markdown headings, no bold.
- If the user's question is vague, ask a clarifying question instead of guessing.`,
    messages,
  });

  const text = (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Parse citation markers from the reply: [lawsuit:<uuid>] or [regulation:<uuid>]
  const cited = new Set();
  const citeRe = /\[(lawsuit|regulation):([0-9a-f-]{8,})\]/gi;
  let m;
  while ((m = citeRe.exec(text)) !== null) {
    cited.add(`${m[1].toLowerCase()}:${m[2]}`);
  }
  const citations = contextItems.filter(c => cited.has(`${c.kind}:${c.id}`));

  return { reply: text, citations };
}

/**
 * Claude call with Anthropic's server-side web_search tool enabled.
 *
 * The API runs the search loop itself — we just get the final text response
 * with the model's answer. Useful for "verify this against a primary source"
 * prompts (date audits, fact-checks).
 *
 * Returns { text, citations } where citations is an array of {url, title}
 * objects the model cited (may be empty if no search was needed).
 */
export async function callClaudeWithWebSearch({ system, userContent, maxTokens = 1500, maxUses = 5 }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userContent }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
  };
  const message = await client.messages.create(params);

  // Content blocks are a mix of text + tool_use + server_tool_use + web_search_tool_result
  const textBlocks = (message.content || []).filter(b => b.type === 'text');
  const text = textBlocks.map(b => b.text).join('\n');

  // Harvest citations from any text blocks that carry them (new SDK feature)
  const citations = [];
  for (const b of textBlocks) {
    if (Array.isArray(b.citations)) {
      for (const c of b.citations) {
        citations.push({ url: c.url, title: c.title });
      }
    }
  }
  return { text, citations };
}

import { buildEnrichedSystemPrompt, recordKnowledgeUsage, recordInteraction } from './knowledge.js';

/**
 * Knowledge-enriched Claude call. Wraps callClaude with:
 * 1. System prompt enrichment from knowledge base
 * 2. Interaction recording for feedback loop
 * 3. Knowledge usage tracking
 */
async function callClaudeWithKnowledge({ functionName, system, userContent, maxTokens = 2000, messages = null, temperature = undefined, context = {} }) {
  const startTime = Date.now();

  // Enrich the system prompt with relevant knowledge
  const { enrichedPrompt, knowledgeIds } = await buildEnrichedSystemPrompt(
    functionName, system, context
  ).catch(() => ({ enrichedPrompt: system, knowledgeIds: [] }));

  // Make the API call
  const result = await callClaude({
    system: enrichedPrompt,
    userContent,
    maxTokens,
    messages,
    temperature,
  });

  const durationMs = Date.now() - startTime;

  // Record the interaction (non-blocking)
  recordInteraction({
    interactionType: functionName,
    sectorId: context.sectorId,
    entityType: context.entityType,
    entityId: context.entityId,
    knowledgeIdsUsed: knowledgeIds,
    inputSummary: (userContent || '').slice(0, 500),
    outputText: result,
    userId: context.userId,
    durationMs,
  }).catch(err => console.error('Failed to record interaction:', err.message));

  // Track knowledge usage (non-blocking)
  if (knowledgeIds.length > 0) {
    recordKnowledgeUsage(knowledgeIds).catch(err => console.error('Failed to record usage:', err.message));
  }

  return result;
}

export async function analyseAssessment(sectorName, orgName, responses) {
  const formattedResponses = responses
    .map((r, i) => `Q${i + 1}: ${r.question_text}\nA: ${r.answer || 'No response'}`)
    .join('\n\n');

  const analysis = await callClaudeWithKnowledge({
    functionName: 'analyse_assessment',
    system: `You are an AI implementation consultant at Develop AI, analysing a needs assessment for a client organisation in the ${sectorName} sector. Develop AI helps organisations implement AI responsibly through training, ethical policies, legal frameworks, and mentorship.
Your task is to produce a structured analysis report based on their questionnaire responses.

Output your analysis in the following format:

## Executive Summary
A 2-3 sentence overview of the organisation's AI readiness and key opportunities.

## Key Pain Points
Bullet list of the main challenges identified from their responses.

## Recommended Service Tier
One of: Training, Policy, Framework, or Mentorship — with a brief justification.

## Suggested Course Modules
Bullet list of specific training modules or services that would benefit this organisation.

## Red Flags or Blockers
Any concerns that could impede AI adoption (regulatory, cultural, technical).

## Recommended Tier
State clearly one of: training, policy, framework, mentorship`,
    userContent: `Please analyse the following needs assessment for ${orgName || 'an organisation'} in the ${sectorName} sector.\n\n${formattedResponses}`,
    temperature: 0.3,
    context: { sectorName, searchTerms: `${sectorName} ${orgName || ''}` },
  });

  let tier = null;
  const tierMatch = analysis.match(/## Recommended Tier\s*\n\s*(training|policy|framework|mentorship)/i);
  if (tierMatch) {
    tier = tierMatch[1].toLowerCase();
  }

  return { analysis, tier };
}

export async function suggestCourseImprovements(course, modules, sectorName) {
  const moduleList = modules.map((m, i) => {
    let entry = `${i + 1}. ${m.title} (${m.duration_minutes || '?'} min)`;
    if (m.effectiveness_rating) entry += ` — effectiveness: ${m.effectiveness_rating}/5`;
    if (m.feedback_notes) entry += `\n   Trainer notes: ${m.feedback_notes}`;
    return entry;
  }).join('\n');

  return callClaudeWithKnowledge({
    functionName: 'suggest_course_improvements',
    system: `You are a curriculum development expert at Develop AI, building AI training programmes that help client organisations in the ${sectorName} sector. Analyse this course and its modules, paying attention to effectiveness ratings and trainer feedback. Provide actionable improvement suggestions.

Output in this format:
## Overall Assessment
Brief assessment of the course quality and gaps.

## Module-Specific Suggestions
For each module that needs improvement, suggest specific changes.

## New Topics to Consider
Based on the latest developments in AI for the ${sectorName} sector, suggest new modules or topics to add.

## Content That May Be Outdated
Flag any content that might need updating based on current AI landscape.`,
    userContent: `Course: ${course.title} (${course.delivery_type}, ${course.version})\nSector: ${sectorName}\nDescription: ${course.description || 'None'}\n\nModules:\n${moduleList || 'No modules yet.'}`,
    temperature: 0.4,
    context: { sectorName, courseId: course.id, searchTerms: `${sectorName} ${course.title}` },
  });
}

export async function chatWithResearchAssistant(courseContext, conversationHistory, userMessage) {
  const messages = conversationHistory.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });

  return callClaudeWithKnowledge({
    functionName: 'chat_research_assistant',
    system: `You are an AI curriculum research assistant at Develop AI. You help build and improve AI training courses that are delivered to client organisations across multiple sectors.

Current context:
- Course: ${courseContext.title}
- Sector: ${courseContext.sectorName}
- Description: ${courseContext.description || 'Not set'}
- Modules: ${courseContext.modules?.map(m => m.title).join(', ') || 'None yet'}

Help the user research topics, suggest content structures, review outlines, find relevant examples, and improve their curriculum. Be specific and practical. When suggesting content, consider the sector context and what would be most useful for professionals in that field.`,
    messages,
    temperature: 0.5,
    context: { sectorName: courseContext.sectorName, courseId: courseContext.id, searchTerms: `${courseContext.sectorName} ${courseContext.title}` },
  });
}

export async function generateDocument(templatePrompt, sectorName, orgName, assessmentData, structure) {
  const structureText = structure ? `\n\nDocument structure to follow:\n${structure.join('\n')}` : '';
  const assessmentContext = assessmentData?.responses?.length
    ? `\n\nNeeds Assessment Data:\n${assessmentData.responses.map(r => `- ${r.question_text}: ${r.answer || 'No response'}`).join('\n')}`
    : '';

  return callClaudeWithKnowledge({
    functionName: 'generate_document',
    system: templatePrompt + structureText,
    userContent: `Generate this document for ${orgName || 'the organisation'} in the ${sectorName} sector.${assessmentContext}\n\nPlease generate a complete, professional document in markdown format following the structure provided. Make it specific and actionable, not generic.`,
    maxTokens: 4000,
    temperature: 0.3,
    context: { sectorName, searchTerms: `${sectorName} ${orgName || ''} policy framework` },
  });
}

export async function draftColdEmail(contactName, contactRole, orgName, sectorName, campaignGoal) {
  const text = await callClaudeWithKnowledge({
    functionName: 'draft_cold_email',
    system: `You are a professional business development writer at Develop AI, a company that provides AI training, ethical AI policy creation, and AI legal frameworks for organisations in the ${sectorName} sector.

Write a personalised cold outreach email. Be professional but warm, not salesy. Focus on the value to the recipient's specific role and organisation. Keep it concise — under 200 words for the body.

Output in this exact format:
SUBJECT: <email subject line>
---
<email body>`,
    userContent: `Write a cold email to ${contactName || 'the recipient'}${contactRole ? ` (${contactRole})` : ''} at ${orgName || 'their organisation'} in the ${sectorName} sector.\n\nCampaign goal: ${campaignGoal || 'Introduce Develop AI services and explore potential partnership.'}`,
    maxTokens: 1500,
    temperature: 0.6,
    context: { sectorName, searchTerms: `${sectorName} ${orgName || ''}` },
  });

  const parts = text.split('---');
  const subjectMatch = parts[0]?.match(/SUBJECT:\s*(.+)/i);
  return {
    subject: subjectMatch ? subjectMatch[1].trim() : 'Introduction from Develop AI',
    body: parts[1]?.trim() || text,
  };
}

export async function draftSocialPost(sectorName, platform, topic) {
  const platformGuide = {
    linkedin: 'Professional tone. Can be longer (up to 1300 chars). Use line breaks for readability. Include a call to action.',
    twitter: 'Concise. Under 280 characters. Punchy and engaging.',
    facebook: 'Conversational and engaging. Medium length. Can include a question to drive engagement.',
  };

  return callClaudeWithKnowledge({
    functionName: 'draft_social_post',
    system: `You are a social media content writer for Develop AI, specialising in AI training and services for the ${sectorName} sector.

Write a post for ${platform}. ${platformGuide[platform] || ''}

Focus on providing value — thought leadership, insights, or practical tips about AI in the ${sectorName} sector. Do not be overly promotional.

Output ONLY the post content, nothing else.`,
    userContent: `Write a ${platform} post about: ${topic || `AI trends and opportunities in the ${sectorName} sector`}`,
    maxTokens: 1000,
    temperature: 0.7,
    context: { sectorName, searchTerms: `${sectorName} ${topic || ''}` },
  });
}

export async function researchFundingOpportunity(funderName, opportunityTitle, opportunityUrl, sectorName) {
  return callClaudeWithKnowledge({
    functionName: 'research_funding',
    system: `You are a funding research analyst for Develop AI, a company that provides AI training, ethical AI policy creation, and AI legal frameworks for the ${sectorName || 'various'} sector(s).

Analyse this funding opportunity and provide a structured assessment. Be specific and practical.

Output in this format:
## Opportunity Summary
Brief overview of what this fund supports.

## Eligibility Assessment
Key eligibility criteria and how Develop AI fits.

## What Makes a Strong Application
Based on the funder's priorities, what should the application emphasise.

## Fit with Develop AI
How well this opportunity aligns with Develop AI's services (AI training, ethical policy, legal frameworks, mentorship).

## Key Dates & Requirements
Deadlines, match funding, reporting obligations, or other conditions.

## Recommendation
Clear recommendation: Strong fit / Good fit / Marginal fit / Not suitable — with brief justification.`,
    userContent: `Research this funding opportunity:\n\nFunder: ${funderName || 'Unknown'}\nOpportunity: ${opportunityTitle}\n${opportunityUrl ? `URL: ${opportunityUrl}\n` : ''}Sector focus: ${sectorName || 'Cross-sector'}`,
    temperature: 0.3,
    context: { sectorName, searchTerms: `funding ${funderName || ''} ${opportunityTitle}` },
  });
}

export async function draftFundingApplication(opportunityContext, programmeStats, sectorName) {
  const statsText = programmeStats
    ? `\n\nDevelop AI Track Record:\n- Cohorts delivered: ${programmeStats.cohortCount || 0}\n- Participants trained: ${programmeStats.participantCount || 0}\n- Sectors: ${programmeStats.sectors || 'Media, Legal'}\n- Services: AI training programmes, ethical AI policy creation, AI legal frameworks, 1:1 mentorship`
    : '\n\nDevelop AI provides AI training programmes, ethical AI policy creation, AI legal frameworks, and 1:1 mentorship for professional sectors.';

  return callClaudeWithKnowledge({
    functionName: 'draft_funding_application',
    system: `You are an expert grant writer for Develop AI. Write a compelling funding application that connects Develop AI's AI training, ethical policy, and legal framework services to the funder's priorities.

Write in a professional, evidence-based tone. Be specific about outcomes and impact. Structure the application clearly with sections that funders expect to see.

Output a complete application in markdown format with these sections:
## Project Title
## Executive Summary
## Need and Context
## Project Description
## Methodology and Approach
## Expected Outcomes and Impact
## Sustainability
## Budget Justification
## Organisational Capacity`,
    userContent: `Draft a funding application for this opportunity:\n\n${opportunityContext}${statsText}\n\nSector: ${sectorName || 'Cross-sector'}\n\nWrite a complete, professional application ready for review and refinement.`,
    maxTokens: 4000,
    temperature: 0.4,
    context: { sectorName, searchTerms: `funding application ${sectorName}` },
  });
}

export async function draftFundingReport(reportType, applicationContext, programmeStats, sectorName) {
  return callClaudeWithKnowledge({
    functionName: 'draft_funding_report',
    system: `You are an impact report writer for Develop AI. Draft a ${reportType} report for a funded project. Use specific data from the programme delivery to demonstrate impact and outcomes.

Write in a professional, evidence-based tone suitable for funders. Be honest about challenges while highlighting achievements.

Output in markdown with appropriate sections for a ${reportType} report.`,
    userContent: `Draft a ${reportType} report for this funded project:\n\n${applicationContext}\n\nProgramme data:\n- Cohorts: ${programmeStats?.cohortCount || 'N/A'}\n- Participants: ${programmeStats?.participantCount || 'N/A'}\n- Avg feedback score: ${programmeStats?.avgFeedback || 'N/A'}\n- Sector: ${sectorName || 'Cross-sector'}\n\nWrite a complete report ready for review.`,
    maxTokens: 3000,
    temperature: 0.4,
    context: { sectorName, searchTerms: `funding report ${sectorName}` },
  });
}

export async function generateBusinessSummary(dbContext, sectorName) {
  return callClaudeWithKnowledge({
    functionName: 'generate_business_summary',
    system: `You are Holly. Write a SHORT status overview as BULLET POINTS for Paul at Develop AI.

This is a STATUS REPORT — not a to-do list. Report what IS, not what Paul should do.

CONTEXT — Develop AI's business model:
- FUNDERS (e.g. TRF, DNTF) are clients who pay Develop AI
- PROGRAMME ORGS (e.g. Verstka, Bumaga, Grocott's) are assigned by funders to be trained
- LEADS are prospective new business

Rules:
- Output 3-5 bullet points, each starting with "• "
- Each bullet states a FACT about current status — numbers, names, states
- Do NOT give instructions or tell Paul what to do
- Do NOT use words like "urgent", "immediately", "now", "should", "must", "begin", "target"
- Simply state: what's active, what's pending, what's empty, what numbers look like
- Keep each bullet under 15 words
- No bold, no headers, plain bullets only`,
    userContent: `Sector: ${sectorName}\n\n${typeof dbContext === 'string' ? dbContext : JSON.stringify(dbContext)}`,
    maxTokens: 300,
    temperature: 0.3,
    context: { sectorName },
  });
}

export async function chatWithAssistant(conversationHistory, userMessage, pageContext) {
  const messages = conversationHistory.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });

  return callClaudeWithKnowledge({
    functionName: 'chat_assistant',
    system: `You are Holly, the internal operating system for Develop AI. Develop AI helps organisations across multiple sectors (Legal, Media, and others) implement AI responsibly — through training programmes, ethical AI policies, AI legal frameworks, and 1:1 mentorship. Holly tracks all client organisations, their AI implementation journeys, needs assessments, programme delivery, curriculum effectiveness, and outcomes. You help the Develop AI team manage their full client portfolio.

Current context:
- Page: ${pageContext?.page || 'Dashboard'}
- Sector: ${pageContext?.sectorName || 'All sectors'}

You are powered by Claude (Anthropic). Your capabilities include:
1. Analyse needs assessments → go to Assessments page, click "Analyse with AI"
2. Suggest curriculum improvements → go to Curriculum, open a course, click "AI Assist"
3. Research topics for courses → go to Curriculum, open a course, "AI Research" tab
4. Generate policy documents and frameworks → go to Documents, click "Generate Document"
5. Draft personalised cold outreach emails → go to Marketing > Campaigns, compose email with "AI Draft"
6. Create social media content → go to Marketing > Social Content, click "AI Generate Post"
7. Research funding opportunities → go to Fundraising, open an opportunity, click "AI Research"
8. Draft funding applications → Fundraising, open opportunity, Application tab, "AI Draft"
9. Draft funding reports → Fundraising, when awarded, Reports tab, "AI Draft"
10. Upload documents → any entity page, drag and drop or click upload. Holly extracts and learns from them.
11. Browse knowledge base → Intelligence and Knowledge pages show what Holly has learned.

Be concise, helpful, and specific to the Develop AI business. Reference your accumulated knowledge when answering questions. If a user asks you to do something that maps to one of these tools, tell them which page to go to and what button to click.`,
    messages,
    maxTokens: 1500,
    temperature: 0.5,
    context: { sectorName: pageContext?.sectorName, searchTerms: userMessage?.slice(0, 100) },
  });
}

export async function analyseFeedbackTrends(courses, modules, sectorName) {
  const courseData = courses.map(c => `- ${c.title}: effectiveness ${c.effectiveness_score || 'N/A'}/5, ${c.module_count} modules`).join('\n');
  const moduleData = modules.map(m => {
    let line = `- [${m.course_title}] ${m.title}: ${m.effectiveness_rating || 'unrated'}/5`;
    if (m.feedback_notes) line += ` — "${m.feedback_notes}"`;
    return line;
  }).join('\n');

  return callClaudeWithKnowledge({
    functionName: 'analyse_feedback_trends',
    system: `You are a training effectiveness analyst at Develop AI, analysing feedback data across AI training courses delivered to client organisations in the ${sectorName} sector.

Output in this format:
## What's Working Well
Modules/approaches with high effectiveness scores and positive trainer notes.

## Areas for Improvement
Modules with low scores or concerning feedback patterns.

## Cross-Course Patterns
Common themes that suggest systemic issues or opportunities.

## Recommendations
Specific, actionable changes ranked by likely impact.

Be data-driven. Reference specific courses and modules by name.`,
    userContent: `Courses:\n${courseData || 'No courses yet.'}\n\nModules with feedback:\n${moduleData || 'No module feedback yet.'}`,
    maxTokens: 2500,
    temperature: 0.3,
    context: { sectorName, searchTerms: `feedback effectiveness ${sectorName}` },
  });
}

export async function researchIndustryTrends(sectorName, currentTopics) {
  return callClaudeWithKnowledge({
    functionName: 'research_industry_trends',
    system: `You are an AI industry research analyst at Develop AI. Research the latest developments in AI as they apply to client organisations in the ${sectorName} sector.

IMPORTANT: If live scraped news articles are provided below, prioritise those — they are today's real headlines from industry sources. Reference their URLs where relevant. Combine this live data with your own knowledge to provide the most current analysis possible.

Output in this format:
## Recent AI Developments
Key AI advancements relevant to this sector. Include source URLs where available.

## Impact on Training Needs
How these developments change what professionals in this sector need to learn.

## Curriculum Gap Analysis
Based on the current course topics, identify gaps and outdated content.

## Suggested New Modules
Specific new training modules to develop, with target audience and learning outcomes.

Be specific and practical. Focus on what's actionable for a training company. Always include source URLs when referencing scraped articles.`,
    userContent: `Sector: ${sectorName}\nCurrent course topics: ${currentTopics || 'None defined yet'}\n\nWhat are the latest AI developments relevant to this sector, and what should we be teaching?`,
    maxTokens: 2500,
    temperature: 0.5,
    context: { sectorName, searchTerms: `${sectorName} AI trends training` },
  });
}

/**
 * Extract structured data from an uploaded document.
 */
export async function extractDocumentData(text, entityType, entityContext) {
  const entityPrompts = {
    organisation: `Extract: organisation name, key contact names and roles, sector, size/team count, location, AI readiness indicators, current tools, key challenges. Return as JSON.`,
    course: `Extract: course title, module structure (list of topics/sections), learning outcomes, target audience, duration, prerequisites. Return as JSON.`,
    funding_opportunity: `Extract: funder name, opportunity title, eligibility criteria, deadlines, funding amount/range, reporting requirements, priority areas, application process. Return as JSON.`,
    contact: `Extract: full name, email, phone, job title, organisation, LinkedIn URL, any notes about their interests or needs. Return as JSON.`,
    general: `Extract: key entities (organisations, people, topics), main themes, actionable items, and any data relevant to AI training, ethical AI policies, or legal frameworks. Return as JSON.`,
  };

  const prompt = entityPrompts[entityType] || entityPrompts.general;
  const contextInfo = entityContext ? `\n\nExisting entity context: ${JSON.stringify(entityContext)}` : '';

  return callClaude({
    system: `You are a document analysis expert at Develop AI. Extract structured information from the following document text. ${prompt}

Return ONLY valid JSON — no markdown, no explanation. The JSON should have clear, descriptive keys.${contextInfo}`,
    userContent: text.slice(0, 15000),
    maxTokens: 2000,
    temperature: 0.1,
  });
}

/**
 * Classify newsletter content into discrete items with curriculum relevance.
 */
export async function classifyNewsletterContent(emailText, sectorNames) {
  const result = await callClaudeWithKnowledge({
    functionName: 'classify_newsletter',
    system: `You are an AI news analyst at Develop AI. Develop AI trains organisations in ${sectorNames.join(', ')} sectors on AI implementation — covering practical tools, ethical policies, legal frameworks, and mentorship.

Analyse this newsletter email and break it into discrete news items. For each item, assess whether it's relevant to Develop AI's curriculum (not just interesting AI news — it must directly affect what we should be teaching).

CRITICAL: Only extract facts actually stated in the email text. Do NOT invent, embellish, or add information not present. If a claim is vague in the source, keep it vague in the summary.

Return ONLY valid JSON — an array of objects with these fields:
- title: concise headline (max 100 chars)
- summary: 2-sentence summary using ONLY facts from the email. Include any URLs/links mentioned.
- source_url: if a URL is mentioned for this item in the email, include it. Otherwise null.
- category: one of "ai_tool", "regulation", "technique", "use_case", "industry_news", "opinion"
- is_curriculum_relevant: boolean — true ONLY if this should influence course content
- curriculum_relevance_reason: if relevant, explain specifically how it affects training (e.g. "New tool that legal professionals should learn to use")
- relevant_sectors: array of sector names this applies to (from: ${sectorNames.join(', ')})

Be selective with curriculum relevance — most news is digest-only. Only flag items that would actually change what Develop AI teaches.`,
    userContent: emailText.slice(0, 12000),
    maxTokens: 3000,
    temperature: 0.2,
    context: { searchTerms: 'AI training curriculum news' },
  });

  try {
    return JSON.parse(result);
  } catch {
    // Try extracting JSON from response
    const match = result.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

/**
 * Generate a daily digest summary from newsletter items.
 */
export async function generateDailyDigest(items) {
  const itemsList = items.map((item, i) => {
    const source = item.sender || 'Unknown source';
    const date = item.received_at ? new Date(item.received_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const url = item.source_url || '';
    return `${i + 1}. [${item.category}] ${item.title || item.subject}\n   Summary: ${item.summary || 'No summary'}\n   Source: ${source}${date ? ` (${date})` : ''}${url ? `\n   URL: ${url}` : ''}`;
  }).join('\n\n');

  return callClaudeWithKnowledge({
    functionName: 'generate_newsletter_digest',
    system: `You are Holly, writing a morning AI news digest for Paul at Develop AI. Write a crisp, scannable briefing.

CRITICAL RULES ON CONTENT:
- ONLY include facts from the input items below. Do NOT invent anything.
- Start with the single most important story.
- Group by theme, not by source.
- Flag items relevant to AI training curriculum with [CURRICULUM].

CRITICAL RULES ON LINKS:
- After each item, put the source on its own line using ONLY this exact format: [Source Name](https://the-actual-url.com) — DD Mon YYYY
- ALWAYS include the publication date (from the input data) after the source link, separated by " — ".
- If no URL is available, write: Source Name — DD Mon YYYY
- NEVER output HTML. No angle brackets, no href, no target, no style attributes. ONLY markdown.

CRITICAL RULES ON TONE — WRITE AS PAUL MCNALLY:
- Paul is the founder of Develop AI. He trains journalists, lawyers, and media professionals to use AI responsibly. He's based in South Africa, works across Africa and with exiled Russian newsrooms.
- Write in first person where it fits. "This is exactly what we're teaching" not "This is relevant to training".
- Be direct and opinionated. Paul has strong views on AI ethics, media freedom, and practical implementation. Don't hedge.
- Lead with why it matters for someone who trains people in AI, not just what happened.
- Short paragraphs. Conversational. Like you're writing a newsletter people actually want to read, not a corporate briefing.
- No filler. Cut "notably", "significantly", "it is worth noting", "it should be noted". Just say the thing.
- When something connects to what Develop AI teaches, say so plainly: "This is going straight into the next Legal cohort" or "We've been warning about this exact scenario".
- End cleanly. No sign-off, no "have a good day" — just stop when you're done.`,
    userContent: `Today's newsletter items:\n\n${itemsList}`,
    maxTokens: 3000,
    temperature: 0.2,
    context: { searchTerms: 'AI training curriculum news digest' },
  });
}

/**
 * Extract AI lawsuit data from scraped article/document text.
 * Returns an array of structured lawsuit objects for upsert into ai_lawsuits.
 */
export async function analyzeLawsuitContent(text) {
  const result = await callClaude({
    system: `You are a legal analyst specialising in AI copyright and technology litigation. Extract structured lawsuit data from the provided text.

Return ONLY valid JSON — an array of lawsuit objects. Each object must have these fields:
- case_name: string — formal case name e.g. "New York Times v. OpenAI"
- plaintiffs: string[] — list of plaintiff names
- defendants: string[] — list of defendant names
- court: string — court name e.g. "US District Court", "Court of Appeal"
- judge: string or null
- jurisdiction: string — one of "US Federal", "US State", "EU", "UK", "International"
- district: string or null — e.g. "N.D. Cal.", "S.D.N.Y."
- circuit: string or null — e.g. "9th Circuit"
- status: string — one of "active", "settled", "dismissed", "appealing", "decided"
- case_type: string — one of "copyright", "privacy", "defamation", "labour", "contract", "other"
- key_issues: string[] — 2-5 specific legal issues raised
- filing_date: string or null — ISO date "YYYY-MM-DD"
- last_update: string — ISO date of most recent development
- next_deadline: string or null — ISO date
- next_deadline_notes: string or null — description of what the deadline is
- outcome: string or null — for settled/dismissed/decided cases
- settlement_amount: string or null — e.g. "$1,500,000"
- case_url: string or null — URL to court documents or primary source
- summary: string — 2-3 sentence factual summary
- curriculum_relevance: string or null — why this is relevant to AI training courses

Only extract cases that are clearly AI-related (AI training data, AI-generated content, AI tools). Return [] if no AI lawsuits found.`,
    userContent: text.slice(0, 15000),
    maxTokens: 4000,
    temperature: 0.1,
  });

  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return []; }
    }
    return [];
  }
}

/**
 * Generate a deep 2-3 paragraph analysis of a single AI lawsuit for the knowledge base.
 * Called per-case after extraction so it can be thorough and focused.
 */
export async function generateCaseAnalysis(caseData, sourceTexts = []) {
  const caseContext = [
    `Case: ${caseData.case_name}`,
    `Parties: ${(caseData.plaintiffs || []).join(', ')} v. ${(caseData.defendants || []).join(', ')}`,
    `Court: ${caseData.court || 'Unknown'} ${caseData.district ? `(${caseData.district})` : ''}`,
    `Filed: ${caseData.filing_date || 'Unknown'}`,
    `Status: ${caseData.status}`,
    `Type: ${caseData.case_type}`,
    caseData.key_issues?.length ? `Key issues: ${caseData.key_issues.join('; ')}` : '',
    caseData.outcome ? `Outcome: ${caseData.outcome}` : '',
    caseData.settlement_amount ? `Settlement: ${caseData.settlement_amount}` : '',
    caseData.summary ? `Summary: ${caseData.summary}` : '',
  ].filter(Boolean).join('\n');

  const sourceContext = sourceTexts.length > 0
    ? `\n\nSource material:\n${sourceTexts.join('\n\n').slice(0, 8000)}`
    : '';

  const result = await callClaude({
    system: `You are a senior legal analyst and journalist specialising in AI, copyright, and technology law. Your audience is newsroom leaders and journalists who need to understand the practical implications of AI litigation for their industry.

Write a comprehensive analysis of an AI lawsuit. Structure it as three clear paragraphs:

**Paragraph 1 — Background & Facts**: Explain who the parties are, what was filed, when, and in which court. Describe the specific AI system or behaviour at the heart of the dispute. Be precise about dates and factual claims.

**Paragraph 2 — Legal Arguments & Battleground**: Explain the core legal questions — what the plaintiffs allege, what the defendants argue, what precedents or legal doctrines are being tested (e.g. fair use, transformative use, GDPR, right of publicity). Note any significant rulings or motions already decided.

**Paragraph 3 — Significance for Journalism & AI**: Explain why this case matters for the media industry, AI developers, and newsrooms specifically. What is at stake? What outcome would set a precedent and in which direction? How does this affect newsrooms considering AI tools for content creation, research, or workflows?

Write in plain English. Be specific. Avoid vague generalisations. Total length: 300-450 words.`,
    userContent: `${caseContext}${sourceContext}`,
    maxTokens: 1200,
    temperature: 0.3,
  });

  return result || null;
}

/**
 * Format a case as a structured knowledge entry content block.
 */
export function formatCaseAsKnowledge(caseData) {
  const lines = [
    `# ${caseData.case_name}`,
    '',
    `**Status:** ${caseData.status}  |  **Type:** ${caseData.case_type}  |  **Jurisdiction:** ${caseData.jurisdiction || 'US Federal'}`,
    `**Parties:** ${(caseData.plaintiffs || []).join(', ')} v. ${(caseData.defendants || []).join(', ')}`,
    `**Court:** ${[caseData.court, caseData.district, caseData.circuit].filter(Boolean).join(' · ')}`,
    caseData.judge ? `**Judge:** ${caseData.judge}` : null,
    caseData.filing_date ? `**Filed:** ${caseData.filing_date}` : null,
    caseData.last_update ? `**Last update:** ${caseData.last_update}` : null,
    caseData.outcome ? `**Outcome:** ${caseData.outcome}` : null,
    caseData.settlement_amount ? `**Settlement:** ${caseData.settlement_amount}` : null,
    '',
    caseData.key_issues?.length
      ? `**Key legal issues:** ${caseData.key_issues.join(' · ')}`
      : null,
    '',
    caseData.detailed_analysis || caseData.summary || '',
    '',
    caseData.curriculum_relevance ? `**Curriculum relevance:** ${caseData.curriculum_relevance}` : null,
    caseData.case_url ? `**Court documents:** ${caseData.case_url}` : null,
  ].filter(l => l !== null).join('\n');

  return lines;
}

/**
 * Generate a deep Claude analysis for a single AI regulation.
 */
export async function generateRegulationAnalysis(regData, sourceTexts = []) {
  const regContext = [
    `Regulation: ${regData.regulation_name}${regData.short_name ? ` (${regData.short_name})` : ''}`,
    `Jurisdiction: ${regData.jurisdiction}`,
    regData.regulator ? `Regulator: ${regData.regulator}` : '',
    `Status: ${regData.status}`,
    regData.regulation_type ? `Type: ${regData.regulation_type}` : '',
    regData.scope?.length ? `Scope: ${regData.scope.join('; ')}` : '',
    regData.affected_sectors?.length ? `Affected sectors: ${regData.affected_sectors.join('; ')}` : '',
    regData.proposed_date ? `Proposed: ${regData.proposed_date}` : '',
    regData.enacted_date ? `Enacted: ${regData.enacted_date}` : '',
    regData.effective_date ? `Effective: ${regData.effective_date}` : '',
    regData.enforcement_date ? `Enforcement begins: ${regData.enforcement_date}` : '',
    regData.key_provisions?.length ? `Key provisions: ${regData.key_provisions.join('; ')}` : '',
    regData.penalties ? `Penalties: ${regData.penalties}` : '',
    regData.extraterritorial_scope ? `Extraterritorial scope: ${regData.extraterritorial_scope}` : '',
    regData.summary ? `Summary: ${regData.summary}` : '',
  ].filter(Boolean).join('\n');

  const sourceContext = sourceTexts.length > 0
    ? `\n\nSource material:\n${sourceTexts.join('\n\n').slice(0, 8000)}`
    : '';

  const result = await callClaude({
    system: `You are a senior policy analyst specialising in AI regulation, data protection, and technology law. Your audience is newsroom leaders, journalists, compliance officers, and legal professionals who need to understand the practical implications of AI regulation globally.

Write a comprehensive analysis of an AI regulation. Structure it as three clear paragraphs:

**Paragraph 1 — What the regulation is and where it came from**: Identify the full name of the regulation, the jurisdiction and regulator, its legal form (statute, directive, guidance, etc.), and the timeline from proposal to enactment to effect. Describe the concerns or incidents that drove it.

**Paragraph 2 — Core obligations and scope**: Explain what the regulation actually requires. Who is in scope? What conduct is regulated? What are the key compliance obligations, risk tiers, transparency rules, or prohibited practices? What are the penalties? Is the scope extraterritorial?

**Paragraph 3 — Significance and enforcement reality**: Explain why this regulation matters for media, AI developers, and organisations deploying AI. How does it interact with other regimes (GDPR, sectoral laws, other jurisdictions)? What's the enforcement trajectory — is this a paper tiger or a serious regulator? What should readers watch for next?

Write in plain English. Be specific about articles, section numbers, dates, and thresholds where known. Avoid vague generalisations. Total length: 300-450 words.`,
    userContent: `${regContext}${sourceContext}`,
    maxTokens: 1200,
    temperature: 0.3,
  });

  return result || null;
}

/**
 * Format a regulation as a structured knowledge entry content block.
 */
export function formatRegulationAsKnowledge(regData) {
  const lines = [
    `# ${regData.regulation_name}${regData.short_name ? ` (${regData.short_name})` : ''}`,
    '',
    `**Status:** ${regData.status}  |  **Type:** ${regData.regulation_type || '—'}  |  **Jurisdiction:** ${regData.jurisdiction}`,
    regData.regulator ? `**Regulator:** ${regData.regulator}` : null,
    regData.proposed_date ? `**Proposed:** ${regData.proposed_date}` : null,
    regData.enacted_date ? `**Enacted:** ${regData.enacted_date}` : null,
    regData.effective_date ? `**Effective:** ${regData.effective_date}` : null,
    regData.enforcement_date ? `**Enforcement begins:** ${regData.enforcement_date}` : null,
    '',
    regData.scope?.length ? `**Scope:** ${regData.scope.join(' · ')}` : null,
    regData.affected_sectors?.length ? `**Affected sectors:** ${regData.affected_sectors.join(' · ')}` : null,
    regData.key_provisions?.length ? `**Key provisions:**\n${regData.key_provisions.map(p => `- ${p}`).join('\n')}` : null,
    regData.penalties ? `**Penalties:** ${regData.penalties}` : null,
    regData.extraterritorial_scope ? `**Extraterritorial scope:** ${regData.extraterritorial_scope}` : null,
    '',
    regData.detailed_analysis || regData.summary || '',
    '',
    regData.curriculum_relevance ? `**Curriculum relevance:** ${regData.curriculum_relevance}` : null,
    regData.official_url ? `**Official text:** ${regData.official_url}` : null,
  ].filter(l => l !== null).join('\n');

  return lines;
}

/**
 * Generate personalised learning tasks for a participant.
 */
export async function generatePersonalisedTasks(contact, organisation, course, outcomes, skillLevel) {
  const outcomeList = outcomes.map((o, i) => `${i + 1}. ${o.title}${o.assessment_criteria ? ` — Criteria: ${o.assessment_criteria}` : ''}`).join('\n');

  const result = await callClaudeWithKnowledge({
    functionName: 'generate_learning_tasks',
    system: `You are an AI training curriculum designer at Develop AI. Generate personalised, specific learning tasks for a professional who is learning to implement AI in their work.

Tasks must be:
- Tailored to this person's specific role and organisation
- Progressive in difficulty (start easy, build up)
- Mix of types: deliverables (produce something), practice (try a tool), reflections (think critically)
- Small and achievable — each task should take 15-60 minutes
- Connected to the learning outcomes provided

Return ONLY valid JSON — an array of task objects with these fields:
- title: short, action-oriented (max 100 chars)
- description: clear instructions the person can follow (2-4 sentences)
- task_type: one of "deliverable", "practice", "reflection", "quiz"
- difficulty: "beginner", "intermediate", or "advanced"
- outcome_index: which learning outcome this relates to (0-indexed from the list provided)`,
    userContent: `Generate 5-8 personalised learning tasks.

Learner: ${contact.first_name} ${contact.last_name}
Role: ${contact.job_title || 'Professional'}
Organisation: ${organisation?.name || 'Unknown'}
Organisation type: ${organisation?.type || 'Unknown'}
Skill level: ${skillLevel || 'beginner'}
Sector: ${course?.sector_name || 'General'}

Course: ${course?.title || 'AI Implementation'}
Learning Outcomes:
${outcomeList || 'No specific outcomes defined — generate tasks for general AI literacy and practical tool use.'}`,
    maxTokens: 2000,
    temperature: 0.5,
    context: { sectorName: course?.sector_name, searchTerms: `${contact.job_title || ''} ${organisation?.type || ''} AI tasks` },
  });

  try {
    return JSON.parse(result);
  } catch {
    const match = result.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

/**
 * AI reviews a participant's task submission.
 */
export async function reviewSubmission(task, submissionText, submissionUrl) {
  return callClaudeWithKnowledge({
    functionName: 'review_submission',
    system: `You are an AI training assessor at Develop AI. Review a participant's submission for a learning task. Be constructive, specific, and encouraging.

Assess the submission against the task requirements. Provide:
1. A quality score (1-5): 1=incomplete, 2=needs work, 3=acceptable, 4=good, 5=excellent
2. What they did well
3. What could be improved
4. Specific next steps or suggestions

Output in this format:
SCORE: [1-5]
---
## Assessment
[Your detailed review]

## What's Working
[Specific positives]

## Improvements Needed
[Specific suggestions]

## Next Steps
[What they should do next]`,
    userContent: `Task: ${task.title}
Instructions: ${task.description || 'None'}
Task type: ${task.task_type}
Assessment criteria: ${task.assessment_criteria || 'General quality and completeness'}

Submission:
${submissionText || '[No text submitted]'}
${submissionUrl ? `Link: ${submissionUrl}` : ''}`,
    maxTokens: 1500,
    temperature: 0.3,
    context: { searchTerms: `${task.title} assessment` },
  });
}

/**
 * AI assesses a participant's overall learning progress.
 */
export async function assessLearningProgress(contact, organisation, journey, tasks, outcomes) {
  const taskSummary = tasks.map(t => `- ${t.title} [${t.status}]${t.review_score ? ` (${t.review_score}/5)` : ''}`).join('\n');
  const outcomeSummary = outcomes.map(o => {
    const relatedTasks = tasks.filter(t => t.outcome_id === o.id);
    const completed = relatedTasks.filter(t => t.status === 'approved').length;
    return `- ${o.title}: ${completed}/${relatedTasks.length} tasks completed`;
  }).join('\n');

  return callClaudeWithKnowledge({
    functionName: 'assess_learning_progress',
    system: `You are an AI learning progress analyst at Develop AI. Assess this participant's overall learning journey and recommend next steps.

Be specific, data-driven, and constructive. Reference actual task completion data.

Output:
## Progress Summary
Brief overview of where this learner is.

## Strengths Demonstrated
What they've shown they can do.

## Gaps Remaining
What they haven't yet demonstrated.

## Recommended Next Steps
Specific actions — tasks, practice areas, or topics to focus on.

## Skill Level Assessment
Current level: beginner / intermediate / advanced — with justification.`,
    userContent: `Learner: ${contact.first_name} ${contact.last_name} (${contact.job_title || 'Professional'})
Organisation: ${organisation?.name || 'Unknown'}
Current skill level: ${journey.skill_level}
Overall progress: ${journey.overall_progress}%

Tasks:
${taskSummary || 'No tasks assigned yet.'}

Outcomes coverage:
${outcomeSummary || 'No outcomes defined.'}`,
    maxTokens: 1500,
    temperature: 0.3,
    context: { sectorName: journey.sector_id ? undefined : 'general', searchTerms: 'learning progress assessment' },
  });
}

// ═══════════════════════════════════════════════════════════════════
// AGENT 1: CURRICULUM BUILDER
// ═══════════════════════════════════════════════════════════════════

export async function chatWithCurriculumBuilder(context, conversationHistory, userMessage) {
  const messages = conversationHistory.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });

  const courseInfo = context.course
    ? `\nCurrent course: ${context.course.title} (${context.course.delivery_type}, ${context.course.version})\nModules: ${context.modules?.map(m => m.title).join(', ') || 'None yet'}`
    : '';

  return callClaudeWithKnowledge({
    functionName: 'agent_curriculum_builder',
    system: `You are the Curriculum Builder agent at Develop AI. You help Paul design and build AI training courses for professionals in the ${context.sectorName} sector.

Your expertise:
- Structuring multi-session AI training programmes (online 3x2hr or in-person 2-day)
- Designing learning outcomes that lead to practical AI implementation
- Identifying which AI tools and concepts are most relevant for specific professional roles
- Sequencing content from fundamentals to advanced application
- Creating hands-on exercises and assessments

${courseInfo}

When Paul asks you to design a course, think about:
1. What does this sector specifically need from AI training?
2. What practical tools should they learn to use?
3. What ethical/policy considerations apply?
4. How do we measure that they've actually learned something?

Be specific, practical, and opinionated. Reference current AI tools and trends. Output course structures as clear lists with module titles, durations, and learning outcomes.`,
    messages,
    maxTokens: 4000,
    temperature: 0.5,
    context: { sectorName: context.sectorName, searchTerms: `${context.sectorName} AI training curriculum ${userMessage.slice(0, 80)}` },
  });
}

export async function generateCourseStructure(sectorName, topic, targetAudience) {
  const result = await callClaudeWithKnowledge({
    functionName: 'generate_course_structure',
    system: `You are a curriculum architect at Develop AI. Generate a complete course structure for an AI training programme.

Return ONLY valid JSON with this structure:
{
  "title": "Course Title",
  "description": "2-3 sentence course description",
  "delivery_type": "online" or "in_person" or "both",
  "modules": [
    {
      "title": "Module Title",
      "description": "What this module covers",
      "duration_minutes": 60,
      "order_index": 0,
      "learning_outcomes": ["Outcome 1", "Outcome 2"],
      "content_outline": "Key topics and activities"
    }
  ]
}

Design 4-8 modules. Each module should be 30-120 minutes. Include practical exercises. Consider the sector context and target audience carefully.`,
    userContent: `Design a course structure:\nSector: ${sectorName}\nTopic: ${topic}\nTarget audience: ${targetAudience || 'Professionals in the ' + sectorName + ' sector'}`,
    maxTokens: 3000,
    temperature: 0.4,
    context: { sectorName, searchTerms: `${sectorName} ${topic} training course structure` },
  });

  try { return JSON.parse(result); }
  catch { const m = result.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { error: 'Failed to parse', raw: result }; }
}

export async function generateModuleContent(course, module, sectorName) {
  return callClaudeWithKnowledge({
    functionName: 'generate_module_content',
    system: `You are a curriculum content writer at Develop AI. Write detailed training content for a single module in an AI course for the ${sectorName} sector.

Include:
- Learning objectives (3-5 bullet points)
- Key concepts explained clearly for professionals (not AI experts)
- Practical exercises or activities
- Discussion questions
- Resources and tools to explore
- Assessment criteria

Write in a clear, professional style. Use examples relevant to the ${sectorName} sector. Output in markdown.`,
    userContent: `Course: ${course.title}\nModule: ${module.title}\nDescription: ${module.description || 'No description'}\nDuration: ${module.duration_minutes || 60} minutes\nSector: ${sectorName}`,
    maxTokens: 3000,
    temperature: 0.4,
    context: { sectorName, searchTerms: `${sectorName} ${module.title} training content` },
  });
}

// ═══════════════════════════════════════════════════════════════════
// AGENT 2: LEAD FINDER & OUTREACH
// ═══════════════════════════════════════════════════════════════════

export async function chatWithLeadFinder(context, conversationHistory, userMessage) {
  const messages = conversationHistory.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });

  return callClaudeWithKnowledge({
    functionName: 'agent_lead_finder',
    system: `You are the Lead Finder agent at Develop AI. You help Paul identify potential clients and craft outreach strategies for the ${context.sectorName} sector.

Develop AI offers:
- AI training programmes (online 3x2hr or in-person 2-day)
- Ethical AI policy creation
- AI legal framework development
- 1:1 AI mentorship

Your role:
- Suggest types of organisations that need AI training in this sector
- Identify decision-maker roles to target (e.g. Head of Innovation, Managing Partner)
- Recommend outreach channels and messaging angles
- Help craft personalised pitches
- Think strategically about positioning and value propositions

${context.campaignGoal ? `\nCurrent campaign goal: ${context.campaignGoal}` : ''}

Be specific and strategic. Don't be generic — give actionable suggestions with specific org types, role titles, and messaging angles.`,
    messages,
    maxTokens: 4000,
    temperature: 0.6,
    context: { sectorName: context.sectorName, searchTerms: `${context.sectorName} AI training business development ${userMessage.slice(0, 80)}` },
  });
}

export async function generateOutreachStrategy(sectorName, targetProfile, goal) {
  const result = await callClaudeWithKnowledge({
    functionName: 'generate_outreach_strategy',
    system: `You are a business development strategist at Develop AI. Create a concrete outreach strategy.

Return ONLY valid JSON:
{
  "target_segments": [{"name": "Segment", "description": "Who they are", "size_estimate": "Small/Medium/Large", "priority": "High/Medium/Low"}],
  "decision_makers": [{"role": "Job Title", "motivation": "Why they'd buy", "objections": "Likely pushback"}],
  "channels": [{"channel": "email/linkedin/event/referral", "approach": "How to use it", "priority": "High/Medium/Low"}],
  "messaging_angles": [{"angle": "Core message", "for_segment": "Which segment", "example_hook": "Opening line"}],
  "sequence": [{"step": 1, "action": "What to do", "timing": "When", "channel": "Which channel"}]
}`,
    userContent: `Build an outreach strategy:\nSector: ${sectorName}\nTarget profile: ${targetProfile || 'Organisations needing AI training'}\nGoal: ${goal || 'Introduce Develop AI services'}`,
    maxTokens: 2500,
    temperature: 0.5,
    context: { sectorName, searchTerms: `${sectorName} outreach strategy business development` },
  });

  try { return JSON.parse(result); }
  catch { const m = result.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { error: 'Failed to parse', raw: result }; }
}

export async function draftLinkedInMessage(contactName, contactRole, orgName, sectorName, messageContext) {
  return callClaudeWithKnowledge({
    functionName: 'draft_linkedin_message',
    system: `You are a LinkedIn outreach expert at Develop AI. Write a short, personalised LinkedIn connection message or InMail.

Rules:
- Under 300 characters for connection requests, under 1000 for InMails
- Professional but human — not corporate-speak
- Lead with value, not a sales pitch
- Reference something specific about their role or organisation
- End with a soft ask (coffee chat, insight share, not a demo request)

Output ONLY the message text, nothing else.`,
    userContent: `Write a LinkedIn message to ${contactName || 'this person'}${contactRole ? ` (${contactRole})` : ''} at ${orgName || 'their organisation'} in the ${sectorName} sector.${messageContext ? `\nContext: ${messageContext}` : ''}`,
    maxTokens: 500,
    temperature: 0.7,
    context: { sectorName, searchTerms: `${sectorName} ${orgName || ''} LinkedIn outreach` },
  });
}

export async function suggestLeadTargets(sectorName, idealClient) {
  return callClaudeWithKnowledge({
    functionName: 'suggest_lead_targets',
    system: `You are a market research analyst at Develop AI. Suggest specific types of organisations and roles to target for AI training services in the ${sectorName} sector.

Be concrete and actionable — don't just say "law firms", say "mid-size law firms (50-200 lawyers) with no dedicated innovation team, where the managing partner is the decision maker".

Structure your response with:
## Ideal Target Profiles
For each profile: org type, size, indicators they need AI training, decision maker role, estimated deal value.

## Where to Find Them
Specific networks, associations, events, publications.

## Qualifying Questions
Questions to ask in first contact to assess fit.

## Red Flags
Signs an org isn't ready or won't convert.`,
    userContent: `Suggest lead targets for AI training:\nSector: ${sectorName}\nIdeal client: ${idealClient || 'Not specified — suggest based on sector'}`,
    maxTokens: 2000,
    temperature: 0.5,
    context: { sectorName, searchTerms: `${sectorName} AI training target market leads` },
  });
}

// ═══════════════════════════════════════════════════════════════════
// AGENT 3: IMPLEMENTATION COACH
// ═══════════════════════════════════════════════════════════════════

export async function chatWithImplementationCoach(context, conversationHistory, userMessage) {
  const messages = conversationHistory.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: userMessage });

  const cohortInfo = context.cohortData
    ? `\nCohort: ${context.cohortData.name} (client: ${context.cohortData.client_name || 'self-funded'})\nActive journeys: ${context.journeys?.length || 0}`
    : '';

  return callClaudeWithKnowledge({
    functionName: 'agent_implementation_coach',
    system: `You are the Implementation Coach agent at Develop AI. You help Paul monitor and support organisations that have completed AI training and are now implementing AI into their daily work.

Your role:
- Track how well trained organisations are actually using what they learned
- Generate practical implementation tasks tailored to each org's work
- Identify who's falling behind and suggest interventions
- Assess submission quality and give constructive feedback
- Recommend follow-up training when gaps appear

${cohortInfo}

The goal is not just training completion — it's real-world AI adoption. Every task should push the learner to actually use AI in their specific professional context, not just understand it theoretically.`,
    messages,
    maxTokens: 4000,
    temperature: 0.5,
    context: { sectorName: context.sectorName, searchTerms: `AI implementation coaching ${context.sectorName} ${userMessage.slice(0, 80)}` },
  });
}

export async function generateFollowUpTasks(contact, organisation, completedTasks, course) {
  const completedList = completedTasks?.map(t => `- ${t.title} [${t.review_score || '?'}/5]`).join('\n') || 'None completed yet';

  const result = await callClaudeWithKnowledge({
    functionName: 'generate_followup_tasks',
    system: `You are an AI implementation coach at Develop AI. Generate follow-up tasks for someone who has completed initial training and is now implementing AI in their work.

These tasks should:
- Build on what they've already done (see completed tasks below)
- Be progressively more challenging
- Require real-world application, not hypothetical exercises
- Include deliverables that prove they're actually using AI
- Mix quick wins (15 min) with deeper projects (1-2 hours)

Return ONLY valid JSON — an array of task objects:
[{
  "title": "Action-oriented task title",
  "description": "Clear instructions (2-4 sentences)",
  "task_type": "deliverable|practice|reflection",
  "difficulty": "intermediate|advanced",
  "estimated_minutes": 30
}]

Generate 4-6 tasks.`,
    userContent: `Learner: ${contact.first_name} ${contact.last_name} (${contact.job_title || 'Professional'})\nOrganisation: ${organisation?.name || 'Unknown'} (${organisation?.type || 'Unknown'})\nCourse completed: ${course?.title || 'AI Training'}\nSector: ${course?.sector_name || 'General'}\n\nCompleted tasks:\n${completedList}`,
    maxTokens: 2000,
    temperature: 0.5,
    context: { sectorName: course?.sector_name, searchTerms: `implementation tasks ${organisation?.type || ''} AI` },
  });

  try { return JSON.parse(result); }
  catch { const m = result.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; }
}

export async function draftNudgeEmail(contact, organisation, stalledTasks, daysSinceActivity) {
  const text = await callClaudeWithKnowledge({
    functionName: 'draft_nudge_email',
    system: `You are a friendly AI implementation coach at Develop AI. Write a nudge email to someone who has gone quiet on their AI implementation tasks.

Tone: Warm, supportive, not pushy. Acknowledge they're busy. Remind them of the value. Offer a specific small action.

Output in this exact format:
SUBJECT: <subject line>
---
<email body — under 150 words, personal, ends with a specific ask>`,
    userContent: `Write a nudge to ${contact.first_name} ${contact.last_name} at ${organisation?.name || 'their org'}.\nDays since last activity: ${daysSinceActivity}\nStalled tasks: ${stalledTasks?.map(t => t.title).join(', ') || 'General implementation'}`,
    maxTokens: 800,
    temperature: 0.6,
    context: { searchTerms: 'implementation follow-up nudge' },
  });

  const parts = text.split('---');
  const subjectMatch = parts[0]?.match(/SUBJECT:\s*(.+)/i);
  return {
    subject: subjectMatch ? subjectMatch[1].trim() : `Checking in on your AI implementation`,
    body: parts[1]?.trim() || text,
  };
}

export async function assessCohortProgress(cohortName, clientName, journeys, tasks) {
  const journeyData = journeys?.map(j =>
    `- ${j.first_name} ${j.last_name} (${j.org_name || 'Unknown org'}): ${j.overall_progress}% complete, skill level: ${j.skill_level}, last active: ${j.last_activity_at ? new Date(j.last_activity_at).toLocaleDateString() : 'never'}`
  ).join('\n') || 'No journey data';

  return callClaudeWithKnowledge({
    functionName: 'assess_cohort_progress',
    system: `You are an AI implementation programme manager at Develop AI. Analyse the progress of an entire cohort and produce a status report.

Output:
## Cohort Overview
Summary stats: how many learners, average progress, active vs stalled.

## Top Performers
Who's doing well and what they've achieved.

## At Risk
Who's fallen behind and how long they've been inactive.

## Common Patterns
What's working across the cohort and what's not.

## Recommended Actions
Specific interventions: nudge emails, follow-up sessions, adjusted tasks.

Be data-driven — reference specific people and numbers.`,
    userContent: `Cohort: ${cohortName} (Client: ${clientName || 'Self-funded'})\n\nLearner progress:\n${journeyData}`,
    maxTokens: 2000,
    temperature: 0.3,
    context: { searchTerms: 'cohort progress implementation assessment' },
  });
}
