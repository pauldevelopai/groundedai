# Anchor — the 10 agents (canonical)

This file is the single source of truth for the 10 agents Anchor ships. Verbatim from Paul's final spec on 2026-05-05 (PM). Any change to an agent's scope or wording lands here first; the agent registry descriptions in `lib/agents/*.js` and any HANDOFF references must match this file.

The platform ships with ten agents. Each does one thing well — the power is in the composition. Newsrooms combine them into workflows that fit how they actually work.

## 1. Verifier

Checks claims against external sources and the newsroom's archive. Returns a confidence rating, evidence, citations, and gaps. Multi-source consensus, never single-source. Built on an Africa-grounded credibility map. Verifies both journalist-sourced claims and community-submitted material, pairing with Distributor's intake queue to fact-check tips, submissions, and contributor pieces before they enter the editorial pipeline. Pairs with Archivist to turn dead storage into a live intelligence system — archives that serve ongoing investigations, hold institutional memory, and open up product and licensing revenue.

## 2. Archivist

Semantic search over the newsroom's own archive. Answers "have we covered this before, and what did we say?" Private to each newsroom. The connective tissue across most workflows: feeds footage into video production, citations into WhatsApp answers, and context into audience analysis. Turns decades of locked-up output into an asset the newsroom can actively use and, where appropriate, responsibly monetise.

## 3. Drafter

Writes social copy, headlines, newsletter blurbs, and scripts in the newsroom's house style. Handles light translation. In the short-form video workflow, paste an article and Drafter produces the script (opening hook included) for Translator and Producer to take forward.

## 4. Researcher

Pulls public records, court filings, regulatory disclosures, and financial documents.

## 5. Translator

Moves full stories between English and African languages with the depth needed to publish in them, not just gloss them. Maintains a per-newsroom glossary of approved terminology, place names, and idiom that builds with every edit. Routes each language pair to the model that performs best on it — isiZulu, isiXhosa, Sesotho, Setswana, Siswati, IsiNdebele, Sepedi, and Afrikaans are not equivalent problems, and Translator does not pretend they are. Surfaces phrase-level confidence so editors can see where the model is guessing, not just what it produced. Every human edit feeds back into the glossary and the routing logic, so quality compounds rather than plateaus. In the audio workflow, one English script becomes three language versions, each with its own confidence pass and editor sign-off.

## 6. Producer

Builds the finished product across formats: radio scripts, podcast outlines, video briefs, audio assembly, vertical video. In video, it pulls archive and stock footage together, auto-captions for the target platform, and outputs an editable timeline plus a ready-to-upload MP4. In audio, it delivers podcast-quality output — solo, two-host, or interview-style, with a sound design layer — sized for podcast platforms, WhatsApp voice notes, and audiograms.

## 7. Distributor

Distributor manages how the newsroom talks to its audience and how the audience talks back. On the outbound side, it handles social posts, newsletter scheduling, CMS publishing, and WhatsApp broadcasts, with every send cleared by an editor before it goes out. On the inbound side, it gathers tips, submissions, and contributor pieces from WhatsApp, web forms, and tip lines into a single editor triage queue, where the editor decides what moves on to Verifier for fact-checking and what moves on to Operations for contributor handling. WhatsApp is where this two-way design earns its keep: the same channel that carries broadcasts and answers reader questions from the archive is the channel that brings in community tips and carries corrections back to the audiences where misinformation first took hold.

## 8. Fundraiser

Handles the structural work of grant writing. Keeps a live funder library of the major media-development donors and the newsroom's profile — strengths, prior coverage, audience data, impact stories — up to date. Auto-populates relevant sections so a short brief comes back as a first draft, mapped to the funder's structure with budget scaffolding included. Across the cohort, it surfaces collaboration opportunities — joint applications that improve everyone's odds.

## 9. Audience

Collects analytics across the newsroom and builds an AI layer over that so you can interrogate what's landing, what's missing, what's bouncing and where engagement is concentrating. Test a headline and sense-check a story angle against what has worked in the past. (Revised 2026-05-07: synthetic personas / focus-group orchestration dropped from the agent's scope. The previous persona machinery from slice 10 is soft-deprecated — tables remain for backward compatibility but the workspace primary surface is now consultations: headline_test, angle_check, analytics_query.)

## 10. Operations

Runs the internal stuff: editorial calendar, deadlines, freelancer coordination, sales, logistics, financial management, performance metrics. Also runs community contributor operations — vetting, attribution, light payment, moderation routing — so newsrooms with active contribution programmes have an operational home for them. The biggest departure from how most media-sector AI projects are framed — AI working across the whole organisation, not just the editorial floor. This is the shift that turns AI from a feature into a foundation for organisational resilience.

## 11. Social Listener

Tracks Facebook and other social-media posts for narratives the newsroom flags — keywords, named figures, place names — and reports back on what was said, where it came from, and why it matters. Origin attribution is the load-bearing piece: when a damaging post is amplified by an account that traces back to Russian or Chinese state-aligned media (RT, Sputnik, Sputnik Africa, CGTN, CGTN Africa, Xinhua and the documented sub-brands), the newsroom needs to see that link clearly so they can report on it with context. Uses open-source language identification (GlotLID) and multilingual NER (Wikineural) for the structural detection, plus a curated per-newsroom source-reputation list (state-media domains seeded by default, editable). Real Facebook API integration requires Meta approval; the agent ships ingestion-agnostic — manual paste, CSV import, webhook for third-party scrapers / Meta Content Library exports — so newsrooms can start tracking immediately and plug in real-time feeds when they have the access. Surfaces patterns: coordinated phrasing across accounts, shared timing windows, and connections to known state-aligned domains. Flagged signals route to Verifier (for fact-check) and Distributor (for context-note publishing).
