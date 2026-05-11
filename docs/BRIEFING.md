# ANCHOR — CLAUDE CODE BUILD BRIEFING

> Pasted verbatim from Paul's briefing on 2026-05-04. The file lives in the repo so the project is self-contained — any future contributor (human or AI) can read this without external context.

---

## WHAT THIS BRIEFING IS FOR

You are building Grounded in a fresh directory. New project. Fresh git repo (initialise it yourself; do not copy a .git folder from anywhere). Build incrementally with confirmation at each stage, the same way Paul works on Surepath.

Past infrastructure exists across several of Paul's codebases. Reference it where useful — to lift battle-tested code, to copy schemas, to reuse patterns. Don't reinvent what already works. But don't refactor anything that's currently in production.

The deliverable is a working Grounded MVP that the pilot ZimZam newsrooms can use. Not a report. Not a scaffold. Working software, shipped in confirmed steps.

Read this whole document before starting. Ask the questions at the bottom before touching code.

---

## WHAT ANCHOR IS

Grounded is a web platform for African newsrooms. It is the flagship of GROUNDED, which is Develop AI's practice on data — both harnessing newsroom data and defending against data exploitation.

Grounded combines two things in one product:

1. **An agent execution layer.** Newsrooms use it to run AI workflows against their own content — verifying material, archiving stories, drafting outputs. Three MVP agents: Verifier, Archivist, Copywriter.
2. **A governance layer.** This encodes Paul's methodology for ethical, jurisdiction-aware AI implementation. POPIA. Zimbabwe Cyber and Data Protection Act. Zambia Cyber Security Act. Press codes. Donor compliance. Tool evaluation frameworks.

The agent layer is what newsrooms touch every day. The governance layer is what makes Grounded different from any other workflow tool — it knows where each newsroom is, what laws apply, what their funders require, and flags issues before they become incidents.

### WHO IT IS FOR

Independent African newsrooms. The pilot is the five ZimZam newsrooms, all simultaneously:

- Capital FM 99.7 (Lusaka, Zambia)
- EnviroPress Zimbabwe
- MakanDay Media Centre (Zambia)
- Maricho Media (Zimbabwe)
- VicFallsLive (Zimbabwe)

After the pilot, Grounded scales to other Develop AI training cohorts and to TRF / DW Akademie / IMS programme partners.

### WHERE IT SITS IN THE PORTFOLIO

Develop AI is the umbrella company.
GROUNDED is one practice under Develop AI — the data practice.
GROUNDED has five expressions: Grounded (this), Tracker (live), Awareness (data exploitation defence in SA schools), MediaMap (research mapping every Develop AI-trained newsroom), and training cohorts.
Surepath sits separately under Develop AI, not under GROUNDED. Don't confuse the two.

---

## THE PRODUCT IN DETAIL

### TWO MODES

**Builder mode.** Used by the AI champion in each newsroom — the person Paul has trained to lead AI adoption internally. The builder composes workflows by stringing together agents, prompts, knowledge sources, and outputs. Workflows are saved and named.

**User mode.** Used by the rest of the newsroom team. They run the workflows the builder has composed. They don't see the agent plumbing — they see a button that says "verify this story" or "find related archive material" or "draft a social copy from this article".

This separation matters. The builder needs power and configurability. The user needs a tool that doesn't require any AI literacy beyond clicking a button.

### THE MVP AGENTS

Three to ship first. The product can grow agents later but the MVP is these three:

- **Verifier.** Fact-checks claims in submitted material. Flags AI-generated content. Cross-references against the newsroom's own archive and trusted external sources. Outputs a verification report with confidence indicators.
- **Archivist.** Ingests the newsroom's existing material into a searchable knowledge base (RAG). Tags, indexes, makes retrievable. Lets the newsroom answer "have we covered this before, and what did we say". The archive is per-newsroom and private to that newsroom.
- **Copywriter.** Assists with drafting under editorial oversight. Social copy. Newsletter blurbs. Headline alternatives. Translation to local languages. Always positioned as draft-only — the newsroom signs off.

### SLUGS AND AGENT SETS

A slug is an agent set — a named bundle of agents configured for a specific use case. Example slugs:

- "Election coverage" slug = Verifier configured for political claims + Archivist scoped to election coverage + Copywriter set to formal news register
- "Investigative" slug = Verifier with stronger source-checking + Archivist with broader date range + Copywriter set to long-form

The builder composes slugs. The user picks a slug for their task.

### THE SHARED WORKFLOW LIBRARY

This is the network effect. Any workflow built by any pilot builder becomes available across all five pilot newsrooms via a shared library. So if Capital FM's AI champion builds a great fact-checking flow for environmental claims, EnviroPress can use it tomorrow.

The shared library has implications worth thinking about:

- **Privacy.** The workflow definition is shared. The newsroom's own content and credentials are not. A workflow says "use the newsroom's Archivist with these prompts and these output settings" — it doesn't carry one newsroom's data into another.
- **Attribution.** Workflows show who built them. Builders earn credibility across the network.
- **Versioning.** Workflows evolve. Forks are allowed.
- **Moderation.** Paul probably needs an admin role that can promote, demote, or remove workflows from the shared library. For the MVP, a flat shared list with attribution is enough — full versioning and moderation can come in v2.

### MULTI-TENANCY

Five newsrooms, isolated from each other for content but sharing the workflow library. So:

- **Per-newsroom:** users, content, archive, audit log, workflow runs, credentials
- **Cross-newsroom:** workflow definitions (the shared library), plus probably a global agent registry

This is the architectural backbone. Get this wrong and the privacy story collapses.

### GOVERNANCE LAYER

Three pillars:

1. **Governance and compliance.** Per-jurisdiction regulatory layer. POPIA for SA, Zimbabwe Cyber and Data Protection Act for Zim, Zambia Cyber Security Act for Zambia. Each newsroom is loaded with its applicable jurisdiction pack. The system flags AI use that conflicts with its loaded regulations.
2. **Ethical tool evaluation.** Paul's curated framework for assessing third-party AI tools (the same methodology he teaches in cohorts). Encoded as a RAG knowledge base.
3. **Implementation pathways.** Structured guidance for "how this newsroom should approach this kind of AI problem", drawn from Paul's GROUNDED and ZimZam programme logic. Also encoded as RAG content.

The governance layer is consultative — it doesn't block actions, it advises and logs.

### AUDIT LOG

Every workflow run leaves an audit trail. What ran, who ran it, what the AI saw, what it produced, what governance flags fired. This is exportable as a compliance report — useful for funders, press councils, donor compliance, and for the newsroom's own internal review.

### DELIVERY SURFACE

Mobile-first web app. PWA, not native. Journalists open it in the browser, add to home screen, get a near-native experience. WhatsApp for outputs that need to land where journalists already are (drafts, archive search results, workflow notifications).

---

## TARGET STACK

- Node.js (CommonJS at root, matching Surepath)
- Next.js (App Router — ESM inside `app/`, hybrid is fine)
- PostgreSQL
- Anthropic SDK
- AWS Lightsail (deployment deferred — local dev first)
- AWS S3 (newsroom-uploaded content; mirrored to Drive per newsroom)
- Twilio / WhatsApp Business API (deferred to post-MVP)
- Roll-our-own auth (Holly's pattern)

JusticePro and SmartGuard are parked products and not in scope. If you find code from either, ignore them.

---

## INTEGRATIONS (DECIDED 2026-05-04)

Grounded is NOT standalone. It works in unison with:

- **Airtable** (Develop AI base, `app4FVlF4AAy8Q8s2`) — read newsroom directory ON DEMAND from `Newsrooms` table; write Activity Log rows with `Stream=Grounded` for high-signal events. Postgres holds the full forensic audit log; Activity Log gets summary rows only.
- **Google Drive** — methodology + jurisdiction packs ingested into governance RAG. Newsroom uploads stored in S3 (primary) AND mirrored to Drive per-newsroom folder.

---

## PAST INFRASTRUCTURE TO PULL FROM

Paul has multiple existing codebases. Treat all of them as **read-only references** during the build. If you want to extract code from a live codebase into a shared module, propose it explicitly and wait for Paul's go-ahead.

- **SUREPATH (live — do not modify).** Repo: github.com/pauldevelopai/surepath. Hosted: AWS Lightsail (`surepath-prod`, `af-south-1`). Has working, production-tested versions of: Claude API wrapper with retry logic, RAG infrastructure, Claude Vision integration with WHY chain reasoning, PostgreSQL pool/schema patterns, Twilio/WhatsApp webhook handler, AWS S3 file storage, admin dashboard, webhook handler patterns, cost/usage logging.
- **ZIMZAM NEEDS ASSESSMENT TOOLS (local).** Output documents (per-newsroom assessments) are more valuable than the code — they describe each newsroom's context, constraints, and AI priorities, and feed directly into how Grounded is configured per pilot newsroom. Located on Drive (5 numbered .docx files: 1_Capital_FM, 2_EnviroPress, 3_MakanDay, 4_Maricho_Media, 5_VicFallsLive).
- **HOLLY (Node + Express + React, on disk).** The auth model and Postgres schema are the most likely things to draw from. Also: googleapis usage pattern, background-jobs queue.
- **OTHER LOCAL PROTOTYPES.** Paul will point you to anything relevant.
- **TRACKER PROTOTYPES (possibly local).** Tracker is a separate live GROUNDED product. Earlier prototypes may inform Grounded's compliance/regulation tracking.

### CATEGORIES OF REUSE

Classify every reuse before lifting:

1. **LIFT-AS-IS.** Code that copies into Grounded with minimal modification.
2. **EXTRACT TO SHARED MODULE.** Code currently inside Surepath that should become a shared library both Surepath and Grounded depend on. Requires coordinating with Surepath's deployment — flag and wait for Paul's go-ahead.
3. **REFERENCE / METHODOLOGY.** Approaches Grounded should adopt where the actual lines won't carry across.
4. **SCHEMAS / DATA.** Database schemas, JSON shapes, RAG document structures.
5. **METHODOLOGY ASSETS.** Non-code: ZimZam needs assessments, GROUNDED methodology docs, jurisdiction compliance research, ethical AI frameworks. These become Grounded's RAG knowledge base.

For each significant reuse, log it briefly in `REUSE.md` so Paul can see what was lifted from where.

---

## WHAT IS OFF-LIMITS

- Do not modify Surepath. It serves real customers.
- Do not run anything that touches a live database or live API during investigation work. All reading is read-only.
- Do not commit secrets. Use `.env` (gitignored).
- Do not invent features that aren't in this briefing. If something feels missing or unclear, ask Paul.

---

## BUILD APPROACH

Fresh directory. Fresh git repo. Step-by-step with confirmation at each step. Same way Paul works on Surepath.

- **Step 0.** Set up. Create directory, git init, npm init, .env, .gitignore, README. *(Done 2026-05-04.)*
- **Step 1.** Walk through past infrastructure. Locate each codebase. Read the high-value ones (Surepath, ZimZam tools, Holly). Build a mental model of what's reusable. No Grounded code yet.
- **Step 2.** Confirm core architecture decisions. *(Most done 2026-05-04 — Next.js hybrid, Postgres, roll-our-own auth, new Lightsail later, Airtable + Drive integration.)*
- **Step 3.** Build the multi-tenancy backbone. Schema for newsrooms, users, content scoping, audit log. The architectural commitment everything else depends on.
- **Step 4.** Build the agent execution layer. One agent at a time. Verifier first (smallest), then Archivist (RAG-heavy), then Copywriter.
- **Step 5.** Builder mode and user mode UIs in parallel with the agents. Function over form.
- **Step 6.** Workflow library. Per-newsroom workflows first. Then cross-newsroom shared library with attribution (flat, no moderation in v1).
- **Step 7.** Governance layer. Jurisdiction packs. RAG over methodology docs. Audit log integration.
- **Step 8.** Delivery layer. WhatsApp output. Email fallback. *(Deferred — MVP ships without WhatsApp.)*
- **Step 9.** Pilot deployment. First 3 newsrooms, then 2 more.

At each step: confirm with Paul before proceeding to the next. Use feature flags so a half-built feature doesn't break the half that works. Reversible changes only.

### CONSTRAINTS THAT SHAPE EVERY STEP

- **Additive-first.** New code, new tables, new modules. Don't restructure across Grounded and Surepath in the same change.
- **Reversible.** Every change can be rolled back without data loss.
- **Codebase investigation before writing.** Look at how Surepath does the equivalent thing before writing Grounded's version.
- **No greenfield rewrites of working code in past projects.**
- **Honest scoping.** If a feature looks bigger than the briefing implies, flag it before building.
