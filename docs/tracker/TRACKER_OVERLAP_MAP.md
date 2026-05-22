# Tracker ⇄ GROUNDED overlap map

Human-readable companion to [`overlap-map.yaml`](./overlap-map.yaml). The decision (2026-05-22) was to **import all ~60 tables** from the Tracker app (the legacy "AI Legal" app — the prior brand is **retired**), but **defer reconciliation**. This file is the backlog: where the two schemas overlap, and what a later pass should do about it. Nothing here is reconciled yet — every row is `status: deferred`.

## Import rules (so the lift is additive + reversible)

1. **AI-Legal core tables import as-is** (`ai_*`, `ai_legal_*`) — verified zero name collision with GROUNDED's 70 tables.
2. **CRM / operational tables import under a `tracker_` prefix** (`funders → tracker_funders`, `contacts → tracker_contacts`, …). This resolves the only hard collision and namespaces them under the Tracker pillar without clashing with the existing `tracker_use_cases` / `tracker_relationships` / `tracker_digests` shell.
3. **Never import the Tracker app's `migrations` table** — GROUNDED's `db/migrate.js` owns `public.migrations`.
4. **AI-Legal reference data is global** (`newsroom_id IS NULL`), matching GROUNDED's cohort-wide `tracker_digests` precedent. Lawsuits and regulations are the same worldwide; they are not per-newsroom.
5. **CRM/operator tables** get a `newsroom_id` only when reconciled, defaulting to the operator newsroom.

## The only hard name collision

| Incoming table | Collides with GROUNDED | Imported as |
|---|---|---|
| `funders` | `funders` (fundraiser section) | `tracker_funders` |
| `migrations` | `migrations` | **not imported** |

(Generic CRM names like `contacts`, `notifications`, `courses`, `team_members`, `background_jobs`, `feedback` don't collide with GROUNDED today, but the `tracker_` prefix future-proofs them.)

## Highest-value dedupe candidates (address first, later)

| Incoming | GROUNDED owner | Why |
|---|---|---|
| `ai_lawsuits` / `ai_regulations` / `ai_legal_usecases` | `tracker_use_cases`, `tracker_relationships`, `learning_updates` | GROUNDED's `/learning` 7-tab tracker + `lib/agents/legal_tracker.js` are a *shell* reimplementation of exactly this. The imported tables are the real backing store. |
| `team_members` / `gmail_tokens` | `users` | Auth unifies on `anchor_token`. Handled partly up-front by the auth bridge. |
| `funders` + funding pipeline | `funders`, `fundraiser_briefs` | Name collision **and** product overlap with the fundraiser section. |
| `knowledge_entries` / `knowledge_tags` | `archive_*` | Both do pgvector embeddings; archive is strategic owner. |
| `agent_conversations` / `ai_*` | `workflow_executions`, `agentic_invocations`, `api_costs` | All AI spend should land in `api_costs`. |
| `cohorts` / `courses` / learning | mentorship + learning sections | Cohort/curriculum concept overlaps GROUNDED's own. |

## Keep-separate (no real GROUNDED equivalent)

`ai_lawsuit_events`, `ai_regulation_events`, `ai_legal_*` (sources/runs/mentions/insights/notifications/api_keys), `tracker_sectors`, `tracker_needs_assessments`, `tracker_service_engagements`, `tracker_feedback`.

---

See [`overlap-map.yaml`](./overlap-map.yaml) for the full per-table catalogue with `imported_as`, `overlap`, `collision`, and `action` fields a script can read.
