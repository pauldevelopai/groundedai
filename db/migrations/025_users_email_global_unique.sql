-- Make users.email globally unique (case-insensitive).
--
-- Pre-existing schema only enforced (newsroom_id, email) uniqueness, on the
-- assumption an email could exist independently in two different newsrooms.
-- The login flow does not honour that — it looks up by email alone and
-- returns the first matching row, which means email collisions across
-- newsrooms cause arbitrary login routing.
--
-- The platform's actual access model is one-newsroom-per-user (no
-- cross-newsroom membership in this slice), so a global unique index is
-- the right shape and matches what login already assumes.
--
-- If two newsrooms have already created users with the same email, this
-- migration WILL fail. The platform-readiness audit (2026-05-09) confirmed
-- no such collisions exist; if a future deployment hits this, resolve the
-- duplicates before applying.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_global_uniq
  ON users (lower(email));

COMMIT;
