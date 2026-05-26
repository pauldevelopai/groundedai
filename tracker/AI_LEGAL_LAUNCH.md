# AI Legal — Launch Checklist

**Goal**: Make `ailegal.co.za` the global standard for AI-related lawsuit and regulation information.

Snapshot taken **2026-04-23**. Counts update as work lands. Tick items as they complete.

---

## Current system state

| Metric | Count |
|---|---|
| Lawsuits tracked | **53** across 15 jurisdictions |
| Regulations tracked | **25** across 15 jurisdictions |
| Lawsuit events | **95** |
| Regulation events | **26** |
| AI-generated insights | **5** (73 entities still need them) |
| Documented use cases | **10** (all URLs verified 2026-04-21) |
| Active ingest sources | **58** across 5 scraper kinds (RSS 44, Bluesky 7, Mastodon 3, Puppeteer 2, HTML 2) |
| Raw items in pipeline | **384** pending triage, **58** candidates awaiting human review |
| Public API v1 | Live at `/api/v1` with OpenAPI docs + RSS/Atom feeds + API keys |
| Subscriptions (watch + digest) | Infra live, 0 confirmed subs, email provider unconfigured |

---

## Phase 1 — Data quality ✅ **largely done**

| # | Task | Status |
|---|---|---|
| 1.1 | Fix dead use-case URLs | ✅ All 10 verified 2026-04-21 |
| 1.2 | Wire `npm run orchestrate` script | ✅ |
| 1.3 | **You**: review **58 candidates** at `/legal-sources` | ⏳ pending |
| 1.4 | **You**: review 1 user submission at `/legal-sources` | ⏳ pending |
| 1.5 | Anthropic credit top-up | ✅ done |
| 1.6 | Cost verification (`verify-triage-cost.js`) | ✅ — $0.0048/item empirically |

## Phase 2 — Data enrichment

| # | Task | Status |
|---|---|---|
| 2.1 | CourtListener token in `.env` | ✅ |
| 2.2 | CL bulk sync on US cases | ❌ **unusable** — CL free tier returns 403 on `/docket-entries/` (PACER-protected). Need paid tier or alternate source. |
| 2.3 | Triage 714-item backlog (Phase 1 re-triage) | ✅ 8 promoted, 46 new candidates, drained backlog |
| 2.4 | Triage new 384 pending items | ⏳ **blocked on Ollama / LLM backend decision** |
| 2.5 | Timeline research on non-US cases | ⏳ paused (spending cap) |
| 2.6 | Insights backfill on 73 entities | ⏳ paused (spending cap) |
| 2.7 | Date audit retry on errored items | ⏳ paused (spending cap) |

**Note**: Ollama + Gemma 3 12B installed locally but model too heavy on 16GB Mac to run sustained. Decision pending on: upsize model/Mac, switch to Groq free API for production, or defer enrichment features.

## Phase 3 — Launch infrastructure 🟡 **ready-to-deploy artifacts landed**

| # | Task | Status |
|---|---|---|
| 3.1 | DNS A record: `ailegal.co.za` → `52.56.143.231` | 🛑 your registrar |
| 3.2 | DNS CNAME: `www.ailegal.co.za` → `ailegal.co.za` | 🛑 your registrar |
| 3.3 | Nginx server block | ✅ written at `deploy/nginx/ailegal.co.za.conf` — ready to `scp` |
| 3.4 | `certbot --nginx -d ailegal.co.za -d www.ailegal.co.za` | 🛑 needs 3.1+3.2 first |
| 3.5 | Favicon + OG default image | ✅ `favicon.svg` + `og-default.svg` shipped |
| 3.6 | Lightsail Puppeteer libs (`apt-get`) | 🛑 on server |
| 3.7 | Deploy holly to Lightsail | 🛑 ready — see deploy runbook below |
| 3.8 | PM2 production config | ✅ `deploy/ecosystem.production.cjs` |
| 3.9 | `robots.txt` + dynamic `/sitemap.xml` | ✅ both live, 88 URLs indexed |
| 3.10 | OG/Twitter meta injection on detail pages | ✅ verified end-to-end |

## Phase 4 — Public API ✅

| # | Task | Status |
|---|---|---|
| 4.1 | `/api/v1/*` versioned routes + discovery root | ✅ |
| 4.2 | OpenAPI 3.1 spec | ✅ |
| 4.3 | Redoc docs at `/api/v1/docs` | ✅ |
| 4.4 | RSS 2.0 + Atom 1.0 feeds | ✅ |
| 4.5 | API keys with per-key rate limits | ✅ |

## Phase 5 — Engagement features ✅ **shipped this round**

| # | Task | Status |
|---|---|---|
| 5.1 | Launch announcement copy (LinkedIn + Bluesky) | ✅ drafted |
| 5.2 | Logo / accent colour / tagline decision | 🛑 your call |
| 5.3 | Email digest | ✅ code shipped — `send_digest.js`, provider-pluggable |
| 5.4 | Per-case "watch" button | ✅ end-to-end, DB triggers fan out events to watchers |
| 5.5 | Newsletter ingestion | ✅ covered by RSS sources (Above the Law, Artificial Lawyer, JD Supra AI, etc.) |
| 5.6 | Subscription / paid tier | 🛑 product decision |
| 5.7 | Deep per-case research (Phase 5 orchestrator) | ✅ code ready (expensive, opt-in) |
| 5.8 | OG/meta tags per detail page | ✅ live, verified |
| 5.9 | **+15 new free RSS sources** (DOJ, SEC, Copyright Office, 5 CourtListener circuit feeds, JD Supra, Eric Goldman, Patently-O, Above the Law, AI Now, Brookings, OII) | ✅ |

## Phase 6 — Ops hygiene (ongoing)

| # | Task | Cadence |
|---|---|---|
| 6.1 | Review candidates in queue | Weekly, 5 min |
| 6.2 | Review user submissions | As they arrive |
| 6.3 | Spot-check insights for hallucination | Monthly |
| 6.4 | Monitor ingest health at `/legal-sources` | Weekly |
| 6.5 | Dead-link checker (Sun 03:11 auto) | Automatic |
| 6.6 | Weekly digest send (cron) | 🛑 needs SMTP + cron entry |

---

## 🎯 Remaining launch path (pre-Ollama decision)

Everything below is gated on you. I can pre-pack commands/scripts for each.

1. **DNS** — tell me your registrar, I'll give exact record values
2. **Lightsail deploy** — I'll write a single SSH-paste script (apt-get + git pull + npm build + pm2 + nginx symlink + certbot)
3. **SMTP provider** — recommend Resend (3k/mo free tier). Sign up → paste key into `.env`
4. **Cron the digest** — one-line crontab entry
5. **Review 58 candidates** at `/legal-sources` — can pair with me
6. **Post announcement** — copy drafted, ready to go

## ⏸ Parked decisions

- **LLM backend for production triage** — Mac+tunnel (current plan) too heavy; fallbacks: Groq free API, Gemma 3 4B, or keep Claude paid on a budget cap
- **Chatbot backend** — still pointed at Claude; will burn credit while public
- **Bigger data enrichment** (timeline, insights, audit) — on hold pending LLM backend decision

## 📁 Deploy artifacts (ready to use)

- `deploy/nginx/ailegal.co.za.conf` — nginx server block (http→https certbot adds)
- `deploy/ecosystem.production.cjs` — PM2 config (server only; nginx serves static Vite build)
- `client/public/robots.txt` — allow/disallow rules
- `GET /sitemap.xml` — live dynamic sitemap
- `server/db/scripts/send_digest.js` — CLI for weekly digest
- `server/services/email/providers.js` — pluggable providers (console / Postmark / Resend / SES)
