# Grounded — Build Hand-off

For the AI agent picking up this build. Paul is now driving Grounded from **Claude Code inside VS Code**.

**Read this entire file before touching code.** Then read:
- [`docs/AGENTS.md`](AGENTS.md) — **canonical agent definitions** (the 11 agents, verbatim from Paul's final spec). This is the source of truth for what each agent does. Registry descriptions and all references must match it.
- [`docs/BRIEFING.md`](BRIEFING.md) — original product brief (older; AGENTS.md supersedes any agent-scope conflict).
- [`../REUSE.md`](../REUSE.md) — lift inventory.

Last updated 2026-05-11 after the Anchor → Grounded rename pass and the agent-name re-alignment (Drafter → Copywriter, Distributor → Digital News Gatherer with outbound conceptually re-homed under Copywriter, Producer → Audio & Video Producer, Audience → Audience Analytics Manager, Operations → Operations Manager, Social Listener → Social media listener). Internal slugs/tables/env vars unchanged.

---

## 0. What changed in this session (2026-05-05)

1. **Pilot scope = the full PDF concept note (final agent spec, 2026-05-11 rename pass).** Only **WhatsApp delivery** and **Lightsail deploy** are post-pilot. Everything else — full Audio & Video Producer (audio + video + audiograms), full Translator (multi-model routing + glossary + edit feedback), inbound-only Digital News Gatherer (outbound posting moved conceptually to Copywriter — code lives under `lib/distribution/*`), full Operations Manager (incl. contributor mgmt), Audience Analytics Manager consultations (headline_test / angle_check / analytics_query — synthetic personas dropped 2026-05-07), the learning layer, the newsroom profile object — is **in pilot**.
2. **Canonical agent text moved to [`docs/AGENTS.md`](AGENTS.md).** The 11 agents are described verbatim there. Treat that file as primary source of truth — registry descriptions in `lib/agents/*.js` must match.
3. **Pilot agent set = the official 11.** Sourcer, Media Verifier, Compliance dropped from the original concept-note set. Funder renamed Fundraiser. Social media listener added 2026-05-07 (was 10 → 11 in that revision).
4. **Governance / compliance layer dropped** (no jurisdiction packs / POPIA enforcement / audit-export). Internal `audit_log` table stays for plain debugging. The new "**learning layer**" — curated AI ethics/law/security update FEED + cross-cohort meta-analytics + workflow auto-promotion — is a different mechanism and IS in pilot.
5. **User mode is a web app — not a chat, not WhatsApp.** Builder mode (desktop web app, drag-and-drop canvas) composes workflows. User mode (web list of workflows by problem category) consumes them, filtered by per-workflow team-member assignment. WhatsApp-for-journalists was earlier planned but **dropped 2026-05-05 PM** — too complicated. WhatsApp stays in scope only for Digital News Gatherer's audience-facing channels (tips in, broadcasts/corrections out).
6. **Builder mode is drag-and-drop on a single canvas page** (React Flow). Workflows list rail on the left, agent palette below it, canvas centre, per-node config + workflow settings + Members on the right. Per-workflow team-member assignment in `workflow_assignments` (migration 007).
7. **Verifier ↔ Digital News Gatherer coupling.** Verifier checks both journalist-sourced and community-submitted material. Digital News Gatherer's inbound triage queue surfaces community material to an **editor**; the editor decides per item whether to send it to Verifier (fact-check) or Operations (contributor handling) — this is editorial judgment, not auto-routing. Build sequencing: Operations before Digital News Gatherer; credibility-map enhancement after the inbound flow exists.
8. **Open-source-first rule locked.** Every non-LLM module (embeddings, vision, OCR, translation, speech, …) **must be fully free at any usage volume** — i.e. OSS we self-host (Hugging Face is the default place to look). Free-tier hosted APIs are NOT acceptable. Anthropic Claude is the only allowed paid dependency.
9. **Cohere replaced.** Embeddings run locally via `@huggingface/transformers` against `Xenova/bge-m3`. Same 1024-dim output, no schema migration. See [`lib/storage/embed.js`](../lib/storage/embed.js).
10. **Repo on GitHub** at `https://github.com/pauldevelopai/anchor.git`. **Repo path** is `/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/anchor`.

---

## 1. What Grounded is (one paragraph)

Shared AI infrastructure for African newsrooms. A multi-tenant web platform with an **agent execution layer** (11 pilot agents — see §2). The pitch: most African newsrooms have done an AI workshop; almost none have working AI infrastructure. Grounded closes that gap by providing prebuilt agents and a low-code Builder for non-technical newsroom leads. Pilot is **5 ZimZam newsrooms** (Capital FM Lusaka, EnviroPress, MakanDay, Maricho Media, VicFallsLive). Primary markets to expand into post-pilot: South Africa, Zimbabwe, Zambia, Kenya. Grounded is the flagship of GROUNDED, a practice under Develop AI.

Two modes:
- **Builder mode** — the AI champion at the newsroom (editor, head of audience) composes AI workflows on a desktop web app, picking from the prebuilt agents and writing the prompts. No coding required.
- **User mode** — the rest of the newsroom team uses what the Builder shipped. They don't see agents or prompts. They see a **chat surface** that does the thing they need. Eventually accessible over WhatsApp (post-pilot).

Cross-newsroom **shared workflow library** is the network effect. Per-newsroom isolation for content; shared workflow definitions. *"What works in Lusaka can run in Harare without anyone needing to rebuild it."*

---

## 2. The 11 agents

**Canonical scope: [`docs/AGENTS.md`](AGENTS.md)** — verbatim from Paul's final spec. Read it first; this section just summarises build state and OSS-dependency notes. If anything here disagrees with AGENTS.md, AGENTS.md wins.

**Built (basic shells — descriptions match AGENTS.md as of 2026-05-05 PM):**

| # | Agent | Build status |
|---|-------|--------------|
| 1 | **Verifier** | Built. Pending: Digital News Gatherer-intake-queue integration, Africa-grounded credibility map (SA + ZW + ZM + KE). |
| 2 | **Archivist** | Built. BGE-M3 + pgvector. |
| 3 | **Copywriter** | Built. House style still surface-level (will deepen as Newsroom Profile lands). |

**To build (all in pilot scope per the final spec):**

| # | Agent | OSS dependencies to lean on (Hugging Face first) |
|---|-------|---------------------------------------------------|
| 4 | **Researcher** | `pdf-parse` (already in repo), GLiNER for entity extraction. |
| 5 | **Translator** | Helsinki-NLP `opus-mt-*` (Marian), Meta NLLB-200 distilled, Masakhane (`afri-mt5`, `afroLM`), Lelapa AI's open models — via `@huggingface/transformers` in-process. **Multi-model routing layer is core, not optional.** |
| 6 | **Audio & Video Producer** | `faster-whisper` (STT), Piper / Coqui TTS, `ffmpeg`. Stock footage source TBD — Pexels/Pixabay are free-tier hosted APIs (NOT OSS-rule-compliant); Wikimedia Commons or per-newsroom uploaded libraries are likely. |
| 7 | **Digital News Gatherer** | Direct API clients for social/newsletter/CMS. WhatsApp piece lifts from `surepath/whatsapp.js` post-pilot. |
| 8 | **Fundraiser** | Mostly Claude-driven over a `funders` table + `newsroom_profiles`. |
| 9 | **Audience** | Plausible / Umami connectors + GA export parser; persona generation via Claude with seeded defaults. |
| 10 | **Operations** | DB + Claude. Adds `contributors` table (vetting/attribution/payment/moderation). |

**Plus the learning layer** (Slice 16): AI ethics/data law/security update feed + cross-cohort meta-analytics + workflow auto-promotion. Curated, not enforcement.

**Plus the newsroom profile** (Slice 7): first-class object holding strengths, prior coverage, audience data, impact stories. Read by Fundraiser, Audience, Copywriter (style), Audio & Video Producer.

**Sequencing rule:** Builder + User UI scaffold ships first (done in Slice 4 / 4b) so each new agent lights up in the UI as it ships. New agents = registry entry + module + smoke-test through Builder UI before moving on.

---

## 3. Build state (commits)

Latest first; older commits in `git log`:

```
ddf62b2 Step 5 Slice 4b: inline Builder workspace + team-member assignments
1b771d3 Step 5 Slice 4: Builder drag-and-drop UI (React Flow)
ff788f1 Step 5 Slice 3: workflow runner + POST /api/workflows/:id/run
d145baf Step 5 Slice 2: workflows table + CRUD
60b9aa5 Step 5 Slice 1: agent registry + GET /api/agents
fbc8eca Replace Cohere embeddings with local BGE-M3 (Transformers.js)
9cd82a3 Step 4c and 4d: Archivist and Copywriter agents
d80b08c Step 4 Pass B: Verifier agent
7977582 Step 4 Pass A: Claude wrapper + cost logging + JSON parser + smoke endpoint
21e5d70 Step 3b: auth layer (login, logout, me, seed)
fdcc608 Step 3a: scaffold Next.js + Postgres backbone
```

**Currently working end-to-end (verified 2026-05-05 PM):**
- Login + session at `/login` + `/api/auth/{login,logout,me}` ✓
- Agent registry at `GET /api/agents` returning all 3 ✓
- Workflow CRUD at `/api/workflows/*` (create, list, fetch, update, delete) ✓
- Workflow runner at `POST /api/workflows/:id/run` (unit-tested; live HTTP not exercised — first run will pay BGE-M3 download cost) ✓
- Builder UI at `/builder` — drag-and-drop canvas with workflows list + agent palette + per-node config + workflow Members assignment ✓
- Per-workflow team-member assignment routes ✓

**Pre-existing live verification (still holds):**
- `POST /api/agents/verifier` returns journalism-grade fact-check (~$0.17 / 29 s on Opus 4.7).
- BGE-M3 embedding pipeline returns correct 1024-dim vectors.

---

## 4. Stack and conventions

- **Node.js** at root with `"type": "commonjs"` (matches Surepath). Use `require` / `module.exports`.
- **Next.js 15 App Router** under `app/`, **TypeScript** there. Use `import` / `export`. The Next.js bundler handles CJS↔ESM interop automatically.
- **PostgreSQL** with raw SQL migrations (no ORM). Migration files in `db/migrations/` numbered `001_*.sql`, `002_*.sql`, etc.
- **Anthropic SDK** for Claude calls — wrapped in `lib/claude.js` with retry-with-exponential-backoff for 429/529/connection errors. Anthropic is the **only paid dependency** in Grounded.
- **Embeddings: `@huggingface/transformers` + `Xenova/bge-m3`**, in-process. ESM-only package consumed via dynamic `import()` inside the CJS module. See [`lib/storage/embed.js`](../lib/storage/embed.js).
- **Roll-our-own auth** — JWT in httpOnly cookie + bcryptjs. Lifted from Holly. See `lib/auth.js`, `app/lib/session.ts`, `app/api/auth/*`.
- **Multi-tenancy via explicit `newsroom_id UUID NOT NULL REFERENCES newsrooms(id)` foreign keys** on every per-newsroom row. NOT arrays (Holly's `sector_ids[]` pattern was rejected).
- **Cost logging** is automatic for Claude — every `chat()` call inserts a row to `api_costs`. Embeddings now cost $0 so no rows are written for them.
- **Audit log** is at workflow level (`audit_log` table); per-API-call cost is in `api_costs`; per-agent-run state is in `workflow_runs`. Three distinct tables, distinct purposes.
- **JSDoc types in CJS modules must inline the full shape** in `@returns`. Typedefs and `object` type don't propagate cleanly across CJS↔TS module boundaries. Lesson learned the hard way in commit `78e2798`.
- **Module-system gotcha:** Holly is ESM, Surepath is CommonJS, Grounded stays CommonJS at root. When porting Holly patterns, convert `import` → `require`. For ESM-only npm packages (like `@huggingface/transformers`), use dynamic `import()` inside an async wrapper.

### Ports

| Project | Port |
|---------|------|
| Surepath | 3000 |
| Holly server | 3001 |
| **Grounded** | **3002** |

### Build approach (CRITICAL — Paul's preference)

- **Step → confirm → next step.** Do not chain through multiple build phases without explicit Paul approval. Each commit should be a unit Paul can review and reverse.
- **Additive-first.** New code, new tables, new modules. Do not restructure across Grounded and Surepath in the same change.
- **Reversible.** Every change should be roll-backable without data loss.
- **Investigation before writing.** Look at how Surepath does the equivalent thing before writing Grounded's version. Log every reuse in [`../REUSE.md`](../REUSE.md).
- **No greenfield rewrites of working code in past projects.**
- **Honest scoping.** If a feature looks bigger than the briefing implies, flag it before building.
- **Park side-tasks.** When a side-task appears mid-build (Drive housekeeping, ops cleanup), propose deferring rather than diving in. Paul has been burned by this.
- **OSS-first.** For any new non-LLM dependency: search Hugging Face / OSS first. Self-host. Free-tier APIs are not acceptable. Log every OSS pick in REUSE.md.

---

## 5. Local dev — exact commands that work

Tested on Paul's macOS. **TWO Postgres instances are running** on his machine:

| Port | Source | Auth | Use this? |
|------|--------|------|-----------|
| 5432 | EnterpriseDB installer (`/Library/PostgreSQL/15/`) | Password-required, will hang | NO |
| **5433** | **User-owned Postgres (peer auth, owner: paulmcnally)** | **No password** | **YES** |

So `DATABASE_URL=postgresql://localhost:5433/anchor` (note port).

### One-time setup

```bash
cd anchor

# Create local DB on port 5433
psql -p 5433 -d postgres -c 'CREATE DATABASE anchor;'

# Build .env (only if it doesn't exist)
# - Pull ANTHROPIC_API_KEY from ../surepath/.env (Paul has authorized this)
# - Generate JWT_SECRET (32+ chars)
# - Set DATABASE_URL=postgresql://localhost:5433/anchor
# See .env.example for full variable list. NB: no embedding key needed (BGE-M3 is local).
cp .env.example .env
# edit values

# Apply migrations + seed bootstrap admin
npm run migrate    # → 001..005 currently
npm run seed       # → admin@anchor.local / changeme123, Local Dev Newsroom
```

### Run dev server (CRITICAL: see gotcha below)

```bash
unset ANTHROPIC_API_KEY && npm run dev
```

**Why `unset`:** Paul's shell exports `ANTHROPIC_API_KEY=""` (empty string) from Claude for Desktop's launch context. Empty string is "set" as far as dotenv and Next.js are concerned, so neither overrides it from `.env`. Calls fail with `"ANTHROPIC_API_KEY is not set."` despite the key being in `.env`. Always prepend `unset ANTHROPIC_API_KEY && ` to local dev commands.

### Background job worker (Step 1 onward)

Run alongside the web app in a second terminal. Required by Researcher's
deep crawler (Step 3), the style-fingerprint extractor (Step 4), and any
future async work. Pulls jobs off the same Postgres database (pg-boss
schema), no separate broker:

```bash
# Terminal 1
unset ANTHROPIC_API_KEY && npm run dev      # Next.js on :3002

# Terminal 2
unset ANTHROPIC_API_KEY && npm run worker   # pg-boss worker
```

The worker creates a `pgboss` schema on first run (isolated from `public.*`).
Stop with Ctrl-C — graceful shutdown waits for in-flight jobs.

Alternative for pure-Node scripts (`db/migrate.js`, `db/seed.js`, future workers): use `dotenv.config({ override: true })` instead of plain `dotenv.config()`.

### First embedding run

The first call to the Archivist (or any code path that hits `embedChunks` / `embedQuery`) downloads ~1.3 GB of BGE-M3 quantized ONNX weights to `~/.cache/huggingface`. Allow ~3 min on a decent connection. Subsequent loads are ~1–3 s.

To pre-warm the cache from CLI without going through the full app:

```bash
node -e "require('./lib/storage/embed').embedQuery('warmup').then(v => console.log('dim:', v.length))"
```

### Quick smoke test commands

```bash
# Login → save cookie
curl -s -c /tmp/anchor-cookies.txt -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@anchor.local","password":"changeme123"}'

# Confirm Claude end-to-end
curl -s -b /tmp/anchor-cookies.txt -X POST http://localhost:3002/api/agents/smoke-test
# expect: {"ok":true,"text":"ANCHOR_SMOKE_OK","cost":{...}}

# Verify a real article
curl -s -b /tmp/anchor-cookies.txt -X POST http://localhost:3002/api/agents/verifier \
  -H "Content-Type: application/json" \
  -d '{"articleText":"<paste >=50 chars of article>"}'
```

### Other gotchas

- **Drive sync churn.** The repo lives on Google Drive (Paul's preference). `node_modules/` is gitignored but Drive desktop tries to sync 100k+ files. It works but is slow. Don't worry about it; do NOT propose moving the project off Drive — Paul has been asked and prefers Drive.
- **`tsc --noEmit` exit-code chain.** Bash `npx tsc --noEmit | head -30 && git commit ...` swallows tsc's exit code via `head`, so type errors don't block commits. Capture `$?` explicitly. (See `78e2798` for the bug.)
- **Async cookies.** Next.js 15's `cookies()` from `next/headers` is async. Always `await cookies()`.
- **HF cache size.** BGE-M3 + future Whisper/NLLB/deepfake models will accumulate several GB in `~/.cache/huggingface`. Not a problem on Paul's Mac; flag it for the eventual deploy box.

---

## 6. Architecture decisions already locked

Don't re-litigate these unless Paul re-opens them:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | Next.js 15 App Router (TS in `app/`) | Confirmed Q3 — full-stack React, App Router DX |
| Auth | Roll-our-own JWT + bcryptjs (httpOnly cookie) | Confirmed Q4 — lifted from Holly |
| Database | Local Postgres for dev. Lightsail deploy is **post-pilot**. | Confirmed 2026-05-05 |
| **NODE_ENV gotcha** | Paul's shell exports `NODE_ENV=production`. Always `unset NODE_ENV` before `npm install` (else devDependencies — incl. typescript — get skipped) and `npm run dev`. Same class as `unset ANTHROPIC_API_KEY`. | Burned 2026-05-05 PM |
| DB schema | Raw SQL migrations, no ORM | Confirmed — lifted from Holly |
| Multi-tenancy | Explicit `newsroom_id` FK on every per-newsroom row | Confirmed — Holly's `sector_ids[]` rejected |
| Module system | CommonJS at root, TS in `app/` (ESM via Next bundler); ESM-only deps via dynamic `import()` | Confirmed |
| Vector store (Archivist) | **pgvector** (Postgres extension) | One fewer service; same DB; multi-tenant via FK |
| Embedding model (Archivist) | **`Xenova/bge-m3` (BAAI/bge-m3 ONNX) via `@huggingface/transformers`, in-process** | OSS, fully free, 1024-dim. **Replaces Cohere as of 2026-05-05.** |
| Paid LLM | Anthropic Claude (Opus 4.7 default) | The only paid dep. All other agents must be OSS. |
| Upload formats v1 (Archivist) | PDF, DOCX, plaintext, Markdown | URL fetch deferred to v1.5 |
| Storage (Archivist uploads) | Local filesystem mock for now. Real S3 + Drive mirror lands with the post-pilot deploy work. | Confirmed 2026-05-05 |
| WhatsApp surface for **journalists / Users** | **DROPPED.** Earlier "WA delivery for User mode post-pilot" decision is reversed. Grounded's User mode is web-only forever. | Reversed 2026-05-05 PM |
| WhatsApp surface for **the audience** (Digital News Gatherer) | **Post-pilot.** Lifts from `surepath/whatsapp.js`. Digital News Gatherer's WhatsApp inbound (tips, submissions) + outbound (broadcasts) + correction-loop pieces sequence with this. Audience-facing only. | Confirmed 2026-05-05 PM |
| Lightsail deployment | **Post-pilot.** Sibling to surepath-prod. | Confirmed 2026-05-05 PM |
| Pilot scope (everything else) | **Full PDF concept note (final 2026-05-05 PM spec).** Audio & Video Producer's full multimedia pipeline, Translator's multi-model routing + glossary + edit-feedback, Digital News Gatherer's two-way intake + triage queue (web/non-WA channels), Operations whole-org + contributor mgmt, Audience clones with default low-data/vernacular/feature-phone personas, the learning layer, the newsroom profile object — ALL pilot. | Confirmed 2026-05-05 PM |
| Governance / Compliance layer | **DROPPED.** No jurisdiction packs / POPIA enforcement / audit-export. The new "**learning layer**" is a curated AI-ethics/law update FEED (different mechanism, IS in pilot). Internal `audit_log` stays for debugging. | Confirmed 2026-05-05 |
| Workflow library v1 | Flat shared list with attribution; no versioning/moderation. Learning layer's auto-promotion of "successful configs as deployable assets" comes from cross-cohort meta-analytics, not editorial moderation. | Confirmed 2026-05-05 |
| User mode UX | **Web app, list-of-workflows.** Journalists pick a workflow grouped by problem category, see the problem statement + step-by-step user instructions, fill the form, run, see the output. **Not a chat surface.** Not WhatsApp-accessible. | Per Paul 2026-05-05 PM |
| Workflow framing | Every workflow has `problem_statement`, `problem_category`, `user_instructions` (migration 009). Workflows are framed as products solving newsroom problems — not technical pipelines. The shared library becomes a marketplace of solved problems. | Confirmed 2026-05-05 PM |
| In-Builder testing | Builder has a "▶ Test as user" button that auto-saves and opens a side panel rendering the workflow as the User will experience it (problem statement + instructions + input form + rendered output). The same `WorkflowRunner` component powers User mode in /run. | Confirmed 2026-05-05 PM |
| Per-workflow team-member assignment | `workflow_assignments` table (migration 007). User mode chat filters by assignments — only show workflows the user is on. | Confirmed 2026-05-05 PM |
| Per-newsroom credentials (Digital News Gatherer) | Encrypted at rest with a key from `CREDENTIALS_KEY`. Decrypted only at posting time. Highest-blast-radius surface — security review before pilot launch. | Confirmed 2026-05-05 |
| Verifier philosophy | "Never Accuse" — neutral, advisory, all evidence "to be independently confirmed". | Hard constraint per briefing |
| Verifier source-credibility map | Curated for **SA + Zimbabwe + Zambia + Kenya**. Outlets, official agencies, recognised credible vs. known-problem sources per country. | Confirmed 2026-05-05 |
| Translator languages | **SA-focused** per final spec: isiZulu, isiXhosa, Sesotho, Setswana, Siswati, IsiNdebele, Sepedi, Afrikaans. NOT the same list as Verifier's market list (which spans SA + ZW + ZM + KE). | Confirmed 2026-05-05 PM |
| Translator routing | **Multi-model per language pair** (NLLB-200, Helsinki opus-mt, Masakhane afri-mt5, Lelapa, etc.) — not a single-model wrapper. | Confirmed 2026-05-05 PM |
| Pilot agent set | **The 11 in `docs/AGENTS.md`** — verbatim from Paul's latest spec. | Confirmed 2026-05-11 |
| Primary markets | SA, Zimbabwe, Zambia, Kenya. Pilot newsrooms remain 5 ZimZam (ZW + ZM); SA + KE in next cohort. | Confirmed 2026-05-05 |
| Build order | UI scaffold (done) → agents in dependency order. Operations BEFORE Digital News Gatherer (Digital News Gatherer routes contributors to Operations). Newsroom Profile early (Slice 7 — many agents read it). | Confirmed 2026-05-05 PM |

---

## 7. External integrations (live IDs)

### Airtable

Single base: **Develop AI** (`app4FVlF4AAy8Q8s2`). Tables Grounded talks to:

| Table | ID | Use |
|-------|----|----|
| **Newsrooms** | `tblUCJtQvYFcSIdxP` | Source of truth for newsroom metadata. Grounded's local `newsrooms` table is a cache; sync on demand via `airtable_record_id`. |
| **Activity Log** | `tblbjZL7ckos17au5` | Grounded writes high-signal events here (workflow created, agent run, governance flag) tagged with `Stream=Grounded`. Postgres `audit_log` keeps the full forensic trail. |
| **Contacts** | `tblDjons0lRF2ft77` | AI champions linked to Newsrooms. Has 3 link fields (`Newsrooms`, `Newsrooms 2`, `Newsrooms 3`) — verify which is canonical when reading. |

Sync model: read on demand (not nightly cache).

### Google Drive

**Canonical knowledge base:** `08 - Knowledge Library` (`1nuVY8OIpZfctRw-eGJ3uj8FCitZBBlGE`) under `My Drive/Develop AI/`.

11 topic subfolders (created by Paul). **Grounded does not ingest from this library yet.** The earlier governance/methodology RAG was dropped along with the Compliance agent. The new **learning layer (Slice 16)** may pull from a curated subset — review when we get there; do NOT pre-ingest now.

**Newsroom uploads (Step 4c Archivist):** **For the pilot, stays local-disk.** S3 + per-newsroom Drive folder mirror are post-pilot infra (currently mocked).

**ZimZam needs assessments** (in `08 - Knowledge Library/01 - Needs Assessments/ZimZam Cohort 2026/`): per Paul's hard constraint, these are **reference material for newsrooms only**, **NOT product inputs**. Do NOT ingest them into Grounded's governance RAG. Do NOT extract per-newsroom signals from them to bake into product config.

### Drive cleanup pending

There's an orphan `08 - GROUNDED Knowledge Base/` folder (id `1jq2VORItU0Kv9UI6ioY44g9IA_jNMA-N`) that Claude created in error before discovering Paul's existing `08 - Knowledge Library/`. Mostly empty; contains 12 ZimZam file copies. Paul to manually move/delete when convenient. Don't touch via API.

---

## 8. Off-limits

- **Surepath is live in production** on AWS Lightsail (`surepath-prod`, `af-south-1`). Local copy at `../surepath/` is **read-only reference**. NEVER modify it. Lift patterns into Grounded; do not refactor Surepath.
- **Secrets stay in `.env` (gitignored).** Do not commit. Real values were lifted from `../surepath/.env` (Paul has explicitly authorized reading that file).
- **`JusticePro`, `SmartGuard`** — parked products. Ignore if encountered.
- **Needs assessments** — reference only, NOT product inputs (see §7 Drive section).
- **Don't reach for paid APIs without asking.** Claude (Anthropic) is the only paid dep allowed. If the obvious solution to a sub-problem is a paid SaaS (Cohere, OpenAI embeddings, AssemblyAI, Replicate, ElevenLabs, …), stop and surface an OSS alternative instead.

---

## 9. Build plan — slices

Pilot ships **the full PDF concept note** (see [`AGENTS.md`](AGENTS.md)). Only WhatsApp and Lightsail are post-pilot. Each slice ends in a commit Paul reviews before moving on.

### Step 5 — Builder + User UI scaffold

| Slice | Description | Status |
|-------|-------------|--------|
| 1 | Agent registry + `GET /api/agents` | ✓ done (`60b9aa5`) |
| 2 | Workflows table + CRUD | ✓ done (`d145baf`) |
| 3 | Workflow runner + `POST /api/workflows/:id/run` | ✓ done (`ff788f1`) |
| 4 | Builder drag-and-drop UI (React Flow) | ✓ done (`1b771d3`) |
| 4b | Inline workspace + per-workflow team-member assignment | ✓ done (`ddf62b2`) |
| 4c | Alignment to final agent spec — `docs/AGENTS.md`, registry descriptions, this rewrite, scope memories | in progress |
| 5 | User chat surface (filters by user's workflow assignments; keyword-first + LLM-fallback routing) | next |
| 6 | Admin invite endpoint + UI (Members panel needs >1 user to be useful) | |

### Step 6 — Newsroom profile + agent build-out

Order set by dependencies:

| Slice | Description |
|-------|-------------|
| 7 | **Newsroom profile** — schema + CRUD. Read by Fundraiser, Audience, Copywriter (style), Audio & Video Producer. |
| 8 | **Researcher** — `pdf-parse`, GLiNER for entity extraction, public-records orchestration. |
| 9 | **Translator** — sub-slices: 9a glossary + Helsinki-NLP `opus-mt-*` baseline; 9b multi-model routing layer (NLLB / opus-mt / Masakhane / Lelapa); 9c phrase-level confidence; 9d edit-feedback loop (glossary auto-update + routing reweighting). SA-focused languages. |
| 10 | **Operations** — calendar/deadlines/freelancers + sales/logistics/finance + community contributor management (vetting, attribution, payment, moderation). Must ship before Digital News Gatherer. |
| 11 | **Digital News Gatherer** — sub-slices: 11a inbound triage queue + web-form intake; 11b outbound creds (encrypted) + social/CMS posting; 11c **editor triage actions** ("send to Verifier" / "send to Operations" — manual editorial decisions from the queue, not auto-routing); 11d correction loop. WhatsApp inbound + outbound + WA-correction-loop pieces sequence with WA itself (post-pilot). |
| 12 | **Audience** — analytics ingest (Plausible/Umami/GA/CSV) + clones from data + DEFAULT low-data/vernacular/feature-phone personas seeded. |
| 13 | **Fundraiser** — funder library + per-newsroom profile composition + cohort joint-application matching. |
| 14 | **Audio & Video Producer** — sub-slices: 14a text outputs (radio scripts, podcast outlines, video briefs); 14b audio assembly (Whisper + Piper + sound design); 14c vertical video assembly (ffmpeg + footage retrieval + auto-captions); 14d audiograms. |
| 15 | **Verifier credibility map** — structured JSON/DB table covering SA + ZW + ZM + KE outlets, official agencies, known-disinformation sources. Verifier loads at run time. |
| 16 | **Learning layer** — AI ethics/data law/security update feed + cross-cohort meta-analytics + auto-promotion of successful workflows as deployable assets. |

For each new agent: investigate OSS deps on Hugging Face / GitHub first (default home for non-LLM dependencies); log the pick in REUSE.md; register in the agent registry; smoke-test through Builder UI before moving on.

### Post-pilot

**Do not start before pilot signoff.**
- **Lightsail deploy** — sibling to `surepath-prod`. Deploy script lifts from `surepath/deploy.sh`. Confirm BGE-M3 + Whisper + NLLB model-cache strategy.
- **WhatsApp** — lift `surepath/whatsapp.js`. Adapt conversation state to User-mode chat. Hooks into Digital News Gatherer's two-way pieces (inbound, outbound broadcasts, correction loop).
- **Real S3 + Drive mirror** — replace local-disk uploads.

### Removed from plan

- ~~Compliance agent~~, ~~Sourcer~~, ~~Media Verifier~~ — not in the official 11.
- ~~Governance / jurisdiction packs / POPIA enforcement~~ — moved to a different system. The new "learning layer" (Slice 16) is a different mechanism (curated FEED, not enforcement).

---

## 10. Open decisions

Most pre-existing open questions are resolved. Remaining:

1. **User-mode chat routing.** Going with **(a) keyword-first + (b) LLM-fallback** unless Paul redirects. Workflow trigger phrases are matched first; if none match, a small Claude call picks the best-fit workflow from the user's assigned set.
2. **Audio & Video Producer stock-footage source.** Pexels/Pixabay are free-tier hosted APIs (NOT OSS-rule-compliant). Likely options: Wikimedia Commons (open license), per-newsroom uploaded asset library, or a curated open-asset bundle baked into the deploy. Decide at Slice 14.
3. **Audience analytics connectors.** Plausible / Umami / GA export / raw CSV. Default-persona seed handles newsrooms with no analytics; analytics ingest is opportunistic. Confirm when we get there whether any pilot newsroom has real analytics to wire up.

---

## 11. Reference codebases (read-only)

Local sibling directories under `../`:

| Path | Stack | Live? | Lift inventory |
|------|-------|-------|----------------|
| `../surepath/` | Node CommonJS + Next.js dashboard | **YES — production on Lightsail** | See [`../REUSE.md`](../REUSE.md) tables S1–S9. Patterns: db.js, costs.js, parse-claude-json (vision.js), Next dashboard auth, Twilio webhook, Claude Vision WHY-chain. |
| `../holly/` | Node ESM Express + React client | No | H1–H8: server middleware order, JWT+bcrypt auth, migration runner, googleapis usage, pluggable LLM dispatch, admin route guarding. |
| `../aikit/`, `../aitools/`, `../grounded/` | Python FastAPI scaffold (3 forks of same scaffold) | No | Reference only — different stack. |
| `../alibi/` | Python computer vision | No | **Worth a deeper look for Media Verifier (Step 5+).** Vision/RTSP patterns. |
| `../aipod/` | Python audio pipeline (Celery+Redis) | No | **Worth a deeper look for Audio & Video Producer (Step 5+).** Whisper integration patterns. |
| `../recapture/`, `../market/`, `../substack/` | Python | No | Reference only. |

For each lift, **log it in [`../REUSE.md`](../REUSE.md)** with date, source path, target path, tier (🟢 LIFT / 🟡 ADAPT / 🔴 REFERENCE), and notes. This is non-negotiable — Paul audits this file.

---

## 12. Memory / context outside this repo

User-level memory lives at `~/.claude/projects/-Users-paulmcnally-Developai-Dropbox-Paul-McNally-DROPBOX-ONMAC-PYTHON-2025-anchor/memory/`. Key facts saved there:

- **Grounded's only paid dep is Anthropic.** Everything else must be OSS, fully free, no free-tier limits. Hugging Face is the default place to look first.
- **Pilot scope = the full PDF concept note (final 2026-05-05 PM spec)** — see [`docs/AGENTS.md`](AGENTS.md) for the canonical agent definitions. ONLY WhatsApp + Lightsail are post-pilot.
- **Translator scope** — multi-model routing per language pair + per-newsroom glossary + phrase confidence + edit-feedback loop. SA-focused languages.
- **Digital News Gatherer scope** — two-way (inbound triage + outbound) with correction loop. Routes inbound to Verifier (fact-check) + Operations (contributor mgmt).
- **Operations scope** — whole-org (sales/logistics/finance) + community contributor management. Build BEFORE Digital News Gatherer.
- **Audience scope** — analytics conversion + clones + DEFAULT low-data/vernacular/feature-phone personas seeded.
- **Builder mode = drag-and-drop canvas** at /builder. Per-workflow team-member assignment via `workflow_assignments`.
- **User mode = web list of workflows by problem category**, filtered by per-workflow assignment. Not a chat. Not WhatsApp. WhatsApp is only for Digital News Gatherer's audience channels (post-pilot).
- **Workflow framing** — every workflow has problem_statement + problem_category + user_instructions. Builder writes the framing; User sees it on /run.
- **Primary markets:** SA, Zimbabwe, Zambia, Kenya. Pilot newsrooms remain 5 ZimZam.
- **Build agents incrementally behind the UI**, not in a long invisible batch. Step → confirm → next step. Park side-tasks.
- **Surepath is live — never modify it.** Read-only reference.
- **Shell gotchas:** `unset ANTHROPIC_API_KEY` before `npm run dev`; `unset NODE_ENV` before `npm install` (else devDependencies get skipped).

---

## 13. Bootstrap prompt for the next agent

> Read `docs/AGENTS.md` (canonical agent definitions), `docs/HANDOFF.md` (this file), and `REUSE.md` (lift inventory) in full before doing anything. Grounded is shared AI infrastructure for African newsrooms. **Pilot scope = the full PDF concept note as it stands in `docs/AGENTS.md` — only WhatsApp delivery and Lightsail deploy are post-pilot. Everything else (Audio & Video Producer's full multimedia, Translator's multi-model routing + glossary + edit-feedback, inbound-only Digital News Gatherer with outbound conceptually re-homed under Copywriter, Operations Manager including contributor mgmt, Audience Analytics Manager consultations grounded in historical analytics, the learning layer, the newsroom profile object) is in pilot.** Anthropic Claude is the only paid dependency; everything else must be OSS, fully free at any volume, self-hosted (Hugging Face is the default place to look). 3 of 11 agents are shipped as basic shells (Verifier, Archivist, Copywriter); Builder UI scaffold is shipped with drag-and-drop, workflow CRUD, runner, and per-workflow team-member assignment. Next phase is Slice 5 (User chat surface filtered by assignments). Before writing code, confirm the open questions in §10 and the slice plan in §9. Step → confirm → next step; park side-tasks.
