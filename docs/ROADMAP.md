# Grounded — Forward Roadmap

**Last updated:** 2026-05-19

This file is the single forward-looking view of what's outstanding. Read this first when you (or a future Claude session) come back to the project. It's not a re-statement of what's shipped — that's in the README's "Status" section and the per-feature plan docs ([`V2_PLAN.md`](V2_PLAN.md), [`SECURITY_AUDIT_PLAN.md`](SECURITY_AUDIT_PLAN.md), [`APPLIANCE_EXECUTION_PLAN.md`](APPLIANCE_EXECUTION_PLAN.md)).

---

## What's shipped (1-line summary so you don't have to dig)

- **V1:** 8 agents + 5 tools (incl. Security Audit shipped 2026-05-19 with research-grade ZA jurisdiction pack), Builder with drag-and-drop + "Describe & build" prompt-to-workflow, User mode, Postgres workflow registry, encrypted social credentials, OSS-first stack, Anthropic + Ollama fallback.
- **V2:** Observatory, Mentorship dashboard, 7-tab Tracker UX, agentic agents (Verifier + Researcher + Operations with `db_read` + `archive_search` + `web_fetch` + `invoke_agent` tools and the `/observatory/runs/[id]` trace viewer), sensitivity classifier + routing, newsroom-appliance protocol + signed dispatch + one-script installer.
- **Latest commits at the time of this writing:** `eb26198` (.env.example cleanup + security_audit unit tests + pilot seed), `60fca81` (BRIEFING.md superseded header + prompt-to-workflow doc), `693ece5` (Security Audit Slice D).

---

## Substantial work outstanding

These each warrant a dedicated session.

### 1. Tracker integration — **Paul is owning this**

The AI Legal, Ethics & Regulation Tracker (12th agent / 4th tool) is currently a 175-line shell ([`lib/agents/legal_tracker.js`](../lib/agents/legal_tracker.js)) over the V1 `learning_updates` table so it registers and appears in the Builder. The real implementation lives at:

```
/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/INTEGRATE/tracker
```

It's a full standalone codebase: `client`, `server`, `holly.sql` Postgres schema, PM2 `ecosystem.config.cjs`, plus `AI_LEGAL_BUILD_SPEC.md` and `AI_LEGAL_LAUNCH.md` design docs. Paul is bringing it across when ready. Don't rebuild it from scratch.

When integration happens, scope check:
- Does the standalone schema (`holly.sql`) play with Grounded's per-newsroom isolation, or does it need a `newsroom_id` retrofit?
- Does the 7-tab Tracker UX at [`app/learning/LearningWorkspace.tsx`](../app/learning/) get kept, replaced, or merged with the standalone's UI?
- The `lib/agents/legal_tracker.js` shell needs replacing with a real implementation that uses the integrated codebase. Agent registration stays the same (slug `legal_tracker`, `category: 'tool'`).

### 2. Newsroom appliance — real Ollama-backed execution (V2 Step 6.x)

See [`APPLIANCE_EXECUTION_PLAN.md`](APPLIANCE_EXECUTION_PLAN.md) for the full scope plan + slice breakdown.

**Short version:** the protocol, signing, central-app integration, registry/health/test-dispatch endpoints, and one-script installer are all shipped. Only the execution backend in [`appliances/agent-runner/server.js`](../appliances/agent-runner/server.js) is a STUB that acknowledges dispatches without running them. The concept note's "sensitive material runs on the newsroom's own hardware" claim depends on this being real. ~2-3 weeks for the full build per the original V2 plan, sequenced into four sub-slices in the appliance plan.

---

## Operational growth work (incremental, as cohort scales)

### Deep-research the remaining jurisdiction packs

Locked decision 2026-05-18 (from the user): *"South African at the moment"*. The ZA pack is `audit_depth: deep` with primary-source citations (POPIA s.72, FISA 702 / RISAA, Garante DeepSeek ban, etc.). Eight other packs are `audit_depth: light` — they cite their primary data-protection act but haven't had the deep avoid-list research:

| Jurisdiction | Primary law cited | Deep research when |
|---|---|---|
| Zimbabwe (ZW) | Cyber and Data Protection Act, 2021 | EnviroPress / Maricho / VicFallsLive onboard |
| Zambia (ZM) | Data Protection Act, 2021 | Capital FM Lusaka / MakanDay onboard |
| Kenya (KE) | Data Protection Act, 2019 | First Kenyan newsroom joins pilot |
| Tanzania (TZ) | Personal Data Protection Act, 2022 | First Tanzanian newsroom joins |
| Uganda (UG) | Data Protection and Privacy Act, 2019 | First Ugandan newsroom joins |
| Ghana (GH) | Data Protection Act, 2012 (Act 843) | First Ghanaian newsroom joins |
| Nigeria (NG) | Nigeria Data Protection Act, 2023 + GAID 2025 | First Nigerian newsroom joins |
| EU | GDPR + Schrems II | If a European partner needs it |
| US | CCPA / CPRA | If a US partner needs it |

The deepening pattern is the [ZA pack](../config/jurisdiction-packs.yaml) — add sources with `evidence_kind` tags, set `audit_depth: deep`, refresh `last_verified`. Each pack takes ~½ day of focused research per the [`SECURITY_AUDIT_PLAN.md`](SECURITY_AUDIT_PLAN.md) approach.

---

## Locked post-pilot deferrals (do not pull forward without explicit reopening)

These are deliberately out of scope for the pilot build period. Memory references for each.

| | Item | Why deferred | Memory pointer |
|---|---|---|---|
| 1 | **WhatsApp audience channel** (Digital News Gatherer outbound + inbound + correction loop) | Pilot ships web-only for journalists; WA for audiences is post-pilot per the original concept-note phasing | [project_user_mode_web_only.md](../memory location), [project_distributor_credentials.md](#) |
| 2 | **Real S3 + Google Drive mirror for uploads** | Pilot uses local-disk storage under `storage/` — fine for 5 newsrooms, gets retrofitted before cohort scales | locked rule #4 in README |
| 3 | **Lightsail deploy** | Pilot is dev-environment; production deploy comes after V2 close-out + security-audit shipping | locked rule #4 in README |
| 4 | **Per-newsroom Anthropic API keys** | Pilot uses a single shared `ANTHROPIC_API_KEY`; per-newsroom billing is post-pilot grantee-charging work (Jan 2027+) | concept note p.4 |
| 5 | **Cross-cohort search** ("show me what Maricho has published on POPIA") | Big privacy + governance question, not a build slice | V2_PLAN.md "What's not in this plan" section |
| 6 | **Multi-cohort support** | Pilot is one cohort; multi-cohort schema is friendly but UI is single-cohort. Lands when grantees become a second cohort (~Jan 2027) | V2_PLAN.md |
| 7 | **Fine-tuning custom Haiku adaptors on edit-data** | Observatory captures the data; whether/when/how to fine-tune is a Paul + Anthropic conversation, not a build step | V2_PLAN.md |
| 8 | **Voice cloning, video synthesis, image generation** | None in the concept note's V2 scope; expensive OSS deps; defer until a pilot newsroom asks | V2_PLAN.md |

---

## When you come back — start here

1. **Re-read this file first.** Quick scan of what's shipped + what's outstanding.
2. **Pick one of the two substantial items** (Tracker integration if Paul has brought it across; otherwise appliance real-execution per [`APPLIANCE_EXECUTION_PLAN.md`](APPLIANCE_EXECUTION_PLAN.md)).
3. **Memory entries** (auto-loaded via the CLAUDE memory system) will surface the locked rules + the 2026-05-19 session state with pointers back here.
4. **Run `npm test`** to confirm 187 tests still pass before changing anything.
5. **Run `npm run migrate`** if migrations 036–038 haven't been applied locally — they were committed but the user is the one who runs the dev DB.

---

## Quick reference — where things live

| What | Where |
|---|---|
| Canonical agent + tool spec | [`docs/AGENTS.md`](AGENTS.md) |
| V2 build history (six steps, all shipped) | [`docs/V2_PLAN.md`](V2_PLAN.md) |
| Security Audit (Tool #5) plan + shipped log | [`docs/SECURITY_AUDIT_PLAN.md`](SECURITY_AUDIT_PLAN.md) |
| Appliance real-execution scope plan | [`docs/APPLIANCE_EXECUTION_PLAN.md`](APPLIANCE_EXECUTION_PLAN.md) |
| Original briefing (build methodology; **portfolio framing superseded**) | [`docs/BRIEFING.md`](BRIEFING.md) |
| Cross-session handoff notes (snapshot 2026-05-11) | [`docs/HANDOFF.md`](HANDOFF.md) |
| Pilot-readiness checklist | [`docs/PILOT_PUNCHLIST.md`](PILOT_PUNCHLIST.md) |
| Open decisions log | [`docs/OPEN_DECISIONS.md`](OPEN_DECISIONS.md) |
| Jurisdiction packs (audit scoring source) | [`config/jurisdiction-packs.yaml`](../config/jurisdiction-packs.yaml) |
| Reuse inventory (what's lifted from other Develop AI codebases) | [`REUSE.md`](../REUSE.md) |

---

## Locked rules — don't break these

Repeated from the README because they're load-bearing on every change:

1. **Haiku 4.5 only.** Hardcoded in [`lib/claude.js`](../lib/claude.js). No model param on `chat()`. No env override. No UI knob.
2. **OSS-first** for everything except Anthropic. Embeddings (BGE-M3), translation (Helsinki opus-mt / NLLB), audio (Whisper + Piper), document parsing (pdf-parse + mammoth) are all in-process or local binaries.
3. **Per-newsroom isolation.** Every multi-tenant row has `newsroom_id` FK. Every query is scoped. The `db_read` agentic tool refuses cross-newsroom reads.
4. **Anchor → Grounded rename is partial on purpose.** Slugs (`drafter`, `distributor`, …), table prefixes (`distribution_*`, …), cookie name (`anchor_token`), dev-seed login (`admin@anchor.local`), drag MIME (`application/anchor-agent`) are intentionally still `anchor` to protect saved data + live sessions. Don't "fix" these.
5. **WhatsApp is for audiences, not journalists.** Journalists use the web app only.
6. **Workflows are products framed as problems.** Every workflow carries `problem_statement`, `problem_category`, `user_instructions`. User mode groups by problem category.

If a change in front of you would violate any of these, stop and surface it before proceeding.
