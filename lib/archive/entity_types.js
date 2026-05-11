// Entity-type registry for the archive knowledge graph.
//
// Universal types (newsroom_id = NULL) are seeded once and apply to every
// newsroom. They cover what wikineural-multilingual-ner emits — PER / ORG /
// LOC / MISC — plus a handful of newsroom-load-bearing extras Haiku will be
// asked to extract structurally (events, works, money amounts, dates).
//
// Newsroom-specific types (newsroom_id = <uuid>) are added by editors via
// the UI; GLiNER consumes prompt_hint as a zero-shot label so a newsroom
// covering extractives can add "mining company" and have it picked up from
// every new document without retraining.

const { pool } = require('../db');

const UNIVERSAL_TYPES = [
  {
    slug: 'person',
    label: 'Person',
    prompt_hint: 'person',
    source_model: 'wikineural',
    description: 'Named individual — politician, executive, journalist, public figure, private individual.',
  },
  {
    slug: 'organisation',
    label: 'Organisation',
    prompt_hint: 'organization',
    source_model: 'wikineural',
    description: 'Companies, NGOs, government bodies, political parties, regulatory agencies, media outlets.',
  },
  {
    slug: 'place',
    label: 'Place',
    prompt_hint: 'location',
    source_model: 'wikineural',
    description: 'Countries, cities, regions, neighbourhoods, geographic features.',
  },
  {
    slug: 'misc',
    label: 'Miscellaneous',
    prompt_hint: 'miscellaneous named entity',
    source_model: 'wikineural',
    description: 'Catch-all for wikineural MISC tag — nationalities, languages, religions, products.',
  },
  // Haiku-extracted structural types (no wikineural equivalent)
  {
    slug: 'event',
    label: 'Event',
    prompt_hint: 'named event (e.g. election, protest, court hearing)',
    source_model: 'haiku',
    description: 'Specific named occurrence — an election, a protest, a court hearing, a summit, a disaster.',
  },
  {
    slug: 'work',
    label: 'Work / Document',
    prompt_hint: 'named work or document (e.g. report, bill, court case)',
    source_model: 'haiku',
    description: 'Named published work — a report, a bill, a court case, an album, a book.',
  },
  {
    slug: 'money',
    label: 'Money amount',
    prompt_hint: 'monetary amount with currency',
    source_model: 'haiku',
    description: 'Numeric amount with currency — $1.2m, R450 000, K500. Captured as entities so claims can join on them.',
  },
];

/**
 * Idempotent seed. Inserts universal types if not present; safe to run repeatedly.
 * Returns the number of rows newly inserted (existing rows are not touched).
 */
async function seedUniversalTypes() {
  let inserted = 0;
  for (const t of UNIVERSAL_TYPES) {
    // ON CONFLICT DO NOTHING because the unique constraint is (newsroom_id, slug)
    // and NULL = NULL is false in SQL — but pg treats NULL in unique indexes as
    // distinct, so we have to check by hand.
    const existing = await pool.query(
      `SELECT id FROM archive_entity_types WHERE newsroom_id IS NULL AND slug = $1`,
      [t.slug]
    );
    if (existing.rows.length > 0) continue;
    await pool.query(
      `INSERT INTO archive_entity_types
         (newsroom_id, slug, label, prompt_hint, kind, source_model, description)
       VALUES (NULL, $1, $2, $3, 'universal', $4, $5)`,
      [t.slug, t.label, t.prompt_hint, t.source_model, t.description]
    );
    inserted++;
  }
  return inserted;
}

/**
 * Add a newsroom-specific type. Editors create these via the UI to direct
 * GLiNER at entity types that matter to their beat.
 */
async function addNewsroomType(newsroomId, { slug, label, promptHint, description }) {
  const { rows } = await pool.query(
    `INSERT INTO archive_entity_types
       (newsroom_id, slug, label, prompt_hint, kind, source_model, description)
     VALUES ($1, $2, $3, $4, 'newsroom', 'gliner', $5)
     RETURNING *`,
    [newsroomId, slug, label, promptHint, description || null]
  );
  return rows[0];
}

/**
 * Return all types visible to a newsroom — universal + that newsroom's own.
 * Used by the ingestion pipeline to assemble the GLiNER zero-shot label set,
 * and by the UI's entity-type picker.
 */
async function listForNewsroom(newsroomId) {
  const { rows } = await pool.query(
    `SELECT * FROM archive_entity_types
      WHERE newsroom_id IS NULL OR newsroom_id = $1
      ORDER BY kind, label`,
    [newsroomId]
  );
  return rows;
}

/**
 * Look up a single type by (newsroom_id, slug). Used by ingestion to map a
 * NER tag back to a type_id. Falls back to universal type if newsroom-specific
 * doesn't exist.
 */
async function findBySlug(newsroomId, slug) {
  const { rows } = await pool.query(
    `SELECT * FROM archive_entity_types
      WHERE slug = $1 AND (newsroom_id IS NULL OR newsroom_id = $2)
      ORDER BY (newsroom_id = $2) DESC NULLS LAST
      LIMIT 1`,
    [slug, newsroomId]
  );
  return rows[0] || null;
}

module.exports = {
  UNIVERSAL_TYPES,
  seedUniversalTypes,
  addNewsroomType,
  listForNewsroom,
  findBySlug,
};
