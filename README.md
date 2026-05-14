# Grounded

Newsroom AI platform. Part of Develop AI.

This is a fresh build. See [`docs/BRIEFING.md`](docs/BRIEFING.md) for scope.
See [`REUSE.md`](REUSE.md) for what has been lifted from other Develop AI codebases.

The repo, npm package, env vars (`GROUNDED_*`), and dev-key file (`.grounded-distribution-key`) all carry the project name. Some lower-level identifiers — agent slugs (`drafter`, `distributor`, …), DB table prefixes (`distribution_*`, `audience_*`, …), URL paths (`/api/agents/drafter`), the cookie name (`anchor_token`), and the dev-seed login (`admin@anchor.local`) — were intentionally left as `anchor` to keep existing workflow definitions, sessions, and seeded data working.
