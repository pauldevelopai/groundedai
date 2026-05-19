# Grounded

**Shared AI infrastructure for African newsrooms.** Eight composable AI **agents** that do journalism work + five **tools** that support newsroom operations, a drag-and-drop workflow builder, an observability layer, and an optional per-newsroom appliance for sensitive work. Built by [Develop AI](https://developai.co.za) and designed to scale across the African media sector. Apache-2.0.

> One person at the newsroom (the "AI champion") composes workflows by dragging agents onto a canvas; the rest of the team uses what the champion ships through a simple web UI. Sensitive material runs locally on the newsroom's own hardware; everything else uses Anthropic Claude in the cloud.

---

## Status (2026-05-18)

- **V1 shipped:** eight agents + five tools (Tracker as a shell, real implementation at `/INTEGRATE/tracker`), drag-and-drop Builder, User mode, Postgres-backed workflow registry, encrypted social credentials, OSS-first dependency stack, Anthropic + Ollama fallback path.
- **V2 shipped:** Observatory (per-workflow + per-edit telemetry), Mentorship dashboard, 7-tab Legal/Ethics Tracker UX, agentic agents (Verifier + Researcher + Operations with bounded tool-use loops), sensitivity classifier + routing, newsroom-appliance protocol + one-script installer.
- **Digital Security Audit (concept-note Tool #5) shipped 2026-05-19:** external-tool inventory + research-grade jurisdiction packs (SA deep, TZ/UG/GH/NG/EU/US/ZW/ZM/KE light) + audit pipeline with one-Haiku-call fix list + report viewer + JSON/Markdown export + Builder block. See [`docs/SECURITY_AUDIT_PLAN.md`](docs/SECURITY_AUDIT_PLAN.md).
- **Pilot scope:** 5 ZimZam newsrooms initially, scaling toward 120+ across the continent. Build window Jul–Dec 2026; grantee charging begins Jan 2027.
- **Open source:** Apache-2.0. Designed to outlive Develop AI — any successor team can fork, inspect, and run independently.

The product specification of record is [`docs/AGENTS.md`](docs/AGENTS.md). The V2 build plan is in [`docs/V2_PLAN.md`](docs/V2_PLAN.md). The original funder-facing concept note frames the why.

---

## The two modes

**Builder mode** — the AI champion (editor, head of audience) composes workflows on a desktop. Drag agents onto a canvas, wire them together, attach prompts and knowledge sources, save and assign to the team. Not a form: a visual canvas (xyflow / React Flow).

**User mode** — the rest of the team picks from a list of named workflows organised by problem category ("Personalisation", "Fact-checking", "Translation", …). They don't see agents or prompts; they see a chat-style surface that follows their commands. Web only — journalists do not access Grounded via WhatsApp (WhatsApp is reserved as a *Digital News Gatherer* channel for audience inbound/outbound, never for the newsroom team).

---

## The eight agents + four tools

Canonical definitions in [`docs/AGENTS.md`](docs/AGENTS.md). All twelve register via `lib/agents/registry.js` and carry a `category: 'agent' | 'tool'` field; the Builder palette and the GlobalNav dropdown group by category, but slugs, tables, and registration are otherwise identical. Slugs in code stay as written for back-compat with saved workflow definitions.

### Agents (8) — journalism work

| # | Display name | Slug | What it does |
|---|---|---|---|
| 1 | Verifier | `verifier` | Multi-source claim verification against external sources + the newsroom's archive. Returns confidence + evidence + citations + gaps. Africa-grounded credibility map (SA + ZW + ZM + KE). Agentic enrichment (V2) for low-confidence claims. |
| 2 | Archivist | `archivist` | Semantic search + knowledge graph over the newsroom's own archive (BGE-M3 + pgvector). Private per newsroom. Powers other agents' archive lookups. |
| 3 | Copywriter | `drafter` | Social copy, headlines, newsletter blurbs, scripts in the newsroom's house style. Posts to social via encrypted per-newsroom credentials (slug stays `drafter`; outbound code lives under `lib/distribution/*`). |
| 4 | Researcher | `researcher` | Pulls + scrapes public records, court filings, regulatory disclosures, financial documents. Persists structured findings to research dossiers. Agentic enrichment (V2) chases gaps via web_fetch + archive cross-reference. |
| 5 | Translator | `translator` | English ↔ African languages with per-newsroom glossary, multi-model routing (Helsinki opus-mt / NLLB-200 / Masakhane), phrase-level confidence, and edit-feedback loop that compounds quality. |
| 6 | Audio & Video Producer | `producer` | Radio scripts, podcast outlines, video briefs, audio assembly (Whisper + Piper), audiograms, vertical video, ready-to-upload MP4 + editable timeline. |
| 7 | Digital News Gatherer | `distributor` | **Inbound only.** Triages tips / submissions / contributor pieces from WhatsApp / web forms / tip lines into a single editor queue. Three-way routing: editor sends each item to Verifier (fact-check), Researcher (deepen with public records), and/or Operations (contributor handling). |
| 8 | Social media listener | `social_listener` | Tracks cross-platform posts for damaging narratives, attributes origin (especially state-aligned actors). OSS lang-detection + NER via Transformers.js. Manual / webhook / CSV ingestion. |

### Tools (5) — newsroom operations

| # | Display name | Slug | What it does |
|---|---|---|---|
| 1 | Fundraiser | `fundraiser` | Grant writing infrastructure: live funder library + per-newsroom profile (strengths, prior coverage, audience data, impact stories) → first-draft applications with budget scaffolding. Surfaces cohort joint-application opportunities. |
| 2 | Audience Analytics Manager | `audience` | Analytics ingest (Plausible / Umami / GA / WordPress / CSV) + AI query layer over them. Headline test + angle sense-check against historical performance. |
| 3 | Operations Manager | `operations` | Editorial calendar, deadlines, freelancer coordination, sales, logistics, finance, performance metrics, community contributor management. Whole-org, not just the editorial floor. Agentic ad-hoc question kind (V2) reads live tables via `db_read`. |
| 4 | AI Legal, Ethics & Regulation Tracker | `legal_tracker` | Finds + collects + stores legal/regulatory/ethical shifts daily; helps each newsroom build a living governance framework. **Current repo state: thin shell** over `learning_updates`. The full Tracker is a standalone codebase at `/INTEGRATE/tracker` (not in this repo) — to be integrated later. |
| 5 | Digital Security Audit | `security_audit` | Built-in audit a newsroom runs on its own setup: external-tool inventory + risk scoring against a research-grade jurisdiction pack (SA deep, others light) + 90-day routing-history rollup + Haiku-drafted prioritised fix list. Saved + JSON/Markdown exportable reports. On-demand from `/security` and as a draggable Builder block. |

---

## Architecture

```
                                      ┌──────────────────────┐
                                      │   AI Champion (web)  │  Builder mode
                                      │   Drag-and-drop UI   │
                                      └──────────┬───────────┘
                                                 │ saves
                                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js 15 app (port 3002)                                         │
│                                                                     │
│  app/api/agents/<slug>          ← direct agent invocations          │
│  app/api/workflows/<id>/run     ← multi-agent execution             │
│  app/api/observatory/*          ← V2 telemetry                      │
│  app/api/appliances/*           ← V2 federated dispatch             │
│                                                                     │
│  lib/agents/registry.js         ← agent registration                │
│  lib/agents/<slug>.js           ← 12 agents                         │
│  lib/agents/agentic/loop.js     ← bounded tool-use loop (V2 Step 4) │
│  lib/agents/agentic/tools/      ← archive_search, web_fetch,        │
│                                    invoke_agent, db_read            │
│  lib/sensitivity/classify.js    ← classifies input → public         │
│                                    | internal | sensitive           │
│  lib/agents/route.js            ← routes to cloud or appliance      │
│  lib/claude.js                  ← Anthropic + Ollama fallback       │
└──────────────┬───────────────────────────────────┬──────────────────┘
               │ public / internal                 │ sensitive
               ▼                                   ▼
       Anthropic Claude                  Newsroom appliance
       (Haiku 4.5 only)                  (gemma3:12b on Mac mini /
                                          NUC / VM via Ollama)
                                          appliances/agent-runner/
```

**Storage layer:** Postgres (37 migrations). Per-newsroom isolation enforced by `newsroom_id` FK on every multi-tenant row. Local-disk storage for uploads in pilot (S3 + Drive mirror are post-pilot).

**Job queue:** pg-boss for async work (Tracker digest, deferred jobs).

---

## Locked rules (do not relitigate without explicit approval)

These are the load-bearing decisions that shape every change. Future contributors and future Claude sessions should treat them as constraints, not preferences.

### 1. Haiku 4.5 only

Every Claude call uses `claude-haiku-4-5-20251001`. Hardcoded in [`lib/claude.js`](lib/claude.js). No model parameter on `chat()`. No agent passes a model. No env override of the model. No UI knob exposing model choice. **Reason:** cost is the binding constraint at per-newsroom volumes; quality is sufficient for journalism work. (Researcher benchmark showed Haiku at 22× the cost-efficiency of Opus on identical extraction quality.)

**One exception:** when Anthropic is unreachable (credit exhausted, persistent 429/529, or network), `lib/claude.js` falls over to a local Ollama instance (default `gemma3:12b`). This is *availability, not cost-shopping*. Responses carry `usedFallback: true`. Disable with `GROUNDED_OLLAMA_FALLBACK_DISABLED=1`.

### 2. Open-source + fully free for non-LLM modules

Anthropic Claude is the only allowed paid dependency. Everything else must be open-source and fully free at any usage volume — no free-tier hosted APIs. Concretely:

- **Embeddings:** `BAAI/bge-m3` via `@huggingface/transformers` (in-process, ~1.3 GB first-call download).
- **Translation:** Helsinki-NLP `opus-mt-*` + Meta NLLB-200 distilled 600M via `@huggingface/transformers`.
- **STT/TTS:** Whisper-base ONNX + Piper / espeak-ng / macOS `say`.
- **Document parsing:** `pdf-parse` + `mammoth`.
- **Appliance LLM:** Ollama with `gemma3:12b` (sensitive jobs only).

### 3. Per-newsroom isolation by construction

Every multi-tenant table has `newsroom_id`. Every query is scoped. The `db_read` agentic tool auto-injects `WHERE newsroom_id = $1` and refuses cross-newsroom reads. Sensitive tables (`users`, `sessions`, `*_credentials`, `newsroom_appliances`) are not in the read whitelist.

### 4. Anchor → Grounded rename is partial on purpose

The platform was renamed Anchor → Grounded in May 2026 (Phase 1 display rename + Phase 2 deeper rename of env vars / package / dev-key file / repo dir). Some lower-level identifiers were **intentionally** left as `anchor` to avoid breaking saved data:

- Agent slugs (`drafter`, `distributor`, `producer`, `audience`, `operations`, `social_listener`) — saved workflow definitions reference them.
- DB table prefixes (`distribution_*`, `audience_*`, `operations_*`).
- URL paths (`/api/agents/drafter`, `/distribution`, `/audience`, …).
- Cookie name (`anchor_token`) — renaming would invalidate every live session.
- Dev-seed login (`admin@anchor.local`).
- Drag-MIME identifier (`application/anchor-agent`).

Do **not** "fix" these. Display names use the canonical Grounded names from [`docs/AGENTS.md`](docs/AGENTS.md); slugs and tables stay as-is.

### 5. WhatsApp is for audiences, not journalists

Journalists use the web app only. WhatsApp is reserved for the Digital News Gatherer agent's audience channel (broadcasts out, tips in, corrections). User-mode-over-WhatsApp is permanently out of scope.

### 6. Workflows are products framed as problems

Every workflow carries a `problem_statement`, `problem_category`, and `user_instructions`. The User mode groups workflows by problem category, not by agent. The shared library across newsrooms is a marketplace of solved problems, not of agent compositions.

---

## Getting started

### Prerequisites

- Node 22+
- Postgres 14+ with `pgcrypto` and `pgvector` extensions
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- (optional) Ollama with `gemma3:12b` for the local fallback path

### Install

```bash
git clone https://github.com/pauldevelopai/groundedai.git grounded
cd grounded
npm install

cp .env.example .env
$EDITOR .env                    # fill ANTHROPIC_API_KEY + DATABASE_URL at minimum

createdb grounded
psql grounded -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;"

npm run migrate                 # apply all 37 migrations
npm run seed                    # baseline seed (admin user, demo newsroom)
npm run seed:pilots             # optional: cohort newsroom seed

npm run dev                     # http://localhost:3002
```

Default dev login: `admin@anchor.local` (password printed by the seed script).

### Background worker

Some agents enqueue async jobs (Tracker weekly digest, deferred uploads). Run the worker alongside the web server:

```bash
npm run worker
```

### Newsroom appliance (V2 Step 6)

The optional per-newsroom appliance runs sensitive jobs locally so payloads never leave the newsroom perimeter. On a Mac mini / NUC / Debian VM:

```bash
cd appliances
bash install.sh
```

The installer verifies Node, installs Ollama, pulls `gemma3:12b`, sets up the `.env`, and registers a launchd (macOS) or systemd (Linux) service unit. See [`appliances/README.md`](appliances/README.md) for full instructions. The current `agent-runner/server.js` execution backend is a **STUB** that acknowledges dispatches — real Ollama-backed agent execution is the Step 6.x follow-on.

---

## Repo layout

```
app/                      Next.js 15 App Router
  api/                    REST endpoints (agents, workflows, observatory, appliances, …)
  builder/                Drag-and-drop workflow composer (Builder mode)
  observatory/            V2 telemetry dashboard + /runs/[id] trace viewer
  mentorship/             V2 cohort + per-team performance view
  distribution/           Inbound triage queue + outbound channels UI
  audience/, research/, translation/, producer/, fundraiser/, operations/, social/, learning/
                          One workspace per agent that needs a durable surface
  team/                   Newsroom + user admin
  login/                  Auth

lib/
  claude.js               Anthropic SDK wrapper (Haiku-only; Ollama fallback)
  ollama.js               Fallback path
  db.js                   pg pool
  auth.js                 Session + role + cookie (still `anchor_token`)
  agents/
    registry.js           Agent registration
    <slug>.js             12 agents
    agentic/
      loop.js             Bounded tool-use loop (V2 Step 4)
      tools/              archive_search, web_fetch, invoke_agent, db_read
  sensitivity/classify.js V2 Step 5 deterministic classifier (no Claude call)
  observatory/log.js      V2 Step 1 run + edit logging wrappers
  appliance/              V2 Step 6 dispatch + HMAC signing
  archive/, research/, translation/, audio/, video/, audience/, copywriter/,
  distribution/, fundraiser/, operations/, social/, learning/
                          Per-agent backend + persistence helpers

db/
  migrate.js              Idempotent migration runner
  migrations/             37 SQL files, numbered 001–037
  seed.js                 Baseline seed
  seed-pilots.js          Cohort newsroom seed

appliances/
  install.sh              Cross-platform installer (macOS launchd + Linux systemd)
  agent-runner/server.js  Signed-HTTPS appliance receiver (currently STUB execution)
  README.md               Operations manual

docs/
  AGENTS.md               CANONICAL agent definitions (source of truth)
  V2_PLAN.md              Six V2 steps with confirm-before-next gates
  BRIEFING.md             Project scope brief
  CONSOLIDATION_PLAN.md   V1 → V1.1 consolidation history
  HANDOFF.md              Cross-session handoff notes (may have stale paths)
  OPEN_DECISIONS.md       Pending decisions
  PILOT_PUNCHLIST.md      Pilot-readiness checklist

config/                   Trusted-sources allowlist YAML, etc.
scripts/jobs/worker.js    pg-boss worker entrypoint
tests/                    node:test suites (155 tests at last run)
storage/                  Dev-only local uploads (gitignored in S3 mode)
appliances/.env.example   Appliance env template
.env.example              App env template
```

### Things deliberately not in this repo

- **AI Legal, Ethics & Regulation Tracker (the real one)** — full implementation lives standalone at `/Users/.../PYTHON 2025/INTEGRATE/tracker` (client + server + `holly.sql` + PM2 config). The current `lib/agents/legal_tracker.js` is a 175-line shell that queries `learning_updates` so the agent appears in the registry. Integrate the standalone tracker into this repo later.
- **Real Ollama execution on the appliance** — the appliance protocol is shipped; the local-execution backend is a STUB.
- **WhatsApp delivery + real S3/Drive mirror + Lightsail deploy** — post-pilot.

---

## V2 stack — what each step delivered

| Step | What | Where |
|---|---|---|
| 1 | **Observatory** — per-workflow + per-edit telemetry | `db/migrations/030_observatory.sql`, `lib/observatory/log.js`, `app/observatory/`, `app/api/observatory/` |
| 2 | **Mentorship dashboard** — per-team + cohort views over Observatory data, k-anonymity floor for cohort | `app/mentorship/`, `app/api/mentorship/` |
| 3 | **Tracker 7-tab UX** — Home / Lawsuits / Regulations / Connections / Use cases / Sources / Submit + weekly digest | `db/migrations/032_tracker_v2.sql`, `app/learning/`, `lib/jobs/handlers/tracker-digest.js` |
| 4 | **Agentic agents** — bounded tool-use loop; Verifier + Researcher + Operations have `agentic_mode`; tools = `archive_search`, `web_fetch`, `invoke_agent`, `db_read`; trace viewer at `/observatory/runs/[id]` | `lib/agents/agentic/`, `app/observatory/runs/[id]/`, `app/api/observatory/runs/[id]/` |
| 5 | **Sensitivity classifier + routing** — deterministic `public` / `internal` / `sensitive` labels; per-newsroom override rules; cloud-vs-appliance routing decision | `lib/sensitivity/classify.js`, `lib/agents/route.js`, `db/migrations/034_sensitivity_routing.sql` |
| 6 | **Newsroom appliance + federated execution** — signed HTTPS dispatch protocol, register / health / test-dispatch endpoints, `install.sh` for Mac mini / NUC / Debian | `appliances/`, `lib/appliance/`, `db/migrations/035_newsroom_appliance.sql`, `app/api/appliances/` |

---

## Testing

```bash
npm test                        # 155 tests via node:test
npx tsc --noEmit                # typecheck
```

Tests are integration-leaning: many hit a local Postgres. The agentic tool tests mock the pool; the classifier tests are pure-JS deterministic.

---

## Database

Migrations are numbered (`001` … `037`) and applied in order via `node db/migrate.js`. They're idempotent within a transaction. Schema highlights:

- **Per-newsroom isolation:** every multi-tenant row has `newsroom_id` FK with `ON DELETE CASCADE`.
- **Archive:** `archive_documents` + `archive_chunks` (BGE-M3 embeddings, pgvector). Knowledge graph in `archive_*` extensions (027).
- **Workflow telemetry:** `workflow_executions` (parent rollup) + `workflow_runs` (per-agent invocation). Agentic tool calls land as `workflow_runs` rows with `kind='agentic_tool'` and `parent_invocation_id` set.
- **Edit feedback:** `output_edits` records human Accept / Edit / Reject / Fork events.
- **Per-agent tables:** `research_*`, `translation_*`, `audience_*`, `fundraiser_*`, `producer_*`, `distribution_*` / `distributor_briefs`, `ops_*`, `social_*`, `verifier_*`, `learning_updates`, `tracker_*`.
- **V2 federation:** `newsroom_appliances`, `appliance_dispatches`, `sensitivity_*`.

---

## Configuration

All app-level config lives in `.env`. Template in [`.env.example`](.env.example). Key vars:

- `ANTHROPIC_API_KEY` — required for the cloud LLM path.
- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET` / `SESSION_SECRET` — change from defaults.
- `GROUNDED_OLLAMA_FALLBACK_URL` / `GROUNDED_OLLAMA_FALLBACK_MODEL` — local fallback when Anthropic is unreachable.
- `GROUNDED_OLLAMA_FALLBACK_DISABLED=1` — disable the fallback entirely.
- `GROUNDED_DISTRIBUTION_KEY` — base64 AES-256 key for encrypting per-newsroom social credentials. Leave blank in dev; a stable `.grounded-distribution-key` file is generated automatically (gitignored).
- `GROUNDED_SENSITIVITY_ROUTING=off` — V2 Step 5 escape hatch; treats every input as `public`.
- `GROUNDED_FEDERATED_EXECUTION=off` — V2 Step 6 escape hatch; treats every newsroom as appliance-less.

Note: `.env.example` may still reference some legacy `ANCHOR_*` names — the runtime reads `GROUNDED_*` (per the Phase 2 rename). When in doubt, the runtime is authoritative.

---

## Contributing + forking

Grounded is built to outlive Develop AI. The codebase is Apache-2.0 so any newsroom, the funder (DNTF), or a successor team can fork, inspect, and run independently. The newsroom method is captured in saved, shareable workflows rather than improvised in conversation, so the value already lives inside each newsroom that uses it.

If you're picking this up:

1. Read [`docs/AGENTS.md`](docs/AGENTS.md) first — it's the canonical product spec.
2. Read [`docs/V2_PLAN.md`](docs/V2_PLAN.md) — it explains the federated architecture and the order things landed.
3. Respect the **locked rules** above. Most have a real incident behind them.
4. Per-newsroom isolation is non-negotiable. New tables get `newsroom_id` from day one.
5. Every new dependency must be OSS + fully free or it doesn't ship.

---

## License

Apache-2.0. See [`LICENSE`](LICENSE).

Develop AI · 2026
