import pool from '../db/pool.js';
import { generateEmbedding, toPgVector } from './embeddings.js';

/**
 * Retrieve relevant knowledge entries using PostgreSQL full-text search
 * combined with category and entity filtering.
 */
export async function getRelevantKnowledge({ categories = null, sectorId = null, orgId = null, courseId = null, searchTerms = null, limit = 5 } = {}) {
  // Try vector search first if search terms provided
  if (searchTerms) {
    try {
      const queryEmbedding = await generateEmbedding(searchTerms);
      if (queryEmbedding) {
        return await hybridVectorSearch({ queryEmbedding, searchTerms, categories, sectorId, orgId, courseId, limit });
      }
    } catch (err) {
      console.warn('[Knowledge] Vector search failed, falling back to text search:', err.message);
    }
  }

  // Fallback: pure text/metadata search
  return await textSearch({ searchTerms, categories, sectorId, orgId, courseId, limit });
}

async function hybridVectorSearch({ queryEmbedding, searchTerms, categories, sectorId, orgId, courseId, limit }) {
  const pgVector = toPgVector(queryEmbedding);
  const params = [pgVector, searchTerms || '', limit];
  let conditions = ['ke.is_active = true', '(ke.expires_at IS NULL OR ke.expires_at > NOW())'];

  if (categories && categories.length > 0) {
    params.push(categories);
    conditions.push(`ke.category = ANY($${params.length})`);
  }
  if (sectorId) {
    params.push(sectorId);
    conditions.push(`(ke.sector_id = $${params.length} OR ke.sector_id IS NULL)`);
  }
  if (orgId) {
    params.push(orgId);
    conditions.push(`(ke.organisation_id = $${params.length} OR ke.organisation_id IS NULL)`);
  }
  if (courseId) {
    params.push(courseId);
    conditions.push(`(ke.course_id = $${params.length} OR ke.course_id IS NULL)`);
  }

  const query = `
    SELECT ke.id, ke.category, ke.title, ke.content, ke.confidence, ke.is_verified,
      ke.usage_count, ke.sector_id, ke.organisation_id, ke.course_id,
      CASE WHEN ke.embedding IS NOT NULL THEN 1 - (ke.embedding <=> $1::vector) ELSE 0 END AS vector_score,
      ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')), plainto_tsquery('english', $2)) AS text_score
    FROM knowledge_entries ke
    WHERE ${conditions.join(' AND ')}
    ORDER BY (
      COALESCE(CASE WHEN ke.embedding IS NOT NULL THEN 1 - (ke.embedding <=> $1::vector) ELSE 0 END, 0) * 0.6 +
      COALESCE(ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')), plainto_tsquery('english', $2)), 0) * 0.2 +
      CASE WHEN ke.is_verified THEN 0.1 ELSE 0 END +
      COALESCE(ke.confidence, 0) * 0.1
    ) DESC
    LIMIT $3
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

async function textSearch({ searchTerms, categories, sectorId, orgId, courseId, limit }) {
  const params = [];
  let conditions = ['ke.is_active = true', '(ke.expires_at IS NULL OR ke.expires_at > NOW())'];

  if (categories && categories.length > 0) {
    params.push(categories);
    conditions.push(`ke.category = ANY($${params.length})`);
  }
  if (sectorId) {
    params.push(sectorId);
    conditions.push(`(ke.sector_id = $${params.length} OR ke.sector_id IS NULL)`);
  }
  if (orgId) {
    params.push(orgId);
    conditions.push(`(ke.organisation_id = $${params.length} OR ke.organisation_id IS NULL)`);
  }
  if (courseId) {
    params.push(courseId);
    conditions.push(`(ke.course_id = $${params.length} OR ke.course_id IS NULL)`);
  }

  let rankSelect = '0 AS rank';
  if (searchTerms) {
    params.push(searchTerms);
    rankSelect = `ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')), plainto_tsquery('english', $${params.length})) AS rank`;
  }

  params.push(limit);

  const query = `
    SELECT ke.id, ke.category, ke.title, ke.content, ke.confidence, ke.is_verified,
      ke.usage_count, ke.sector_id, ke.organisation_id, ke.course_id,
      ${rankSelect}
    FROM knowledge_entries ke
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE WHEN ke.is_verified THEN 1 ELSE 0 END DESC,
      ke.confidence DESC,
      rank DESC,
      ke.usage_count DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Build an enriched system prompt by injecting relevant knowledge.
 * Returns { enrichedPrompt, knowledgeIds }
 */
export async function buildEnrichedSystemPrompt(functionName, basePrompt, context = {}) {
  const { sectorId, sectorName, orgId, orgName, courseId, searchTerms } = context;

  // Check for a prompt template override
  const { rows: templates } = await pool.query(
    'SELECT * FROM prompt_templates WHERE function_name = $1 AND is_active = true',
    [functionName]
  );
  const template = templates[0];

  // Determine knowledge query from template or defaults
  let categories = null;
  let limit = 5;

  if (template?.knowledge_query) {
    const kq = template.knowledge_query;
    categories = kq.categories || null;
    limit = kq.max_entries || 5;
  } else {
    // Default knowledge categories per function type
    const categoryMap = {
      analyse_assessment: ['client_insight', 'assessment_insight', 'industry_trend'],
      suggest_course_improvements: ['course_outcome', 'content_effectiveness', 'feedback_pattern', 'industry_trend'],
      chat_research_assistant: ['course_outcome', 'industry_trend', 'tool_technique'],
      generate_document: ['client_insight', 'regulatory', 'assessment_insight'],
      draft_cold_email: ['client_insight', 'content_effectiveness'],
      draft_social_post: ['industry_trend', 'content_effectiveness'],
      research_funding: ['proposal_outcome', 'client_insight'],
      draft_funding_application: ['proposal_outcome', 'course_outcome', 'client_insight'],
      draft_funding_report: ['proposal_outcome', 'course_outcome'],
      generate_business_summary: ['client_insight', 'course_outcome', 'industry_trend'],
      chat_assistant: ['client_insight', 'course_outcome', 'industry_trend', 'tool_technique'],
      analyse_feedback_trends: ['feedback_pattern', 'course_outcome', 'content_effectiveness'],
      research_industry_trends: ['industry_trend', 'tool_technique', 'regulatory'],
    };
    categories = categoryMap[functionName] || ['industry_trend', 'client_insight'];
  }

  // Build search terms from context
  const terms = [searchTerms, sectorName, orgName].filter(Boolean).join(' ');

  const entries = await getRelevantKnowledge({
    categories,
    sectorId,
    orgId,
    courseId,
    searchTerms: terms || null,
    limit,
  });

  if (entries.length === 0) {
    return { enrichedPrompt: basePrompt, knowledgeIds: [] };
  }

  // Format knowledge section
  const knowledgeSection = entries.map(e => {
    let line = `- [${e.category}] ${e.title}: ${e.content}`;
    if (e.content.length > 300) line = `- [${e.category}] ${e.title}: ${e.content.slice(0, 300)}...`;
    return line;
  }).join('\n');

  const enrichedPrompt = `${basePrompt}

## Holly's Accumulated Knowledge
The following insights are drawn from Holly's knowledge base — past assessments, programme outcomes, research, and verified findings. Reference these where relevant:

${knowledgeSection}`;

  const knowledgeIds = entries.map(e => e.id);

  return { enrichedPrompt, knowledgeIds };
}

/**
 * Record that knowledge entries were used in an AI call.
 */
export async function recordKnowledgeUsage(knowledgeIds) {
  if (!knowledgeIds || knowledgeIds.length === 0) return;
  await pool.query(
    `UPDATE knowledge_entries SET usage_count = usage_count + 1, last_used_at = NOW()
     WHERE id = ANY($1)`,
    [knowledgeIds]
  );
}

/**
 * Record an AI interaction for the feedback loop.
 */
export async function recordInteraction({ interactionType, sectorId, entityType, entityId, knowledgeIdsUsed, inputSummary, outputText, userId, durationMs }) {
  const { rows } = await pool.query(
    `INSERT INTO ai_interactions (interaction_type, sector_id, entity_type, entity_id, knowledge_ids_used, input_summary, output_text, user_id, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [interactionType, sectorId || null, entityType || null, entityId || null, knowledgeIdsUsed || [], inputSummary || null, outputText, userId || null, durationMs || null]
  );
  return rows[0].id;
}

/**
 * Create a knowledge entry from any source.
 */
export async function createKnowledgeEntry({ category, subcategory, title, content, sectorId, organisationId, courseId, sourceType, sourceId, sourceDescription, confidence, tags }) {
  const { rows } = await pool.query(
    `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, organisation_id, course_id, source_type, source_id, source_description, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [category, subcategory || null, title, content, sectorId || null, organisationId || null, courseId || null, sourceType, sourceId || null, sourceDescription || null, confidence || 0.5]
  );
  const knowledgeId = rows[0].id;

  // Add tags
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      await pool.query(
        'INSERT INTO knowledge_tags (knowledge_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [knowledgeId, tag.toLowerCase()]
      );
    }
  }

  // Generate and store embedding (non-blocking)
  generateEmbedding(`${title}. ${content}`.slice(0, 2000)).then(embedding => {
    if (embedding) {
      pool.query('UPDATE knowledge_entries SET embedding = $1 WHERE id = $2', [toPgVector(embedding), knowledgeId])
        .catch(err => console.error('[Knowledge] Failed to store embedding:', err.message));
    }
  }).catch(() => {});

  return knowledgeId;
}

/**
 * Full-text search across knowledge entries.
 */
export async function searchKnowledge(query, { sectorId, limit = 20 } = {}) {
  // Try vector search first
  try {
    const queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding) {
      const pgVector = toPgVector(queryEmbedding);
      const params = [pgVector, query, limit];
      let sectorFilter = '';
      if (sectorId) {
        params.push(sectorId);
        sectorFilter = `AND (ke.sector_id = $${params.length} OR ke.sector_id IS NULL)`;
      }

      const { rows } = await pool.query(`
        SELECT ke.*,
          CASE WHEN ke.embedding IS NOT NULL THEN 1 - (ke.embedding <=> $1::vector) ELSE 0 END AS vector_score,
          ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')),
                  plainto_tsquery('english', $2)) AS text_score
        FROM knowledge_entries ke
        WHERE ke.is_active = true ${sectorFilter}
        ORDER BY (
          COALESCE(CASE WHEN ke.embedding IS NOT NULL THEN 1 - (ke.embedding <=> $1::vector) ELSE 0 END, 0) * 0.7 +
          COALESCE(ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')), plainto_tsquery('english', $2)), 0) * 0.3
        ) DESC
        LIMIT $3
      `, params);
      return rows;
    }
  } catch (err) {
    console.warn('[Knowledge] Vector search failed in searchKnowledge:', err.message);
  }

  // Fallback: pure text search
  const params = [query];
  let sectorFilter = '';
  if (sectorId) {
    params.push(sectorId);
    sectorFilter = `AND (ke.sector_id = $${params.length} OR ke.sector_id IS NULL)`;
  }
  params.push(limit);

  const { rows } = await pool.query(`
    SELECT ke.*,
      ts_rank(to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, '')),
              plainto_tsquery('english', $1)) AS rank
    FROM knowledge_entries ke
    WHERE ke.is_active = true
      AND to_tsvector('english', coalesce(ke.title, '') || ' ' || coalesce(ke.content, ''))
          @@ plainto_tsquery('english', $1)
      ${sectorFilter}
    ORDER BY rank DESC, ke.confidence DESC
    LIMIT $${params.length}
  `, params);
  return rows;
}

/**
 * Get knowledge stats for dashboard.
 */
export async function getKnowledgeStats() {
  const { rows: totals } = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_verified)::int AS verified,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent
    FROM knowledge_entries WHERE is_active = true
  `);
  const { rows: cats } = await pool.query(`
    SELECT category, COUNT(*)::int AS count
    FROM knowledge_entries WHERE is_active = true GROUP BY category ORDER BY count DESC
  `);
  return { ...totals[0], by_category: cats };
}
