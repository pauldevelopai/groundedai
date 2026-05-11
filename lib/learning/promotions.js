// Workflow auto-promotion.
//
// At pilot scale we don't yet have a per-workflow execution log
// (workflow_runs is per-agent-invocation, no workflow_id FK), so
// adoption / run counts can't be derived from usage data. The pilot
// heuristic is:
//
//   - any workflow with is_shared = TRUE is a promotion candidate
//   - admins recompute the promotions table from the candidates
//   - usage_count and cohort_adopter_count default to 0 until we add
//     workflow-level execution logging (post-pilot)
//
// This keeps the surface functional without inventing fake adoption
// numbers. Editors at other newsrooms still see the recommended
// workflows; the metrics fill in honestly once we have real signals
// to count.

const { pool } = require('../db');

async function computePromotions() {
  const { rows: candidates } = await pool.query(
    `SELECT w.id AS workflow_id,
            w.name AS title,
            w.problem_statement,
            w.problem_category,
            w.newsroom_id AS origin_newsroom_id,
            n.name AS origin_newsroom_name
       FROM workflows w
       JOIN newsrooms n ON n.id = w.newsroom_id
      WHERE w.is_shared = TRUE
      ORDER BY w.updated_at DESC NULLS LAST`
  );

  let promoted = 0;
  for (const c of candidates) {
    const existing = await pool.query(
      `SELECT id FROM workflow_promotions WHERE workflow_id = $1`,
      [c.workflow_id]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE workflow_promotions
            SET title = $2, problem_statement = $3, problem_category = $4,
                origin_newsroom_id = $5, origin_newsroom_name = $6,
                status = 'promoted', updated_at = NOW()
          WHERE workflow_id = $1`,
        [
          c.workflow_id, c.title, c.problem_statement, c.problem_category,
          c.origin_newsroom_id, c.origin_newsroom_name,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO workflow_promotions
           (workflow_id, title, problem_statement, problem_category,
            origin_newsroom_id, origin_newsroom_name,
            usage_count, cohort_adopter_count, cohort_success_rate,
            recommendation_note, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0, NULL, $7, 'promoted')`,
        [
          c.workflow_id, c.title, c.problem_statement, c.problem_category,
          c.origin_newsroom_id, c.origin_newsroom_name,
          `Shared by ${c.origin_newsroom_name}. Adoption metrics will populate once per-workflow execution logging lands.`,
        ]
      );
      promoted++;
    }
  }
  return { candidate_count: candidates.length, newly_promoted: promoted };
}

async function listPromotions(newsroomId) {
  const { rows } = await pool.query(
    `SELECT p.*,
            wa.id AS adoption_id,
            wa.created_at AS adopted_at,
            wa.copied_workflow_id
       FROM workflow_promotions p
       LEFT JOIN workflow_adoptions wa
         ON wa.promotion_id = p.id AND wa.newsroom_id = $1
      WHERE p.status = 'promoted'
      ORDER BY p.cohort_adopter_count DESC, p.usage_count DESC`,
    [newsroomId]
  );
  return rows;
}

async function adoptPromotion(newsroomId, userId, promotionId) {
  const existing = await pool.query(
    `SELECT * FROM workflow_adoptions WHERE promotion_id = $1 AND newsroom_id = $2`,
    [promotionId, newsroomId]
  );
  if (existing.rows.length > 0) return { adoption: existing.rows[0], created: false };

  const { rows } = await pool.query(
    `INSERT INTO workflow_adoptions (promotion_id, newsroom_id, adopted_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [promotionId, newsroomId, userId]
  );
  await pool.query(
    `UPDATE workflow_promotions SET cohort_adopter_count = cohort_adopter_count + 1, updated_at = NOW() WHERE id = $1`,
    [promotionId]
  );
  return { adoption: rows[0], created: true };
}

module.exports = { computePromotions, listPromotions, adoptPromotion };
