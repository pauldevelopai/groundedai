# Anchor — Build Hand-off

For an AI agent picking up this build mid-flight (Antigravity, Cursor, Cline, any). **Read this entire file before touching code.** Then read [`docs/BRIEFING.md`](BRIEFING.md) for full product scope and [`../REUSE.md`](../REUSE.md) for the lift inventory.

Last updated 2026-05-05 by Antigravity after completing Step 4c (Archivist) and Step 4d (Drafter).

---

## 1. What Anchor is (one paragraph)

A multi-tenant web platform for African newsrooms that combines an **agent execution layer** (3 MVP agents: Verifier, Archivist, Drafter) with a **governance layer** (jurisdiction-aware compliance: POPIA, Zimbabwe Cyber & Data Protection Act, Zambia Cyber Security Act, press codes, donor compliance). Pilot is **5 ZimZam newsrooms** (Capital FM Lusaka, EnviroPress, MakanDay, Maricho Media, VicFallsLive). Anchor is the flagship of GROUNDED, which is a practice under Develop AI.

Two modes:
- **Builder mode** — AI champion in each newsroom composes workflows ("slugs" = named agent sets).
- **User mode** — newsroom team runs workflows. No AI literacy needed.

Cross-newsroom **shared workflow library** is the network effect. Per-newsroom isolation for content; shared workflow definitions.

---

## 2. Build state (commits in this repo)

```
[Uncommitted] Step 4d: Drafter agent
[Uncommitted] Step 4c Pass C-2/C-3: Text extraction, Chunking, Embeddings, pgvector, Search + Verifier integration
[Uncommitted] Step 4c Pass C-1: File upload + S3 + Drive mirror (Mocked locally for MVP)
78e2798 Fix TS: inline cost shape in JSDoc @returns
d80b08c Step 4 Pass B: Verifier agent
7977582 Step 4 Pass A: Claude wrapper + cost logging + JSON parser + smoke endpoint
21e5d70 Step 3b: auth layer (login, logout, me, seed)
fdcc608 Step 3a: scaffold Next.js + Postgres backbone
6e3b6bc Step 1: populate REUSE.md from Surepath + Holly walkthrough
7725ddf Step 0: scaffold Anchor project
```

**Verified end-to-end on 2026-05-04:**
- Login + cookie session + `/api/auth/me` ✓
- `POST /api/agents/smoke-test` returns `ANCHOR_SMOKE_OK` ($0.002 / call on Opus 4.7) ✓
- `POST /api/agents/verifier` returns calibrated, journalism-grade fact-check on a real article. Caught: outdated agency name (CSO → ZamStats 2018), fictional bank name, plausibility-flagged unanimous MPC vote. AI-likelihood scoring works. "Never Accuse" constraint honored. ($0.17 / article on Opus 4.7, 29s)

**REPO HAS NO GIT REMOTE.** First action a future agent should propose: `git remote add origin git@github.com:pauldevelopai/anchor.git && git push -u origin main` (after Paul creates the repo). Currently 8 commits live only on Paul's local Drive copy — fragile.

---

## 3. Stack and conventions

- **Node.js** at root with `"type": "commonjs"` (matches Surepath). Use `require` / `module.exports`.
- **Next.js 15 App Router** under `app/`, **TypeScript** there. Use `import` / `export`. The Next.js bundler handles CJS↔ESM interop automatically.
- **PostgreSQL** with raw SQL migrations (no ORM). Migration files in `db/migrations/` numbered `001_*.sql`, `002_*.sql`, etc.
- **Anthropic SDK** for Claude calls — wrapped in `lib/claude.js` with retry-with-exponential-backoff for 429/529/connection errors.
- **Roll-our-own auth** — JWT in httpOnly cookie + bcryptjs. Lifted from Holly. See `lib/auth.js`, `app/lib/session.ts`, `app/api/auth/*`.
- **Multi-tenancy via explicit `newsroom_id UUID NOT NULL REFERENCES newsrooms(id)` foreign keys** on every per-newsroom row. NOT arrays (Holly's `sector_ids[]` pattern was rejected).
- **Cost logging** is automatic — every `chat()` call inserts a row to `api_costs` with `{ newsroom_id, user_id, agent, endpoint, tokens, cost_usd }`.
- **Audit log** is at workflow level (`audit_log` table); per-API-call cost is in `api_costs`; per-agent-run state is in `workflow_runs`. Three distinct tables, distinct purposes.
- **JSDoc types in CJS modules must inline the full shape** in `@returns`. Typedefs and `object` type don't propagate cleanly across CJS↔TS module boundaries. Lesson learned the hard way in commit `78e2798`.
- **Module-system gotcha:** Holly is ESM, Surepath is CommonJS, Anchor stays CommonJS at root. When porting Holly patterns, convert `import` → `require`.

### Ports

| Project | Port |
|---------|------|
| Surepath | 3000 |
| Holly server | 3001 |
| **Anchor** | **3002** |

### Build approach (CRITICAL — Paul's preference)

- **Step → confirm → next step.** Do not chain through multiple build phases without explicit Paul approval. Each commit should be a unit Paul can review and reverse.
- **Additive-first.** New code, new tables, new modules. Do not restructure across Anchor and Surepath in the same change.
- **Reversible.** Every change should be roll-backable without data loss. Use feature flags where appropriate.
- **Investigation before writing.** Look at how Surepath does the equivalent thing before writing Anchor's version. Log every reuse in [`../REUSE.md`](../REUSE.md).
- **No greenfield rewrites of working code in past projects.**
- **Honest scoping.** If a feature looks bigger than the briefing implies, flag it before building.
- **Park side-tasks.** When a side-task appears mid-build (Drive housekeeping, ops cleanup), propose deferring rather than diving in. Paul has been burned by this.

---

## 4. Local dev — exact commands that work

Tested on Paul's macOS, 2026-05-04. **TWO Postgres instances are running** on his machine:

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
# See .env.example for full variable list
cp .env.example .env
# edit values

# Apply migrations + seed bootstrap admin
npm run migrate    # → 001, 002, 003 currently (will grow as Archivist etc. land)
npm run seed       # → admin@anchor.local / changeme123, Local Dev Newsroom
```

### Run dev server (CRITICAL: see gotcha below)

```bash
unset ANTHROPIC_API_KEY && npm run dev
```

**Why `unset`:** Paul's shell exports `ANTHROPIC_API_KEY=""` (empty string) from Claude for Desktop's launch context. Empty string is "set" as far as dotenv and Next.js are concerned, so neither overrides it from `.env`. Calls fail with `"ANTHROPIC_API_KEY is not set."` despite the key being in `.env`. Always prepend `unset ANTHROPIC_API_KEY && ` to local dev commands.

Alternative for pure-Node scripts (`db/migrate.js`, `db/seed.js`, future workers): use `dotenv.config({ override: true })` instead of plain `dotenv.config()`.

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

---

## 5. Architecture decisions already locked

Don't re-litigate these unless Paul re-opens them:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | Next.js 15 App Router (TS in `app/`) | Confirmed Q3 — full-stack React, App Router DX |
| Auth | Roll-our-own JWT + bcryptjs (httpOnly cookie) | Confirmed Q4 — lifted from Holly |
| Database | Local Postgres for dev; new Lightsail instance later (NOT same as Surepath) | Confirmed Q2 |
| DB schema | Raw SQL migrations, no ORM | Confirmed — lifted from Holly |
| Multi-tenancy | Explicit `newsroom_id` FK on every per-newsroom row | Confirmed — Holly's `sector_ids[]` rejected |
| Module system | CommonJS at root, TS in `app/` (ESM via Next bundler) | Confirmed |
| Vector store (Archivist) | **pgvector** (Postgres extension) | One fewer service; same DB; multi-tenant via FK |
| Embedding model (Archivist) | **Cohere `embed-multilingual-v3`** | African-language support: Bemba, Shona, Tonga, Nyanja, Ndebele |
| Upload formats v1 (Archivist) | PDF, DOCX, plaintext, Markdown | URL fetch deferred to v1.5 |
| Storage (Archivist uploads) | S3 primary + per-newsroom Drive folder mirror | Confirmed |
| WhatsApp delivery | Deferred to post-MVP (Step 8) | Ship MVP without |
| Workflow library v1 | Flat shared list with attribution; no versioning/moderation | Confirmed |
| Bootstrap admin user | Seed creates `admin@anchor.local` / `changeme123`; real users via admin invite later | Register endpoint deferred to Step 5 |
| Verifier philosophy | "Never Accuse" — neutral language, advisory verdicts, all evidence flagged "to be independently confirmed" | Hard constraint per briefing |

---

## 6. External integrations (live IDs)

### Airtable

Single base: **Develop AI** (`app4FVlF4AAy8Q8s2`). Tables Anchor talks to:

| Table | ID | Use |
|-------|----|----|
| **Newsrooms** | `tblUCJtQvYFcSIdxP` | Source of truth for newsroom metadata. Anchor's local `newsrooms` table is a cache; sync on demand via `airtable_record_id`. |
| **Activity Log** | `tblbjZL7ckos17au5` | Anchor writes high-signal events here (workflow created, agent run, governance flag) tagged with `Stream=Anchor`. Postgres `audit_log` keeps the full forensic trail. |
| **Contacts** | `tblDjons0lRF2ft77` | AI champions linked to Newsrooms. Has 3 link fields (`Newsrooms`, `Newsrooms 2`, `Newsrooms 3`) — verify which is canonical when reading. |

Sync model: read on demand (not nightly cache).

### Google Drive

**Canonical knowledge base:** `08 - Knowledge Library` (`1nuVY8OIpZfctRw-eGJ3uj8FCitZBBlGE`) under `My Drive/Develop AI/`. URL: https://drive.google.com/drive/folders/1nuVY8OIpZfctRw-eGJ3uj8FCitZBBlGE

11 topic subfolders (created by Paul): `AI in Journalism`, `AI Policy`, `African Media`, `Biometrics`, `Data Privacy`, `Funding Landscape`, `Legal AI`, `Newsroom Case Studies`, `POPIA`, `Property Data`, `Schools and AI`.

**Anchor governance RAG should ingest** from selected topic folders relevant to the newsroom domain: `AI in Journalism`, `AI Policy`, `African Media`, `Data Privacy`, `POPIA`, `Newsroom Case Studies`. Skip `Property Data` (Surepath domain), `Schools and AI` (Awareness practice).

**Newsroom uploads (Step 4c Archivist):** S3 is primary, with **per-newsroom Drive folder mirror** under a parent folder TBD. Add env var `GOOGLE_DRIVE_UPLOADS_PARENT_FOLDER_ID` when implementing.

**ZimZam needs assessments** (in `08 - Knowledge Library/01 - Needs Assessments/ZimZam Cohort 2026/`): per Paul's hard constraint, these are **reference material for newsrooms only**, **NOT product inputs**. Do NOT ingest them into Anchor's governance RAG. Do NOT extract per-newsroom signals from them to bake into product config. The 5 newsrooms will consult their own assessments when configuring their workflows; Anchor is generic.

### Drive cleanup pending

There's an orphan `08 - GROUNDED Knowledge Base/` folder (id `1jq2VORItU0Kv9UI6ioY44g9IA_jNMA-N`) that Claude created in error before discovering Paul's existing `08 - Knowledge Library/`. Mostly empty; contains 12 ZimZam file copies in `01 - Needs Assessments/ZimZam Cohort 2026/`. Paul to manually move/delete when convenient. Don't touch via API.

---

## 7. Off-limits

- **Surepath is live in production** on AWS Lightsail (`surepath-prod`, `af-south-1`). Local copy at `../surepath/` is **read-only reference**. NEVER modify it. Lift patterns into Anchor; do not refactor Surepath.
- **Secrets stay in `.env` (gitignored).** Do not commit. Real values were lifted from `../surepath/.env` (Paul has explicitly authorized reading that file).
- **`JusticePro`, `SmartGuard`** — parked products. Ignore if encountered.
- **Needs assessments** — reference only, NOT product inputs (see §6 Drive section).

---

## 8. Remaining build phases

Briefing's 9 steps; Steps 0–4B done. What's next:

### Step 4c — Archivist agent (COMPLETED)

The biggest single agent. RAG over per-newsroom uploaded content.

**Pass C-1: File upload + S3 + Drive mirror (COMPLETED via Option B mock)**
- Built `archive_documents` table and upload endpoint.
- Mocked S3 to local disk and Drive to a no-op to unblock local dev due to missing credentials.

**Pass C-2: Text extraction + chunking + embedding + pgvector (COMPLETED)**
- Integrated `pdf-parse`, `mammoth`, and `cohere-ai` (with mock fallback).
- Built `archive_chunks` with HNSW index and inline text extraction/chunking.

**Pass C-3: Search + retrieve + Verifier integration (COMPLETED)**
- Built `POST /api/archive/search` and `lib/agents/archivist.js`.
- Wired Verifier agent to pull `archiveContext` automatically before verifying claims.

### Step 4d — Drafter agent (COMPLETED)

Smaller. Drafting under editorial oversight: social copy, newsletter blurbs, headline alternatives, translation to local languages (Bemba, Shona, Tonga, Nyanja, Ndebele).
- `lib/agents/drafter.js` built.
- `app/api/agents/drafter/route.ts` built.
- Explicit "draft-only" constraint and tone adaptation verified.

### Step 5 — Builder + User mode UIs

Two distinct surfaces:
- **Builder:** workflow composition — pick agents, set prompts, attach knowledge sources, name the workflow ("slug"). Rich UI but functional > polished for MVP.
- **User:** workflow runner — list workflows for the newsroom + the shared library, click to run, see output. Mobile-first PWA per briefing.
- Both are server-rendered Next.js App Router pages. Use `getCurrentSession()` from `app/lib/session.ts` everywhere.
- Add `register` endpoint here (or as part of Step 5) — admin-driven invite flow. Self-registration was deferred from Step 3b on purpose.

### Step 6 — Workflow library (per-newsroom + cross-newsroom shared)

- `workflows` table — per-newsroom owned but with `is_shared boolean` flag for cross-newsroom visibility
- Attribution shown on shared workflows (built-by name, newsroom)
- v1 = flat shared list; no versioning, no moderation. Audit log gives "who did what when" backstop.

### Step 7 — Governance layer

- Jurisdiction packs: ingest into pgvector tagged by jurisdiction (POPIA/Zimbabwe/Zambia)
- Each newsroom has applicable jurisdictions (from Airtable `country` field or explicit per-newsroom config)
- `lib/governance.js` — pre-run check on every workflow run, flags issues (advisory, doesn't block)
- Audit log export endpoint: `GET /api/audit/export?newsroomId=X&format=csv|pdf`
- Methodology RAG: ingest from `08 - Knowledge Library/AI in Journalism/`, `/AI Policy/`, `/Data Privacy/`, `/POPIA/`, `/Newsroom Case Studies/`, `/African Media/`

### Step 8 — WhatsApp delivery (deferred)

Lift Surepath's `whatsapp.js` (Twilio webhook + signature verification + conversation state machine). Adapt the conversation state to workflow-output delivery (newsroom user gets workflow result on WhatsApp).

### Step 9 — Pilot deploy

- New Lightsail instance (sibling to surepath-prod, NOT same instance)
- 3 newsrooms first, 2 more after stability
- Deploy script: lift from `surepath/deploy.sh` shape

---

## 9. Reference codebases (read-only)

Local sibling directories under `../`:

| Path | Stack | Live? | Lift inventory |
|------|-------|-------|----------------|
| `../surepath/` | Node CommonJS + Next.js dashboard | **YES — production on Lightsail** | See [`../REUSE.md`](../REUSE.md) tables S1–S9. Patterns: db.js, costs.js, parse-claude-json (vision.js), Next dashboard auth, Twilio webhook, Claude Vision WHY-chain. |
| `../holly/` | Node ESM Express + React client | No | H1–H8: server middleware order, JWT+bcrypt auth, migration runner, googleapis usage, pluggable LLM dispatch, admin route guarding. |
| `../aikit/`, `../aitools/`, `../grounded/` | Python FastAPI scaffold (3 forks of same scaffold) | No | Reference only — different stack. |
| `../alibi/` | Python computer vision | No | Reference only — vision/RTSP patterns may inform future media-verification work. |
| `../aipod/` | Python audio pipeline (Celery+Redis) | No | Reference only — audio agents not in MVP. |
| `../recapture/`, `../market/`, `../substack/` | Python | No | Reference only. |

For each lift, **log it in [`../REUSE.md`](../REUSE.md)** with date, source path, target path, tier (🟢 LIFT / 🟡 ADAPT / 🔴 REFERENCE), and notes. This is non-negotiable — Paul audits this file.

---

## 10. Immediate next action

**Step 5 — Builder + User mode UIs**

Order of operations:
1. Review Builder UI wireframes/requirements.
2. Build the workflow composition interface.
3. Build the workflow runner interface for users.

---

## 11. Memory / context outside this repo

Claude Code (the tool that built this) keeps user-level memory at `~/.claude/projects/.../memory/` with feedback like "park side-tasks during numbered builds", "Surepath is live — read-only", "shell exports ANTHROPIC_API_KEY=empty". An agent in a different IDE won't have this. The most load-bearing pieces have been distilled into this HANDOFF.md — if anything's unclear, ask Paul rather than guessing.

---

## 12. Bootstrap prompt for the next agent

Paste this into Antigravity (or any agent) to start:

> Read `docs/HANDOFF.md`, `docs/BRIEFING.md`, and `REUSE.md` in full before doing anything. The execution layer (MVP agents) is complete. The next phase is Step 5 (Builder + User mode UIs). Please outline an implementation plan for Step 5 and ask me any necessary questions before writing code.
