# Digital Security Audit — implementation plan

**Status:** drafted 2026-05-18, design decisions locked. Awaiting Paul's go-ahead on Slice A.

**Decisions locked (2026-05-18):**
- `data_kinds_exposed` is a fixed enum with an "Other, please specify" escape (cleanest editor UX, comparable across cohort).
- Jurisdiction packs ship as YAML in the repo + per-newsroom overrides stored at `newsroom_profile.metadata.jurisdiction_overrides`. Matches how sensitivity rules already work.
- Routing-history default window: **90 days**. Quarterly view; right for governance reviews.
- Security Audit is available both **on-demand** (button on `/security`) AND as a **draggable Builder block**. Workflow-mode returns the new `reportId`.
- **Research-grade citations are mandatory (added 2026-05-18 mid-Slice-B).** Every non-trivial claim in a jurisdiction pack carries a `sources` list with `evidence_kind` tags (`primary_legislation` / `regulator_guidance` / `regulator_action` / `case_law` / `reputable_press` / `industry_analysis` / `vendor_documentation`). The ZA pack is `audit_depth: deep` with primary-source backing for POPIA s.72, FISA 702 / RISAA, and recent DeepSeek / TikTok regulator actions. Other packs are `audit_depth: light` and cite the jurisdiction's primary data-protection act — they get deep-research treatment as newsrooms from those countries join the pilot. Tanzania, Uganda, Ghana, and Nigeria added as light packs in this pass.

**Decision still open:** report retention. The plan defaults to "keep all reports forever" (storage is trivial; year-over-year comparison value is real). Flip to expire-after-12-months if Paul prefers.
**Concept-note origin:** Tool #5 in the 18 May 2026 GROUNDED concept note + budget. Was the missing piece flagged by the reviewer's reconciliation.
**Why now:** the Tool/Agent split landed (Tools = 4 currently, planned 5th). Security Audit completes that count. The reviewer correctly identified this as the highest-priority concept-note gap: the note describes it in detail, it does not exist in code.

---

## Goal

Build a built-in audit a newsroom runs on its own setup that:

1. **Maps where data is leaking** — which external tools are in use, what each collects, where source material / contacts / unpublished work are exposed.
2. **Flags external AI tools to avoid**, scored against the newsroom's loaded jurisdiction pack.
3. **Returns a prioritised list of fixes** the editor can work through.
4. **Shows which Grounded tasks have been sent outside** — i.e. cloud vs appliance routing history, by workflow + agent + sensitivity label. This is the half of the concept-note ask that is already serviceable by the V2 sensitivity classifier + routing + Observatory.

Output: a saved, dated **Audit Report** the newsroom can re-run, compare against, and export. Per-newsroom scoped; never crosses newsrooms.

---

## Cross-cutting principles (preserve V2's)

- **Anthropic-only paid dep + Haiku-only.** The audit's narrative-generation step uses one Haiku call to draft the prioritised fix list; the inventory + classification work is deterministic JS, no model call.
- **OSS-first non-LLM.** Jurisdiction pack is a checked-in YAML file in `config/`. No SaaS dependency.
- **Per-newsroom isolation.** New tables get `newsroom_id` from day one.
- **Reversible / additive.** New tables only; no modification of existing schemas. Off-by-default until the editor runs it.
- **Reuse, don't duplicate.** The "what's been sent outside" half reads `workflow_executions.sensitivity_label` + `workflow_runs.sensitivity_label`. The classifier reuse is `lib/sensitivity/classify.js`.

---

## What the editor sees (UX shape, end state)

`/security` — admin + builder role only. Three regions:

1. **External tool inventory** — table of external AI/data tools the newsroom uses (ChatGPT, Claude, Gemini, Notion AI, …). Editor maintains the list; each row carries vendor, data-residency country, declared use, risk band (auto-scored against jurisdiction pack).
2. **Run an audit** — button. Runs the pipeline (deterministic + 1 Haiku call), produces an `audit_reports` row, redirects to the report view.
3. **Recent reports** — history. Each is a snapshot of "as of this date, here is what this newsroom looks like."

`/security/reports/[id]` — the report:

- Summary banner (overall risk band, change vs last report).
- **Inventory risks** (auto-scored).
- **What's been sent outside** (cloud routing history, last 30 days, by workflow + sensitivity).
- **Prioritised fix list** (Haiku-drafted, evidence-cited).
- Export buttons: JSON + Markdown.

Builder palette: Tool #5 appears as a draggable block. Slug `security_audit`. When wired into a workflow, the audit pipeline runs and the report URL is returned as the agent's output — same pattern as Operations briefs.

---

## Sub-slices (each is one commit Paul reviews)

### Slice A — Schema + tool inventory CRUD (low risk, ~1 day)

**Adds:**

- `db/migrations/038_security_audit.sql`:
  - `security_external_tools` — `id`, `newsroom_id` FK, `vendor`, `tool_name`, `data_residency` (ISO country, nullable), `declared_use` (free text), `data_kinds_exposed` (`text[]` — fixed enum values: `'unpublished_drafts'`, `'source_contacts'`, `'article_archive'`, `'audience_pii'`, `'financial_records'`, `'other'`; a `data_kinds_other` TEXT column captures the free-form description when `'other'` is selected), `added_by_user_id`, `notes`, `created_at`, `updated_at`. One row per external tool the newsroom uses.
  - `security_audit_reports` — `id`, `newsroom_id` FK, `initiated_by_user_id`, `status` (`running`/`completed`/`failed`), `summary_json` (the full report payload), `overall_risk_band` (`low`/`medium`/`high`/`critical`), `inventory_snapshot_json` (snapshot of `security_external_tools` at run time), `routing_window_days`, `started_at`, `finished_at`, `cost_usd`, `error`. One row per audit run.

- `app/api/security/tools/route.ts` — POST/GET CRUD on `security_external_tools` (role: builder + admin).
- `app/api/security/tools/[id]/route.ts` — PATCH/DELETE.
- `app/security/` workspace skeleton with the inventory table (no run-audit button yet).

**Reverse:** drop the two tables, delete the route + workspace.

**Validation:**
- Add three tools as a builder; refresh — they persist.
- Try CRUD as a `user` role — 403'd.
- A second newsroom doesn't see the first's tools.

**Confirm-before-next:** Paul eyeballs the inventory UX. Decides:
1. Are the columns right (vendor / tool / data residency / declared use / data kinds exposed)?
2. Are the six enum values for `data_kinds_exposed` right (`unpublished_drafts`, `source_contacts`, `article_archive`, `audience_pii`, `financial_records`, `other`)? Edit them now if not.

---

### Slice B — Jurisdiction pack + risk scoring (low risk, ~1 day)

**Adds:**

- `config/jurisdiction-packs.yaml` — checked-in YAML. Per-country sections covering SA / ZW / ZM / KE / EU / US plus a `default` fallback. Each section carries:
  - `data_law_summary` — one paragraph.
  - `risky_residencies` — list of countries whose tools should be flagged when the audited newsroom is in this jurisdiction.
  - `tool_avoid_list` — vendor / tool name patterns to flag with `severity` (`warn` / `avoid` / `prohibit`) and `reason`.
  - `safe_residencies` — list of acceptable data-residency countries.
- `lib/security/jurisdiction.js` — `loadPacks()`, `scoreTool(tool, newsroomJurisdiction, overrides) → { risk_band, reasons[] }`, `scoreInventory(tools, newsroomJurisdiction, overrides) → { tool_id: scoring }`. `overrides` is the per-newsroom override blob.
- `tests/security/jurisdiction.test.js` — 15-20 unit tests: a US-resident ChatGPT scored against a SA newsroom should warn (POPIA); a SA-resident tool against a SA newsroom should be safe; a vendor in the `tool_avoid_list` always flags; a per-newsroom override that says `"OpenAI": "safe"` flips the result; etc. Deterministic, no Claude.
- `newsroom_profile.metadata.jurisdiction` — added as a soft field (no schema change — it's already a JSONB column). Defaults to `'default'` if unset; admins set it from `/newsroom`.
- `newsroom_profile.metadata.jurisdiction_overrides` — per-newsroom override blob, same shape as the YAML pack sections (`safe_residencies`, `risky_residencies`, `tool_avoid_list`, with a `tool_allow_list` to whitelist exceptions). Admins maintain from `/security` settings (a small editor sub-panel; the API + UI scaffolding for the editor lands here too).

**Reverse:** delete the YAML + lib + test; the field on `metadata` is JSONB so removing it is a no-op.

**Validation:**
- `scoreTool({ vendor: 'OpenAI', data_residency: 'US' }, 'SA')` → risk_band `'warn'`, reason mentions POPIA + US residency.
- `scoreTool({ vendor: 'Develop AI', data_residency: 'ZA' }, 'SA')` → risk_band `'low'`.
- Loading the YAML twice doesn't double-register.

**Confirm-before-next:** Paul reads the YAML, edits the SA / ZW / ZM / KE entries to reflect his real opinion on residency risk. The audit's quality is downstream of this file's quality — get it right.

---

### Slice C — Audit pipeline (medium risk, ~2 days)

**Adds:**

- `lib/agents/security_audit.js` — registered agent, `category: 'tool'`, slug `security_audit`. Implements `runAudit({ newsroomId, userId, routingWindowDays })`:
  1. Loads `security_external_tools` rows for the newsroom.
  2. Loads `newsroom_profile.metadata.jurisdiction` (default `'default'`).
  3. Calls `scoreInventory()` → per-tool risk + reasons.
  4. Queries `workflow_executions` + `workflow_runs` for the past N days, grouped by workflow_slug + sensitivity_label. Builds a "what's been sent outside" rollup.
  5. Composes a structured payload + system prompt and makes **one** Haiku call to draft the prioritised fix list. Hardcoded Haiku via `lib/claude.js` — no model knob.
  6. Persists everything to `security_audit_reports` (status `completed` or `failed`, with full snapshot).
  7. Returns `{ reportId, output }`.
- `app/api/security/reports/route.ts` — GET (list), POST (run an audit).
- `app/api/security/reports/[id]/route.ts` — GET (read report).
- `app/security/reports/[id]/page.tsx` + `ReportViewer.tsx` — render the four sections (summary / inventory risks / routing history / fix list).
- Add a "Run audit" button on `/security`.

**Reverse:** revert these files. The DB rows remain (orphan reports are harmless).

**Validation:**
- Seed 3 fake tools + 20 fake `workflow_executions` rows with mixed sensitivity labels. Run the audit. Confirm:
  - Report row exists with `status='completed'`.
  - `inventory_snapshot_json` captures all 3 tools.
  - `summary_json.routing_history` shows the cloud-vs-appliance split.
  - Fix list contains specific, named actions (not generic prose).
- Hit the 5-minute Haiku timeout path — confirm report row marked `failed` with the error captured.
- Tenant isolation — newsroom A's audit doesn't see newsroom B's tools or routing history.

Routing-history window default: **90 days** (locked). The Builder block accepts an override.

**Confirm-before-next:** Paul runs an audit on the seeded newsroom. Decides:
1. Is the report layout legible to a non-engineer editor?
2. Is the Haiku-drafted fix list specific enough, or does the prompt need work?

---

### Slice D — Export + Builder palette (low risk, ~½ day)

**Adds:**

- `app/api/security/reports/[id]/export/route.ts` — accepts `?format=json` or `?format=markdown`, returns the full report. Markdown is the editor-shareable form.
- The Builder palette already groups agents/tools by `category` — slice A's registration as `category: 'tool'` puts it under "Tools" automatically. No code change needed in the Builder beyond the agent module itself.
- `lib/agents/security_audit.js` declares its workflow contract:
  - `inputs:` — empty (the audit reads from the newsroom's stored tool inventory + routing history).
  - `config: { routingWindowDays: { type: 'number', default: 90 } }` — Builder can override per workflow.
  - `outputs: { reportId, overallRiskBand }` — downstream nodes can branch on the band (e.g. refuse to publish if `'critical'`).
- A small "Export Markdown" button on the report viewer.

**Reverse:** delete the export route + button.

**Validation:**
- Export endpoint returns valid JSON and renders cleanly as Markdown in a preview.
- Builder shows the Security Audit tile under "Tools."
- Drag a Security Audit node onto a canvas, wire it into a workflow, run — workflow returns the `reportId`.

**Confirm-before-next gate (end-of-slice):** Paul runs the full flow end-to-end on a pilot newsroom (real inventory, real audit, real report, export). Confirms ready to merge.

---

## Out of scope (deliberately)

- **Active discovery of external tools.** This audit is *self-reported* — the editor types in their tool list. Network-level discovery (sniff outbound DNS to detect ChatGPT use) is out: it would need agent-level instrumentation on user machines, which is invasive and out of charter.
- **Detecting source-contact exposure inside Grounded.** The audit reports what the newsroom *says* it uses externally and what Grounded *has actually sent* via routing history. It doesn't open archive_documents and grep for phone numbers — that's a separate PII-detection feature and would touch source-protection in ways that need their own design.
- **Tool-by-tool ToS / DPA scraping.** Jurisdiction risks come from the YAML pack (human-curated). Auto-pulling vendor terms of service is brittle, out of scope.
- **Continuous monitoring.** This is a snapshot-based audit (run on demand). Cron-style nightly audits can be a later slice if newsrooms want them.

---

## Open decisions

All four blocking decisions resolved 2026-05-18 (see header). One non-blocking decision remains:

- **Report retention** — keep all reports forever (default in this plan) or expire after 12 months. Storage cost is trivial; comparison-over-time value is real. Flip when Paul calls.

---

## Effort + sequencing

| Slice | Effort | Cumulative |
|---|---|---|
| A — schema + inventory CRUD | ~1 day | 1 day |
| B — jurisdiction pack + scoring | ~1 day | 2 days |
| C — audit pipeline | ~2 days | 4 days |
| D — export + Builder | ~½ day | 4.5 days |

Confirm-before-next gates at end of each slice. Each slice is a single commit Paul can review and revert independently.

---

## What ships after this slice

- Five tools live: Fundraiser, Audience Analytics Manager, Operations Manager, AI Legal Ethics & Regulation Tracker, **Digital Security Audit**. The concept note's full tool count matches the code.
- The "data security is crucial" section of the concept note is no longer aspirational — it points at a working audit.
- `docs/AGENTS.md` removes the "*(planned)*" badge from Tool #5.
- README's Tools table marks Tool #5 as shipped.

Future work outside this slice (still on the reviewer's list): Step 3 (SUPERSEDED header on BRIEFING.md), Step 4 (confirm prompt-to-workflow auto-construction), Step 5 (scope the standalone Tracker integration + real Ollama appliance execution). None of those depend on Security Audit; any can be slotted in next.
