# Newsroom Appliance — real execution implementation plan

**Status:** drafted 2026-05-19. Awaiting Paul's go-ahead on Slice α.
**Origin:** V2 Step 6.x close-out — the second half of the reviewer's Step 5 follow-up. The protocol + signing + central-app integration + installer were shipped in V2 Step 6 (commit `ac0b9fe` + Slice from this session). The execution backend itself is still a STUB.

---

## What this slice closes

The concept note's federated-architecture claim: *"For sensitive data we will work with open-source LLM models that will run locally. Sensitive inference happens on the newsroom's own appliance."*

Today: the central app correctly classifies sensitive jobs and routes them to a registered appliance. The appliance receives the signed dispatch, validates the signature, and returns a stub response — **no agent actually runs.** Until that's replaced, federation is architecture-in-place, not function.

This plan ships real Ollama-backed agent execution on the appliance against the same `lib/agents/registry.js` the central app uses.

---

## What's already shipped (don't re-do)

- [`db/migrations/035_newsroom_appliance.sql`](../db/migrations/035_newsroom_appliance.sql) — `newsroom_appliances` + `appliance_dispatches` tables
- [`lib/appliance/dispatch.js`](../lib/appliance/dispatch.js) — central → appliance dispatcher with HMAC signing
- [`lib/appliance/sign.js`](../lib/appliance/sign.js) — signRequest / verifyRequest helpers
- [`appliances/agent-runner/server.js`](../appliances/agent-runner/server.js) — Node service skeleton: `/test`, `/workflows/run`, `/agents/run`, `/healthz` endpoints; signature verification; heartbeat to central
- [`appliances/install.sh`](../appliances/install.sh) — cross-platform installer (Mac mini launchd / Linux systemd); installs Node 22+, Ollama, pulls `gemma3:12b`
- [`appliances/README.md`](../appliances/README.md) — operations manual
- Central-app side: `/api/appliances/register`, `/health`, `/test-dispatch`, `/team` admin panel

**Locked rules to preserve:**
1. Haiku 4.5 on cloud / Ollama `gemma3:12b` on appliance — both decided automatically by `lib/sensitivity/classify.js` + `lib/agents/route.js`. No model knob.
2. The same `lib/agents/registry.js` runs the same agent code on both sides. Only the LLM call differs.
3. Sensitive payloads NEVER leave the newsroom perimeter once routed to the appliance.

---

## Sub-slices

Each is one commit Paul reviews before the next starts. Same shape as [`SECURITY_AUDIT_PLAN.md`](SECURITY_AUDIT_PLAN.md) / [`V2_PLAN.md`](V2_PLAN.md).

### Slice α — LLM-call abstraction layer (1-2 days, low risk)

The agent code today calls `lib/claude.js#chat()` directly. To run the same agent on cloud-Haiku or appliance-Ollama without forking the agent files, introduce one thin abstraction:

- New `lib/llm/call.js` — exports `chat({ system, messages, ... })`. On the central app, this just forwards to `lib/claude.js#chat()`. On the appliance, it forwards to `lib/ollama.js#chat()` (which already exists as the fallback path).
- Environment detection: `process.env.GROUNDED_APPLIANCE_MODE === '1'` → Ollama. Default → Anthropic.
- Every agent module changes `require('../claude')` → `require('../llm/call')`. Mechanical, mostly find-and-replace.

**Validation:**
- All 187 tests still pass with `GROUNDED_APPLIANCE_MODE` unset.
- Set `GROUNDED_APPLIANCE_MODE=1` locally, run a single agent — it routes through Ollama and returns a real response (with `usedFallback: false` since this is intentional appliance mode, not Anthropic-outage fallback).

**Doesn't touch:** the registry, the workflow runner, the sensitivity classifier, the routing layer. Pure swap underneath every existing agent.

### Slice β — Real `/agents/run` on the appliance (2-3 days, medium risk)

Replace the STUB in [`appliances/agent-runner/server.js`](../appliances/agent-runner/server.js) for the `/agents/run` endpoint with a real path:

- The appliance imports `lib/agents/registry.js`. Same code, same agent definitions, same `run()` functions.
- Incoming dispatch body shape: `{ slug, input, ctx }` (mirrors what central calls today).
- Resolve the slug, call `agent.run(input, ctx)`. The agent's `chat()` calls go through Slice α's abstraction → Ollama.
- Return `{ ok: true, result, cost, durationMs, executed_on: 'appliance' }` — same shape central already expects.
- Error path: any throw becomes a 500 with `{ error, slug }`. Central records `appliance_dispatches.status = 'failed'`.

**Validation:**
- Stand up the appliance locally on a dev laptop. Register it.
- Mark a workflow input as sensitive (via classifier override or keyword).
- Run the workflow through the central app — dispatch fires, appliance runs the agent against Ollama, result comes back.
- Observatory `workflow_runs.executed_on` reflects `appliance`.
- Tenant isolation: register two appliances, two newsrooms — A's job never hits B's appliance.

**Doesn't touch:** the central agent flow for non-sensitive jobs. They continue to use Anthropic exactly as today.

### Slice γ — Real `/workflows/run` on the appliance (2-3 days, medium risk)

Multi-node workflows are more involved than single-agent runs. The appliance needs to execute the full graph locally:

- Import `lib/workflows/runner.js` (the workflow execution engine) on the appliance. It already calls registry-registered agents, so once Slice β lands, this works by composition.
- Dispatch body shape: `{ workflow_slug, definition, inputs }` (per the existing STUB contract).
- Run the graph end-to-end on the appliance. Persist `workflow_runs` rows locally? **Open question — see below.**
- Return the final node output + per-node costs.

**Open design question (resolve at start of γ):**

The current architecture has all `workflow_runs` rows in the central DB. If the appliance runs a workflow, do those rows:
- (a) Get streamed back to central as metadata-only (no input/output content) so Observatory shows the run happened?
- (b) Stay local on the appliance, with central only knowing "dispatched" + final status?
- (c) Some hybrid — central gets metadata + per-node status, appliance keeps the input/output payloads?

(c) is the strongest privacy story but doubles the schema work. (b) is the easiest to ship but means Observatory's per-newsroom dashboard goes blank for sensitive runs. (a) is the middle ground. **Recommend (a) for the first ship**; revisit if any newsroom objects.

**Validation:**
- Run a 3-node workflow on the appliance end-to-end. All three node outputs are real Ollama responses, not stubs.
- Observatory `/observatory/runs/[id]` shows the multi-node trace for an appliance run (matching the chosen Open-question option).
- Cost rollup: `workflow_executions.total_cost_usd` reflects appliance runs as $0 (Ollama is free; appliance instances are flat-cost hardware).

### Slice δ — Pilot deployment + monitoring (1-2 weeks, real-world)

Not a code slice — this is the actual newsroom install. Pick one tech-comfortable pilot newsroom (EnviroPress in Zimbabwe is the V2 plan's first candidate):

1. Spec the hardware. Mac mini M2 8GB minimum for `gemma3:12b` (≈9GB resident); 16GB+ comfortable. Or Intel NUC. Or a Debian VM if they have on-prem infrastructure.
2. Run `appliances/install.sh` under Paul's supervision.
3. Register the appliance via the central `/team` UI. Capture the signing secret.
4. Test-dispatch a known-no-op agent. Verify round-trip.
5. Flag one real workflow as sensitivity-tagged. Run it. Confirm execution-on-appliance via Observatory.
6. Monitor for a week — heartbeat reliability, dispatch failure rates, response-time delta vs cloud, hardware load.

**Validation:**
- One real pilot newsroom running real sensitive workflows on real hardware for a week.
- The concept note's "data security is crucial" + "federated architecture" claims are now demonstrable to funders.

---

## What's NOT in this plan

- **Multi-newsroom appliance pool** — V2 ships one-per-newsroom. Pool comes later if a newsroom can't afford hardware.
- **Voice cloning / video synthesis on appliance** — out of charter; none in the concept note's V2 scope.
- **Auto-update path for appliances** — V2 install pulls latest from a Grounded repo each install. Self-updating daemon is post-pilot.
- **TLS cert provisioning** — the installer assumes you'll front the appliance with Tailscale / Cloudflare Tunnel / nginx. We're not getting into Let's Encrypt automation.

---

## Effort + sequencing

| Slice | Effort | Cumulative | Risk |
|---|---|---|---|
| α — LLM-call abstraction | ~1-2 days | 2 days | low |
| β — Real /agents/run | ~2-3 days | 5 days | medium |
| γ — Real /workflows/run | ~2-3 days | 8 days | medium |
| δ — Pilot deployment | ~1-2 weeks | 3-4 weeks total | high (real-world variance) |

Confirm-before-next at end of each slice. The original V2 plan budgeted Dec 2026 for Step 6; if pilot deployment lands by then, V2 closes cleanly and grantee charging can start Jan 2027 with federation as a real feature, not a promise.

---

## Open decisions (surface to Paul one at a time as each slice nears)

1. **Slice γ Open question:** workflow_runs rows for appliance executions — central-streams-metadata-only / local-only / hybrid? (Recommend metadata-only first ship.)
2. **Hardware spec:** Mac mini M2 8GB target, or push to 16GB? Driven by which Ollama model V2 ships against — sticking with `gemma3:12b` keeps 8GB feasible; jumping to `gemma3:27b` needs 32GB.
3. **Quality delta acceptance:** if the gemma3:12b output is meaningfully worse than Haiku on sensitive work, what's the threshold for shipping anyway vs going back to model selection?
4. **Sensitive-job-without-appliance escape hatch:** does a newsroom without registered hardware get a "downgrade to cloud with explicit consent" path, or is sensitive = appliance-only? (V2 Step 5 plan left this open; needs answering before pilot deployment.)
