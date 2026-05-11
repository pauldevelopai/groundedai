# Reuse log

Code, schemas, and patterns lifted from other Develop AI codebases into Grounded.
Each entry: what was lifted, from where, the tier, and date.

Source codebases (read-only references — never modify them):
- `surepath/` — live in production on Lightsail. CommonJS Node + Express + Postgres + Anthropic SDK + Twilio + a `dashboard/` Next.js sub-app (TypeScript, App Router). Repo: github.com/pauldevelopai/surepath.
- `holly/` — Node + Express `server/` (ESM) + React `client/`. Postgres + Anthropic + googleapis + bcrypt JWT auth.
- `aikit/`, `aitools/`, `grounded/` — Python FastAPI scaffolds. Reference only (different stack).
- `recapture/`, `aipod/`, `alibi/`, `market/` — capability references (RAG, audio, vision, finetuning) for later if needed.

## Conventions

- **Module system:** root `"type": "commonjs"` (matches Surepath). Next.js routes under `app/` use ESM `import` syntax — Next's bundler handles it; no Node runtime ESM resolution needed. Workers, scripts, and shared lib code stay CommonJS.
- **Ports:** Surepath = 3000, Holly server = 3001, Grounded = 3002.
- **Module-system gotcha:** Holly's `server/` is **ESM** (`import` / `export`), Surepath is **CommonJS** (`require` / `module.exports`). Grounded stays CommonJS at the root. When porting Holly patterns, convert `import x from 'y'` → `const x = require('y')` and named imports accordingly. `__dirname` and `__filename` are available natively in CommonJS — no `fileURLToPath` workarounds needed.

## Tier definitions

- 🟢 **LIFT** — copy with minimal modification (provider-agnostic, well-isolated).
- 🟡 **ADAPT** — pattern adopted, code rewritten for Grounded's multi-tenant agent-oriented domain.
- 🔴 **REFERENCE** — read for ideas, no code carried across.
- **methodology** — non-code (RAG content, policy text, schema design).

## Lifts (executed)

| Date | From | What | Tier | Notes |
|------|------|------|------|-------|
| 2026-05-04 | `surepath/.env.example`, `package.json` | `.env.example` shape, `"type": "commonjs"`, port allocation | 🔴 REFERENCE | No code copied. Variable naming aligned with Surepath conventions (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, TWILIO_*) so muscle memory transfers. |
| 2026-05-04 | `surepath/.gitignore` | `.gitignore` structure | 🔴 REFERENCE | Adapted: dropped Surepath-specific paths (reports/, dashboard/, property-images/), kept the spirit. |
| 2026-05-04 | `surepath/db.js` (S1) | `anchor/lib/db.js` — Postgres pool | 🟢 LIFT | Same shape: single `pg.Pool` from `DATABASE_URL`, `module.exports = { pool }`. Added explicit error on missing env var; added pool error handler. |
| 2026-05-04 | `holly/server/db/migrate.js` (H3) | `anchor/db/migrate.js` + `anchor/db/migrations/001_init.sql` | 🟢 LIFT | Converted Holly's ESM to CommonJS (`require`/`module.exports`). Same pattern: read `.sql` from `migrations/`, track in `migrations` table, BEGIN/COMMIT/ROLLBACK per file. First migration creates `newsrooms`, `users`, `audit_log`. |
| 2026-05-04 | `holly/server/middleware/auth.js` + `routes/auth.js` (H2) | `anchor/lib/auth.js` (helpers) + `anchor/app/lib/session.ts` (Next-side cookie reader) + `anchor/app/api/auth/login,logout,me/route.ts` | 🟢 LIFT | Same shape: bcryptjs hash (10 rounds), jsonwebtoken JWT (7d expiry), httpOnly cookie. Cookie name `anchor_token`. JWT_SECRET enforced ≥32 chars at use. Generic 401 on login fail (no user enumeration). last_login_at touched on success. Register endpoint deferred to Step 5 (admin-driven invites). |
| 2026-05-04 | seed pattern from `holly/server/db/seed.js` | `anchor/db/seed.js` | 🟡 ADAPT | Idempotent seed: creates one bootstrap newsroom (`recLOCAL_DEV`) + one admin user (`admin@anchor.local` / `changeme123`). Production newsrooms come from Airtable sync; production users via admin invite. |
| 2026-05-04 | `surepath/costs.js` (S2) | `anchor/lib/costs.js` + `anchor/db/migrations/002_api_costs.sql` | 🟢 LIFT | Simplified to Claude-only at MVP (extensible to Google/ElevenLabs). Pricing table for Claude 4 family (Opus/Sonnet/Haiku). Per-call insert into `api_costs` with newsroom/user/agent/endpoint metadata. |
| 2026-05-04 | `surepath/vision.js` parseVisionResponse (S3) | `anchor/lib/parse-claude-json.js` | 🟢 LIFT | Same fallback-cascade strategy: as-is → strip markdown fences → extract JSON object/array → progressive normalisations (trailing commas, single→double quotes, unquoted keys). Throws on failure (caller decides recovery). |
| 2026-05-04 | NEW (gap noted in Step 1: no retry in either codebase) | `anchor/lib/claude.js` | new-build | Claude wrapper with retry-with-exponential-backoff for 429/529/connection errors, max 3 attempts, jittered 1s/2s/4s delays. Hooks `lib/costs.js` on every successful call so cost tracking is automatic. Exposes `chat({ system, messages, maxTokens, temperature, context })` returning `{ text, raw, cost }`. |
| 2026-05-04 | Surepath WHY-chain reasoning structure (S4) — adapted for newsroom domain | `anchor/lib/agents/verifier.js` + `anchor/db/migrations/003_workflow_runs.sql` + `anchor/app/api/agents/verifier/route.ts` | 🟡 ADAPT | Verifier agent: fact-checks claims, flags AI-generated content. Output schema = `{ claims[{claim,verdict,confidence,evidence,sources}], ai_likelihood, ai_indicators, overall_assessment }`. System prompt enforces "never accuse" briefing constraint. Archive cross-reference deferred to Pass C (Archivist). New `workflow_runs` table tracks every agent invocation per-newsroom (input/output/status/tokens/cost/duration). |
| 2026-05-04 | `surepath/storage.js` (S8) | `anchor/lib/storage/s3.js` and `anchor/lib/storage/drive.js` | 🟡 ADAPT | Option B applied: Temporary mock of S3 using local filesystem to unblock local dev due to missing AWS keys in `.env`. Drive mirror is mocked as a no-op. Will swap for real `@aws-sdk/client-s3` later. |
| 2026-05-05 | OSS — `Xenova/bge-m3` (ONNX of `BAAI/bge-m3`) via `@huggingface/transformers` | `anchor/lib/storage/embed.js` | 🟢 LIFT | **Replaces Cohere `embed-multilingual-v3` to satisfy "fully free, no paid APIs except Anthropic" rule.** 1024-dim — same as before, so no DB migration. Runs in-process (no separate worker / sidecar). First call downloads ~1.3 GB to `~/.cache/huggingface`; warm load 1–3 s; per-query latency ~100–300 ms on CPU. Smoke-tested 2026-05-05 returning correct 1024-dim vectors for batch + single inputs. Cohere kept zero data so no re-embedding needed (mock vectors only). |

## Planned lifts (from Step 1 walkthrough, 2026-05-04)

Concrete plan informed by a read-only walkthrough of Surepath + Holly. Each entry will be executed at the build step listed in "When".

### Surepath

| # | Pattern | Source path | Grounded target | Tier | When |
|---|---------|-------------|---------------|------|------|
| S1 | **Postgres pool** — `pg.Pool` from `DATABASE_URL`, callers use `pool.query(sql, params)` directly | `surepath/db.js` | `anchor/lib/db.js` | 🟢 LIFT | Step 3 |
| S2 | **Cost / usage logger** — logs Claude tokens (per model), Google services, ElevenLabs into `api_costs` table; live USD→ZAR cache | `surepath/costs.js` | `anchor/lib/costs.js` + `migrations/00X_api_costs.sql` | 🟢 LIFT | Step 4 (with first agent) |
| S3 | **Robust JSON parser** — handles markdown fences, prose around JSON, trailing commas, unquoted keys, single-quoted strings, newlines in strings; falls back to empty valid response to prevent pipeline crash | `surepath/vision.js` lines 434–476 (`parseVisionResponse`) | `anchor/lib/parse-claude-json.js` | 🟢 LIFT | Step 4 (Verifier) |
| S4 | **Claude Vision + WHY-chain reasoning** — system prompt builds context (data + RAG + patterns + feedback); response = structured findings with `visual_evidence`, `corroboration`, `severity`, `tier_reason` | `surepath/vision.js` (`analyseBatch`) | Verifier agent's reasoning structure | 🟡 ADAPT | Step 4 (Verifier) — domain-specific (property inspection); adapt schema to newsroom claim-verification |
| S5 | **Next.js dashboard auth** — JWT in httpOnly cookie (12h), `signToken`/`verifyToken`, `withAuth(handler)` HOF, rate limiter (5 attempts / 15 min lockout), constant-time credential check | `surepath/dashboard/lib/auth.ts` + `surepath/server.js` lines 3–14 | `anchor/app/lib/auth.ts` (Grounded dashboard is Next.js so TS is fine inside `app/`) | 🟢 LIFT | Step 3 (auth) — flag: Surepath uses TypeScript here; align with Grounded's choice |
| S6 | **Next.js dashboard architecture** — App Router, server-side rendered, calls parent CommonJS service via internal API routes, shares the same `pg.Pool` | `surepath/dashboard/` | `anchor/app/` (top-level since Grounded is Next.js root, not a sub-app) | 🟡 ADAPT | Step 5 (UIs) — Grounded's structure is different from sub-app; pattern still informs |
| S7 | **Twilio WhatsApp webhook + signature verification + conversation state machine** | `surepath/whatsapp.js` (lines 1–400) | `anchor/server/webhooks/whatsapp.js` | 🟡 ADAPT | Step 8 (deferred to post-MVP) — capture shape now; adapt conversation-state to workflow-output delivery |
| S8 | **Local filesystem storage helper** | `surepath/storage.js` (`saveBuffer`, `saveFile`) | Not lifted — Grounded uses S3 from Step 4 | 🔴 REFERENCE | — |
| S9 | **Claude retry logic** — **NOT FOUND in Surepath.** Grounded's Claude wrapper should add retry-with-backoff (rate-limit + transient errors) since Surepath's wrapper just bubbles errors. | — | New: `anchor/lib/claude.js` | new-build | Step 4 |

### Holly

| # | Pattern | Source path | Grounded target | Tier | When |
|---|---------|-------------|---------------|------|------|
| H1 | **Express server entry + middleware order** — CORS → JSON parser → cookie parser → public routes → rate-limited `/api/v1` → admin-gated `/api/admin/...` | `holly/server/index.js` | `anchor/server/index.js` (or Next.js route handlers, depending on Step 5 architecture choice) | 🟢 LIFT | Step 3 |
| H2 | **JWT + bcrypt auth** — login, register, logout; httpOnly cookie (7d expiry); `requireAuth` middleware reads `req.cookies.<token>`; `requireRole('admin')` middleware | `holly/server/routes/auth.js` + `holly/server/middleware/auth.js` | `anchor/server/routes/auth.js` + `anchor/server/middleware/auth.js` | 🟢 LIFT | Step 3 |
| H3 | **Migration runner** — home-grown, reads `.sql` files from `migrations/` dir, tracks completed in a `migrations` table, BEGIN/COMMIT/ROLLBACK on each. No Knex/TypeORM. | `holly/server/db/migrate.js` | `anchor/server/db/migrate.js` + `anchor/server/db/migrations/` | 🟢 LIFT | Step 3 (first migration creates `newsrooms`, `users`, `audit_log`) |
| H4 | **Google OAuth2 + Gmail API** — `generateAuthUrl()` → callback handler stores access + refresh tokens in DB; `getAuthedClient()` auto-refreshes expired tokens | `holly/server/services/gmail.js` | Informs `anchor/server/services/drive.js` (Drive uses **service account**, not OAuth — but the token-refresh + auto-retry shape transfers) | 🟡 ADAPT | Step 4 (Drive mirror) and Step 7 (governance corpus ingest) |
| H5 | **Pluggable LLM dispatch** — Anthropic / Groq / Ollama backends behind one `callClaudeClassifier()` function; Groq throttle (45ms global) for free-tier rate limit | `holly/server/services/claude.js` lines 1–120 | Grounded stays Anthropic-only for MVP; preserve the dispatch shape so adding fallback providers is easy later | 🟡 ADAPT | Step 4 |
| H6 | **Multi-tenant via array of sector_ids** — `team_members(role, sector_ids UUID[], holly_access bool, is_active bool)`; downstream filtering by sector | `holly/server/db/migrations/004_create_team_members.sql` + `routes/auth.js` | Grounded uses **explicit `newsroom_id` foreign keys** instead of arrays (cleaner queries, better isolation guarantee). Holly's pattern is reference-only. | 🔴 REFERENCE | Step 3 |
| H7 | **Admin route guarding** — `const admin = express.Router(); admin.use(requireAuth); admin.use(requireRole('admin')); app.use('/api/admin', admin)` | `holly/server/index.js` line 149+ | `anchor/server/index.js` (or Next.js route guards) | 🟢 LIFT | Step 3 |
| H8 | **API rate limiting on public endpoints** | `holly/server/middleware/api-rate-limit.js` (referenced from `index.js` line 106) | `anchor/server/middleware/rate-limit.js` | 🟢 LIFT | Step 3 |

## Notes from Step 1 walkthrough

1. **No S3 helper in either codebase.** Surepath stores files locally and serves via Next.js static. Holly doesn't have an upload handler. Grounded has to build the S3 uploader from scratch in Step 4. Use `@aws-sdk/client-s3` (already in Surepath's deps so the API is familiar). Mirror to Drive per the Grounded briefing.

2. **No Claude retry/backoff anywhere.** Both codebases let Anthropic SDK errors bubble. Grounded's Claude wrapper (`lib/claude.js`) should add retry-with-exponential-backoff for `429`, `529`, and connection errors. Hook the cost logger (S2) into success path.

3. **Multi-tenancy.** Surepath has none. Holly uses `sector_ids UUID[]` arrays (clever but loses query-planner clarity and FK constraints). Grounded uses explicit `newsroom_id UUID NOT NULL REFERENCES newsrooms(id)` on every per-newsroom row. Locked in for Step 3.

4. **TypeScript inside `app/`.** Surepath's dashboard is TypeScript. Grounded's Next.js `app/` can be JS or TS — TS is the Next.js default and has good DX with the App Router. Decision deferred to Step 2 architectural locking.

5. **Holly is ESM, Surepath is CommonJS.** Listed in Conventions above. Watch when porting Holly's `import` statements.

6. **Twilio webhook deferred but capture early.** WhatsApp delivery is post-MVP per the briefing, but Surepath's webhook + signature verification + conversation state machine are non-trivial. Lift at Step 8 in one piece, don't piecemeal.

7. **Cost logger first.** Drop S2 in at Step 4 alongside the first agent (Verifier). Every Claude call routes through it. Audit log (Step 3) and `api_costs` (Step 4) are different tables — audit log is workflow-level, `api_costs` is per-API-call-level. Both feed compliance reporting.
