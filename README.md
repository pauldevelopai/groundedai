# Grounded

Newsroom AI platform. Part of Develop AI. Shared AI infrastructure for African newsrooms — twelve agents (Verifier, Archivist, Copywriter, Researcher, Translator, Audio & Video Producer, Digital News Gatherer, Fundraiser, Audience Analytics Manager, Operations Manager, Social media listener, AI Legal Ethics & Regulation Tracker) composable into newsroom-specific workflows via a drag-and-drop Builder. See [`docs/BRIEFING.md`](docs/BRIEFING.md) for scope and [`docs/AGENTS.md`](docs/AGENTS.md) for the canonical agent definitions.

Open source under [Apache-2.0](LICENSE). Built so any newsroom or successor team can fork, inspect, and run it independently.

See [`REUSE.md`](REUSE.md) for what has been lifted from other Develop AI codebases.

The repo, npm package, env vars (`GROUNDED_*`), and dev-key file (`.grounded-distribution-key`) all carry the project name. Some lower-level identifiers — agent slugs (`drafter`, `distributor`, …), DB table prefixes (`distribution_*`, `audience_*`, …), URL paths (`/api/agents/drafter`), the cookie name (`anchor_token`), and the dev-seed login (`admin@anchor.local`) — were intentionally left as `anchor` to keep existing workflow definitions, sessions, and seeded data working.
