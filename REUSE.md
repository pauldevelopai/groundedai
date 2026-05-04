# Reuse log

Code, schemas, and patterns lifted from other Develop AI codebases into Anchor.
Each entry: what was lifted, from where, the tier, and date.

Source codebases (read-only references — never modify them):
- `surepath/` — live in production on Lightsail. Source for: Claude wrapper, Postgres pool, Twilio/WhatsApp webhook, S3 helper, admin dashboard, deploy patterns.
- `holly/` — Node + Express server + React client. Source for: roll-our-own auth pattern, googleapis usage, background-jobs queue.
- `aikit/`, `aitools/`, `grounded/` — Python FastAPI scaffolds. Reference only (different stack).
- `recapture/`, `aipod/`, `alibi/`, `market/` — capability references (RAG, audio, vision, finetuning) for later if needed.

## Conventions

- **Module system:** root `"type": "commonjs"` (matches Surepath). Next.js routes under `app/` use ESM `import` syntax — Next's bundler handles it; no Node runtime ESM resolution needed. Workers, scripts, and shared lib code stay CommonJS.
- **Ports:** Surepath = 3000, Holly server = 3001, Anchor = 3002.

## Lifts

| Date | From | What | Tier | Notes |
|------|------|------|------|-------|
| 2026-05-04 | surepath/.env.example, package.json | `.env.example` shape, `"type": "commonjs"`, port allocation | reference | No code copied. Variable naming aligned with Surepath conventions (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, TWILIO_*) so muscle memory transfers. |
| 2026-05-04 | surepath/.gitignore | `.gitignore` structure | reference | Adapted: dropped Surepath-specific paths (reports/, dashboard/, property-images/), kept the spirit. |

## Tier definitions

- **lift** — copied with minimal modification.
- **adapt** — pattern adopted, code rewritten for Anchor's domain.
- **reference** — read for ideas, no code carried across.
- **methodology** — non-code (RAG content, policy text, schema design).

## Pending (Step 1 will populate)

- Surepath Claude wrapper → adapt for Anchor's agent layer.
- Surepath Postgres pool → lift as `lib/db.js`.
- Surepath S3 helper → adapt for newsroom uploads (with Drive mirror).
- Surepath admin dashboard pattern → reference for Anchor's builder mode.
- Holly auth (JWT, bcrypt, Postgres users table) → adapt for Anchor's multi-tenant auth.
- Holly googleapis usage → reference for Drive integration.
