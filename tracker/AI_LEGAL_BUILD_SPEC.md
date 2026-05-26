# AI Legal — Tonight's Build (Two Specs)

**Working directory:** `/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/holly`

**Product:** AI Legal — public-facing global tracker for AI lawsuits and AI regulations
**Domain:** ailegal.co.za (DNS not yet pointing — handled separately)
**Built inside:** Holly (no new repo, same Postgres, reuses existing public-login surface)

**Order tonight:**
1. Execute **Spec A** end-to-end. Verify it works.
2. Then execute **Spec B**.

**Estimated focused build time:**
- Spec A: 4-5 hours
- Spec B: 4-6 hours
- Total: 8-11 hours

**Honest note:** This is a long night. If energy flags during Spec B, ship Spec A clean and pick up Spec B fresh. Half-built code is worse than a clean stopping point.

---

# SPEC A — Globally complete data + AI Legal branding

## A1. Database — regulations schema

### A1.1 Migration: `server/db/migrations/056_create_ai_regulations.sql`

```sql
CREATE TABLE IF NOT EXISTS ai_regulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  regulation_name VARCHAR(500) NOT NULL,
  short_name VARCHAR(200),
  jurisdiction VARCHAR(200) NOT NULL,
  regulator VARCHAR(300),
  status VARCHAR(50) DEFAULT 'in_force',
  -- Statuses: 'proposed', 'draft', 'consultation', 'enacted', 'in_force', 'partial_force', 'amended', 'repealed', 'superseded'
  regulation_type VARCHAR(100),
  -- Types: 'statute', 'regulation', 'directive', 'guidance', 'executive_order', 'standard', 'voluntary_code', 'court_ruling'
  scope TEXT[] DEFAULT '{}',
  affected_sectors TEXT[] DEFAULT '{}',
  proposed_date DATE,
  enacted_date DATE,
  effective_date DATE,
  enforcement_date DATE,
  next_milestone DATE,
  next_milestone_notes TEXT,
  key_provisions TEXT[] DEFAULT '{}',
  penalties TEXT,
  extraterritorial_scope TEXT,
  official_url TEXT,
  source_url TEXT,
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  detailed_analysis TEXT,
  analysis_generated_at TIMESTAMPTZ,
  curriculum_relevance TEXT,
  is_curriculum_relevant BOOLEAN DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  knowledge_entry_id UUID,
  external_id VARCHAR(200),
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_regulations_jurisdiction ON ai_regulations(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_ai_regulations_status ON ai_regulations(status);
CREATE INDEX IF NOT EXISTS idx_ai_regulations_effective_date ON ai_regulations(effective_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ai_regulations_scope ON ai_regulations USING gin(scope);
CREATE INDEX IF NOT EXISTS idx_ai_regulations_tags ON ai_regulations USING gin(tags);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_regulations_short_name_jurisdiction ON ai_regulations(short_name, jurisdiction);
```

### A1.2 Migration: `server/db/migrations/057_create_ai_regulation_events.sql`

```sql
CREATE TABLE IF NOT EXISTS ai_regulation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  regulation_id UUID NOT NULL REFERENCES ai_regulations(id) ON DELETE CASCADE,
  event_date DATE,
  event_type VARCHAR(50) NOT NULL DEFAULT 'update',
  -- Types: proposed, consultation, enacted, amended, took_effect, enforcement_action, guidance_issued, repealed, superseded, update
  title VARCHAR(500),
  description TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regulation_events_regulation_id ON ai_regulation_events(regulation_id);
CREATE INDEX IF NOT EXISTS idx_regulation_events_date ON ai_regulation_events(event_date DESC NULLS LAST);
```

### A1.3 Run the migrations

```
cd "/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/holly"
npm run migrate
```

Verify both tables exist: `psql $DATABASE_URL -c "\dt ai_regulation*"`

---

## A2. Backend routes for regulations

Create `server/routes/regulations.js`. Mirror the structure of `server/routes/lawsuits.js` exactly so it's familiar to maintain. Reuse the same `pool`, `scrapeArticle`, `generateCaseAnalysis` (adapt to `generateRegulationAnalysis`), and `createKnowledgeEntry` patterns where applicable.

Required endpoints:

**Admin (existing auth):**
- `GET /api/regulations` — list, supports `?jurisdiction=`, `?status=`, `?scope=`, `?sector=`, `?q=` filters
- `GET /api/regulations/:id` — single regulation
- `GET /api/regulations/:id/events` — events for a regulation
- `POST /api/regulations` — create
- `PUT /api/regulations/:id` — update
- `POST /api/regulations/:id/events` — add event
- `POST /api/regulations/:id/analyse` — generate Claude analysis (use the `claude.js` service)
- `POST /api/regulations/:id/add-to-knowledge` — link to knowledge base (use existing `createKnowledgeEntry`)

**Public (no auth):**
Mount these via a separate public router or with `app.use('/api/public', publicRouter)`.

- `GET /api/public/regulations` — list, only `status IN ('enacted','in_force','partial_force','amended')`
- `GET /api/public/regulations/:id` — single regulation, public-safe fields only (omit any internal `curriculum_relevance` if you prefer)
- `GET /api/public/lawsuits` — list (check if this already exists; if not, add it mirroring the same pattern)
- `GET /api/public/lawsuits/:id` — single lawsuit, public view
- `GET /api/public/feed?limit=20` — combined chronological feed of recent lawsuit events + regulation events for the public homepage. Returns `{ type: 'lawsuit_event' | 'regulation_event', date, title, description, item_id, item_name, jurisdiction }` shape.

### A2.1 Wire in `server/index.js`

```js
import regulationsRouter from './routes/regulations.js';
app.use('/api/regulations', regulationsRouter);
```

Public routes: ensure they're mounted before any auth middleware that would block them, OR mark them explicitly as bypassing auth.

### A2.2 Test

```
curl http://localhost:3000/api/public/regulations | jq '.[0]'
curl http://localhost:3000/api/public/feed | jq '.[0:3]'
```

Both should return data after seed step (next phase).

---

## A3. Seed: global lawsuits (additions to existing US-heavy seed)

### A3.1 Create `server/db/scripts/seed_global_lawsuits.js`

Inserts non-US AI lawsuit cases into `ai_lawsuits` using `ON CONFLICT (case_name) DO NOTHING` so it's safe to re-run.

**Critical instruction to Claude Code:** verify each case is real before inserting. If you cannot confirm a specific case from a credible source, OMIT it. Do not invent cases. Do not invent dates, plaintiffs, or judges. If unsure about a detail, leave the field NULL rather than guess. **A small set of verified cases is infinitely better than a large set with fabricated entries.**

Aim for 12-18 cases total. **Quality and verifiability over quantity.**

Run script:
```
cd "/Users/paulmcnally/Developai Dropbox/Paul McNally/DROPBOX/ONMAC/PYTHON 2025/holly"
node server/db/scripts/seed_global_lawsuits.js
```

Verify count:
```
psql $DATABASE_URL -c "SELECT jurisdiction, COUNT(*) FROM ai_lawsuits GROUP BY jurisdiction ORDER BY COUNT(*) DESC;"
```

---

## A4. Seed: global regulations

Same critical instruction: **verify each regulation is real and current. Do not invent. Do not approximate dates if unsure — leave NULL.**

Target 15-25 entries, verified.

Run:
```
node server/db/scripts/seed_global_regulations.js
```

Verify:
```
psql $DATABASE_URL -c "SELECT jurisdiction, COUNT(*) FROM ai_regulations GROUP BY jurisdiction ORDER BY COUNT(*) DESC;"
```

---

## A5. Frontend — public regulation views

Create `client/src/pages/regulations/` sibling of `lawsuits/`:
- `RegulationsList.jsx`
- `RegulationDetail.jsx`
- `RegulationEventList.jsx`

Public variants in `client/src/pages/public/`:
- `PublicLawsuitsList.jsx`
- `PublicLawsuitDetail.jsx`
- `PublicRegulationsList.jsx`
- `PublicRegulationDetail.jsx`
- `PublicHome.jsx`

Routing:
- `/` or `/legal` → `PublicHome`
- `/lawsuits` → `PublicLawsuitsList`
- `/lawsuits/:id` → `PublicLawsuitDetail`
- `/regulations` → `PublicRegulationsList`
- `/regulations/:id` → `PublicRegulationDetail`

---

## A6. Light AI Legal branding pass

- Public header "AI Legal"
- Footer `ailegal.co.za`
- No "Holly" on public pages
- Update `client/index.html` title

---

## A7. Verification checklist

- [ ] `npm run migrate` completes without error
- [ ] Both new tables exist (`ai_regulations`, `ai_regulation_events`)
- [ ] `node server/db/scripts/seed_global_lawsuits.js` runs cleanly
- [ ] `node server/db/scripts/seed_global_regulations.js` runs cleanly, adds 15+ regulations
- [ ] `curl http://localhost:3000/api/public/regulations` returns data
- [ ] `curl http://localhost:3000/api/public/lawsuits` returns data including new non-US cases
- [ ] `curl http://localhost:3000/api/public/feed` returns mixed chronological feed
- [ ] Public regulations list page renders at `/regulations`
- [ ] Public regulation detail page renders at `/regulations/:id`
- [ ] Public lawsuit pages still work
- [ ] Public home page shows combined feed
- [ ] All public pages say "AI Legal", not "Holly"
- [ ] Admin routes still work and are still auth-protected
- [ ] Existing internal LawsuitTracker page still works
