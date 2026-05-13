# Pilot punch-list — what's left to finish this version

Snapshot at 2026-05-13. The "platform" here means Grounded (11 agents,
Builder + User mode, learning layer, newsroom profile, Ollama fallback).
WhatsApp delivery + Lightsail deploy are the only items the spec puts
post-pilot; everything in this file is in-scope for the pilot ship.

Status legend: 🟢 done · 🟡 partial/gated · 🔴 not started · ⏭ deferred

---

## Track A — Flip the gated switches

Two prompt extensions ship behind env flags so we can review real outputs
before turning them on cohort-wide.

| # | Item | Where | Gate | Notes |
|---|---|---|---|---|
| A1 🟡 | Copywriter topic-match hint | `lib/agents/drafter.js` | `GROUNDED_TOPIC_HINT=on` | Step 0. Eyeball 10–20 real Drafter outputs with the flag on. Decide whether to keep, drop, or tweak the 10-bucket default. |
| A2 🟡 | Style-fingerprint in prompts | `lib/newsroom-profile.js` `formatForPrompt` | `GROUNDED_STYLE_FINGERPRINT_IN_PROMPT=on` | Step 4. Generate fingerprints for 2–3 pilot newsrooms first; review the banded labels read sensibly to Claude. |

Effort: ~1 hour each (just flip + spot-check).

---

## Track B — Editor-UI sub-sections the plan deferred

The pan-African defaults are editable today via SQL on `newsroom_profile.metadata`.
The plan said the editor UI for these lands as a fast-follow.

| # | Item | Touches | Effort | Notes |
|---|---|---|---|---|
| B1 🔴 | Topic taxonomy editor (Step 0.6) | `app/newsroom/NewsroomProfileForm.tsx` | ½ day | Collapsible "Topic taxonomy" sub-section. Show the effective merged list; let the editor add/remove keywords per bucket and add custom buckets. Writes to `newsroom_profile.metadata.topic_tags`. |
| B2 🔴 | Trusted-sources editor (Step 2.5) | same form | ½ day | "Trusted sources" sub-section. Show categorised list; editor adds/removes apex domains. Writes to `newsroom_profile.metadata.trusted_sources`. |
| B3 🔴 | Crawl-rules editor (Step 3) | same form | ½ day | "Crawl rules" sub-section. exclude_paths / include_paths_only / priority_paths / max_links_per_crawl / respect_robots / same_host_only. Writes to `newsroom_profile.metadata.crawl_rules`. |
| B4 🔴 | Style-fingerprint inspector + button | same form + new endpoint exists | ½ day | "Compute house-style fingerprint" button (POSTs to existing endpoint, enqueues job). Read-only display of the 14 dimensions when ready. |

These four are the same pattern repeated four times — once the first lands, the rest are template-copies. Total ≈ 1.5 days.

---

## Track C — Researcher deep-crawl UI

The crawl backend + API are done (Step 3). Surfacing in the workspace is
still pending.

| # | Item | Touches | Effort | Notes |
|---|---|---|---|---|
| C1 🔴 | Crawl trigger in dossier UI | `app/research/dossiers/[id]/DossierDetail.tsx` | ½ day | "Crawl a website into this dossier" affordance. Editor enters homepage URL + optional maxLinks, hits POST `/api/research/dossiers/[id]/crawl`. Status panel polls `/api/research/crawl/[id]/status`. |

---

## Track D — Archive-layer pilot limitations

Documented in the slice commits. None block pilot ship, but the user
experience benefits from each.

| # | Item | Where | Effort | Notes |
|---|---|---|---|---|
| D1 🔴 | Auto-resolve acronym ↔ expansion | `lib/archive/resolve.js` | 1 day | Detect ALL-CAPS tokens that expand to a multi-word entity in the same chunk (e.g. "ANC" within range of "African National Congress") and auto-merge them. Falls back to the existing editor-mediated merge UI. |
| D2 🔴 | Cross-type entity merge UI | `app/archive/ArchiveWorkspace.tsx` Entities tab | ¼ day | Editor merge already works at the API; the UI's merge dialog currently filters candidates to the same type. Lift that filter for the manual case (e.g. "Anglo American" appears as both `organisation` (wikineural) and `mining_company` (Haiku custom)). |
| D3 🔴 | Wikidata QID linking | `lib/archive/resolve.js` + new module | 1 day | Optional. Currently `wikidata_qid` is a nullable column nobody populates. Add a post-resolve step that hits a cached Wikidata API for high-confidence matches. Useful later for cross-newsroom joins. Editor-confirmed only. |
| D4 ⏭ | REBEL ONNX port for relation extraction | `lib/archive/extract.js` | 2 days | Currently using Haiku for triples. REBEL has no ONNX port; would need conversion via Optimum. Post-pilot — the Haiku path works and is cheap. |
| D5 ⏭ | True GLiNER zero-shot NER | `lib/archive/extract.js` + new module | 2 days | Currently using Haiku for newsroom-specific entity types. The `gliner` npm package pulls in CVE-vulnerable deps; would need a custom Transformers.js port. Post-pilot. |

---

## Track E — Operational concerns

Things that aren't features but matter for a real newsroom using the
platform.

| # | Item | Effort | Notes |
|---|---|---|---|
| E1 🔴 | Real social-media outbound credentials | 1–2 days | Distributor outbound is currently simulated dispatch (logged, not sent). Wire one real channel adapter as a proof — probably Mastodon (no app-review needed) or Bluesky. Plan-level decision: ZW/ZM newsrooms care more about X + Facebook than Mastodon, so app-review is a real cost. |
| E2 🔴 | pg-boss worker in production deploy | ½ day | The worker is fine in dev (`npm run worker`). For Lightsail (post-pilot) we'll want systemd or a `pm2` config so it restarts on crash. Belongs in the Lightsail track but flagging here. |
| E3 🔴 | Migration runner safety | ¼ day | `db/migrate.js` has no checksum / no rollback. Once pilot DBs exist, adding a checksum column to `schema_migrations` becomes prudent. |
| E4 🟡 | Test coverage of the archive layer | 1 day | 50 tests today, mostly cover topic taxonomy + scrape + style fingerprint + a chunk of the archive query layer. Resolve / extract / metadata / answer paths are exercised via smoke scripts but not pinned in `tests/`. Worth pinning before pilot newsrooms touch the archive at scale. |

---

## Track F — Onboarding the 5 pilot newsrooms

Per HANDOFF §2, the pilot is Capital FM Lusaka, EnviroPress, MakanDay,
Maricho Media, VicFallsLive. None are seeded.

| # | Item | Effort | Notes |
|---|---|---|---|
| F1 🔴 | Newsroom seed for the 5 pilots | ½ day | Create `newsrooms` rows + an admin user per newsroom. Seed initial `newsroom_profile` (mission, beats, geography, primary languages, voice notes — drafted from each newsroom's public bio). |
| F2 🔴 | Per-newsroom Anthropic key handling | ¼ day | Right now there's one `ANTHROPIC_API_KEY` for the whole platform. For the pilot, all 5 share Paul's key. Note in HANDOFF that per-newsroom keys are post-pilot. |
| F3 🔴 | Welcome email / onboarding doc | ¼ day | Single page explaining: how to log in, how to upload archive, how to run a workflow, where to find the Help guide. |

---

## Track G — Open decisions from HANDOFF §10

These are pre-existing open questions that need a call before pilot ship.

| # | Item | Decision needed |
|---|---|---|
| G1 🔴 | User-mode chat routing | Going with **keyword-first + LLM-fallback** unless Paul redirects. Plan §10.1 — confirm or change. |
| G2 🔴 | Audio & Video Producer stock-footage source | Paid APIs (Pexels/Pixabay) are NOT OSS-compliant. Pick: Wikimedia Commons / per-newsroom uploaded asset library / baked-in open-asset bundle. Plan §10.2. |
| G3 🔴 | Audience analytics connectors | Default-persona seed is dropped (2026-05-07 revision). Confirm which pilot newsroom (if any) has real Plausible/Umami/GA data to wire up at Slice-pilot time. Plan §10.3. |

---

## Suggested order

1. **A1 + A2** (1 hour) — flip the topic-hint and style-fingerprint flags after a quick eyeball. Cheapest wins.
2. **B1** (½ day) — topic-taxonomy editor sub-section. Establishes the pattern.
3. **B2 + B3 + B4** (1 day total) — template-copy the pattern for trusted-sources, crawl-rules, fingerprint button.
4. **C1** (½ day) — crawl-trigger UI in dossier detail. Closes Step 3 for the editor.
5. **F1 + F2 + F3** (1 day total) — seed the 5 pilot newsrooms.
6. **D1 + D2** (1¼ day) — archive auto-merge polish.
7. **E4** (1 day) — pin the archive smoke flows as proper tests.
8. **G1, G2, G3** — surface for explicit Paul decision before Slice pilot.

That puts pilot-ready at ~5–6 working days of build, plus your decision time
on G1/G2/G3, plus whatever Lightsail deploy ends up taking (post-pilot bucket).

The D4 / D5 / E1 items can move to post-pilot without harm — flagged here
so they don't get forgotten.
