# V2 plan — the six lifts that make Grounded a platform

A calm, step-at-a-time execution plan for the V2 work surfaced by the concept-note audit. Everything below is **additive, reversible, designed to scale across the cohort, and gated by Paul-confirms-before-next-step** — same shape as the consolidation plan.

V1 is shipped (12 agents, archive knowledge-graph, profile overrides, style fingerprint, pg-boss workers, pilot seed, AI-crawler policy advisory). V2 turns Grounded from "an AI suite each newsroom logs into" into "a federated platform where each newsroom owns its own appliance and the cloud is only invoked under explicit, audited rules."

The build window is **Jul–Dec 2026** (six months, one slice per month with overflow). Grantee charging begins Jan 2027; July 2027+ shifts toward enterprise.

---

## The six

1. **GROUNDED Observatory** — per-workflow execution + per-edit feedback logging. The foundation everything else measures against.
2. **Mentorship dashboard** — the AI champion sees how their team uses the platform; spots stuck flows and good practice to share.
3. **Tracker 7-tab UX** — the AI Legal, Ethics & Regulation Tracker expanded from the V1 shell (one search surface) to the full concept-note shape (Home / Lawsuits / Regulations / Connections map / Use cases / Sources / Submit + weekly digest).
4. **Agentic agents** — selected agents (Verifier, Researcher, Operations) gain tool-using bounded autonomy: they can call other agents and the archive without a Builder pre-wiring the graph.
5. **Sensitivity routing classifier** — every workflow input gets a sensitivity label (`public` / `internal` / `sensitive`) before routing. Cloud LLM gated by label. At this step, sensitive jobs simply refuse with a clear message; Step 6 wires them to local execution.
6. **Newsroom appliance + federated execution** — each newsroom runs a small local appliance (Mac mini / NUC / VM) with Ollama + the platform's worker. Sensitive jobs execute there; cloud jobs continue to use Anthropic. The platform becomes federated, with the central app coordinating but never seeing sensitive payloads.

---

## Cross-cutting principles

Grounded V1 already enforces three constraints that V2 must preserve verbatim:

- **Anthropic Claude is the only paid dependency.** Every non-LLM module is open-source and $0 self-hostable. V2's local LLM path uses Ollama (already in V1 as the Anthropic fallback). V2 adds no new paid SaaS dependencies.
- **Haiku 4.5 only.** No model-tier knob. Sensitivity routing decides cloud-vs-local; it does NOT switch Anthropic models.
- **Per-newsroom isolation by construction.** Multi-tenant tables already carry `newsroom_id`. V2's federated execution makes isolation physical (data never leaves the newsroom's appliance for sensitive jobs), but the central app's existing per-newsroom scoping is preserved unchanged.

Two new V2 principles:

- **Every action logs to the Observatory.** Edits, agent invocations, workflow runs, errors, costs, and routing decisions. The Observatory is the data layer the mentorship dashboard, the cohort library, and the audit trail all read from. Logging lands in Step 1 specifically so Steps 2–6 inherit it.
- **Federation never costs the newsroom usability.** The appliance is optional in V2. Newsrooms without one continue to work as today (everything cloud-routed, with sensitivity-flagged inputs refused or downgraded by Step 5). The appliance unlocks `sensitive` work but never gates anything `public` or `internal`.

---

## Order, and why

Foundation first (Observatory — every later step writes to it). UI on top of that data (Mentorship, Tracker tabs). Then behaviour change (Agentic). Then architecture (Sensitivity classifier, then appliance).

| # | Step | Risk | Reversible? | Touches existing agents? |
|---|---|---|---|---|
| 1 | GROUNDED Observatory — per-workflow runs + per-edit feedback logs | low | yes — drop two new tables; the existing `agent_invocations` table is untouched | no (additive table writes from runners + UI) |
| 2 | Mentorship dashboard | low | yes — UI-only route; drop the page and a single API endpoint | no |
| 3 | Tracker 7-tab UX | low-medium | yes — new tabs + new tables on `learning_updates`; existing search keeps working | no (Legal Tracker agent unchanged; UI expanded) |
| 4 | Agentic agents — tool-using bounded autonomy for 3 agents | medium | yes — gated by config; off-by-default | Verifier / Researcher / Operations gain optional `agentic_mode` config; default off |
| 5 | Sensitivity classifier + routing decision | medium | yes — env-var gate; classifier off → routing identical to V1 | every agent's run() receives a `sensitivity` field; agents that don't care ignore it |
| 6 | Newsroom appliance + federated execution | high | yes (per-newsroom) — toggle appliance off → fall back to cloud routing; appliance is opt-in cohort-wide | no API contract change; routing layer fans out to appliance or cloud |

Each step is one commit Paul reviews before the next starts. No step modifies a shipped agent's `inputs` / `outputs` / `config` registry schema in a backward-incompatible way (Step 4 adds an optional config field; Step 5 adds a context field to `run()` callers that already pass an opaque `ctx`).

---

## Step 1 — GROUNDED Observatory

**Goal:** give Paul + each AI champion a granular view of what's actually happening on the platform: which workflows run, which agents fire inside them, what they cost, where they fail, and — most importantly — what humans edit after the model finishes. Per-edit feedback is the raw material for the cohort-library "what works" signal and for any future fine-tune.

**Why first:** every later step writes to the Observatory. Mentorship reads it. The Tracker's Use Cases tab reads it (anonymised). The agentic-mode trace reads it. Sensitivity routing decisions read from + write to it. Land it once cleanly so the rest of V2 inherits the discipline.

**Adds:**

- `db/migrations/031_observatory.sql`:
  - `workflow_runs` — `id`, `newsroom_id` FK, `workflow_id` FK (nullable for ad-hoc agent invocations), `started_by_user_id`, `triggered_via` (`user_run` | `chat` | `builder_test` | `cron`), `input_summary` (≤500 chars), `status` (`running` / `completed` / `failed` / `cancelled`), `started_at`, `finished_at`, `total_cost_usd`, `total_duration_ms`, `error`, `node_count`. Each `agent_invocations` row gains an optional `workflow_run_id` FK so we can roll up.
  - `output_edits` — `id`, `newsroom_id` FK, `agent_invocation_id` FK, `workflow_run_id` FK (nullable), `user_id`, `edit_kind` (`accepted` / `edited` / `rejected` / `forked`), `original_text`, `edited_text` (NULL when accepted), `diff_chars` (Levenshtein-ish), `notes` (optional one-line user note), `created_at`. Captures the human-in-the-loop signal.

- `lib/observatory/log.js` — thin wrappers: `startWorkflowRun(ctx, input)`, `finishWorkflowRun(runId, status, totals)`, `recordEdit(invocationId, edit)`. ~80 LOC. Called from existing runners (workflow runner, agent-API routes) and from a new edit-capture endpoint.

- `app/api/observatory/edits/route.ts` — `POST { agent_invocation_id, edit_kind, edited_text?, notes? }`. The frontend calls this whenever a user accepts / edits / rejects an agent output.

- `app/observatory/` workspace — read-only views for the AI champion: Recent runs (table), Workflow rollups (cost / success / edit-rate per workflow), Failing nodes (which agent in which workflow most often errors), Edit hotspots (which outputs get most-edited — i.e. where the model performs worst).

- A tiny consumer wedge in existing UIs: the agent output panels (Drafter, Translator, Producer) gain three pill buttons — **Accept** / **Edit** / **Reject** — that POST to `/api/observatory/edits`. "Edit" wraps the editor's existing in-place edit and submits the diff on save.

**Doesn't touch:**

- `agent_invocations` schema beyond the new nullable FK (additive).
- Any agent's `run()` shape. The runner records the invocation as today; `workflow_run_id` is set by the workflow runner when present, NULL when not.
- The chat router or the Builder. They both gain an optional `workflow_run_id` opaque context field; if absent, nothing changes.

**Reverse:**

- `DROP TABLE output_edits;`
- `ALTER TABLE agent_invocations DROP COLUMN workflow_run_id;`
- `DROP TABLE workflow_runs;`
- Revert the new files.

**Validation:**

- Run an existing workflow end-to-end. Confirm one `workflow_runs` row, N matching `agent_invocations` rows, all costs roll up.
- Click Accept on a Drafter output → one `output_edits` row with `edit_kind=accepted`, NULL `edited_text`. Click Edit + change a sentence → row with `edit_kind=edited`, populated `edited_text` and non-zero `diff_chars`.
- Concurrency: two newsrooms running workflows simultaneously → each sees only its own rows in `/observatory`.
- Cost rollup: known `cost_usd` per invocation sums to `workflow_runs.total_cost_usd`.

**Confirm-before-next gate:** Paul runs 5–10 real edits across 2–3 agents, eyeballs the Observatory dashboard, decides:
1. Are the edit pills in the right place / right wording?
2. Is the Edit Hotspots heuristic right (raw diff_chars sum vs. % edited vs. weighted)?
3. Do we need a "this was a Claude vs Ollama-fallback run" filter at this step or can it wait until Step 6?

**Est. effort:** ~2 days. Tables + log wrappers + dashboard + edit pills + the rollup queries.

---

## Step 2 — Mentorship dashboard

**Goal:** give each AI champion a view of how their team uses the platform — not surveillance, but mentorship: which journalists are stuck (lots of rejects, lots of partial workflows), which patterns earn their keep (workflows with high accept-rate that the team converges on), which agent outputs the team consistently edits the same way (signals a prompt or default that's wrong for this newsroom).

**Why second:** purely a UI consumer of Step 1's Observatory data. No new logging, no new model behaviour. Lands fast because Step 1 did the hard work.

**Adds:**

- `app/mentorship/` workspace, admin + builder role only. Three regions:
  - **Team activity** — per-user table: workflows-run-this-week, accept-rate, top workflows, last-active. Click a user to drill in.
  - **Workflow performance** — per-workflow table: total runs, success rate, mean edit_chars, top 3 most-edited outputs (deep-link to the run). The signal for "this workflow needs work" or "this is our most-loved workflow."
  - **Cohort signals** (opt-in) — anonymised aggregate across the cohort: median accept-rate per workflow, "newsrooms that share this workflow's shape see X% accept-rate." Drives the cohort library. Off by default per newsroom; flip on from /team.

- `app/api/mentorship/team/route.ts` and `app/api/mentorship/workflows/route.ts` — admin-scoped roll-up queries against `workflow_runs` + `output_edits`.

- `app/api/mentorship/cohort/route.ts` — admin-scoped roll-up but JOINs across newsrooms that have opted in. Returns aggregated counts only, never row-level data; per-newsroom k≥3 anonymity threshold before any number is exposed.

**Doesn't touch:**

- Step 1 schema. Pure reads.
- Any agent.
- The role model. Admin + builder already exist.

**Reverse:** delete the route and three endpoints. No DB changes.

**Validation:**

- Seed 3 fake users with 2 weeks of synthetic edits. The dashboard's per-user / per-workflow numbers match the synthetic ledger.
- Cohort tab with k=1 newsroom: confirm "not enough data" placeholder, no numbers shown.
- Cohort tab with k=3 newsrooms opted-in: confirm aggregate numbers appear; no row-level leakage between newsrooms.
- Two newsrooms both have a "verify-and-tweet" workflow — confirm the cohort tab merges them into one row only when both opted-in.

**Confirm-before-next gate:** Paul shows the dashboard to one pilot AI champion. Decides:
1. Does the per-user view land as mentorship or surveillance? If the latter, drop the per-user table and keep workflows-only.
2. Is cohort opt-in the right default (it should be — sharing across competitor newsrooms is sensitive).
3. Are the three regions enough, or do we need a fourth (e.g. "team training tips Paul curates" RSS-style)?

**Est. effort:** ~3 days. Mostly query work + UI tables + the k-anonymity threshold.

---

## Step 3 — Tracker 7-tab UX

**Goal:** the V1 Legal Tracker is a search shell against `learning_updates`. The concept note calls for a richer 7-tab workspace where each tab is a different lens on AI law/ethics/regulation: lawsuits, regulations, connections (entity graph), use cases, sources, submission form, plus a weekly digest. The data layer already exists; this step is structured UI + a few small tables for the new tabs.

**Why third:** UI consumer of an existing table (`learning_updates`) plus three small new tables. No agent-behaviour change. Most of the work is React; the DB layer is shallow.

**Adds:**

- `db/migrations/032_tracker_v2.sql`:
  - `tracker_use_cases` — `id`, `newsroom_id` FK (nullable for cohort-shared), `submitted_by_user_id`, `title`, `summary`, `outcome` (`positive` / `negative` / `mixed`), `agents_involved` (`text[]`), `tags` (`text[]`), `attachment_urls` (`text[]`), `shared_with_cohort BOOLEAN`, `created_at`. Newsrooms submit "what happened when we used Grounded for X" to feed the Use Cases tab.
  - `tracker_relationships` — `id`, `from_entry_id` FK, `to_entry_id` FK, `kind` (`cited_in` / `superseded_by` / `applies_to` / `derived_from`), `notes`. Powers the Connections-map tab.
  - `tracker_digests` — `id`, `cohort_id` (nullable; pilot is single cohort for now), `period_start`, `period_end`, `summary_md`, `top_entry_ids` (`uuid[]`), `generated_at`. Filled by a weekly cron job.

- `app/learning/` workspace expanded from one search box to seven tabs:
  - **Home** — feed: most-recent + most-relevant entries for this newsroom (uses existing search with the newsroom's `topic_tags` as implicit query).
  - **Lawsuits** — `learning_updates` filtered by `kind IN ('data_law', 'press_freedom')` and a new derived `is_lawsuit` flag computed from title/body keywords (cheap regex; no LLM).
  - **Regulations** — filtered by `kind IN ('data_law', 'governance')` and not flagged as lawsuit. Grouped by jurisdiction.
  - **Connections map** — force-directed graph of `tracker_relationships` + entities co-mentioned across entries. Read-only; uses an open-source `react-force-graph` (the only new dep; AGPL-clean).
  - **Use cases** — paged list of `tracker_use_cases`. Submit form opens a modal; cohort-shared use cases appear for everyone.
  - **Sources** — directory of the publishers feeding the Tracker (rolled up from `learning_updates.source_publisher`). Each source shows volume, last update, country scope.
  - **Submit** — submit form: "Saw a legal/regulatory development we should track?" Inserts a `pending` row in `learning_updates` that Paul reviews via `/team` queue before going live.

- `lib/jobs/handlers/tracker-digest.js` — pg-boss handler, runs weekly. Pulls the past-7-days entries weighted by severity + recency, drafts a digest via one Haiku call (~$0.002), writes a `tracker_digests` row. Surfaces at the top of the Home tab.

- `scripts/jobs/worker.js` registers the new handler; `lib/jobs/boss.js` schedules it weekly.

**Doesn't touch:**

- `learning_updates` schema. The three new tables reference it via FK only.
- The Legal Tracker agent (`lib/agents/legal_tracker.js`). The agent's `search()` keeps working; the new tabs use it (Home tab) and also query the new tables directly (Lawsuits / Use cases / Sources / etc.).
- Any other agent.

**Reverse:**

- `DROP TABLE tracker_digests; DROP TABLE tracker_relationships; DROP TABLE tracker_use_cases;`
- Revert the new files; the existing `/learning` route falls back to the V1 shell.

**Validation:**

- Each tab renders against seeded data (10 fake entries + 3 fake use cases + 5 fake relationships).
- Submit flow: user submits → entry appears in `pending` state → Paul approves in `/team` queue → entry becomes visible in Lawsuits / Regulations.
- Connections map performance: 200 entries + 500 relationships renders in <1s.
- Digest job: run manually, confirm one Haiku call (~$0.002), `tracker_digests` row appears, Home tab surfaces the summary block.
- Multi-tenant: a newsroom-private use case (`shared_with_cohort=false`) is invisible to other newsrooms.

**Confirm-before-next gate:** Paul + one AI champion walk through the 7 tabs together. Decides:
1. Is the Lawsuit / Regulation split right, or do we keep it one tab?
2. Does the Connections map actually help, or is it cosmetic? If cosmetic, drop it.
3. Should Use Cases be cohort-shared-by-default or newsroom-private-by-default?
4. Frequency of the digest — weekly OK, or daily / fortnightly?

**Est. effort:** ~5 days. The Connections-map tab is the most variable — could be a day or three depending on graph fidelity.

---

## Step 4 — Agentic agents (bounded autonomy)

**Goal:** the V1 agents are mostly one-shot: prompt in → text out. The concept note's vision is agents that can use tools — call the archive, invoke another agent, query a database — without the Builder having to pre-wire the graph. V2 adds bounded autonomy: a `agentic_mode: on` config on selected agents (Verifier, Researcher, Operations) that gives them a tool palette and a small loop.

**Why fourth:** behaviour change. Lands after the Observatory (Step 1) so every tool call is logged; after Mentorship (Step 2) so champions can see how their team uses agentic mode; after Tracker tabs (Step 3) so the Use Cases tab has somewhere to surface agentic vs. non-agentic outcome differences.

**Adds:**

- `lib/agents/agentic/loop.js` — generic bounded loop: given `{ system, tools, input, maxSteps }`, makes a Haiku tool-use call, executes any tool the model requests, feeds the result back, iterates up to `maxSteps` (default 5; hard ceiling 10). Records every tool call as an `agent_invocations` row with `kind='agentic_tool'` so the trace is queryable.

- `lib/agents/agentic/tools/*.js` — the tool palette. Each tool is a thin wrapper around an existing platform capability:
  - `archive_search(query, k)` — wraps `lib/archive/answer.js`.
  - `entity_lookup(name)` — wraps the entity-resolution API.
  - `invoke_agent(slug, input)` — runs another registered agent (recursive guard prevents A→A loops; max recursion depth 2).
  - `web_fetch(url)` — wraps `lib/research/scrape.js`. Honours the newsroom's AI-crawler policy and the platform's robots.txt respect rules.
  - `db_read(table, where)` — read-only SQL against a whitelisted set of tables; never `users`, `sessions`, secrets.

- Three agents gain `agentic_mode: { type: 'boolean', default: false }` config:
  - **Verifier** — in agentic mode, when a claim hits a low confidence threshold, the agent autonomously calls `archive_search` + `web_fetch(trusted_source)` before deciding.
  - **Researcher** — in agentic mode, given a topic, the agent autonomously calls `web_fetch` on N candidate URLs, then `archive_search` to cross-reference, then summarises.
  - **Operations Manager** — in agentic mode, can call `db_read` on the editorial calendar + freelancer tables to answer "who's free Tuesday to cover the ConCourt judgment?" without the Builder pre-wiring.

- Workflow runner: tool calls inside an agentic step roll up under the parent `agent_invocations` row via `parent_invocation_id`. Cost + duration aggregate to the parent.

- A simple trace viewer in `/observatory/runs/[id]`: shows the agentic agent's tool-call tree with timing, cost per tool call, and the model's reasoning lines (if it emits any).

**Doesn't touch:**

- Non-agentic mode of any agent. Default is off; existing workflows are byte-identical.
- The registry contract. Agents that opt in declare `agentic_mode` in their `config` block. Agents that don't opt in simply ignore it.
- Any other agent's behaviour.

**Reverse:**

- Flip `agentic_mode` off on all three agents (config-only change).
- Remove the three agent definitions' `agentic_mode` field.
- Delete `lib/agents/agentic/` directory.
- Trace rows in `agent_invocations` with `kind='agentic_tool'` can stay (additive data) or be deleted with a single WHERE clause.

**Validation:**

- Verifier in agentic mode with a low-confidence claim: trace shows `archive_search → web_fetch → final_answer`. Final cost ≤ $0.02 per run.
- Researcher in agentic mode on "ConCourt media judgment 2026": trace shows N web_fetches + archive cross-ref + summary. Final cost ≤ $0.05 per run.
- Recursion guard: an agentic agent that tries to invoke itself is rejected with a clear error.
- Tool whitelist: `db_read('users', ...)` returns a permission error logged to the trace.
- Multi-tenant: agentic tools enforce `newsroomId` from `ctx`; cross-newsroom data does not leak.
- Per-run cost cap: a runaway loop hits `maxSteps=5` and stops with `status='step_limit'` rather than billing indefinitely.

**Confirm-before-next gate:** Paul runs 5–10 agentic-mode Verifier + Researcher runs on real pilot newsroom claims. Decides:
1. Does the trace UI make the reasoning legible to a non-engineer AI champion?
2. Is the maxSteps default of 5 right, or are we hitting the ceiling and degrading quality?
3. Which other agents (Copywriter? Audience?) deserve agentic mode in V2.1?
4. Cost — is the per-run cost cap satisfactory for the budget the pilot is on?

**Est. effort:** ~6–8 days. The loop is a known shape; the tool palette + the recursion + tenancy guards + the trace UI are where the effort sits.

---

## Step 5 — Sensitivity classifier + routing decision

**Goal:** every workflow input gets a `sensitivity` label (`public` / `internal` / `sensitive`) before any LLM call. The label is computed by a small local classifier (no Anthropic dependency) plus per-newsroom rules (an editor can mark a beat or a workflow always-sensitive). The classifier decides routing: `public` and `internal` go to Anthropic Claude (the V1 path); `sensitive` is refused at this step with a clear "this would need the newsroom appliance — coming in Step 6" message.

**Why fifth:** sets up Step 6's federated execution but is testable + reversible on its own. Lands the classifier and the routing decision; Step 6 only adds the local-execution branch.

**Adds:**

- `lib/sensitivity/classify.js` — pure-JS classifier. Inputs: workflow input text + the newsroom's beat / ethics policy / sensitivity rules. Output: `{ label: 'public' | 'internal' | 'sensitive', confidence: 0..1, reasons: string[] }`. Heuristic + lexicon: PII patterns (phone / ID / SA ID number / email), source-protection keywords (`whistleblower`, `confidential source`, `off-record`, `embargo`), newsroom-supplied custom patterns from `newsroom_profile.metadata.sensitivity_rules`. ~200 LOC + tests. Deterministic; no Claude call.

- `newsroom_profile.metadata.sensitivity_rules` shape:
  ```json
  {
    "always_sensitive_keywords": ["whistleblower", "confidential source", "off-record"],
    "always_sensitive_workflows": ["leaked-document-triage"],
    "regex_patterns": ["\\b\\d{13}\\b"],
    "default_label": "internal"
  }
  ```

- `lib/agents/route.js` — central routing function called by the workflow runner and the agent API routes. Given an input and a `newsroomId`, classifies, decides:
  - `public` / `internal` → proceed with Anthropic.
  - `sensitive` → if no appliance is registered for this newsroom (V2 Step 5 state), refuse with `error: 'sensitive_label_no_appliance'` and a UI message pointing at the appliance setup doc. If an appliance is registered (V2 Step 6 state), route there.

- Every agent's `run(input, ctx)` receives `ctx.sensitivity` (the label + reasons). Agents that don't care ignore it. Agents that do — e.g. Translator might refuse to log sensitive payloads to its glossary table — branch on the label.

- A "Sensitivity rules" sub-section in the newsroom-profile editor (matches B1/B2/B3/V1.3 pattern): keyword list, regex list, always-sensitive workflows multi-select, default label.

- Observatory rollup gets a new field on `workflow_runs`: `sensitivity_label`. Mentorship dashboard gets a filter for "show only sensitive runs."

**Doesn't touch:**

- Any agent's `inputs` / `outputs` registry schema. The `ctx.sensitivity` field is on the existing opaque `ctx` object that runners already build (currently just `newsroomId` + `userId` + `endpoint`).
- The Anthropic call path. The classifier sits before the routing decision; once `route()` returns "cloud", everything is V1.
- The chat router. It gains a one-line call to `classify()` and passes the label through.

**Reverse:**

- Set env var `GROUNDED_SENSITIVITY_ROUTING=off` → routing decision is hardcoded to `public`, classifier still runs but its output is ignored.
- Delete `lib/sensitivity/` and `lib/agents/route.js`.
- `UPDATE newsroom_profiles SET metadata = metadata - 'sensitivity_rules';` to clear overrides.
- `ALTER TABLE workflow_runs DROP COLUMN sensitivity_label;`.

**Validation:**

- Unit tests on the classifier: 30 hand-crafted inputs across the three labels, each with the right reason chain.
- Per-newsroom override: a newsroom adds `"prophet"` as an always-sensitive keyword (cult-coverage beat); an input containing that word is labelled `sensitive`.
- Routing: a `sensitive` input with no appliance registered → API returns 400 + `error: 'sensitive_label_no_appliance'` + helpful body text. Workflow runner stops the run cleanly; no half-finished state.
- Audit trail: every classification writes a `workflow_runs.sensitivity_label` value. Observatory's "Sensitive runs" filter returns the right set.
- Tenant isolation: newsroom A's sensitivity rules never affect newsroom B's classification.

**Confirm-before-next gate:** Paul + 1–2 AI champions feed real editorial inputs through the classifier across two weeks. Decides:
1. Is the default ruleset right (PII + source-protection keywords) or do we need a beat-specific starter pack (e.g. health-data PII for health beats)?
2. Is `internal` a useful third label or should we collapse to a binary `public` / `sensitive`?
3. Should the "no appliance — refuse" message offer a "downgrade to cloud anyway with explicit consent" escape hatch? If yes, log the consent event in Observatory.
4. False-positive tolerance: editors hate being blocked by an aggressive classifier; what's the right precision/recall trade-off?

**Est. effort:** ~4 days. Most of the effort is the lexicon + override schema + the editor UI; the routing layer is a thin module.

---

## Step 6 — Newsroom appliance + federated execution

**Goal:** the concept note's federated vision. Each newsroom optionally runs a small **Grounded Appliance** — a Mac mini, an Intel NUC, or a VM — that hosts an Ollama instance + a thin agent-worker that the central platform can dispatch jobs to. The central app routes `sensitive` jobs (Step 5's label) to the newsroom's appliance; `public` and `internal` still go to Anthropic. The newsroom's sensitive payloads never leave its own hardware.

**Why last:** highest blast radius. Touches identity, network, the existing worker, every agent's runtime path. Lands after the classifier (Step 5) so the routing logic already knows the labels; after Observatory (Step 1) so dispatched-to-appliance jobs are traceable; after Mentorship + Tracker tabs (Steps 2–3) so the cohort can already see what they're getting from V2 before this big rock lands.

**Adds:**

- `db/migrations/033_appliances.sql`:
  - `newsroom_appliances` — `id`, `newsroom_id` FK (unique — one appliance per newsroom for V2), `display_name`, `dispatch_url` (the appliance's reachable URL, e.g. `https://envpress.grounded-appliance.local:8443` or a Tailscale URL), `public_key` (the appliance's signing key for callback authentication), `status` (`active` / `paused` / `failed`), `last_seen_at`, `registered_at`. Off by default; newsrooms opt in.
  - `appliance_dispatches` — `id`, `newsroom_id` FK, `appliance_id` FK, `agent_invocation_id` FK, `workflow_run_id` FK (nullable), `dispatched_at`, `responded_at`, `status` (`dispatched` / `running` / `completed` / `failed` / `timeout`), `error`. Every appliance call gets a row for audit.

- `lib/appliance/dispatch.js` — central → appliance dispatcher. POST to `appliances.dispatch_url + '/agents/run'` with the same JSON shape the local agent runner uses, signed with a per-newsroom shared secret. Default timeout 5 minutes. Records a row in `appliance_dispatches`. Falls through cleanly if the appliance is unreachable: workflow run is marked `failed` with a clear error message; no cloud-routing fallback (sensitive jobs MUST stay in the newsroom's perimeter).

- `appliances/` — new top-level directory in the repo. The appliance is itself a thin Next.js + Node worker:
  - `appliances/agent-runner/` — a node service that wraps the existing `lib/agents/registry.js` against an Ollama backend instead of Anthropic. Same agent code; the Claude SDK call is swapped for an Ollama call. Listens on a configurable port, authenticates incoming requests via the registered public key.
  - `appliances/install.sh` — one-script installer for Mac mini / NUC / Debian-VM. Installs Node + Ollama + pulls `gemma3:12b` + clones the appliance package + sets up systemd / launchd. ~150 lines of bash.
  - `appliances/README.md` — operations manual: hardware spec, install steps, network requirements (a Tailscale or Cloudflare Tunnel link from the appliance to the central app), update procedure, monitoring.

- Central app:
  - `app/api/appliances/register/route.ts` — POST: newsroom admin registers an appliance (display name + URL + public key). Returns the newsroom's signing secret.
  - `app/api/appliances/[id]/health/route.ts` — GET: returns the most-recent ping from the appliance. Used by the admin UI to show "appliance online / offline."
  - `app/team` gains an "Appliance" panel showing status + a "Test dispatch" button that runs a known no-op agent against it.

- Step 5's routing module gains the appliance branch: if `sensitivity === 'sensitive'` and a `newsroom_appliances` row exists with `status='active'`, dispatch to the appliance; otherwise fall back to Step 5's refusal path.

- Observatory updates: `workflow_runs` gains an `executed_on` field (`cloud` / `appliance`) so the Mentorship dashboard can show the cloud/appliance split.

**Doesn't touch:**

- Existing agent code. The agent registry stays unchanged; the appliance imports the same `lib/agents/*.js` files and runs them against Ollama. (Net new fork-risk: the swap from Claude SDK to Ollama happens in one place — `lib/llm/call.js` — and is environment-detected.)
- Newsrooms without an appliance. Their experience is identical to V2 Step 5: cloud routing for `public` / `internal`, refusal for `sensitive`.
- Anthropic billing. Cloud jobs still hit Anthropic exactly as today.

**Reverse:**

- Per-newsroom: set `newsroom_appliances.status='paused'` → all subsequent sensitive jobs revert to Step 5's refusal path.
- Cohort-wide: env var `GROUNDED_FEDERATED_EXECUTION=off` → dispatch never fires; treats every newsroom as appliance-less.
- Hard: `DROP TABLE appliance_dispatches; DROP TABLE newsroom_appliances;` and revert the new files. The appliance package can stay installed at the newsroom; it just won't receive jobs.

**Validation:**

- Local: stand up one appliance on a dev laptop pretending to be `envpress-appliance.local`. Register it. POST a sensitive-labelled workflow run. Confirm the dispatch row, the appliance log, the result coming back, the Observatory row marked `executed_on='appliance'`.
- Authentication: a forged dispatch request without a valid signature is refused by the appliance with 401.
- Network failure: kill the appliance mid-job. Central app times out at 5min, marks the run `failed`, surfaces a clear error to the editor.
- Multi-tenant: register two appliances (newsroom A and B). Dispatch a sensitive job for A → only A's appliance gets the request. B's appliance logs zero traffic.
- Data residency: confirm the sensitive payload (a known-distinctive string) appears only in the appliance's logs and never in the central app's logs.
- Quality parity: run a known-input Verifier job once on cloud (Anthropic) and once on appliance (Ollama gemma3:12b). Observatory captures both. Paul eyeballs the quality delta — defines the cohort's expectation for sensitive work.

**Confirm-before-next gate:** at least one pilot newsroom (likely EnviroPress — they're tech-comfortable) installs the appliance under Paul's supervision. Decides:
1. Hardware spec: is Mac mini M2 8GB enough for `gemma3:12b`, or do we need 16GB+? (12B params + Ollama overhead ≈ 9GB resident.)
2. Quality delta acceptable for sensitive work? If not, do we ship `gemma3:27b` instead and require 32GB hardware?
3. Update mechanism: pull from a public Grounded appliance repo, or each newsroom freezes a version + opt-in upgrades?
4. Cohort scaling: at 5 pilot newsrooms, do we need an appliance pool / shared appliance, or is one-per-newsroom right? (V2 ships one-per-newsroom; pool comes later if a newsroom can't afford hardware.)
5. The big question: do non-appliance newsrooms get a "downgrade to cloud with explicit consent" path (Step 5's open question repeated), or do we hold the line on "sensitive = appliance-only"?

**Est. effort:** ~2–3 weeks. The appliance package itself is the bulk; the central-app integration is a week. Most of the time is the unhappy-path testing (network failures, expired keys, version drift, Ollama crashes).

---

## What's not in this plan, and why

- **Real per-newsroom Anthropic keys.** Out of scope — explicitly excluded by Paul's brief alongside WhatsApp / Lightsail / REBEL / GLiNER / outbound social creds.
- **Lightsail deploy.** Out of scope — same.
- **WhatsApp delivery for end users.** Out of scope — user mode is web-only (memory).
- **REBEL ONNX port for relation extraction, true GLiNER zero-shot NER.** Out of scope — same.
- **Outbound social credentials (real-time posting from Copywriter/Distributor).** Out of scope — same.
- **Voice cloning, video synthesis, image generation.** None of these are in the concept note's V2 scope and they're all expensive open-source dependencies. Defer until a pilot newsroom asks.
- **Cross-cohort search ("show me what Maricho Media has published on POPIA").** Big privacy + governance question. Belongs in a separate cohort-policy doc, not a build slice.
- **Multi-cohort support.** Pilot is one cohort. Multi-cohort lands when grantee newsrooms become a second cohort (~Jan 2027). Schema is multi-cohort-friendly already (`cohort_id` in `tracker_digests`); UI is not.
- **Fine-tuning custom Haiku adaptors on edit-data.** Observatory captures the data. Whether/when/how to fine-tune is a Paul + Anthropic conversation, not a build step.

---

## Sequencing inside the Jul–Dec 2026 window

| Month | Step | Notes |
|---|---|---|
| Jul 2026 | Step 1 — Observatory | foundation; everything else writes here |
| Aug 2026 | Step 2 — Mentorship | UI on top of Observatory; lands fast |
| Sep 2026 | Step 3 — Tracker 7 tabs | the most-variable slice; could overflow into Oct |
| Oct 2026 | Step 4 — Agentic agents | the most-novel slice; budget the most cohort-feedback time |
| Nov 2026 | Step 5 — Sensitivity classifier | sets up Step 6; testable on its own |
| Dec 2026 | Step 6 — Newsroom appliance | longest slice; finish before grantee charging starts Jan 2027 |

Each month ends with Paul-confirms-before-next, exactly like the consolidation plan. No step ships without a real pilot newsroom touching it first.

---

## Decisions (pending Paul, before Step 1 starts)

These are the V2 equivalents of the consolidation plan's settled decisions. Surface them one at a time as each step nears:

1. **Observatory edit pills location** — top of every agent output panel, or only the Drafter / Producer / Translator panels where edits are common?
2. **Mentorship per-user view** — show or drop? Surveillance vs. mentorship framing.
3. **Tracker Lawsuits/Regulations split** — one tab or two?
4. **Tracker Connections-map** — keep or drop based on the demo to one AI champion.
5. **Agentic maxSteps default** — 5, 7, or 10?
6. **Sensitivity labels** — three (`public`/`internal`/`sensitive`) or binary (`public`/`sensitive`)?
7. **Sensitive-job downgrade-with-consent escape hatch** — yes / no? Same question repeats in Step 5 and Step 6.
8. **Appliance hardware spec** — Mac mini M2 8GB target, or push to 16GB? Driven by which Ollama model V2 ships against.

Each becomes a one-line answer in this doc as Paul calls it.

---

## How V2 ends

By Dec 2026:

- 12 agents, 6 new V2 capabilities, one cohort of 5 pilot newsrooms running daily.
- Every action logged in the Observatory. Cohort-shared use cases visible across newsrooms. Sensitive work running on each newsroom's own appliance.
- The platform Paul can charge grantees for in Jan 2027 and enterprises for in Jul 2027, because the federated architecture lets grantees say "we host our own appliance; you never see our sensitive work" — which is what makes Grounded different from a SaaS suite.
