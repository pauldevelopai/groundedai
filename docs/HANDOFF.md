# Anchor — Build Hand-off

For the AI agent picking up this build. Paul is now driving Anchor from **Claude Code inside VS Code** (this file was last updated by Claude Code in the standalone CLI, which Paul retired for this project on 2026-05-05).

**Read this entire file before touching code.** Then read [`docs/BRIEFING.md`](BRIEFING.md) for full product scope and [`../REUSE.md`](../REUSE.md) for the lift inventory.

Last updated 2026-05-05 by Claude Code (CLI) after pushing the Cohere → BGE-M3 swap and the Step 4c+4d catch-up.

---

## 0. What changed in this last session (2026-05-05)

1. **Pilot agent set is now exactly 10** (was 13 earlier in the same session — Paul published the official Anchor summary which lists 10). Removed: Sourcer, Media Verifier, Compliance. Renamed: Funder → **Fundraiser**. The 10 are listed in §2.
2. **Governance layer dropped.** No Compliance agent, no jurisdiction packs (POPIA / Zimbabwe / Zambia), no audit-export, no `lib/governance.js`. That feature set has been deferred to "a different system" outside Anchor. **The internal `audit_log` table stays** — it's plain debugging/transparency, not user-facing governance. (Flag this assumption if Paul disagrees.)
3. **Pilot deployment is local-only.** WhatsApp delivery and Lightsail deploy are **post-pilot**. WhatsApp is part of the official product story (§2 User mode mentions it), but the build sequencing keeps it after the pilot is signed off.
4. **User mode is a chat surface.** Per the official summary: *"They don't see agents or prompts. They see a chat surface that does the thing they need."* Builder mode (desktop web app) composes workflows; User mode (chat surface, eventually WhatsApp) consumes them. Step 5 builds both.
5. **Verifier needs a source-credibility map for SA + Zimbabwe + Zambia + Kenya.** These are the four primary markets. Pilot newsrooms remain 5 ZimZam, but the credibility map is built for all 4 countries up front so next cohort (SA + KE) inherits it. Track as a Verifier enhancement, not a new agent.
6. **Open-source-first rule locked.** Every non-LLM module (embeddings, vision, OCR, translation, speech, …) **must be fully free at any usage volume** — i.e. OSS we self-host. Free-tier hosted APIs are NOT acceptable. Anthropic Claude is the only allowed paid dependency.
7. **Cohere replaced.** Embeddings now run locally via `@huggingface/transformers` against `Xenova/bge-m3` (BAAI/bge-m3 ONNX). Same 1024-dim output, no schema migration. See [`lib/storage/embed.js`](../lib/storage/embed.js). Smoke-tested. No env var required.
8. **Repo pushed to GitHub.** Remote is `https://github.com/pauldevelopai/anchor.git`. (The handoff's older "REPO HAS NO GIT REMOTE" warning is gone for good.)
9. **Repo lives at a new path** on Paul's Drive mount — `/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/anchor`. Cosmetic only.

---

## 1. What Anchor is (one paragraph)

Shared AI infrastructure for African newsrooms. A multi-tenant web platform with an **agent execution layer** (10 pilot agents — see §2). The pitch: most African newsrooms have done an AI workshop; almost none have working AI infrastructure. Anchor closes that gap by providing prebuilt agents and a low-code Builder for non-technical newsroom leads. Pilot is **5 ZimZam newsrooms** (Capital FM Lusaka, EnviroPress, MakanDay, Maricho Media, VicFallsLive). Primary markets to expand into post-pilot: South Africa, Zimbabwe, Zambia, Kenya. Anchor is the flagship of GROUNDED, a practice under Develop AI.

Two modes:
- **Builder mode** — the AI champion at the newsroom (editor, head of audience) composes AI workflows on a desktop web app, picking from the prebuilt agents and writing the prompts. No coding required.
- **User mode** — the rest of the newsroom team uses what the Builder shipped. They don't see agents or prompts. They see a **chat surface** that does the thing they need. Eventually accessible over WhatsApp (post-pilot).

Cross-newsroom **shared workflow library** is the network effect. Per-newsroom isolation for content; shared workflow definitions. *"What works in Lusaka can run in Harare without anyone needing to rebuild it."*

---

## 2. The 10 pilot agents

This list is the official one from Paul (2026-05-05). Three agents previously planned (Sourcer, Media Verifier, Compliance) are **out** of pilot. "Funder" was renamed **Fundraiser**.

**Built and verified end-to-end (Steps 4b/4c/4d):**

| # | Agent | What it does |
|---|-------|-------------|
| 1 | **Verifier** | Checks claims against sources and the newsroom's archive. Returns confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. **Pending enhancement: Africa-grounded source credibility map covering SA + Zimbabwe + Zambia + Kenya** (curated outlets, official statistics bodies, recognised credible sources, known disinformation channels per country). "Never Accuse" constraint honored. |
| 2 | **Archivist** | Semantic search over the newsroom's own archive. Answers "have we written about this before, and what did we say." Per-newsroom and private. Now uses BGE-M3 embeddings (local). |
| 3 | **Drafter** | Produces drafts in the newsroom's house style: social copy, headlines, newsletter blurbs, light translation. Style check before delivery. Always draft-only — the newsroom signs off. |

**Not yet built — required for pilot launch:**

| # | Agent | What it does | Likely OSS dependencies to evaluate |
|---|-------|-------------|--------------------------------------|
| 4 | **Researcher** | Outward research: public records, court filings, regulatory disclosures, financial documents. | PDF parsing already in repo (`pdf-parse`); OSS named-entity-recognition (spaCy, GLiNER); govt-API helpers. |
| 5 | **Translator** | Full stories between English and African languages with newsroom-approved terminology. Languages relevant to the 4 markets: isiZulu, isiXhosa, Afrikaans (SA); Shona, Ndebele (ZW); Bemba, Nyanja, Tonga (ZM); Swahili, Kikuyu (KE). | Meta NLLB-200 distilled (600M or 1.3B); LASER for sentence alignment. |
| 6 | **Producer** | Multi-format production: radio scripts, podcast outlines, video briefs. | Whisper (faster-whisper); TTS via Coqui or Piper; ffmpeg. |
| 7 | **Distributor** | Posts to social, schedules newsletters, pushes to CMS. Editorially cleared, never autonomous. | Direct API integrations (X, Bluesky, Mastodon, Buttondown). All OSS / free APIs preferred. |
| 8 | **Fundraiser** | Maps stories to grants, drafts donor reports, surfaces required metrics. | Donor-database scraping; LLM matching. Mostly Claude-driven. |
| 9 | **Audience** | Reads engagement and search data; flags landed topics, gaps, and bounced stories. | Plausible / Umami self-hosted analytics; Searxng for trend signals. |
| 10 | **Operations** | Internal newsroom workflows: editorial calendar, deadlines, freelancer coordination. | Mostly DB + LLM; reuse Drafter scaffolding. |

**Sequencing rule (decided 2026-05-05):** Build Step 5 (Builder + User UIs) as a **thin agent-registry-driven scaffold first** so each new agent (4–10) lights up in the UI as it ships. **Do NOT build all 7 agents before touching the UI** — that's a long invisible stretch. Each new agent commit should be visibly testable in the UI before moving on.

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
| WhatsApp delivery | **Planned, post-pilot.** Part of official product story; build after pilot signoff. | Confirmed 2026-05-05 |
| Pilot deployment | **Local only on Paul's Mac** | Lightsail is post-pilot |
| Governance / Compliance layer | **DROPPED from Anchor.** No Compliance agent, no jurisdiction packs, no audit-export. Internal `audit_log` table stays for plain debugging only. | Confirmed 2026-05-05 — moved to "a different system" outside Anchor |
| Workflow library v1 | Flat shared list with attribution; no versioning/moderation | Confirmed |
| User mode UX | **Chat surface.** Journalists type what they need; Anchor routes to the right workflow. No agent/prompt visibility for the user. Builder did the heavy lifting. | Per official summary 2026-05-05 |
| Bootstrap admin user | Seed creates `admin@anchor.local` / `changeme123`; real users via admin invite later | Register endpoint deferred to Step 5 |
| Verifier philosophy | "Never Accuse" — neutral language, advisory verdicts, all evidence flagged "to be independently confirmed" | Hard constraint per briefing |
| Verifier source-credibility map | Curate for **SA + Zimbabwe + Zambia + Kenya** before pilot. Outlets, official agencies, recognised credible vs. known-problem sources per country. | Confirmed 2026-05-05 |
| Pilot agent set | **10 agents** — Verifier, Archivist, Drafter (built); Researcher, Translator, Producer, Distributor, Fundraiser, Audience, Operations (to build) | Confirmed 2026-05-05 (changed from 13 earlier same day) |
| Primary markets | South Africa, Zimbabwe, Zambia, Kenya. Pilot newsrooms remain 5 ZimZam (ZW + ZM); SA + KE in next cohort. | Confirmed 2026-05-05 |
| Build order for remaining agents | **Step 5 UI scaffold first**, then add agents 4–10 one at a time, each visibly testable in the UI before moving on | Confirmed 2026-05-05 |

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

11 topic subfolders (created by Paul). **Anchor no longer ingests anything from this library** — the governance/methodology RAG was dropped on 2026-05-05 along with the Compliance agent. Folder kept here as reference for the broader Develop AI ecosystem only.

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

Pilot launch requires: **all 10 agents working + Builder UI + User chat UI + workflow library**, all running locally on Paul's Mac. Governance and WhatsApp are explicitly out of pilot scope.

### Step 5 — Builder + User mode UIs (NEXT — start here)

Two distinct surfaces:
- **Builder:** desktop web app. Workflow composition — pick agents, set prompts, attach knowledge sources, name the workflow ("slug"). Rich UI but functional > polished for MVP.
- **User:** **chat surface.** Journalists type what they need; Anchor routes the message to the right workflow built by their newsroom's Builder. They never see agents or prompts. Mobile-friendly (PWA later; chat-first now).

**Hard requirement: agent-registry pattern.** Don't hardcode the 3 current agents. Define an agent registry (e.g. `lib/agents/registry.js`) that each agent module registers into, with metadata: name, description, input schema, output schema, route. The Builder UI iterates this registry. Adding agents 4–10 should be a registry-entry plus the agent module — no UI rewrites.

**Routing in User mode** is a Step-5 design decision. Two viable options:
- (a) Each workflow has a "trigger phrase" or keyword the Builder sets; the chat parses for that.
- (b) A small Claude call routes the message to the best-fit workflow. More flexible, more cost.
Recommend (a) for v1 with (b) as a fallback when no keyword matches.

Also add the deferred **`register` endpoint** here — admin-driven invite flow. Self-registration was deferred from Step 3b on purpose.

Both UIs are server-rendered Next.js App Router pages. Use `getCurrentSession()` from `app/lib/session.ts` everywhere.

### Step 5.5 onwards — fill in agents 4–10

Recommended order (rough heuristic: easiest-to-implement and most-leveraged first):
1. **Researcher** — Claude-driven web/PDF research orchestration; leans on existing Drafter scaffolding.
2. **Translator** — local NLLB-200 distilled via Transformers.js or Python sidecar; high newsroom value. Cover SA, ZW, ZM, KE languages from start.
3. **Operations** — DB + Claude; mostly UI plumbing.
4. **Fundraiser** — Claude-heavy, lightweight.
5. **Audience** — depends on whether self-hosted analytics is in scope for pilot.
6. **Distributor** — social/CMS APIs; needs per-newsroom credentials. May need to defer per-channel.
7. **Producer** — Whisper for STT, Coqui/Piper for TTS. Bigger lift; build last.

For each new agent: investigate OSS dependencies on Hugging Face / GitHub before writing; log the pick in REUSE.md; write the agent module + a route + register in the agent registry; smoke-test through the Builder UI.

### Step 5.x — Verifier source-credibility map enhancement

Curate a credibility map covering **South Africa, Zimbabwe, Zambia, Kenya**:
- Outlets (e.g. SA: News24, Daily Maverick, M&G; ZW: NewsDay, ZBC, ZimLive; ZM: News Diggers, Lusaka Times, ZNBC; KE: Nation, Standard, Citizen).
- Official agencies (StatsSA, ZimStats, ZamStats, KNBS; reserve banks; election commissions; courts).
- Recognised credible vs. known-disinformation channels.
Store as a structured JSON / DB table the Verifier loads at run-time. Per-country prior on source weighting.

### Step 6 — Workflow library (per-newsroom + cross-newsroom shared)

- `workflows` table — per-newsroom owned but with `is_shared boolean` flag for cross-newsroom visibility
- Attribution shown on shared workflows (built-by name, newsroom)
- v1 = flat shared list; no versioning, no moderation. `audit_log` gives "who did what when" backstop.

### Step 7 — POST-PILOT: Lightsail deploy + WhatsApp delivery

**Do not start either before pilot is signed off.**

- Lightsail: new instance (sibling to surepath-prod, NOT same instance). Deploy script: lift from `surepath/deploy.sh` shape. Need to confirm BGE-M3 model cache strategy (bake into image vs. download on first run).
- WhatsApp: lift Surepath's `whatsapp.js` (Twilio webhook + signature verification + conversation state machine). Adapt the conversation state to workflow-output delivery — User mode chat surface but over WhatsApp.
- Replace local-disk storage with real S3 + Drive mirror.

### Removed from build plan

- ~~Step 7 Governance layer~~ — dropped 2026-05-05; moved to a different system outside Anchor.
- ~~Compliance agent~~ — dropped with governance.
- ~~Sourcer agent~~ — dropped 2026-05-05 (not in official 10).
- ~~Media Verifier agent~~ — dropped 2026-05-05 (not in official 10).

---

## 10. Open decisions for the next agent to ask Paul

Resolved in the 2026-05-05 session: agent count (10), governance (dropped), WhatsApp (planned post-pilot), User-mode shape (chat surface), Media Verifier (out of pilot, no longer a question).

Still open:

1. **Local-only deployment shape for pilot.** Does "local-only" mean (a) just Paul's Mac during dev/demo (newsrooms send work to Paul to run), or (b) each of the 5 pilot newsrooms runs Anchor on their own laptop / local machine?
   - (a) → just keep `npm run dev`; trivial.
   - (b) → need a packaged installer (Electron? Docker desktop? Tauri? `pkg`?), a local-Postgres bootstrap script, model-cache pre-bundling, a no-internet fallback story, etc.
2. **User-mode chat routing.** Per Step 5 design: trigger-phrase routing (Builder sets a keyword per workflow), or LLM routing (small Claude call picks the workflow), or both? See §9 Step 5 for a recommendation.
3. **Distributor agent scope.** Is per-newsroom social-media credential storage in pilot scope, or is "Distributor draft-only, copy/paste to social" enough? Affects Step 5 UI for credentials and a security review.
4. **Producer agent scope.** Whisper STT + Piper/Coqui TTS run locally but are heavy (GBs of model weights, slow on CPU). Acceptable for the pilot Mac? Or trim Producer's scope to text-only outputs (radio scripts, podcast outlines, video briefs) and skip the audio-generation parts at pilot?
5. **Audience agent dependencies.** Self-hosted analytics (Plausible/Umami) takes infra. Are pilot newsrooms instrumented with anything Anchor can read? If not, Audience may be a Step-9 (post-pilot) agent in practice.

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
- **The pilot agent set is 10** (Verifier, Archivist, Drafter built; Researcher, Translator, Producer, Distributor, Fundraiser, Audience, Operations to build). Sourcer, Media Verifier, Compliance dropped.
- **Governance layer dropped.** Belongs to a different system outside Anchor.
- **User mode is a chat surface.** Builder mode is desktop web app. WhatsApp delivery planned, post-pilot.
- **Primary markets:** SA, Zimbabwe, Zambia, Kenya. Pilot newsrooms remain 5 ZimZam.
- **Build agents incrementally behind the UI**, not in a long invisible batch.
- **Park side-tasks.** Paul has been burned by mid-build pivots into housekeeping.
- **Surepath is live — never modify it.** Read-only reference.
- **Shell exports `ANTHROPIC_API_KEY=""`** — always `unset` it before `npm run dev`.

---

## 13. Bootstrap prompt for the next agent (paste into VS Code Claude)

> Read `docs/HANDOFF.md`, `docs/BRIEFING.md`, and `REUSE.md` in full before doing anything. Anchor is shared AI infrastructure for African newsrooms. Pilot scope is **10 agents + Builder web UI + User chat surface + cross-newsroom workflow library**, all running **locally** on Paul's Mac. Anthropic Claude is the only paid dependency; everything else must be OSS and fully free. WhatsApp delivery and Lightsail deploy are planned but post-pilot. The execution layer has 3 of 10 agents shipped (Verifier, Archivist, Drafter). Next phase is Step 5 (Builder + User mode UIs) built as an **agent-registry-driven scaffold** so agents 4–10 can plug in incrementally. Before writing any code, please ask me the five open questions in §10 of HANDOFF.md and propose a Step 5 implementation plan for my review.
