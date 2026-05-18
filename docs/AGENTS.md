# Grounded — the 8 agents + 4 tools (canonical)

This file is the single source of truth for the agents + tools Grounded ships. Verbatim from Paul's spec on 2026-05-18 (the concept-note reconciliation that introduced the agent/tool split). Any change to a scope or wording lands here first; the agent registry descriptions in `lib/agents/*.js` and any HANDOFF references must match this file.

The platform ships **eight agents** that do journalism work and **four tools** (with a fifth — Digital Security Audit — planned) that support newsroom operations. Each does one thing well; the power is in how each newsroom can coordinate and prompt them to suit their specific needs.

In code, all twelve register through the same `lib/agents/registry.js` and carry a `category: 'agent' | 'tool'` field. The Builder palette and the GlobalNav dropdown group by category; saved workflows can mix freely.

---

## Agents (8)

The agents do the actual journalism work — fact-checking, archiving, writing, researching, translating, producing, gathering submissions, listening to social media.

### 1. Verifier

Checks claims against external sources and the newsroom's archive. Returns a confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. Built on an Africa-grounded credibility map. Verifies both journalist-sourced claims and community-submitted material, pairing with the Digital News Gatherer's intake queue to fact-check tips, submissions, and contributor pieces before they enter the editorial pipeline. Pairs with Archivist to turn dead storage into a live intelligence system — archives that serve ongoing investigations, hold institutional memory, and open up product and licensing revenue.

### 2. Social media listener

Detect the origin of social media posts to track if they are from foreign agents and potentially have negative motives.

### 3. Archivist

Semantic search over the newsroom's own archive. Remains private to each newsroom. Turns decades of locked-up output into an asset the newsroom can actively use and, where appropriate, responsibly monetise.

### 4. Copywriter

Writes social copy, headlines, newsletter blurbs, and scripts in the newsroom's house style. Post these easily to social media accounts.

### 5. Researcher

Pulls and scrapes public records, court filings, regulatory disclosures, and financial documents.

### 6. Translator

Moves full stories between English and African languages with the depth needed to publish in them, not just gloss them. Maintains a per-newsroom glossary of approved terminology, place names, and idiom that builds with every edit. Routes each language pair to the model that performs best on it. It then surfaces phrase-level confidence so editors can see where the model is guessing, not just what it produced. Every human edit feeds back into the glossary and the routing logic, so quality compounds rather than plateaus.

### 7. Audio & Video Producer

Builds the finished product across formats: radio scripts, podcast outlines, video briefs, audio assembly, vertical video. In video, it pulls archive and stock footage together, auto-captions for the target platform, and outputs an editable timeline plus a ready-to-upload MP4. In audio, it delivers podcast-quality output, either in solo, two-host, or interview-style, with a sound design layer. And the product is sized for podcast platforms, WhatsApp voice notes, and audiograms.

### 8. Digital News Gatherer

Gathers tips, submissions, and contributor pieces from WhatsApp, web forms, and tip lines into a single editor triage queue, where the editor decides what moves on to Verifier for fact-checking, Researcher for added context and public-records depth, and/or Operations for contributor handling.

---

## Tools (4, with a 5th planned)

The tools support newsroom operations — fundraising, audience analytics, organisational running, governance tracking, security audit (planned). They sit alongside the journalism agents in the same Builder canvas and can be wired into the same workflows.

### 1. Fundraiser

Handles the structural work of grant writing. Keeps a live funder library of the major media-development donors and the newsroom's profile — strengths, prior coverage, audience data, impact stories — up to date. Auto-populates relevant sections so a short brief comes back as a first draft, mapped to the funder's structure with budget scaffolding included. Across the cohort, it surfaces collaboration opportunities — joint applications that improve everyone's odds.

### 2. Audience Analytics Manager

Collect analytics across the newsroom and build an AI layer over that so you can interrogate what's landing, what's missing, what's bouncing and where engagement is concentrating. Test a headline and sense-check a story angle against what has worked in the past.

### 3. Operations Manager

Runs the internal stuff: editorial calendar, deadlines, freelancer coordination, sales, logistics, financial management, performance metrics. The biggest departure is from how most media-sector AI projects are framed: AI working across the whole organisation, not just the editorial floor. This is the shift that turns AI from a feature into a foundation for organisational resilience.

### 4. AI Legal, Ethics & Regulation Tracker

Finds, collects, and stores legal, ethical, and regulatory shifts in the AI and media landscape on a daily basis. Newsrooms can search and cross-reference cases that may be relevant to them. The tool helps each newsroom build its own AI governance framework based on the AI implementations specific to that newsroom, rather than handing down a generic policy. Each newsroom ends up with a living framework it owns and can defend, updated as the regulatory landscape changes. Organisations without dedicated legal or technology teams shouldn't be at a systematic disadvantage.

### 5. Digital Security Audit *(planned — not yet built)*

A built-in audit a newsroom runs on its own setup that (a) maps where data is leaking — which external tools are in use, what each collects, where source material / contacts / unpublished work is exposed; (b) flags which external AI tools to avoid, scored against the newsroom's jurisdiction pack; (c) returns a prioritised list of fixes; (d) shows which tasks are being sent outside and what each exposes. Reuses the existing sensitivity classifier + routing layer (`lib/sensitivity/classify.js`, `lib/agents/route.js`) and the governance jurisdiction packs — not a new source of truth. Produces a saved, exportable report.

---

## Implementation notes (non-canonical)

These notes are about the code layout, not the agent/tool product spec.

- **Slugs in code are unchanged.** The Copywriter's slug is `drafter` ([lib/agents/drafter.js](../lib/agents/drafter.js)); the Digital News Gatherer's slug is `distributor` ([lib/agents/distributor.js](../lib/agents/distributor.js)); the Audio & Video Producer's slug is `producer`; etc. Display names follow this spec; back-end identifiers were intentionally left as-is to avoid migration churn for existing workflow definitions.
- **The Digital News Gatherer's outbound code lives under `lib/distribution/*`.** The dispatch + per-channel adapter + encrypted-credentials machinery from the earlier two-way Distributor design is retained because it works — it is now conceptually owned by the Copywriter ("Post these easily to social media accounts"). The agent registry only advertises the inbound triage flow for the Digital News Gatherer to new workflows.
- **Audience Analytics Manager dropped synthetic personas** in the 2026-05-07 scope revision. The persona / focus-group tables remain in the schema for backward compat with any pre-revision workflows, but the workspace's primary surface is consultations: `headline_test`, `angle_check`, `analytics_query`.
- **The Legal Tracker is currently a shell.** `lib/agents/legal_tracker.js` is a 175-line wrapper over the V1 `learning_updates` table so the tool appears in the registry and the User-mode UI. The full Tracker is a standalone codebase at `/INTEGRATE/tracker` (client + server + `holly.sql`) — to be integrated later as its own confirmed step.
- **Anchor → Grounded.** The platform was renamed on 2026-05-11; the deeper rename (env vars `ANCHOR_*` → `GROUNDED_*`, the `GROUNDED_MODEL` constant, the npm package name → `grounded`, the dev-key file → `.grounded-distribution-key`, the repo directory) followed on 2026-05-15. The GitHub repo was renamed `anchor` → `groundedai` and made public on 2026-05-18. Some lower-level identifiers — agent slugs, DB table prefixes, URL paths, the cookie name (`anchor_token`), and the dev-seed login (`admin@anchor.local`) — are still intentionally `anchor` to keep saved workflows, sessions, and seeded data working.
- **Agent vs tool, in code.** Registered via the `category: 'agent' | 'tool'` field on `register()` in [lib/agents/registry.js](../lib/agents/registry.js). Defaults to `'agent'` if omitted. Use `registry.listByCategory('agent')` / `registry.listByCategory('tool')` to fetch each group for UI rendering.
