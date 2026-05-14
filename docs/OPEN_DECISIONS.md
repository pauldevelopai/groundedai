# Open decisions before pilot ship

Three calls left in HANDOFF §10 that need your explicit "yes / change /
defer". Each is framed so you can answer in one sentence and the build
proceeds.

Status legend: 🟢 platform-default · 🟡 has a reasonable default I'd ship · 🔴 needs a real decision

---

## G1 🟡 — User-mode chat routing

**The question:** when a journalist types a request into User mode (the
non-Builder surface), how does the platform pick which workflow to run?

**Default I'd ship:** (a) keyword-first match against each workflow's
`triggers` array — same data we use in the agent registry — then
(b) LLM-fallback. If the keyword pass returns 0 or >1 hit, a small Haiku
call picks the best-fit workflow from the user's assigned set, given the
user's typed request + each workflow's `problem_statement`.

**Trade-offs:**
- Keyword-first is fast (<1ms) and deterministic, so most queries skip
  the LLM call entirely.
- LLM-fallback handles the long tail (paraphrases, novel phrasings, multi-
  intent queries).
- Cost on the LLM-fallback path: one Haiku call per "didn't keyword-match"
  query. Bounded by user volume; ~$0.001 each.
- Risk: hostile/ambiguous inputs that match nothing AND confuse Haiku
  produce a "no match — try one of these workflows" UI message rather than
  guessing.

**Alternative (more conservative):** pure keyword-first, no LLM fallback.
Faster + free + simpler, but worse for new users who don't know the trigger
words.

**Decision needed:** keep the default? Drop the LLM fallback? Or
something else?

---

## G2 🔴 — Audio & Video Producer stock-footage source

**The question:** vertical video + audiograms need imagery. Pexels and
Pixabay are the obvious choices (huge libraries, free tier, MP4 stock) but
they're hosted APIs with free-tier limits — which violates the platform's
OSS-first rule (anything non-LLM must be fully-free + self-hostable).

**Three real options:**

| Option | Pros | Cons |
|---|---|---|
| **A. Wikimedia Commons via API** | OSS-compliant, broad licensed media, no API key/limit | API is rate-limited but generous; topical / news footage is THIN; needs careful filtering for CC-BY-SA attribution |
| **B. Per-newsroom uploaded asset library** | Editorial control, no licensing surprise, fits "your archive your asset" framing | Newsrooms have to seed it themselves; cold-start problem; storage cost is on us |
| **C. Baked-in open-asset bundle** | Curated by us (~500 clips), ships with the deploy, OSS-clean, zero per-newsroom setup | We curate + license-vet 500 clips; bundle adds ~2GB to deploy; static (no fresh footage) |

**Recommendation:** **B + A hybrid.** Default to Wikimedia Commons + the
newsroom's own uploaded library (whichever has hits). Producer tries the
uploaded library first, falls through to Wikimedia, falls through to a
plain solid-colour background with text overlay if neither has anything
relevant. C is a third-priority because curating 500 clips for "African
newsroom" coverage is open-ended work for one consumer (the Producer).

**Decision needed:** B+A hybrid? Or do you want C as a starter and we
revisit?

---

## G3 🟡 — Audience-analytics connectors at pilot time

**The question:** the Audience Analytics Manager analyses real reader
data. Which of the 5 pilot newsrooms has analytics we can wire to, and
which connectors should the platform support at pilot time?

**Default I'd ship:** raw CSV upload + Plausible export, in that order.
Plausible is OSS, lots of African newsrooms use it. CSV catches everyone
else. GA + Umami are post-pilot connectors — too much surface area to
support all four for a 5-newsroom pilot.

**What we know about the pilot newsrooms:**
- Capital FM Lusaka — ?
- EnviroPress — ?
- MakanDay — ?
- Maricho Media — ?
- VicFallsLive — ?

We just don't know yet. If you can ask each on the onboarding call, the
right answer is:
- 0 of 5 have analytics → ship CSV only; analytics features stay
  optional in V1.
- 1+ uses Plausible → wire Plausible connector now.
- Anyone uses GA → ship CSV-export-from-GA flow + a help page; defer
  native GA OAuth to post-pilot.

**Decision needed:** ship CSV + Plausible by default? Defer all
analytics to V1.1 if no pilot newsroom has data ready?

---

## How to answer

Just reply with three short lines, e.g.:
```
G1: ship default (keyword-first + LLM-fallback)
G2: B+A hybrid
G3: defer — none of the pilots have analytics yet
```

I'll wire each into the relevant slice and we're done with the punch-list.
