# Anchor — Build Hand-off

For the AI agent picking up this build. Paul is now driving Anchor from **Claude Code inside VS Code** (this file was last updated by Claude Code in the standalone CLI, which Paul retired for this project on 2026-05-05).

**Read this entire file before touching code.** Then read [`docs/BRIEFING.md`](BRIEFING.md) for full product scope and [`../REUSE.md`](../REUSE.md) for the lift inventory.

Last updated 2026-05-05 by Claude Code (CLI) after pushing the Cohere → BGE-M3 swap and the Step 4c+4d catch-up.

---

## 0. What changed in this last session (2026-05-05)

1. **Pilot scope expanded.** Pilot now includes **all 13 journalism agents** (was 3). See §2 for the full list. The 10 unbuilt agents are no longer "roadmap" — they are MVP. **Build them before pilot launch.**
2. **Pilot deployment is local-only.** Lightsail and WhatsApp are explicitly **post-pilot**, not pilot. Plan for them in the architecture but do not build them yet. (They previously appeared as Steps 8 and 9 of the build plan; they remain in §8 below as post-pilot phases.)
3. **Open-source-first rule locked.** Every non-LLM module (embeddings, vision, OCR, translation, speech, …) **must be fully free at any usage volume** — i.e. OSS we self-host. Free-tier hosted APIs are NOT acceptable. Anthropic Claude is the only allowed paid dependency.
4. **Cohere replaced.** Embeddings now run locally via `@huggingface/transformers` against `Xenova/bge-m3` (BAAI/bge-m3 ONNX). Same 1024-dim output, no schema migration. See [`lib/storage/embed.js`](../lib/storage/embed.js). Smoke-tested. No env var required.
5. **Repo pushed to GitHub.** Remote is `https://github.com/pauldevelopai/anchor.git`. Local main matches origin/main as of commit `fbc8eca`. (The handoff's older "REPO HAS NO GIT REMOTE" warning is gone for good.)
6. **Repo lives at a new path** on Paul's Drive mount — `/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/anchor`. Cosmetic only; doesn't affect anything in code.

---

## 1. What Anchor is (one paragraph)

A multi-tenant web platform for African newsrooms that combines an **agent execution layer** (13 MVP agents — see §2) with a **governance layer** (jurisdiction-aware compliance: POPIA, Zimbabwe Cyber & Data Protection Act, Zambia Cyber Security Act, press codes, donor compliance). Pilot is **5 ZimZam newsrooms** (Capital FM Lusaka, EnviroPress, MakanDay, Maricho Media, VicFallsLive). Anchor is the flagship of GROUNDED, which is a practice under Develop AI.

Two modes:
- **Builder mode** — AI champion in each newsroom composes workflows ("slugs" = named agent sets).
- **User mode** — newsroom team runs workflows. No AI literacy needed.

Cross-newsroom **shared workflow library** is the network effect. Per-newsroom isolation for content; shared workflow definitions.

---

## 2. The 13 pilot agents

**Built and verified end-to-end (Steps 4b/4c/4d):**

| # | Agent | What it does |
|---|-------|-------------|
| 1 | **Verifier** | Checks claims against sources and the newsroom's archive. Returns confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. Africa-grounded source credibility map. "Never Accuse" constraint honored. |
| 2 | **Archivist** | Semantic search over the newsroom's own archive. Answers "have we written about this before, and what did we say." Per-newsroom and private. Now uses BGE-M3 embeddings (local). |
| 3 | **Drafter** | Produces drafts in the newsroom's house style: social copy, headlines, newsletter blurbs, light translation. Style check before delivery. Always draft-only — the newsroom signs off. |

**Not yet built — required for pilot launch:**

| # | Agent | What it does | Likely OSS dependencies to evaluate |
|---|-------|-------------|--------------------------------------|
| 4 | **Sourcer** | Finds sources, witnesses, and contacts for a developing story. | Web search via DuckDuckGo HTML / SearXNG; OSINT helpers. |
| 5 | **Media Verifier** | Verifies images, video, audio. Reverse-image, deepfake, manipulation, geolocation. | OpenCV; `sherloq` patterns; `dfdc`/Selim-Seferbekov style deepfake models on HF; ExifTool; reverse image via Yandex/Google scrape. |
| 6 | **Researcher** | Outward research: public records, court filings, regulatory disclosures, financial documents. | PDF parsing already in repo (`pdf-parse`); OSS named-entity-recognition (spaCy, GLiNER); govt-API helpers. |
| 7 | **Translator** | Full stories between English and African languages with newsroom-approved terminology. | Meta NLLB-200 distilled (1.3B or 600M); LASER for sentence alignment. |
| 8 | **Compliance** | Runs drafts against jurisdiction-specific risk: defamation, privacy, election rules, POPIA, ZW/ZM data laws. | RAG over jurisdiction packs in pgvector. Reuses BGE-M3. |
| 9 | **Producer** | Multi-format production: radio scripts, podcast outlines, video briefs. | Whisper (faster-whisper); TTS via Coqui or Piper; ffmpeg. |
| 10 | **Distributor** | Posts to social, schedules newsletters, pushes to CMS. Editorially cleared, never autonomous. | Direct API integrations (X, Bluesky, Mastodon, Buttondown). All OSS / free APIs preferred. |
| 11 | **Funder** | Maps stories to grants, drafts donor reports, surfaces required metrics. | Donor-database scraping; LLM matching. Mostly Claude-driven. |
| 12 | **Audience** | Reads engagement and search data; flags landed topics, gaps, and bounced stories. | Plausible / Umami self-hosted analytics; Searxng for trend signals. |
| 13 | **Operations** | Internal newsroom workflows: editorial calendar, deadlines, freelancer coordination. | Mostly DB + LLM; reuse Drafter scaffolding. |

**Sequencing rule (decided 2026-05-05):** Build Step 5 (Builder + User UIs) as a **thin agent-registry-driven scaffold first** so each new agent (4–13) lights up in the UI as it ships. **Do NOT build all 10 agents before touching the UI** — that's a long invisible stretch. Each new agent commit should be visibly testable in the UI before moving on.

---

## 3. Build state (commits in this repo)

```
fbc8eca Replace Cohere embeddings with local BGE-M3 (Transformers.js)   [today]
9cd82a3 Step 4c and 4d: Archivist and Drafter agents
e22ed4f Add HANDOFF.md for next agent (Antigravity / Cursor / etc.)
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
- `POST /api/agents/verifier` returns calibrated, journalism-grade fact-check on a real article. ($0.17 / article on Opus 4.7, ~29 s) ✓

**Verified 2026-05-05:** BGE-M3 embedding pipeline produces correct 1024-dim vectors for batch + single inputs.

---

## 4. Stack and conventions

- **Node.js** at root with `"type": "commonjs"` (matches Surepath). Use `require` / `module.exports`.
- **Next.js 15 App Router** under `app/`, **TypeScript** there. Use `import` / `export`. The Next.js bundler handles CJS↔ESM interop automatically.
- **PostgreSQL** with raw SQL migrations (no ORM). Migration files in `db/migrations/` numbered `001_*.sql`, `002_*.sql`, etc.
- **Anthropic SDK** for Claude calls — wrapped in `lib/claude.js` with retry-with-exponential-backoff for 429/529/connection errors. Anthropic is the **only paid dependency** in Anchor.
- **Embeddings: `@huggingface/transformers` + `Xenova/bge-m3`**, in-process. ESM-only package consumed via dynamic `import()` inside the CJS module. See [`lib/storage/embed.js`](../lib/storage/embed.js).
- **Roll-our-own auth** — JWT in httpOnly cookie + bcryptjs. Lifted from Holly. See `lib/auth.js`, `app/lib/session.ts`, `app/api/auth/*`.
- **Multi-tenancy via explicit `newsroom_id UUID NOT NULL REFERENCES newsrooms(id)` foreign keys** on every per-newsroom row. NOT arrays (Holly's `sector_ids[]` pattern was rejected).
- **Cost logging** is automatic for Claude — every `chat()` call inserts a row to `api_costs`. Embeddings now cost $0 so no rows are written for them.
- **Audit log** is at workflow level (`audit_log` table); per-API-call cost is in `api_costs`; per-agent-run state is in `workflow_runs`. Three distinct tables, distinct purposes.
- **JSDoc types in CJS modules must inline the full shape** in `@returns`. Typedefs and `object` type don't propagate cleanly across CJS↔TS module boundaries. Lesson learned the hard way in commit `78e2798`.
- **Module-system gotcha:** Holly is ESM, Surepath is CommonJS, Anchor stays CommonJS at root. When porting Holly patterns, convert `import` → `require`. For ESM-only npm packages (like `@huggingface/transformers`), use dynamic `import()` inside an async wrapper.

### Ports

| Project | Port |
|---------|------|
| Surepath | 3000 |
| Holly server | 3001 |
| **Anchor** | **3002** |

### Build approach (CRITICAL — Paul's preference)

- **Step → confirm → next step.** Do not chain through multiple build phases without explicit Paul approval. Each commit should be a unit Paul can review and reverse.
- **Additive-first.** New code, new tables, new modules. Do not restructure across Anchor and Surepath in the same change.
- **Reversible.** Every change should be roll-backable without data loss.
- **Investigation before writing.** Look at how Surepath does the equivalent thing before writing Anchor's version. Log every reuse in [`../REUSE.md`](../REUSE.md).
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
| Database | Local Postgres for dev; **local-only for the entire pilot** (Lightsail post-pilot) | Confirmed 2026-05-05 |
| DB schema | Raw SQL migrations, no ORM | Confirmed — lifted from Holly |
| Multi-tenancy | Explicit `newsroom_id` FK on every per-newsroom row | Confirmed — Holly's `sector_ids[]` rejected |
| Module system | CommonJS at root, TS in `app/` (ESM via Next bundler); ESM-only deps via dynamic `import()` | Confirmed |
| Vector store (Archivist) | **pgvector** (Postgres extension) | One fewer service; same DB; multi-tenant via FK |
| Embedding model (Archivist) | **`Xenova/bge-m3` (BAAI/bge-m3 ONNX) via `@huggingface/transformers`, in-process** | OSS, fully free, 1024-dim. **Replaces Cohere as of 2026-05-05.** |
| Paid LLM | Anthropic Claude (Opus 4.7 default) | The only paid dep. All other agents must be OSS. |
| Upload formats v1 (Archivist) | PDF, DOCX, plaintext, Markdown | URL fetch deferred to v1.5 |
| Storage (Archivist uploads) | **Local filesystem mock for the entire pilot** (S3 + Drive mirror are post-pilot infra) | Confirmed 2026-05-05 |
| WhatsApp delivery | **Post-pilot only** | Lift Surepath's `whatsapp.js` after pilot succeeds |
| Pilot deployment | **Local only on Paul's Mac** | Lightsail is post-pilot |
| Workflow library v1 | Flat shared list with attribution; no versioning/moderation | Confirmed |
| Bootstrap admin user | Seed creates `admin@anchor.local` / `changeme123`; real users via admin invite later | Register endpoint deferred to Step 5 |
| Verifier philosophy | "Never Accuse" — neutral language, advisory verdicts, all evidence flagged "to be independently confirmed" | Hard constraint per briefing |
| Pilot agent set | **All 13** — Verifier, Archivist, Drafter (built); Sourcer, Media Verifier, Researcher, Translator, Compliance, Producer, Distributor, Funder, Audience, Operations (to build) | Confirmed 2026-05-05 |
| Build order for remaining agents | **Step 5 UI scaffold first**, then add agents 4–13 one at a time, each visibly testable in the UI before moving on | Confirmed 2026-05-05 |

---

## 7. External integrations (live IDs)

### Airtable

Single base: **Develop AI** (`app4FVlF4AAy8Q8s2`). Tables Anchor talks to:

| Table | ID | Use |
|-------|----|----|
| **Newsrooms** | `tblUCJtQvYFcSIdxP` | Source of truth for newsroom metadata. Anchor's local `newsrooms` table is a cache; sync on demand via `airtable_record_id`. |
| **Activity Log** | `tblbjZL7ckos17au5` | Anchor writes high-signal events here (workflow created, agent run, governance flag) tagged with `Stream=Anchor`. Postgres `audit_log` keeps the full forensic trail. |
| **Contacts** | `tblDjons0lRF2ft77` | AI champions linked to Newsrooms. Has 3 link fields (`Newsrooms`, `Newsrooms 2`, `Newsrooms 3`) — verify which is canonical when reading. |

Sync model: read on demand (not nightly cache).

### Google Drive

**Canonical knowledge base:** `08 - Knowledge Library` (`1nuVY8OIpZfctRw-eGJ3uj8FCitZBBlGE`) under `My Drive/Develop AI/`.

11 topic subfolders (created by Paul). Anchor governance RAG should ingest from: `AI in Journalism`, `AI Policy`, `African Media`, `Data Privacy`, `POPIA`, `Newsroom Case Studies`. Skip `Property Data` (Surepath domain), `Schools and AI` (Awareness practice).

**Newsroom uploads (Step 4c Archivist):** **For the pilot, stays local-disk.** S3 + per-newsroom Drive folder mirror are post-pilot infra (currently mocked).

**ZimZam needs assessments** (in `08 - Knowledge Library/01 - Needs Assessments/ZimZam Cohort 2026/`): per Paul's hard constraint, these are **reference material for newsrooms only**, **NOT product inputs**. Do NOT ingest them into Anchor's governance RAG. Do NOT extract per-newsroom signals from them to bake into product config.

### Drive cleanup pending

There's an orphan `08 - GROUNDED Knowledge Base/` folder (id `1jq2VORItU0Kv9UI6ioY44g9IA_jNMA-N`) that Claude created in error before discovering Paul's existing `08 - Knowledge Library/`. Mostly empty; contains 12 ZimZam file copies. Paul to manually move/delete when convenient. Don't touch via API.

---

## 8. Off-limits

- **Surepath is live in production** on AWS Lightsail (`surepath-prod`, `af-south-1`). Local copy at `../surepath/` is **read-only reference**. NEVER modify it. Lift patterns into Anchor; do not refactor Surepath.
- **Secrets stay in `.env` (gitignored).** Do not commit. Real values were lifted from `../surepath/.env` (Paul has explicitly authorized reading that file).
- **`JusticePro`, `SmartGuard`** — parked products. Ignore if encountered.
- **Needs assessments** — reference only, NOT product inputs (see §7 Drive section).
- **Don't reach for paid APIs without asking.** Claude (Anthropic) is the only paid dep allowed. If the obvious solution to a sub-problem is a paid SaaS (Cohere, OpenAI embeddings, AssemblyAI, Replicate, ElevenLabs, …), stop and surface an OSS alternative instead.

---

## 9. Build phases — what's left for pilot

Pilot launch requires: **all 13 agents working + Builder UI + User UI + workflow library + governance layer**, all running locally on Paul's Mac.

### Step 5 — Builder + User mode UIs (NEXT — start here)

Two distinct surfaces:
- **Builder:** workflow composition — pick agents, set prompts, attach knowledge sources, name the workflow ("slug"). Rich UI but functional > polished for MVP.
- **User:** workflow runner — list workflows for the newsroom + the shared library, click to run, see output. Mobile-first PWA per briefing.

**Hard requirement: agent-registry pattern.** Don't hardcode the 3 current agents. Define an agent registry (e.g. `lib/agents/registry.js`) that each agent module registers into, with metadata: name, description, input schema, output schema, route. The Builder UI iterates this registry. Adding agents 4–13 should be a registry-entry plus the agent module — no UI rewrites.

Also add the deferred **`register` endpoint** here — admin-driven invite flow. Self-registration was deferred from Step 3b on purpose.

Both UIs are server-rendered Next.js App Router pages. Use `getCurrentSession()` from `app/lib/session.ts` everywhere.

### Step 5.5 onwards — fill in agents 4–13

Recommended order (rough heuristic: easiest-to-implement and most-leveraged first):
1. **Compliance** (8) — pure RAG over jurisdiction packs, reuses BGE-M3 + pgvector + Claude. Exercises Step 7 governance layer too.
2. **Translator** (7) — local NLLB-200 distilled via Transformers.js or Python sidecar; high newsroom value.
3. **Researcher** (6) — Claude-driven web/PDF research orchestration; leans on existing Drafter scaffolding.
4. **Sourcer** (4) — similar shape to Researcher.
5. **Operations** (13) — DB + Claude; mostly UI plumbing.
6. **Audience** (12) — depends on whether self-hosted analytics is in scope for pilot.
7. **Funder** (11) — Claude-heavy, lightweight.
8. **Producer** (9) — Whisper for STT, Coqui/Piper for TTS. Bigger lift.
9. **Distributor** (10) — social/CMS APIs; needs per-newsroom credentials. May need to defer per-channel.
10. **Media Verifier** (5) — biggest lift (deepfake models, ExifTool, reverse-image). Build last unless Paul re-prioritises.

For each new agent: investigate OSS dependencies on Hugging Face / GitHub before writing; log the pick in REUSE.md; write the agent module + a route + register in the agent registry; smoke-test through the Builder UI.

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

### Step 8 — POST-PILOT: Lightsail deploy + WhatsApp delivery

**Do not start either before pilot is signed off.**

- Lightsail: new instance (sibling to surepath-prod, NOT same instance). Deploy script: lift from `surepath/deploy.sh` shape. Need to confirm BGE-M3 model cache strategy (bake into image vs. download on first run).
- WhatsApp: lift Surepath's `whatsapp.js` (Twilio webhook + signature verification + conversation state machine). Adapt the conversation state to workflow-output delivery.
- Replace local-disk storage with real S3 + Drive mirror.

---

## 10. Open decisions Paul did NOT answer in the 2026-05-05 session

The next agent should ask Paul these before going deep on Step 5:

1. **Local-only deployment shape.** Does "local-only for pilot" mean (a) just Paul's Mac during dev/demo (newsrooms send work to Paul to run), or (b) each of the 5 pilot newsrooms runs Anchor on their own laptop / local machine? This dramatically changes packaging:
   - (a) → just keep `npm run dev`; trivial.
   - (b) → need a packaged installer (Electron? Docker desktop? Tauri? `pkg`?), a local-Postgres bootstrap script, model-cache pre-bundling, a no-internet fallback story, etc.
2. **Distributor agent scope.** Is per-newsroom social-media credential storage in pilot scope, or is "Distributor draft-only, copy/paste to social" enough? Affects Step 5 UI for credentials and a security review.
3. **Producer agent scope.** Whisper STT + Piper/Coqui TTS run locally but are heavy (GBs of model weights, slow on CPU). Is that acceptable for the pilot Mac, or should Producer be deferred to post-pilot?
4. **Media Verifier scope.** Genuine deepfake detection at journalism quality is hard with OSS models alone — accuracy is mid-70%s on academic benchmarks and degrades on newsroom-realistic inputs. Is "advisory flag with caveats" enough, or does Paul want to defer Media Verifier to post-pilot and ship 12 agents at pilot launch? Honest scoping suggests asking.

---

## 11. Reference codebases (read-only)

Local sibling directories under `../`:

| Path | Stack | Live? | Lift inventory |
|------|-------|-------|----------------|
| `../surepath/` | Node CommonJS + Next.js dashboard | **YES — production on Lightsail** | See [`../REUSE.md`](../REUSE.md) tables S1–S9. Patterns: db.js, costs.js, parse-claude-json (vision.js), Next dashboard auth, Twilio webhook, Claude Vision WHY-chain. |
| `../holly/` | Node ESM Express + React client | No | H1–H8: server middleware order, JWT+bcrypt auth, migration runner, googleapis usage, pluggable LLM dispatch, admin route guarding. |
| `../aikit/`, `../aitools/`, `../grounded/` | Python FastAPI scaffold (3 forks of same scaffold) | No | Reference only — different stack. |
| `../alibi/` | Python computer vision | No | **Worth a deeper look for Media Verifier (Step 5+).** Vision/RTSP patterns. |
| `../aipod/` | Python audio pipeline (Celery+Redis) | No | **Worth a deeper look for Producer (Step 5+).** Whisper integration patterns. |
| `../recapture/`, `../market/`, `../substack/` | Python | No | Reference only. |

For each lift, **log it in [`../REUSE.md`](../REUSE.md)** with date, source path, target path, tier (🟢 LIFT / 🟡 ADAPT / 🔴 REFERENCE), and notes. This is non-negotiable — Paul audits this file.

---

## 12. Memory / context outside this repo

The previous Claude Code (CLI) session kept user-level memory at `~/.claude/projects/-Users-paulmcnally-Developai-Dropbox-Paul-McNally-DROPBOX-ONMAC-PYTHON-2025-anchor/memory/`. The new Claude inside VS Code may or may not see those files depending on its memory configuration. Key facts already saved that the next agent should know whether or not memory loads:

- **Anchor's only paid dep is Anthropic.** Everything else must be OSS, fully free, no free-tier limits.
- **The 13-agent roadmap is all MVP** for pilot. Not just the 3 already built.
- **Build agents incrementally behind the UI**, not in a long invisible batch.
- **Park side-tasks.** Paul has been burned by mid-build pivots into housekeeping.
- **Surepath is live — never modify it.** Read-only reference.
- **Shell exports `ANTHROPIC_API_KEY=""`** — always `unset` it before `npm run dev`.

---

## 13. Bootstrap prompt for the next agent (paste into VS Code Claude)

> Read `docs/HANDOFF.md`, `docs/BRIEFING.md`, and `REUSE.md` in full before doing anything. The execution layer has 3 of 13 MVP agents shipped (Verifier, Archivist, Drafter). Pilot scope is now **all 13 agents + Builder/User UIs + workflow library + governance**, running **locally only**. Lightsail and WhatsApp are post-pilot. Next phase is Step 5 (Builder + User mode UIs) built as an **agent-registry-driven scaffold** so agents 4–13 can plug in incrementally. Before writing any code, please ask me the four open questions in §10 of HANDOFF.md and propose a Step 5 implementation plan for my review.
