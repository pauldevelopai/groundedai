# Grounded — the 11 agents (canonical)

This file is the single source of truth for the 11 agents Grounded ships. Verbatim from Paul's spec on 2026-05-11 (the rename pass). Any change to an agent's scope or wording lands here first; the agent registry descriptions in `lib/agents/*.js` and any HANDOFF references must match this file.

The platform ships with eleven agents. Each does one thing well and the power is in how each newsroom can coordinate and prompt to suit their specific needs. Newsrooms combine them into workflows that fit how they actually work.

## 1. Verifier

Checks claims against external sources and the newsroom's archive. Returns a confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. Built on an Africa-grounded credibility map. Verifies both journalist-sourced claims and community-submitted material, pairing with the Digital News Gatherer's intake queue to fact-check tips, submissions, and contributor pieces before they enter the editorial pipeline. Pairs with Archivist to turn dead storage into a live intelligence system — archives that serve ongoing investigations, hold institutional memory, and open up product and licensing revenue.

## 2. Social media listener

Detect the origin of social media posts to track if they are from foreign agents and potentially have negative motives.

## 3. Archivist

Semantic search over the newsroom's own archive. Remains private to each newsroom. Turns decades of locked-up output into an asset the newsroom can actively use and, where appropriate, responsibly monetise.

## 4. Copywriter

Writes social copy, headlines, newsletter blurbs, and scripts in the newsroom's house style. Post these easily to social media accounts.

## 5. Researcher

Pulls and scrapes public records, court filings, regulatory disclosures, and financial documents.

## 6. Translator

Moves full stories between English and African languages with the depth needed to publish in them, not just gloss them. Maintains a per-newsroom glossary of approved terminology, place names, and idiom that builds with every edit. Routes each language pair to the model that performs best on it. It then surfaces phrase-level confidence so editors can see where the model is guessing, not just what it produced. Every human edit feeds back into the glossary and the routing logic, so quality compounds rather than plateaus.

## 7. Audio & Video Producer

Builds the finished product across formats: radio scripts, podcast outlines, video briefs, audio assembly, vertical video. In video, it pulls archive and stock footage together, auto-captions for the target platform, and outputs an editable timeline plus a ready-to-upload MP4. In audio, it delivers podcast-quality output, either in solo, two-host, or interview-style, with a sound design layer. And the product is sized for podcast platforms, WhatsApp voice notes, and audiograms.

## 8. Digital News Gatherer

Gathers tips, submissions, and contributor pieces from WhatsApp, web forms, and tip lines into a single editor triage queue, where the editor decides what moves on to Verifier for fact-checking, Researcher for added context and public-records depth, and/or Operations for contributor handling.

## 9. Fundraiser

Handles the structural work of grant writing. Keeps a live funder library of the major media-development donors and the newsroom's profile — strengths, prior coverage, audience data, impact stories — up to date. Auto-populates relevant sections so a short brief comes back as a first draft, mapped to the funder's structure with budget scaffolding included. Across the cohort, it surfaces collaboration opportunities — joint applications that improve everyone's odds.

## 10. Audience Analytics Manager

Collect analytics across the newsroom and build an AI layer over that so you can interrogate what's landing, what's missing, what's bouncing and where engagement is concentrating. Test a headline and sense-check a story angle against what has worked in the past.

## 11. Operations Manager

Runs the internal stuff: editorial calendar, deadlines, freelancer coordination, sales, logistics, financial management, performance metrics. The biggest departure is from how most media-sector AI projects are framed: AI working across the whole organisation, not just the editorial floor. This is the shift that turns AI from a feature into a foundation for organisational resilience.

---

## Implementation notes (non-canonical)

These notes are about the code layout, not the agent product spec.

- **Agent slugs in code are unchanged.** The Copywriter agent's slug is still `drafter` (file: `lib/agents/drafter.js`); the Digital News Gatherer's slug is still `distributor` (`lib/agents/distributor.js`); the Audio & Video Producer's slug is still `producer`; etc. Display names follow this spec; back-end identifiers were intentionally left as-is to avoid migration churn for existing workflow definitions.
- **The Digital News Gatherer's outbound code lives under `lib/distribution/*`.** The dispatch + per-channel adapter + encrypted-credentials machinery from the earlier two-way Distributor design is retained because it works — it is now conceptually owned by the Copywriter agent ("Post these easily to social media accounts"). The agent registry only advertises the inbound triage flow for the Digital News Gatherer to new workflows.
- **Audience Analytics Manager dropped synthetic personas** in the 2026-05-07 scope revision. The persona / focus-group tables remain in the schema for backward compat with any pre-revision workflows, but the workspace's primary surface is consultations: headline_test, angle_check, analytics_query.
- **Anchor → Grounded.** The platform was renamed on 2026-05-11; the deeper rename (env vars `ANCHOR_*` → `GROUNDED_*`, the `GROUNDED_MODEL` constant, the npm package name → `grounded`, the dev-key file → `.grounded-distribution-key`, the repo directory) followed on 2026-05-15. Some lower-level identifiers — agent slugs, DB table prefixes, URL paths, the cookie name (`anchor_token`), and the dev-seed login (`admin@anchor.local`) — are still intentionally `anchor` to keep saved workflows, sessions, and seeded data working.
