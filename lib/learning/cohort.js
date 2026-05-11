// Cross-cohort meta-analytics. SELECTs across the per-newsroom tables
// roll up into anonymised cohort metrics — the calling newsroom sees
// "the cohort ran 47 weekly_planning briefs this month, 11 of them
// surfaced overdue freelancer payments" without seeing any other
// newsroom's specific data.
//
// All queries return aggregate counts only; no row-level data crosses
// the newsroom boundary. The calling newsroom is included in the
// rollup; that's intentional — it's a cohort metric, not a peer
// comparison.

const { pool } = require('../db');

/**
 * Cohort-level metrics — agent usage, brief generation, signal volume.
 * Every count includes all newsrooms in the cohort. Returns a stable
 * shape the /learning page can render directly.
 */
async function cohortMetrics() {
  const [
    newsroomCount,
    workflowsTotal,
    workflowRunsRecent,
    briefsByAgent,
    verifierRunsRecent,
    socialSignalsRecent,
    distributionSendsRecent,
    consultationsRecent,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM newsrooms`),
    pool.query(`SELECT COUNT(*)::int AS n FROM workflows`),
    pool.query(`SELECT COUNT(*)::int AS n FROM workflow_runs WHERE created_at >= NOW() - INTERVAL '30 days'`),
    pool.query(`
      SELECT 'fundraiser' AS agent, COUNT(*)::int AS n FROM fundraiser_briefs WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'operations', COUNT(*)::int FROM ops_briefs WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'distributor', COUNT(*)::int FROM distributor_briefs WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'social_listener', COUNT(*)::int FROM social_listener_briefs WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'audience', COUNT(*)::int FROM audience_consultations WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'verifier', COUNT(*)::int FROM verifier_runs WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'producer', COUNT(*)::int FROM producer_productions WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL SELECT 'translator', COUNT(*)::int FROM translations WHERE created_at >= NOW() - INTERVAL '30 days'
    `),
    pool.query(`
      SELECT status, COUNT(*)::int AS n
        FROM verifier_runs
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY status
    `),
    pool.query(`
      SELECT status, COUNT(*)::int AS n
        FROM social_signals
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY status
    `),
    pool.query(`
      SELECT status, COUNT(*)::int AS n
        FROM distribution_sends
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY status
    `),
    pool.query(`
      SELECT kind, COUNT(*)::int AS n
        FROM audience_consultations
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY kind
    `),
  ]);

  // Verifier credibility-map matches: how often the cohort's runs
  // matched outlets in their credibility maps. Captures whether the
  // map is being used at all.
  const verifierOutletMatches = await pool.query(`
    SELECT
      COUNT(*)::int AS total_runs,
      COUNT(*) FILTER (WHERE jsonb_typeof(matched_outlet_findings) = 'object'
                              AND matched_outlet_findings <> '{}'::jsonb)::int AS runs_with_matches
      FROM verifier_runs
     WHERE created_at >= NOW() - INTERVAL '30 days'
  `);

  // Social Listener: network-match rate
  const ioNetworkMatches = await pool.query(`
    SELECT COUNT(*)::int AS signals_with_network_match
      FROM social_signals
     WHERE created_at >= NOW() - INTERVAL '30 days'
       AND array_length(matched_networks, 1) > 0
  `);

  return {
    cohort_size: newsroomCount.rows[0].n,
    workflows_total: workflowsTotal.rows[0].n,
    workflow_runs_30d: workflowRunsRecent.rows[0].n,
    briefs_by_agent_30d: briefsByAgent.rows.sort((a, b) => b.n - a.n),
    verifier: {
      runs_30d: verifierOutletMatches.rows[0].total_runs,
      runs_with_credibility_match: verifierOutletMatches.rows[0].runs_with_matches,
      by_status: verifierRunsRecent.rows,
    },
    social: {
      signals_30d: socialSignalsRecent.rows.reduce((s, r) => s + r.n, 0),
      signals_with_io_network_match: ioNetworkMatches.rows[0].signals_with_network_match || 0,
      by_status: socialSignalsRecent.rows,
    },
    distribution: {
      sends_30d: distributionSendsRecent.rows.reduce((s, r) => s + r.n, 0),
      by_status: distributionSendsRecent.rows,
    },
    audience: {
      consultations_30d: consultationsRecent.rows.reduce((s, r) => s + r.n, 0),
      by_kind: consultationsRecent.rows,
    },
  };
}

module.exports = { cohortMetrics };
