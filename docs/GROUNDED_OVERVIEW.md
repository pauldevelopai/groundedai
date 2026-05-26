# GROUNDED — the complete system

**What it is, everything it does, how it's built, the thinking behind it, and what's next.**

**Compiled:** 2026-05-26 (Claude, Opus 4.7), from the codebase + canonical docs + the Hub/Tracker/Nodes integration work.
**Status of this doc:** the definitive overview. Canonical sub-sources where they go deeper: [`AGENTS.md`](AGENTS.md) (agent/tool spec), [`HUB_TRACKER_NODES_PLAN.md`](HUB_TRACKER_NODES_PLAN.md) (Hub/Tracker/Nodes design + decisions), [`ROADMAP.md`](ROADMAP.md), [`README.md`](../README.md).

---

## Contents

1. [What GROUNDED is](#1-what-grounded-is)
2. [The shape — Hub + three pillars](#2-the-shape)
3. [The thinking & methods](#3-the-thinking--methods)
4. [Pillar 1 — Builder (8 agents + the engine)](#4-pillar-1--builder)
5. [The 4 operations tools](#5-the-4-operations-tools)
6. [Pillar 2 — Nodes](#6-pillar-2--nodes)
7. [Pillar 3 — Tracker (the AI-Legal app, absorbed)](#7-pillar-3--tracker)
8. [The Hub](#8-the-hub)
9. [Cross-cutting infrastructure](#9-cross-cutting-infrastructure)
10. [Stack & conventions](#10-stack--conventions)
11. [Repo layout](#11-repo-layout)
12. [How to run the whole platform](#12-how-to-run-the-whole-platform)
13. [Current state — what's done & verified](#13-current-state)
14. [What needs to be done next](#14-what-needs-to-be-done-next)
15. [Source-of-truth map](#15-source-of-truth-map)

---

## 1. What GROUNDED is

**Shared AI infrastructure for African newsrooms.** Most African newsrooms have done an AI *workshop*; almost none have working AI *infrastructure*. GROUNDED closes that gap: a multi-tenant web platform where one person at a newsroom (the "AI champion") composes AI workflows from prebuilt agents, and the rest of the team uses what the champion ships through a simple web UI. Sensitive material can run on the newsroom's own hardware; everything else uses Anthropic Claude in the cloud. Apache-2.0, built to outlive its maker — any newsroom or successor team can fork, inspect, and run it.

It is the flagship of **GROUNDED**, a practice under **Develop AI**.

| | |
|---|---|
| **Who** | African newsrooms — pilot of 5 ZimZam newsrooms: Capital FM Lusaka, EnviroPress, MakanDay, Maricho Media, VicFallsLive (Zambia + Zimbabwe). |
| **Markets** | South Africa, Zimbabwe, Zambia, Kenya (SA + KE in the next cohort). |
| **Scale ambition** | 5 → 120+ newsrooms across the continent. |
| **Timeline** | Build window Jul–Dec 2026; grantee charging from Jan 2027. |
| **Licence** | Apache-2.0 — forkable, designed to outlive Develop AI. |
| **Only paid dependency** | Anthropic Claude. Everything non-LLM is OSS and fully free at any volume. |
| **Network effect** | A cross-newsroom shared **workflow library** — "what works in Lusaka can run in Harare without anyone rebuilding it." Workflows are framed as *solved problems*, not pipelines. |

---

## 2. The shape

A top-level **Hub** with three pillars:

```
                         ┌─────────────────────────────┐
                         │   /  — the HUB landing page  │
                         │   Builder · Nodes · Tracker  │
                         └──────────────┬──────────────┘
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                                ▼
   BUILDER                            NODES                            TRACKER
   /builder · /run                    /nodes                           /tracker
   compose & run workflows            directory of standalone          the AI-Legal app,
   from the 8 AGENTS;                 AI mini-apps; run the latest      absorbed into groundedai:
   the 4 operations TOOLS             online or clone to a laptop.      public lawsuits/regs/
   live here too.                     The 4 tools are surfaced here.    use-cases site + admin
        │                               │                              + scraper ingestion.
        └──────────────────────── shared substrate ───────────────────────┘
            anchor_token session · one Postgres (newsroom_id isolation) ·
            Haiku-locked lib/claude.js + api_costs · OSS-first stack
```

- **Builder** — the existing GROUNDED platform: compose workflows from the **8 journalism agents**; the **4 operations tools** ship alongside. Two modes (champion builds; team uses).
- **Nodes** — an open directory of standalone AI mini-apps newsrooms create and share; each runs **online** in GROUNDED *or* **cloned on a laptop** (one codebase, two runtimes). The 4 tools are surfaced here too (they're newsroom utilities).
- **Tracker** — the "AI-Legal" application (lawsuits / regulations / AI-in-media use-cases across jurisdictions), **absorbed into the GROUNDED repo** and running on the shared database.

---

## 3. The thinking & methods

The design philosophy that shaped every decision — these are *constraints*, not preferences.

### Product thinking
- **Infrastructure, not a chatbot.** The value is prebuilt, composable, shareable workflows a non-technical newsroom lead assembles — captured as durable assets, not improvised in chat.
- **Workflows are products framed as problems.** Every workflow carries `problem_statement` / `problem_category` / `user_instructions`. User mode groups by *problem*, not by agent. The shared library is a marketplace of solved problems.
- **Two modes.** *Builder mode*: the AI champion composes on a drag-and-drop canvas (React Flow), or describes a workflow in English and Claude drafts the graph ("Describe & build"). *User mode*: the team picks a named workflow and runs it — never sees agents or prompts. **Web only** for journalists.
- **Owned data over scraped data.** Agents/nodes lean on the newsroom's *own* archive, analytics, and history — the signal that's defensible and private.
- **Built to outlive the maker.** Apache-2.0; the method lives in saved workflows inside each newsroom.

### Locked technical decisions (do not relitigate without explicit approval)
1. **Haiku 4.5 only** for every Claude call. Hardcoded `GROUNDED_MODEL = 'claude-haiku-4-5-20251001'` in [`lib/claude.js`](../lib/claude.js): no model param, no env override, no UI knob. *Why:* cost is the binding constraint at per-newsroom volume; quality suffices (a Researcher benchmark put Haiku at 22× Opus's cost-efficiency on identical extraction). **One exception:** an *availability* fallback to local Ollama (`gemma3:12b`) when Anthropic is unreachable — responses carry `usedFallback:true`; not a cost/tier knob.
2. **OSS + fully-free for every non-LLM module.** No free-tier hosted APIs. Anthropic is the only paid dependency. (Embeddings, translation, STT/TTS, parsing all run in-process or as local binaries.)
3. **Per-newsroom isolation by construction.** Every multi-tenant row has `newsroom_id`; every query is scoped; the `db_read` agentic tool refuses cross-newsroom reads. (AI-Legal *reference* data — lawsuits/regs — is the documented exception: global, `newsroom_id IS NULL`, the same worldwide.)
4. **Anchor → GROUNDED rename is partial on purpose.** Slugs (`drafter`, `distributor`, …), table prefixes, the `anchor_token` cookie, the `admin@anchor.local` dev login are intentionally left to protect saved data + live sessions. Don't "fix" them.
5. **WhatsApp is for audiences, not journalists.** Journalists use the web app; WhatsApp is a Digital News Gatherer audience channel (post-pilot).

### Build discipline (how the work is done)
- **Step → confirm → next step.** Each step is one commit the maintainer reviews; nothing chains without a confirm. Migrations are applied by the maintainer (the DB confirm gate).
- **Additive, reversible, investigate-before-writing, no greenfield rewrites.** Look at how prior codebases (Surepath/Holly) did it; log lifts in `REUSE.md`.
- **Verify by running it.** This session caught 4 real bugs only a live run surfaces (a Next `__dirname` path bug, a `BIGINT`→string metrics bug, FK ordering, dep entanglement) — typecheck-clean is necessary, not sufficient.
- **Honest scoping; park side-tasks.** Flag when something's bigger than it looks; defer tangents.

### Scope decisions settled during integration (2026-05-25→26)
- **8 agents + 4 tools** (not "11 agents", not "5 tools"). The AI-Legal Tracker is the **Tracker pillar**, not an operations tool.
- **Nodes stay as separate canonical repos**, vendored into GROUNDED as git submodules and cloned/updated independently by newsrooms.
- **Tracker is absorbed *into* GROUNDED** (its code lives in-repo), not a submodule — and trimmed to the **AI-Legal slice**: the old "Holly" CRM/cohort/training + outreach were dropped; fundraising/ai-assistant/auth/knowledge are covered by GROUNDED's own features.

---

## 4. Pillar 1 — Builder

The mature core platform. Authoring at `/builder`; User mode at `/run`. Agents register through [`lib/agents/registry.js`](../lib/agents/registry.js) with a `category: 'agent' | 'tool'` field; the palette + nav group by category.

### The 8 agents (journalism work)

| # | Display name | Slug | What it does |
|---|---|---|---|
| 1 | **Verifier** | `verifier` | Multi-source claim verification vs external sources + the newsroom archive; confidence + evidence + citations + gaps; "Never Accuse." Africa-grounded credibility map (SA+ZW+ZM+KE). Agentic enrichment for low-confidence claims. |
| 2 | **Social media listener** | `social_listener` | Tracks cross-platform posts for damaging narratives; attributes origin (esp. state-aligned actors). OSS lang-detect + NER (Transformers.js). |
| 3 | **Archivist** | `archivist` | Semantic search + knowledge graph over the newsroom's own archive (BGE-M3 + pgvector). Private per newsroom; powers other agents' archive lookups. |
| 4 | **Copywriter** | `drafter` | Social copy, headlines, newsletter blurbs, scripts in house style; posts to socials via encrypted per-newsroom credentials. |
| 5 | **Researcher** | `researcher` | Pulls + scrapes public records, court filings, regulatory + financial docs → research dossiers. Agentic gap-chasing via `web_fetch` + archive cross-ref. |
| 6 | **Translator** | `translator` | English ↔ African languages with per-newsroom glossary, multi-model routing (Helsinki opus-mt / NLLB-200 / Masakhane), phrase-level confidence, edit-feedback loop. SA-focused languages. |
| 7 | **Audio & Video Producer** | `producer` | Radio scripts, podcast outlines, video briefs, audio assembly (Whisper + Piper), audiograms, vertical video, MP4 + editable timeline. |
| 8 | **Digital News Gatherer** | `distributor` | **Inbound only.** Triages tips/submissions/contributor pieces (WhatsApp/web/tip lines) into one editor queue; editor routes each to Verifier / Researcher / Operations. |

> Display-name ≠ slug is deliberate (locked rule #4): names follow `AGENTS.md`; slugs stay as written so saved workflows don't break.

### The Builder engine (what's underneath)
- **Workflow registry + runner** — `lib/workflows/{runner,validate,generate,starters}.js`; CRUD + run at `app/api/workflows/*`; per-agent invocations recorded as `workflow_runs` under a `workflow_executions` parent. Per-workflow team assignment (`workflow_assignments`).
- **"Describe & build"** — one Haiku call drafts a valid agent graph from plain English, validated against the live registry ([`lib/workflows/generate.js`](../lib/workflows/generate.js)).
- **Agentic agents (V2)** — Verifier, Researcher, Operations can run a **bounded tool-use loop** ([`lib/agents/agentic/loop.js`](../lib/agents/agentic/)) with four tools: `archive_search`, `web_fetch`, `invoke_agent`, `db_read` (auto-scoped to the newsroom). Trace viewer at `/observatory/runs/[id]`.
- **Sensitivity classifier + routing (V2)** — `lib/sensitivity/classify.js` deterministically labels input `public | internal | sensitive` (no Claude call); `lib/agents/route.js` decides cloud vs appliance. Escape hatch `GROUNDED_SENSITIVITY_ROUTING=off`.
- **Newsroom appliance (V2)** — signed-HTTPS dispatch so sensitive jobs run on the newsroom's own hardware (Mac mini / NUC / Debian via Ollama). `appliances/`, `lib/appliance/*`, one-script installer. **The execution backend is currently a STUB** (acknowledges dispatches; real Ollama execution is outstanding).
- **Observatory (V2)** — per-workflow + per-edit telemetry; `output_edits` records human Accept/Edit/Reject/Fork. `app/observatory/`.
- **Mentorship dashboard (V2)** — per-team + cohort views over Observatory data, with a k-anonymity floor for the cohort view.
- **Newsroom Profile** — first-class object (strengths, prior coverage, audience data, impact stories, style fingerprint, AI-crawler policy, trusted sources). Read by Fundraiser, Audience, Copywriter.

---

## 5. The 4 operations tools

Ship *with* GROUNDED; support newsroom operations rather than journalism. Registered like agents (`category:'tool'`), each with its own workspace route, draggable into workflows, and **surfaced in the Nodes directory** (they're newsroom utilities used directly).

| # | Tool | Slug | What it does |
|---|---|---|---|
| 1 | **Fundraiser** | `fundraiser` | Grant-writing: live funder library + newsroom profile → first-draft applications with budget scaffolding; surfaces cohort joint-application opportunities. |
| 2 | **Audience Analytics Manager** | `audience` | Analytics ingest (Plausible/Umami/GA/WordPress/CSV) + an AI query layer; headline test + angle sense-check against history. |
| 3 | **Operations Manager** | `operations` | Whole-org ops: editorial calendar, deadlines, freelancers, sales, logistics, finance, metrics, contributor management. Agentic ad-hoc questions read live tables via `db_read`. |
| 4 | **Digital Security Audit** | `security_audit` | A newsroom audits its own setup: external-tool inventory + risk-scoring vs a jurisdiction pack (SA deep; ZW/ZM/KE/TZ/UG/GH/NG/EU/US light) + 90-day routing-history rollup + a Haiku-drafted fix list. Saved + JSON/MD-exportable reports. |

> **Not a 5th tool:** the AI Legal/Ethics/Regulation Tracker is the **Tracker pillar** (§7). A thin `legal_tracker` shell + the `/learning` 7-tab UX remain in the Builder registry as a placeholder pending reconciliation with the absorbed Tracker.

---

## 6. Pillar 2 — Nodes

**An open, growing directory of AI functions for newsrooms.** A Node is **mostly standalone** — run the latest **online** inside GROUNDED, or **clone the repo** to run on a laptop. One codebase, two runtimes.

### The dual-runtime model (the core idea)
A Node's only application code is its `lib/*.js`, written against a **host interface**. The same code runs:
- **Online (in GROUNDED):** on [`lib/nodes/host.js`](../lib/nodes/host.js) (`createNodeHost`) — Postgres-backed, session-scoped.
- **Local (laptop):** on `createLiteHost` from the `grounded-node-runtime` package — JSON-file-backed.

A fix in the canonical repo flows to the live site on the next submodule bump, and to every newsroom on their next `git pull`.

**The host facade** mirrors `createLiteHost` exactly so node code runs unchanged:
- `host.ctx` `{ newsroomId, userId, role }` from the session
- `host.tablePrefix` = `node_<slug>_`; every query stays inside it
- `host.db.query` (auto-binds `$1 = newsroom_id`) + `host.db.tx`
- `host.ai.chat` (routes through `lib/claude.js`, **Haiku-locked**, logs to `api_costs`)
- `host.parse.docxToHtml` (mammoth)
- `host.log.run/edit/error` + `host.feedback.submit` → the `node_<slug>_{activity,errors,feedback}` tables

### The Nodes (`docs/nodes/registry.yaml`)
| Slug | Name | Status | Online? | Notes |
|---|---|---|---|---|
| `makanday-analytics` | MakanDay Audience Signal | pilot | **Yes — live** | Owned-data FB engagement-rate analytics; runs at `/nodes/makanday-analytics`, verified on its real 120-story dataset. |
| `capitalfm-verifier` | Capital FM Claim Check | build | standalone | Election-misinformation claim verification. Persists state to local JSON → needs a node-side `host.db` refactor before it graduates online. |
| `podcasting` | Podcast Studio | build | standalone | ElevenLabs voice-cloning podcast studio. JSON/disk state + ElevenLabs SDK → node-side refactor before online. |

Vendored as **git submodules** under `nodes/<slug>/` (canonical repos `pauldevelopai/node-*`). Bump with `git submodule update --remote`.

### Telemetry (tracking installs + usage)
- **Collector** (Cloudflare Worker, `collector/`): nodes POST `install`/`event`/`feedback` → Airtable (Node Installs / Events / Feedback). Keeps the Airtable token out of public node repos.
- **Harvest** (`harvest/harvest.mjs`): walks each newsroom's fork, pulls committed telemetry, aggregates into the static cohort dashboard (`dashboard/`).
- Online runs also log via `host.log` → the `node_<slug>_activity` tables.

### The directory + graduation model
- `/nodes` ([`app/nodes/page.tsx`](../app/nodes/page.tsx)) reads the registry and lists each node with **Run online** (when mounted) + **Clone & run locally** (repo URL + quickstart), plus a "Ships with GROUNDED" section surfacing the 4 tools.
- **Graduation, re-cast (2026-05-25):** a Node is a first-class home in its own right; an agent *optionally* "plugs into" a Node when the job matches (e.g. Verifier ↔ a verification node). Most nodes are unlinked. "Graduation" (node → agent) is the special case, not the rule.

---

## 7. Pillar 3 — Tracker (the AI-Legal app, absorbed)

**The "AI-Legal" application** — a public tracker of AI **lawsuits**, **regulations**, and AI-in-media **use-cases** across jurisdictions, plus an admin back office and an automated ingestion pipeline. Originally a standalone Vite SPA + Express app (the legacy "Holly"/"AI Legal" codebase, ~48 routes / 106 components). **Now absorbed into GROUNDED** and running on the shared database, trimmed to the AI-Legal slice.

### What was kept / dropped / merged (decided 2026-05-25)
- **Kept (brought in):** the AI-Legal core + ingestion — `lawsuits`, `regulations`, `usecases`, `legal-sources`, the public site + SSR OG pages, the scraper/triage pipeline, the industry-intelligence feed.
- **Dropped:** the old "Holly" CRM/cohort/training (contacts, organisations, cohorts, courses, learning-*, assessments, …) and outreach/comms (outreach, social-posts, newsletter, gmail).
- **Merged onto GROUNDED's own:** fundraising → Fundraiser; ai-assistant → agents+runner; `knowledge` → Archivist; auth → the session bridge; dashboard/uploads/jobs/notifications/feedback → GROUNDED equivalents.

### How it's wired (the absorption, 5 stages — all done)
1. **Schema** — `db/migrations/039_tracker_import.sql` (generated by [`scripts/tracker/build-import.js`](../scripts/tracker/build-import.js) from the app's `pg_dump`, trimmed to **16 AI-Legal tables**; FKs to dropped tables stripped; AI-Legal core tables imported **as-is**, unprefixed, global). Data loads one-shot via `--data`.
2. **Service** — the trimmed Express app lives in [`tracker/server/`](../tracker/server/) and runs against the shared Postgres (`DATABASE_URL`), started with `npm run tracker` (on `:3055`).
3. **Mount** — `next.config.js` rewrites `/tracker/*` → the service (`TRACKER_URL`, default `:3055`), stripping the prefix; the Hub's Tracker card links to `/tracker/legal`.
4. **SPA front** — the React/Vite SPA in [`tracker/client/`](../tracker/client/) builds with `base:'/tracker/'`, served by the service from `client/dist` (static + SPA fallback); `publicFetch`/`useApi` prefix `BASE_URL` so calls hit `/tracker/api/*`; router `basename` is `/tracker`; bare `/tracker` → `/legal`.
5. **Auth bridge (H2)** — [`tracker/server/middleware/auth.js`](../tracker/server/middleware/auth.js) verifies GROUNDED's `anchor_token` JWT with the shared `JWT_SECRET` → `req.user`. **One sign-in:** an admin logged into GROUNDED uses the Tracker admin with no second login. Admin routes (`/api/usecases`, `/api/lawsuits`, `/api/regulations`, `/api/legal-sources`) are gated by it.

### Ingestion (keeps the tracker live)
`tracker/server/services/legal-ingest/*` (courtlistener, RSS/HTML/puppeteer/bluesky/mastodon scrapers, triage, deep-research, insights) + `web-scraper` + `background-jobs` (its gmail/newsletter path is stubbed out — dropped). Scrapers run **on-demand from the admin routes**; the nightly `node-cron` scheduler is intentionally **not auto-started** (avoid surprise scraping/cost).

### Verified live
Public API serves the real imported data — **53 lawsuits / 22 regulations / 10 use-cases**; SSR detail pages render ("Disney v. Minimax"); admin routes return 401 without / 200 with the grounded session.

---

## 8. The Hub

The shared shell all three pillars hang off ([`app/page.tsx`](../app/page.tsx)):
- **Landing** — three pillar cards (Builder live; Nodes → `/nodes`; Tracker → `/tracker/legal`), gated by `getCurrentSession()`, role-aware (a `user` lands in `/run`, builders/admins in `/builder`). Signed-out → `/login`.
- **Auth/session** — GROUNDED's `anchor_token` cookie + `getCurrentSession()` is the single identity; the Tracker's legacy auth is dropped (bridged).
- **Nav** — `app/components/GlobalNav.tsx` groups "Agents — journalism work" and "Tools — newsroom operations".

---

## 9. Cross-cutting infrastructure

### Data model
- **One Postgres**, raw SQL migrations, numbered `001`–`043`, applied in order by `db/migrate.js` (idempotent, by filename). Needs `pgcrypto` + `pgvector`. Dev DB: port **5433**, database `anchor`.
- **Per-newsroom isolation:** every multi-tenant row has `newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE`.
- **Table families:** `archive_*`, `research_*`, `translation_*`, `audience_*`, `fundraiser_*`, `producer_*`, `distribution_*`, `ops_*`, `social_*`, `verifier_*`, `learning_updates`, `workflow_executions`/`workflow_runs`, `output_edits`, `api_costs`, `newsroom_appliances`/`appliance_dispatches`/`sensitivity_*`, `node_<slug>_*` (migs 040–043), and the imported AI-Legal `ai_*` + `tracker_industry_intelligence` (mig 039).

### AI spend
- **Haiku 4.5 only** (`lib/claude.js`); every `chat()` logs a row to `api_costs`. Embeddings are local ($0). Availability fallback to Ollama `gemma3:12b` (`usedFallback:true`; disable with `GROUNDED_OLLAMA_FALLBACK_DISABLED=1`).
- The absorbed Tracker has its *own* `services/claude.js` (still Sonnet-era) — routing its AI calls through `lib/claude.js` + `api_costs` is an open follow-up (T2).

### OSS-first non-LLM stack (Anthropic is the only paid dep)
- **Embeddings:** `BAAI/bge-m3` via `@huggingface/transformers`, in-process, 1024-dim, pgvector.
- **Translation:** Helsinki-NLP `opus-mt-*` + Meta NLLB-200 distilled.
- **STT/TTS:** Whisper-base ONNX + Piper / espeak-ng / macOS `say`.
- **Doc parsing:** `pdf-parse` + `mammoth`.
- **Appliance LLM:** Ollama `gemma3:12b` (sensitive jobs only).
- **Tracker SPA:** React 19 + Vite; node embeddings via `@xenova/transformers`; scraping via puppeteer + cheerio.

### Storage & jobs
- Uploads: local disk under `storage/` in pilot; S3 + Drive mirror are post-pilot.
- Job queue: `pg-boss` on the same Postgres (`scripts/jobs/worker.js`).

---

## 10. Stack & conventions

- **Node.js** root, `"type":"commonjs"` (`require`/`module.exports`). **Next.js 15 App Router** under `app/` (TypeScript; `@/*` → repo root). React 19; canvas via `@xyflow/react`. ESM-only deps via dynamic `import()`.
- **Ports:** GROUNDED `3002`; absorbed Tracker service `3055`.
- **Auth:** roll-our-own JWT + bcryptjs, httpOnly cookie `anchor_token` (`jwt.sign({sub,nrm,role}, JWT_SECRET, {7d})`).
- **Tests:** `node --test`, single-concurrency (`npm test`); the node host facade has 11 hermetic unit tests.
- **TS config:** `allowJs`, `moduleResolution: bundler`; reads resolve from `process.cwd()` at runtime (NOT `__dirname` — that points into `.next/server/*` in the bundle).
- **Dev gotchas (maintainer's Mac):** Postgres on **:5433** (peer auth); `unset ANTHROPIC_API_KEY` before `npm run dev` (the shell exports an empty string that shadows `.env`); `unset NODE_ENV` before `npm install`. (One shell has a zsh global alias that expands `ANTHROPIC_API_KEY` to its value — don't put the bare name on a command line there.)

---

## 11. Repo layout

```
app/                    Next.js 15 (Hub, Builder /builder, User /run, /nodes, agent/tool workspaces,
                        observatory, mentorship, appliances; app/nodes/makanday-analytics = the live node mount)
lib/                    claude.js (Haiku lock), db.js, auth.js, agents/ (registry + 13 modules + agentic/),
                        nodes/host.js (the host facade) + nodes/registry.js, sensitivity/, observatory/,
                        appliance/, + per-agent backends (archive, research, translation, audio, video, …)
db/migrations/          001–043 SQL (039 = trimmed AI-Legal import; 040–042 node tables; 043 node int metrics)
nodes/<slug>/           the 3 Node submodules (canonical repos)
tracker/                the absorbed AI-Legal app — server/ (Express, AI-Legal slice) + client/ (React/Vite SPA)
collector/              Cloudflare Worker — node telemetry → Airtable
harvest/ + dashboard/   cohort telemetry harvest + static dashboard
appliances/             per-newsroom appliance protocol + installer (execution backend is a STUB)
scripts/tracker/        build-import.js (pg_dump → trimmed migration 039)
docs/                   AGENTS.md, ROADMAP.md, HUB_TRACKER_NODES_PLAN.md, this file, nodes/registry.yaml,
                        tracker/overlap-map.yaml, V2_PLAN.md, SECURITY_AUDIT_PLAN.md, …
```

---

## 12. How to run the whole platform

```bash
# 1. DB (one-time; already at migration 043 on the dev box)
unset ANTHROPIC_API_KEY && npm run migrate

# 2. Build the Tracker SPA once (dist/ is gitignored)
cd tracker/client && npm install && npm run build && cd ../..

# 3. Run — three processes
unset ANTHROPIC_API_KEY && npm run dev      # GROUNDED (Next) on :3002  — restart to apply the /tracker proxy
npm run tracker                             # absorbed AI-Legal service on :3055 (reads tracker/.env -> shared DB)
unset ANTHROPIC_API_KEY && npm run worker   # pg-boss worker (optional, for async jobs)
```
Sign in (`admin@anchor.local` / `changeme123` on the dev seed) → Hub:
- **Builder** → `/builder` (champion) or `/run` (user).
- **Nodes** → `/nodes` → MakanDay **Run online** (real data).
- **Tracker** → `/tracker/legal` (public AI-Legal site); admin works with the same session, no second login.

---

## 13. Current state

**Both pillars moved from "compiles" to "running against the real database" this integration arc.**

- **Builder (V1 + V2): shipped.** All 8 agents + 4 tools, drag-and-drop + Describe & build, User mode, Observatory, Mentorship, agentic loop, sensitivity routing, appliance protocol. Two known stubs: appliance *execution*, and the `legal_tracker` shell.
- **Nodes pillar: live (N1–N5).** Host facade + 11 green tests; submodules vendored; per-node migrations; **MakanDay runs online on its real 120-story dataset**; `/nodes` directory + Hub wired. (Two bugs caught + fixed by running it: the registry `__dirname` path; `BIGINT`→string metrics.)
- **Tracker pillar: absorbed (T0 + T1 ×5), verified.** Scope decided, `039` trimmed to 16 tables, the AI-Legal app brought into `tracker/`, mounted at `/tracker`, SPA served, auth-bridged to the GROUNDED session, scrapers in. Serving the real 53 lawsuits / 22 regs / 10 use-cases.
- **DB:** migrations through `043` applied; AI-Legal data loaded.
- **Branch:** `hub-tracker-nodes` (~18 commits), not yet merged to `main`.

---

## 14. What needs to be done next

**Immediate / housekeeping**
1. **Rotate the Anthropic API key** that was pasted into a terminal earlier (compromised) — and put the new one in `.env`. Required for any AI feature (node briefs, Tracker AI).
2. **Merge `hub-tracker-nodes` → `main`** once reviewed (PR), and confirm a clean run from a fresh checkout.
3. Fix the `--data` emitter to order parent tables before children (a few AI-Legal child/event tables failed to load on FK ordering).

**Tracker follow-ups**
4. **T2 — route the Tracker's Claude calls through `lib/claude.js` + `api_costs`** (currently its own `services/claude.js`); decide Tracker model policy (keep its model vs the Haiku lock).
5. Trim the SPA's inert admin/CRM pages (their backends were dropped); decide whether/where the admin nav surfaces.
6. Decide if/when to **auto-start the nightly scraper scheduler** (currently on-demand only).
7. **T3 — reconcile the `/learning` shell + `legal_tracker` tool vs the absorbed Tracker** (retire the shell, repoint it, or keep both) — driven by `docs/tracker/overlap-map.yaml`.

**Nodes follow-ups**
8. **capitalfm-verifier + podcasting node-side `host.db` refactors** (in their own repos) so their state graduates to Postgres and they can run online (N4 for those two).

**Platform follow-ups (pre-existing)**
9. **Real Ollama-backed appliance execution** — the protocol is shipped; the backend is a STUB (`appliances/agent-runner/server.js`).
10. **Deep-research the light jurisdiction packs** (ZW/ZM/KE/TZ/UG/GH/NG/EU/US) as cohort countries onboard.

**Deferred post-pilot** (don't pull forward): WhatsApp audience channel; real S3 + Drive mirror; Lightsail deploy; per-newsroom Anthropic keys; cross-cohort search; multi-cohort UI.

---

## 15. Source-of-truth map

| For… | Read… |
|---|---|
| Agent + tool product spec | [`docs/AGENTS.md`](AGENTS.md) |
| Hub/Tracker/Nodes design + the scope decisions | [`docs/HUB_TRACKER_NODES_PLAN.md`](HUB_TRACKER_NODES_PLAN.md) |
| Forward view / outstanding work | [`docs/ROADMAP.md`](ROADMAP.md) |
| Platform overview + locked rules + repo layout | [`README.md`](../README.md) |
| V2 build history | [`docs/V2_PLAN.md`](V2_PLAN.md) |
| Security Audit tool | [`docs/SECURITY_AUDIT_PLAN.md`](SECURITY_AUDIT_PLAN.md) |
| Appliance real-execution scope | [`docs/APPLIANCE_EXECUTION_PLAN.md`](APPLIANCE_EXECUTION_PLAN.md) |
| Nodes registry | [`docs/nodes/registry.yaml`](nodes/registry.yaml) |
| Tracker import + overlap catalogue | [`docs/tracker/overlap-map.yaml`](tracker/overlap-map.yaml) |
| Reuse/lift inventory | [`REUSE.md`](../REUSE.md) |
