# Consolidation plan — the four lifts that pay off

A calm, step-at-a-time execution plan for the four pieces from the sibling-app survey that are worth doing. Everything below is **additive, reversible, designed for scale across African newsrooms, and gated by Paul-confirms-before-next-step**.

The earlier menu-style survey is preserved in git history.

---

## The four

1. **Topic taxonomy** (`topics_keywords.yml`) — pan-African default + per-newsroom overrides → Copywriter relevance signal.
2. **pg-boss** — background-job runner. Real infra gap.
3. **Researcher scraper + crawler** — closes the gap between Researcher's agent description and its actual capability. Split across two execution steps (single-page first, async crawler second). Trusted-sources allowlist follows the default + overrides pattern.
4. **Style-fingerprint extractor** — quantified house-style dimensions learned from each newsroom's past content, stored per-newsroom, complementing the editor-authored voice fields.

---

## Cross-cutting principle: pan-African default + per-newsroom overrides

Grounded ships to African newsrooms broadly — primary markets SA / Zimbabwe / Zambia / Kenya, scaling further post-pilot. Every editable corpus in this plan follows the same shape:

- A **pan-African default** lives as a YAML file in the repo (`config/*.default.yml`). Curated to be broadly applicable to any African newsroom doing journalism.
- A **per-newsroom override** lives in `newsroom_profile.metadata` JSONB (existing migration 014 — the column is documented as "for extensions without future migrations"). Each newsroom's AI champion can add/remove keywords or sources without code changes.
- At runtime a small merge function combines `default ⊕ override` and returns the effective set. The override always wins on conflict.
- The newsroom-profile editor UI surfaces these as editable sub-sections so non-developers can maintain them.

This is one tiny module (`lib/newsroom-profile/merge-overrides.js`) shared by topics (Step 0), trusted sources (Step 2), and any future similar lists. Write it once; reuse across the plan.

---

## Order, and why

Smallest and most-isolated first. Infrastructure second. Capability third. Product-shape change last.

| # | Step | Risk | Reversible? | Touches existing agents? |
|---|---|---|---|---|
| 0 | Topic taxonomy (default + overrides) + Copywriter relevance scorer | very low | yes — single file revert + one-liner SQL to clear overrides | reads from Drafter; doesn't change its contract |
| 1 | pg-boss install + worker scaffold + smoke test | low | yes — uninstall + drop pgboss schema | no |
| 2 | Researcher single-page scrape + trusted-sources (default + overrides) | medium | yes — new module, new endpoint, no schema changes | Researcher gains an optional new input path; existing `analyzeText` untouched |
| 3 | Researcher deep crawler (async via pg-boss) + per-newsroom crawl rules | medium | yes — new module + one new table + two new job types | same as #2 |
| 4 | Style-fingerprint extractor for newsroom_profile | medium | yes — new module + JSONB metadata write, no schema migration | Drafter / Producer / Fundraiser read `formatForPrompt()` which optionally appends a fingerprint block; no input/output contract change |

Each step is a single commit Paul reviews before the next starts. No step modifies an already-shipped agent's `inputs`/`outputs`/`config` registry schema (which would break workflows already saved with those keys).

---

## Step 0 — Topic taxonomy + Copywriter relevance scorer

**Goal:** give Copywriter a simple, editable signal for whether an angle is on-brand for the newsroom. Pan-African default ships with the repo; each newsroom extends or trims it.

**Adds:**
- `config/topic_tags.default.yml` — pan-African baseline. ~10 topic buckets (politics & governance / economy & trade / climate & environment / health / conflict & security / media freedom / Africa-world relations / justice & rule of law / gender & society / technology & innovation) + utility lists (`strong_verbs`, `attribution_words`). ~150 lines.
- `lib/newsroom-profile/merge-overrides.js` — generic deep-merge: `mergeWithOverrides(defaultObj, overrideObj) → mergedObj`. Used by this step and Step 2. ~40 LOC.
- `lib/agents/copywriter/topic-tags.js` — loads default YAML once at boot; exports `getEffectiveTopics(newsroomId)` which merges with per-newsroom overrides from `newsroom_profile.metadata.topic_tags`; exports `scoreArticle(text, effectiveTopics) → { topics: { politics_governance: 0.42, ... }, strong_verbs_per_100: 2.1, attribution_density: 1.3 }`. Pure function, no Claude, no external calls.
- Tests: empty-text → all zeros; known-politics text → that bucket > 0; override adds a custom keyword and a follow-up score reflects it.

**Doesn't touch:**
- `lib/agents/drafter.js` registry entry. No new input field, no new config key.
- `newsroom_profiles` table schema. Overrides go into the existing `metadata JSONB` column.
- Any existing migration.

**How Copywriter uses it:** in a follow-up small commit (Step 0.5), Drafter's user-message builder optionally includes a one-line `Topic match: politics_governance 0.42, climate_environment 0.18` block. Behaviour with the line absent is unchanged. Toggle via env var `GROUNDED_TOPIC_HINT=on` for the first commit; flip on after Paul reviews real outputs.

**Editor UI:** deferred to Step 0.6 — a "Topic taxonomy" sub-section in the newsroom-profile editor page where the AI champion can add custom topics or extra keywords for the existing topics. Until that lands, overrides can be set via SQL or a one-off seed.

**Reverse:** `git revert` of the commit; `UPDATE newsroom_profiles SET metadata = metadata - 'topic_tags';` to clear overrides. No migrations to roll back.

**Validation:**
- Unit tests pass.
- `node -e "(async()=>{const t=require('./lib/agents/copywriter/topic-tags');console.log(await t.getEffectiveTopics(null));console.log(t.scoreArticle('Zimbabwe parliament debates new media regulation',{}));})()"` prints sensible scores.
- Hit `/api/agents/drafter` with `GROUNDED_TOPIC_HINT=on` — confirm output still parses as JSON and isn't materially worse than today.

**Confirm-before-next gate:** Paul eyeballs the default YAML. Likely wants to add / re-name buckets (e.g. "Africa-world relations" might split into AfCFTA / China-Africa / diaspora). One file edit, no code change.

**Est. effort:** 3–4 hours including the merge helper, which Step 2 reuses.

---

## Step 1 — pg-boss

**Goal:** add a Postgres-backed job runner so Researcher's crawler (Step 3), Social listener polling (future), and any long-running Producer mix work can be async without holding HTTP connections open.

**Adds:**
- `pg-boss` to `dependencies` in `package.json`. Single dep, peer-clean on `pg`.
- `lib/jobs/boss.js` — thin wrapper around pg-boss: `getBoss()` returns a singleton initialised against `DATABASE_URL`; `enqueue(name, data, opts)` (always carries `newsroomId` in `data` for multi-tenant traceability); `subscribe(name, handler)`. Wraps pg-boss's lifecycle.
- `scripts/jobs/worker.js` — standalone worker process: `node scripts/jobs/worker.js` boots, calls `getBoss()`, registers handlers. Empty registry at first; handlers land in Step 3 and Step 4.
- `npm run worker` script in `package.json`.
- A short paragraph in `docs/HANDOFF.md §5` covering the dev-time start order: `npm run dev` for the web app in one terminal, `npm run worker` in another.

**Doesn't touch:**
- Any existing migration or table.
- Any existing agent code.
- The web app's behaviour — the worker is a separate process; the web app can call `enqueue(...)` but there are no handlers yet so nothing fires.

**Multi-tenant-safe by construction:**
- pg-boss creates a `pgboss` schema on first call — isolated from `public.*`.
- Every job's data payload carries `newsroomId`. Handlers check it before doing work, the same way HTTP routes do.
- Jobs from different newsrooms run in the same queue but never share state.

**Reverse:**
- `npm uninstall pg-boss`.
- `DROP SCHEMA pgboss CASCADE;` — drops only pg-boss's own tables; ours untouched.
- Revert the four new files.

**Validation:**
- Smoke job: enqueue `{ name: 'smoke', data: { newsroomId: 'test', hello: 'world' } }`. Worker logs it. Done.
- Confirm `pgboss` schema exists in psql; confirm `public.*` tables unchanged.

**Confirm-before-next gate:** Paul runs the smoke job locally on his Mac (Postgres on port 5433). We don't move on until it works.

**Est. effort:** 2–3 hours.

---

## Step 2 — Researcher single-page scrape + trusted-sources

**Goal:** close the gap between Researcher's agent description ("Pulls and scrapes public records, court filings, regulatory disclosures, and financial documents") and its actual code (which currently only analyses pasted text). Single-page only; async crawl is Step 3. Trusted-sources allowlist follows the pan-African default + per-newsroom overrides pattern.

**Adds:**
- `lib/research/scrape.js` — exports `scrapeUrl(url, { timeoutMs })` → `{ url, title, text, fetchedAt, contentHash, byteSize, contentType, trustedSource: boolean, trustedReason: string|null }`. Implementation: `axios` for HTTP, `cheerio` for HTML parsing, article-text extraction via common selectors (`article`, `main`, `[role=main]`, `.entry-content`, `.post-content`, `.story-body`) with a sensible fallback. Strip `<script>` / `<style>` / nav / ads. Normalise whitespace. Capture `<title>`.
- `config/trusted_sources.default.yml` — pan-African baseline. Pan-continental wire outlets (Reuters Africa, AFP, BBC Africa, AP Africa, Bloomberg Africa, AllAfrica) + major outlets per primary market (SA, ZW, ZM, KE) + key Nigeria / Ghana / Ethiopia / Senegal / DRC outlets + global reference (Niemanlab, Poynter, Reuters Institute) + the major official-records hosts (StatsSA, ZimStats, ZamStats, KNBS, CIPC, RBZ, BOZ, CBK, SARB, etc. — pulled from Researcher's existing jurisdiction prompts in `lib/agents/researcher.js`). ~80–120 entries, each annotated with country and outlet type. Editable text file.
- `lib/research/trusted-sources.js` — loads default YAML; exports `getEffectiveAllowlist(newsroomId)` which merges with `newsroom_profile.metadata.trusted_sources` overrides; exports `checkUrl(url, allowlist) → { trustedSource: boolean, reason: string|null }`. Reuses `mergeWithOverrides` from Step 0.
- `axios` and `cheerio` to `dependencies`.
- `app/api/research/scrape/route.ts` — POST `{ url }` → calls `scrapeUrl`, returns the scrape result without persisting (persistence into a dossier comes in Step 3 when async makes sense).
- A short integration with the existing Researcher registry: `lib/agents/researcher.js` gains a **second optional input** `sourceUrl` (no `required` flag, default unset). When supplied, the agent calls `scrapeUrl` first, uses the resulting text as `documentText`. Existing `documentText` input remains the primary path. All existing workflows continue to work unchanged because no field is renamed or removed.

**Doesn't touch:**
- The existing `analyzeText` function. Same prompt, same JSON shape, same DB writes.
- Any existing migration.
- Any other agent.
- The allowlist does NOT block scrapes of non-listed URLs — it just sets `trustedSource: false` and returns the result. Editors can scrape anything; the model gets a hint about credibility.

**Network safety (multi-tenant-friendly defaults):**
- Rate-limit: 1 request / 1s per host (in-process token bucket; no Redis). Per-newsroom rate-limit is overengineering at MVP volume; add later if a newsroom abuses it.
- `User-Agent: Grounded/0.x (https://grounded.example) Researcher/1.0` — identifiable, not browser-mimic.
- 20s hard timeout per fetch. Max 5 MB body. Reject `Content-Type` not in `text/html`, `text/plain`, `application/xhtml+xml`.
- Respect `robots.txt` for the initial fetch.

**Editor UI:** deferred to Step 2.5 — a "Trusted sources" sub-section in the newsroom-profile editor where AI champions add local credible sources or remove ones that don't fit. Same pattern as Step 0's topic taxonomy.

**Reverse:** revert the new files; remove `axios` + `cheerio` from package.json; `UPDATE newsroom_profiles SET metadata = metadata - 'trusted_sources';` to clear overrides. The Researcher registry's `sourceUrl` input loses its slot; saved workflows that referenced it would simply have an ignored extra field.

**Validation:**
- Unit-ish: `scrapeUrl('https://www.niemanlab.org/')` returns non-empty `text` ≥ 500 chars.
- Trust-list: confirm a Reuters Africa URL returns `trustedSource: true`; a random blog returns `false`.
- Override: insert a per-newsroom override adding `mydomain.test`; confirm `getEffectiveAllowlist(newsroomId)` includes it.
- End-to-end: POST `/api/research/scrape` → see JSON. POST `/api/agents/researcher` with `sourceUrl` and no `documentText` → see entities extracted from the scraped page. POST with `documentText` only → unchanged behaviour.

**Confirm-before-next gate:** Paul scrapes 5–8 URLs across the spectrum (Reuters Africa, a local African paper, a government PDF, a paywalled site, a SPA-heavy news site, a court filing PDF). Decides:
1. Extraction quality good enough for the common case?
2. SPA-heavy sites likely fail — do we ever need a headless browser? Worth knowing now.
3. Does the trusted-sources default need African newsroom outlets we're missing?

**Est. effort:** 5–7 hours including the allowlist, rate-limit, robots check, override merge, and the registry wire-up.

---

## Step 3 — Researcher deep crawler + per-newsroom crawl rules

**Goal:** turn the single-URL scrape into a multi-page crawl — given a homepage / archive URL, discover article links, fetch and extract each, persist into a dossier. Async via pg-boss so the editor isn't blocked. Each newsroom can supply crawl rules (e.g. "ignore /podcasts/", "treat /breaking/ paths as priority").

**Adds:**
- `lib/research/crawl.js` — exports `discoverLinks(homepageUrl, { maxLinks, sameHostOnly, rules })` → `string[]`. Heuristics adapted from market's deep crawler. Same-host by default. Honours per-newsroom include/exclude path patterns from `rules`. Dedupe + sort newest-first when URL date patterns are discoverable.
- `db/migrations/028_research_crawl_jobs.sql` — new table `research_crawl_jobs`: `id`, `newsroom_id` FK, `dossier_id` FK (nullable for ad-hoc), `homepage_url`, `status` (`pending` | `running` | `completed` | `failed`), `total_urls`, `processed_urls`, `failed_urls`, `started_by`, `started_at`, `finished_at`, `error`, `rules JSONB` (snapshot of the rules used so future re-crawls can reproduce).
- `lib/jobs/handlers/research-crawl.js` — pg-boss handler for job type `research:crawl`. Reads the job row, resolves effective crawl rules (default + per-newsroom override from `newsroom_profile.metadata.crawl_rules`), calls `discoverLinks`, enqueues a `research:scrape-one` sub-job per discovered URL with the same `newsroomId`. Each `research:scrape-one` handler calls Step 2's `scrapeUrl` and persists into `research_documents` (existing migration 010 — verify column shape against the scrape result).
- `scripts/jobs/worker.js` extended to register both handlers.
- `app/api/research/dossiers/[id]/crawl/route.ts` — `POST { homepageUrl, maxLinks }` → inserts a `research_crawl_jobs` row, enqueues a pg-boss job, returns the job id. Auth-scoped: 403 if the dossier isn't in the user's newsroom.
- `app/api/research/crawl/[id]/status/route.ts` — `GET` → returns the crawl job row for UI polling. (SSE / WebSocket can come later if UI performance demands it.)

**Doesn't touch:**
- Step 2's `scrapeUrl`. The crawler is a layer on top.
- Existing dossier UI / endpoints — the crawl endpoint is new alongside them.
- Any other agent.
- Any user-mode workflow surface initially. Crawl is a Builder / editor power-tool, not a workflow node. Could be exposed as a node later if useful — additive.

**Per-newsroom crawl rules shape (`newsroom_profile.metadata.crawl_rules`):**
```json
{
  "exclude_paths": ["/podcasts/", "/sponsored/", "/advertorial/"],
  "include_paths_only": null,
  "priority_paths": ["/investigations/", "/breaking/"],
  "max_links_per_crawl": 25,
  "respect_robots": true
}
```
Newsroom-specific defaults sensible at the cohort level. Editable later via the newsroom-profile UI.

**Reverse:**
- Stop the worker or unregister the two handlers.
- `DROP TABLE research_crawl_jobs;`.
- `UPDATE newsroom_profiles SET metadata = metadata - 'crawl_rules';`.
- Flush pg-boss queues: `b.purgeQueue('research:crawl')` and `b.purgeQueue('research:scrape-one')`.

**Validation:**
- Unit: `discoverLinks` on a few known archive pages (a substack-style site, a WordPress paper, a typical African newspaper homepage) returns a sensible link list of correct length. With `exclude_paths: ['/podcasts/']`, no podcast URLs appear.
- Integration: `POST /api/research/dossiers/<existing-id>/crawl` with `{ homepageUrl: 'https://www.niemanlab.org/', maxLinks: 5 }`. Poll status; after a few seconds see `processed_urls: 5, status: 'completed'`. Dossier now has 5 new documents.
- Failure path: feed an invalid URL. Job ends `status: 'failed'`, dossier unchanged, no zombie sub-jobs.
- Multi-tenant: enqueue crawls from two different newsrooms concurrently. Confirm neither sees the other's results.

**Confirm-before-next gate:** Paul crawls 2–3 real African newsroom sites (a ZimZam pilot site + one from SA + one from Kenya). Reviews quality of extracted articles. Decides whether per-newsroom rules need extension (e.g. a JSON-Schema-validated `selectors` block to override the default article-text selectors per-site — easy to add later).

**Est. effort:** 1–1.5 days. The async fan-out, sub-job tracking, and rules merging are the bulk of it.

---

## Step 4 — Style-fingerprint extractor for newsroom_profile

**Goal:** add a quantified style fingerprint alongside the editor-authored `voice` / `style_notes` / `ethics_policy` fields. Drafter, Producer, and Fundraiser optionally include it in their Claude prompts. Editor-authored fields remain the primary voice signal; the fingerprint adds a data-grounded second voice. Both can disagree — the prompt will show both and Claude weights them.

**Conceptual shift to acknowledge:** the profile moves from *"what the editor says we sound like"* to *"what the editor says we sound like, **and** what the data says we sound like."* Editor-authored fields are not replaced. Nothing the editor wrote is ever overwritten by the analyser.

**Adds:**
- `lib/newsroom-profile/style-fingerprint.js` — pure-JS analyser. Input: `{ texts: [{ text, [title], [publishedAt] }] }`. Output: structured JSON. No Claude, no external API; deterministic, fast, runs locally. ~300–400 LOC + tests.
- Dimension set (pan-African newsroom-general; not tuned to any one newsroom):
  - **Sentence rhythm** — median + variance of sentence length in words
  - **Paragraph rhythm** — median + variance of paragraph length in words
  - **Vocabulary register** — average word length; ratio of words >7 chars
  - **Voice ratio** — passive vs active rate (regex on `was/were/been + past participle`)
  - **Hedge density** — `may`, `could`, `reportedly`, `alleged`, `appears to`, `is said to` per 100 words
  - **Attribution style** — frequencies of `said X` vs `according to X` vs `X told the [paper]` patterns
  - **Quote ratio** — % of sentences containing a direct quote
  - **Time-anchor density** — relative-time references (`yesterday`, `this week`, `in 2023`) per 100 words
  - **Numerical density** — numbers per 100 words
  - **Acronym density** — ALL-CAPS tokens (≥3 chars) per 100 words
  - **Place-name density** — proper nouns matched against a small African geo gazetteer + the newsroom's `geography[]` list from migration 014
  - **Headline length** — median word count when titles are supplied
  - **Lede openers** — top-5 most-common first-three-word patterns (auto-learned per-newsroom)
  - **Repeated phrases** — top-10 trigrams/quadgrams, the newsroom's verbal tics (auto-learned per-newsroom)
- `lib/jobs/handlers/style-fingerprint.js` — pg-boss handler for job type `newsroom-profile:compute-fingerprint`. Reads either `{ documentIds: [...] }` from `archive_documents` or `{ texts: [...] }` for ad-hoc. Calls the analyser, writes to `newsroom_profile.metadata.house_style_fingerprint = { dimensions, computed_at, source_count, source_sha }`. ~50 LOC.
- `app/api/newsroom/style-fingerprint/route.ts` — `POST /api/newsroom/style-fingerprint/compute` enqueues a job; `GET /api/newsroom/style-fingerprint` returns the current fingerprint from `newsroom_profile.metadata`.
- Optional extension to `formatForPrompt()` in `lib/newsroom-profile.js`: when `metadata.house_style_fingerprint` exists, append a compact `Quantified style:` block at the end of the formatted prompt. ~15 LOC. Gated by env var `GROUNDED_STYLE_FINGERPRINT_IN_PROMPT=on` for the first commit; flip on after Paul reviews outputs.
- A simple UI affordance in the newsroom-profile editor page: a "Compute house-style fingerprint from archive" button + read-only display of the resulting dimensions. Editor never edits the fingerprint by hand — they re-run the job when the archive changes substantially.

**Doesn't touch:**
- `newsroom_profiles` table schema. Migration 014's `metadata JSONB DEFAULT '{}'` is explicitly designed for "extensions without future migrations."
- `voice`, `style_notes`, `ethics_policy`, or any other editor-authored field. The fingerprint is **additive**, never overwriting.
- Any agent's `inputs`/`outputs`/`config` registry schema. The fingerprint enters via `formatForPrompt()` which agents already call — no contract change.
- Existing workflows. Behaviour with `GROUNDED_STYLE_FINGERPRINT_IN_PROMPT=off` is byte-identical to today.

**Per-newsroom by construction:** the fingerprint is computed from each newsroom's own archive and stored on each newsroom's profile. No cross-tenant data flow. The dimensions and the analyser are pan-African journalism-general; only the *values* are newsroom-specific.

**Reverse:**
- Flip the env var off → prompts revert immediately.
- Revert new files.
- One SQL one-liner: `UPDATE newsroom_profiles SET metadata = metadata - 'house_style_fingerprint';`. JSONB removal, no migration.

**Validation:**
- Unit tests: hand-crafted terse-vs-flowery sample texts produce materially different sentence-rhythm + vocabulary-register dimensions.
- Integration: compute fingerprint from 20–50 real articles from one pilot newsroom. Paul eyeballs the JSON — does it match his read of that newsroom's voice?
- Round-trip: with `GROUNDED_STYLE_FINGERPRINT_IN_PROMPT=on`, run Drafter on the same article twice (fingerprint present vs absent). Confirm outputs shift toward those parameters when present, and the without-fingerprint output is unchanged.
- Multi-tenant: compute fingerprints for two different newsrooms; confirm each is stored on its own profile row and neither's prompt leaks to the other.

**Confirm-before-next gate:** Paul reviews real fingerprints from 2–3 newsrooms (different scales / voices) and decides:
1. Whether the dimension set is right (add / drop / rename).
2. Whether the prompt-injection block reads well to Claude — too-precise numbers may make the model rigid; banded labels ("short sentences" vs "median 12.4 words") might land better. Raw stored, banded shown.
3. Whether re-computation should be manual-only (button click) or auto-triggered when N new archive docs accumulate.

**Est. effort:** ~1 day for the analyser + tests + endpoint + handler + UI button. The dimension list benefits most from iteration with real fingerprints.

---

## What's not in this plan, and why

**Smart-mix audio constants (P1), per-segment language detection (P2), BM25 hybrid retrieval (R3), QA-gen prompt (R4), Drive section-detector (O1).**
Each useful in its own slice but none urgent. Pull from the git-history version of the long survey if/when those slices open.

**`lib/storage/drive.js` parser.**
Didn't actually read it. May already do section-splitting. Worth a 10-minute glance the next time anyone's in that file; out of scope for this plan.

**Anchor-as-multi-tenant-SaaS performance work** — connection-pool sizing, per-newsroom rate-limits, queue priority lanes, etc. Not relevant until the platform has >20 active newsrooms and real load. Premature today.

---

## Decisions (settled 2026-05-12)

1. **Topic buckets** — keep the 10-bucket pan-African starter as listed.
2. **Trusted sources** — Claude drafts the starter list (~80–120 outlets); Paul red-pens.
3. **pg-boss worker** — runs in dev via `npm run worker`. No deploy box yet.
4. **Researcher `sourceUrl`** — input field on the Researcher agent (per-run value, not a saved config).
5. **Crawl defaults** — same-host only / honour robots.txt / max 10 links per crawl.
6. **Style fingerprint dimensions** — keep all 15 as listed.
7. **Style fingerprint prompt format** — banded labels shown to Claude (`Sentences: short`), raw numbers stored in `metadata.house_style_fingerprint` for editor inspection.
8. **Editor UI for overrides** — drop new collapsible sub-sections into the existing newsroom-profile editor page (Topic taxonomy, Trusted sources, Crawl rules). No separate config page.

Each step ends in a single commit Paul reviews; no chaining.
