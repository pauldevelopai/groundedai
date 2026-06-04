-- 043_node_makanday_int_metrics.sql
-- Lite-host parity fix.
--
-- node_makanday_analytics_stories.reach/engagement were BIGINT (migration 040).
-- node-postgres returns BIGINT (int8) as a STRING to avoid JS precision loss.
-- The MakanDay node's analytics (lib/analytics.js) assumes JS numbers — which is
-- what its standalone JSON/lite host provides — so on the integrated Postgres
-- host the sums/medians broke (totalReach came back as concatenated digits, not
-- a sum). INTEGER (int4) is returned as a JS number by node-postgres and is
-- ample for Facebook reach/engagement, restoring parity with the lite host.
--
-- Convention for future Nodes: use INTEGER for count-like metrics the node does
-- arithmetic on, so the integrated host returns the same JS-number type the lite
-- host does.
ALTER TABLE node_makanday_analytics_stories
  ALTER COLUMN reach TYPE INTEGER,
  ALTER COLUMN engagement TYPE INTEGER;
