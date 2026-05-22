# Hub, Tracker & Nodes — integration plan

Bringing the **Tracker** (the legacy "AI Legal" app — the prior brand is retired) and the three **Nodes** into the GROUNDED platform, behind a new top-level **Hub**. Same house rules as every other plan here: **additive, reversible, investigate-before-writing, no greenfield rewrites, and each step ends in a single commit Paul reviews before the next starts.**

The two tracks (Tracker, Nodes) are independent and run **in parallel**. Both sit behind one shared shell (the Hub), which is the small amount of work they have in common.

> **Branding rule (non-negotiable):** the legacy app's brand is **retired**. No legacy wording survives **anywhere** — not in the UI, not in the auth cookie, not in table names, not in the database name, not in these docs. The platform is **GROUNDED**; its pillars are **Builder**, **Nodes**, **Tracker**.

---

## Decisions that shaped this plan (settled 2026-05-22)

1. **Top-level shape** — a new **Hub** landing page with three pillars:
   - **Builder** → the existing GROUNDED app (agents, workflows, run/builder — everything that exists today).
   - **Nodes** → a list of node git repos: run the latest online, or clone to run locally.
   - **Tracker** → the AI Legal "nice front" (preserved, not reimplemented).
2. **Tracker scope** — import **everything** (~60 tables), but **flag every overlap** with existing GROUNDED sections in a stored, machine-readable catalogue for later reconciliation → [`docs/tracker/overlap-map.yaml`](./tracker/overlap-map.yaml) + [`TRACKER_OVERLAP_MAP.md`](./tracker/TRACKER_OVERLAP_MAP.md). Nothing is deduped now.
3. **Node sync model** — **install-from-git / submodule**. The independent repos stay canonical; the monorepo runs the *latest* of each node online via the integrated host facade. Newsrooms still clone the same repos to run locally. One codebase, two runtimes.
4. **Sequencing** — plan both now, build in parallel.

## Locked rules this plan respects

- **Haiku 4.5 only** for `host.ai.chat` (the node host facade routes through `lib/claude.js`; nodes that use other providers, e.g. Podcasting/ElevenLabs, call those directly with their own keys — they don't touch `host.ai.chat`).
- **Per-newsroom isolation** — `newsroom_id` on every per-tenant row; AI-Legal *reference* data is the documented exception (global, `newsroom_id IS NULL`, like `tracker_digests`).
- **OSS-first** except Anthropic.
- **Anchor→Grounded rename stays partial** — cookie `anchor_token`, internal table prefixes, etc. are deliberately untouched. We do not rename GROUNDED internals as part of this work. (Retiring the *Tracker app's* legacy brand is separate and required — see the branding rule above.)

---

## Target architecture (one picture)

```
                         ┌─────────────────────────────┐
                         │   /  (the HUB landing page)  │
                         │   Builder · Nodes · Tracker  │
                         └──────────────┬──────────────┘
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                ▼
  /builder, /run, …              /nodes  (index of gits)           /tracker  (the nice front)
  existing GROUNDED app          /nodes/<slug> runs latest online   AI Legal SPA + backend
  (unchanged)                    /nodes/<slug> "clone & run local"  behind bridged auth + shared DB
        │                                │                                │
        └────────────────────────────── shared ──────────────────────────┘
           anchor_token session  ·  one Postgres (DATABASE_URL, :5433)  ·  api_costs cost logging
```

Three things are shared by all pillars and built once (Track H — the Hub):

- **Auth/session** — GROUNDED's `anchor_token` cookie + `getCurrentSession()` is the single source of identity. The Tracker's own legacy auth cookie is **dropped**; the node hosts derive identity from the session.
- **Database** — one Postgres. AI-Legal tables imported as-is; CRM tables under `tracker_` prefix; node tables under `node_<slug>_` prefix. No collisions, fully additive.
- **AI spend** — everything that calls Claude logs to `api_costs`.

---

# Track H — the Hub (shared shell)

Small, do first; both other tracks hang off it.

### H1 — Hub landing page
- Replace the redirect in [`app/page.tsx`](../app/page.tsx) (currently `→ /builder` or `/run`) with a real Hub: three cards (Builder / Nodes / Tracker), gated by `getCurrentSession()`, role-aware (a `user` may not see Builder authoring, etc.). Signed-out → `/login` as today.
- Add the three entries to [`app/components/GlobalNav.tsx`](../app/components/GlobalNav.tsx) so the pillars are reachable from anywhere, not just `/`.
- **Doesn't touch:** any existing section's internals. `/builder` and `/run` keep working exactly as now; the Hub just sits above them.
- **Reverse:** restore the one-line redirect in `app/page.tsx`.
- **Confirm gate:** Paul sees the Hub, confirms naming + which roles see which pillar.
- **Est:** 3–4 hrs.

### H2 — Auth unification (unblocks Tracker)
- The Tracker's Express routes currently authorize off their own legacy JWT cookie. Replace that with GROUNDED's session: a small server-side adapter injects `req.user` from `getCurrentSession()` (`anchor_token`) so the Tracker authorizes without a second login. **That legacy cookie is retired** — one identity, one sign-in.
- Node hosts read `newsroomId`/`userId`/`role` straight from the session (see Track N).
- **Doesn't touch:** GROUNDED's auth. The Tracker's standalone login can stay in its own repo for offline dev only.
- **Reverse:** remove the adapter.
- **Confirm gate:** single sign-on works — signed into GROUNDED, `/tracker` loads without a second login.
- **Est:** ~1 day.

---

# Track T — Tracker (everything, preserve the front)

Goal: the AI Legal **nice front** is reachable at `/tracker`, backed by the full schema in the shared DB, with the overlap catalogue recording what to dedupe later. **Preserve the front; do not rewrite it. Scrub all legacy branding in the process.**

**Recommended mechanism (Phase T1):** run the Tracker **largely intact** as an internal service the Hub fronts, rather than hand-porting 60 tables of CRM + 30+ React pages into Next.js up front. The Vite SPA is preserved; the Express backend keeps working; we point both at the shared Postgres and unify auth. Native porting happens later, *selectively*, where the overlap catalogue says it pays. This is the additive, reversible, no-rewrite path. (If you'd rather port the public pages natively into Next from day one, that's a fork we take at T1 — flagged below.)

### T0 — Schema lift (additive, partly namespaced)
- Generate `db/migrations/039_tracker_import.sql` from the Tracker repo's SQL dump: AI-Legal core tables (`ai_*`, `ai_legal_*`) re-created **as-is**; CRM/operational tables re-created under the **`tracker_`** prefix; the legacy `migrations` table **excluded**. AI-Legal reference tables left global; CRM tables carry a nullable `newsroom_id` for later.
- Load the data once via a one-shot import script (not a migration) so the 17 MB dump isn't replayed on every `npm run migrate`.
- **Doesn't touch:** any existing GROUNDED table — verified against the current 70-table inventory; the only hard collision is `funders` (→ `tracker_funders`) and `migrations` (excluded).
- **Reverse:** `DROP` the imported tables; revert the migration.
- **Confirm gate:** Paul confirms the schema loads clean alongside GROUNDED's, row counts match the dump, and no legacy brand string appears in table/column names.
- **Est:** ~1 day.

### T1 — Mount the front behind the Hub
- Bring the Tracker app in as an internal service (or built SPA + Express API), reachable at `/tracker`, fronted by the Hub and the H2 auth unification, talking to the shared Postgres.
- Public AI-Legal routes (`/api/public/*`, `/api/v1/*`, RSS, OG detail pages) stay public; admin routes go through the session.
- Decommission the Tracker's separate Postgres database and PM2/nginx once the shared path is proven. Scrub legacy branding from the UI shell (titles, logos, page `<title>`, footer).
- **Doesn't touch:** the existing `/learning` tracker shell (left running until T3 decides its fate).
- **Reverse:** unmount `/tracker`; the Tracker still runs standalone from its repo.
- **Confirm gate:** Paul loads `/tracker`, exercises the force-graph, map, public pages, and an admin screen — confirms the front is intact, SSO works, and no legacy brand is visible.
- **Est:** 2–4 days depending on the service-vs-port fork.

### T2 — Wire AI spend + telemetry to GROUNDED
- Route the Tracker's Claude calls (currently `claude-sonnet-4-6`) through GROUNDED's cost logging → `api_costs`. **Open decision:** the Tracker uses Sonnet; GROUNDED locks Haiku. Either keep the Tracker on its own model (a distinct product surface) or move it to Haiku. → flag for Paul.
- **Confirm gate:** Paul decides the Tracker model policy; cost rows appear in `api_costs`.
- **Est:** ~0.5 day.

### T3 — Reconcile the `/learning` shell vs the real Tracker (deferred)
- GROUNDED's `/learning` 7-tab UX + `tracker_use_cases`/`tracker_relationships`/`tracker_digests` + `lib/agents/legal_tracker.js` are a lighter reimplementation of what the imported Tracker does for real. Decide: retire the shell, repoint it at the imported tables, or keep both. Driven by [`overlap-map.yaml`](./tracker/overlap-map.yaml).
- **This is explicitly later work** — captured in the overlap catalogue, not done now.

---

# Track N — Nodes (integrated online + clone-and-run local)

Goal: the latest of each node runs **online** inside GROUNDED at `/nodes/<slug>`, while the **same** code stays cloneable to run on a laptop. The architecture is already designed (`grounded-node-runtime`); the missing keystone is the **integrated host facade**.

### N1 — Build `lib/nodes/host.js` (the keystone) ⭐
- The Postgres-backed, session-scoped implementation of the **exact** interface `createLiteHost` provides, so node `lib/*.js` runs unchanged. Implements:
  - `host.ctx` `{ newsroomId, userId, role }` from `getCurrentSession()`
  - `host.tablePrefix` = `node_<slug>_`; every query stays inside it
  - `host.db.query(table, sql, params)` — auto-binds `$1 = newsroom_id`, uses GROUNDED's `lib/db.js` pool
  - `host.db.tx(fn)` — real transaction
  - `host.ai.chat(input, opts)` — routes through `lib/claude.js` (**Haiku-locked**), logs to `api_costs`
  - `host.parse.docxToHtml(buffer)` — reuse `mammoth` (already a dep)
  - `host.log.run/edit/error` — write to Observatory + `api_costs`, with the runtime's sanitiser semantics
  - `host.meta` — install/version identity
- Unit-test it against the same contract `host-lite` satisfies.
- **Doesn't touch:** anything else; pure new module.
- **Confirm gate:** a trivial fake node runs against the facade in a test; reads/writes are newsroom-scoped.
- **Est:** ~1.5 days. **This unblocks all three nodes.**

### N2 — Vendor the node repos (install-from-git)
- Add the three repos as **git submodules** under `nodes/<slug>/` (or npm git deps), pinned to a ref:
  - `pauldevelopai/node-makanday-analytics`
  - `pauldevelopai/node-capitalfm-verifier`
  - `pauldevelopai/node-podcasting`
- `git submodule update --remote` pulls the latest; the independent repos stay the source of truth. Document the bump command in `docs/HANDOFF.md`.
- **Reverse:** `git submodule deinit`.
- **Confirm gate:** all three vendored; their `lib/*` imports resolve in the monorepo.
- **Est:** ~0.5 day.

### N3 — Per-node migrations
- One migration per node mirroring its JSON shape, all `node_<slug>_`-prefixed and `newsroom_id`-scoped:
  - `node_makanday_*` (stories, quality)
  - `node_capitalfm_verifier_*` (corpus, runs) — note GROUNDED already has native `verifier_outlets`/`verifier_runs` (migration 024); the *node's* tables are separate (overlap flagged: the node's graduation target is `agent:verifier`).
  - `node_podcasting_*` (voices, podcasts — metadata only; audio stays on disk for now, matching GROUNDED's deferred-S3 stance)
- **Confirm gate:** migrations apply clean; host facade reads/writes them.
- **Est:** ~1 day total.

### N4 — Online routes + UI per node
- For each node: `app/nodes/<slug>/api/*` route handlers that instantiate the host facade and call the node's own `lib/handlers.js` (the documented graduation, sourced from the submodule). Mount the standard route set **plus** any node-custom routes (Podcasting wires `/api/voices`, `/api/podcasts`, `/api/keys` and a 50 MB upload limit — its `index.js` is non-standard; the route layer must honour that).
- Surface each node's `public/` dashboard at `app/nodes/<slug>/page.tsx` (reuse the node's vanilla-JS front; GROUNDED chrome replaces the runtime chrome).
- **Confirm gate:** Paul runs each node online end-to-end (verify a claim, ingest a matrix, train a voice), newsroom-scoped, cost logged.
- **Est:** ~1–1.5 days per node.

### N5 — The Nodes index ("a list of gits")
- `app/nodes/page.tsx` reads [`docs/nodes/registry.yaml`](./nodes/registry.yaml) and lists each node: name, version, status, **Run online** (→ `/nodes/<slug>`), and **Clone & run locally** (the git URL + the 4-line standalone quickstart from the runtime README). Update the registry's `integrated:` list as each goes live.
- **Confirm gate:** the index shows all three with both run-paths working.
- **Est:** ~0.5 day.

**Why install-from-git is the right call:** the same `lib/*.js` is the only application code; it targets the host interface. Online it runs on `lib/nodes/host` (Postgres); locally it runs on `createLiteHost` (JSON). Submodules keep both in lockstep — a fix in the canonical repo flows to the live site on the next bump and to every newsroom on their next `git pull`.

---

## Cross-cutting open decisions (need a Paul call)

1. **Tracker mechanism at T1** — run the Tracker as an internal service (recommended, fastest, preserves everything) **vs** port public pages natively into Next from day one.
2. **Tracker model policy (T2)** — keep Sonnet for the Tracker product, or move it under the Haiku lock?
3. **Tenancy of the CRM data** — global/operator-owned for now, or scoped to an "operator newsroom"? (AI-Legal reference data is already settled: global.)
4. **Podcasting online** — ElevenLabs keys per-newsroom via the node's own setup flow; audio files on local disk for now (S3/Drive deferred). Confirm acceptable for online use.

## Parallelisation & first moves

```
Track H  H1 → H2 ───────────────┐ (H2 gates Tracker)
Track T            T0 → T1 → T2  │  ⟂  Track N  N1 → N2 → N3 → N4 → N5
                                 │            (N1 needs nothing; start immediately)
```

Lowest-risk, highest-unblock first moves to run concurrently:
- **Track N:** N1 (`lib/nodes/host`) — self-contained, unblocks all three nodes.
- **Track H:** H1 (Hub page) — visible, tiny, frames everything.
- **Track T:** T0 (schema lift) — additive, fully reversible, no UI risk.

Each is a single reviewable commit. Nothing chains without Paul's confirm.

## Reversibility summary

| Change | Undo |
|---|---|
| Hub page | restore one-line redirect in `app/page.tsx` |
| Auth unification | remove adapter module |
| Tracker schema | `DROP` the imported tables + revert migration 039 |
| Tracker mount | unmount `/tracker`; it still runs from its repo |
| Node host facade | delete `lib/nodes/host.js` (pure new module) |
| Node submodules | `git submodule deinit` |
| Node migrations | `DROP` the `node_<slug>_*` tables |

Nothing in this plan modifies an already-shipped agent's `inputs`/`outputs`/`config` registry schema, GROUNDED's auth, or any existing migration.
