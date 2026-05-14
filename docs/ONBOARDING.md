# Welcome to Grounded — pilot newsroom onboarding

For the AI champion at each of the 5 pilot newsrooms: Capital FM Lusaka,
EnviroPress, MakanDay, Maricho Media, VicFallsLive.

One page, in order. Spend 30 minutes once and the rest of your team can use
the platform without thinking about any of this.

---

## 1. Log in

You should have received an admin email + temporary password from Paul
out-of-band. Use it at the login page:

- **Email:** `champion@<your-newsroom-domain>`
- **Password:** the random string Paul shared

Change your password from `/team` immediately after first login.

If you don't have credentials, ask Paul. We never email them.

---

## 2. Set up your newsroom profile

This is the most load-bearing thing you do — every agent reads it.

Go to **Profile** (top-right of any page). A starter profile is already
filled in (mission, beats, geography, voice). Read it. Fix what's wrong.
The more concrete it is, the better the agents perform.

The fields that matter most:
- **Voice** — how your newsroom sounds. Copywriter and the Audio & Video
  Producer use this verbatim.
- **Style notes** — concrete rules. "No Oxford comma. Metric units. Spell
  out percent." Be specific.
- **Beats** — the regular subjects you cover.
- **Geography** — where you cover. Feeds the place-name density signal in
  the house-style fingerprint.
- **Ethics policy** — your right-of-reply window, source-protection rules,
  AI-use disclosure.

Hit **Save profile** at the bottom when done.

### Advanced sub-sections (you don't have to touch these to use Grounded)

Four collapsible sections at the bottom of the profile page. All optional —
the pan-African defaults work out of the box. Open one only if you have
specific overrides:

- **Topic taxonomy** — adds your beats' jargon to Copywriter's relevance
  signal (e.g. ConCourt, Madlanga Commission, tailings, ZRA).
- **Trusted sources** — the URLs Researcher tags as `trustedSource: true`.
  Adds your local outlets the platform default doesn't know yet.
- **Crawl rules** — controls how the Researcher's deep-crawler walks
  websites (skip /podcasts/, prioritise /investigations/, etc.).
- **House-style fingerprint** — clicks the Compute button, the platform
  measures 14 quantitative dimensions of your archive's voice and feeds
  a banded summary into every Copywriter and Producer prompt. Run this
  *after* you've uploaded ~20+ documents to the archive.

---

## 3. Upload your archive

Go to **Archivist**. Click **Documents** tab. Upload anything you want the
agents to know about — past pieces, briefs, internal docs.

Each document is processed in four passes:
1. **Metadata** — extracts title, byline, published_at, beat, story type
2. **NER** — finds every person, organisation, place mentioned
3. **Relationships** — extracts who-did-what-to-whom triples
4. **Claims** — pulls out atomic factual assertions with byline + date

Watch the chips next to each document. When all four say `completed`, that
document is fully searchable + queryable.

Once ingested, the **Ask the archive** tab lets anyone in your newsroom ask
plain-English questions and get cited answers.

---

## 4. Invite your team

Go to **/team** (Admin only — top-right when you're an admin).

For each team member:
- Email + role (`user` for journalists, `builder` for your other AI champion
  if you have a second one)
- Click Invite. The platform returns a one-time password to share
  out-of-band.

They log in, change their password, start running workflows.

---

## 5. The 11 agents

You see all 11 in the **Agents & Tools** dropdown at the top of every page.
Each is a single workspace your team can use directly, or stitch into
workflows in the Builder.

| Agent | What it does |
|---|---|
| **Verifier** | Fact-checks claims against external sources + your archive |
| **Archivist** | Semantic + structured search over your archive |
| **Copywriter** | Drafts social copy, headlines, scripts in your voice |
| **Researcher** | Pulls + scrapes public records, court filings, web pages |
| **Translator** | English ↔ African languages with per-newsroom glossary |
| **Audio & Video Producer** | Radio scripts, podcasts, audiograms, vertical video |
| **Audience Analytics Manager** | Headline tests + angle sense-checks against your real analytics |
| **Fundraiser** | Drafts grant applications + donor reports |
| **Operations Manager** | Editorial calendar, freelancer coordination, finance |
| **Digital News Gatherer** | Inbound tips + submissions triage queue |
| **Social media listener** | Detects foreign-agent / state-aligned social posts |

The **Help** page has a longer write-up of each.

---

## 6. The Builder (your superpower)

If your role is `builder` or `admin`, you have access to the **Builder** —
the drag-and-drop canvas where you compose **workflows** from the agents.

A workflow is a graph: take an article → run Verifier → if it passes, run
Copywriter to draft 3 social posts → Translator drafts the isiZulu version
→ end. Your journalists run that workflow from the simple list at **Run**;
they never see the agents or the prompts.

Two ways to build a workflow:
1. **Pick a starter** — proven shapes the cohort has already validated.
2. **Describe & build** — type "When a tip comes in, fact-check it then
   draft a follow-up tweet" and the platform composes the graph. Edit
   manually after.

When you publish a workflow, you also pick which team members can run it
(per-workflow assignments).

---

## 7. Cost + privacy

- **Cost:** the platform is free for the pilot. Anthropic Claude is the
  only paid dependency; Paul absorbs that cost during the pilot.
- **Privacy:** your archive, profile, workflows, and outputs are
  per-newsroom-isolated. No data shared across newsrooms unless you
  explicitly share a workflow to the cohort library.
- **OSS-first:** embeddings, NER, translation, audio assembly, and image
  rendering all run on-machine. Only the Claude LLM call goes to a
  third-party (Anthropic).
- **Fallback:** if Anthropic is unreachable, the platform automatically
  falls over to a local LLM (Ollama gemma3:12b) so you don't lose a piece
  in flight. Outputs from the fallback are flagged in the UI.

---

## 8. Two things to ask of you during the pilot

1. **Report bugs** — anything looks wrong, message Paul. We'd rather fix it
   for everyone than have one newsroom carry around a workaround.
2. **Share what works** — when a workflow earns its keep at your newsroom,
   click "share with cohort" so the other 4 newsrooms can adopt it.
   That's the network effect we're hoping for.

---

## Help + getting unstuck

- **Help page** — `/guide` from the top nav. Walks through every agent in
  detail.
- **Email Paul** — anytime, but bug reports + cohort discussion go to a
  shared channel (link in the welcome email).

Welcome to Grounded.
