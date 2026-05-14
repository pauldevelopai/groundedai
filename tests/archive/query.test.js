// Tests for the archive query primitives. Real-DB integration: seeds a
// micro-graph in the dev newsroom, exercises the primitives, cleans up.

const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../../lib/db');
const { findBySlug } = require('../../lib/archive/entity_types');
const { embedQuery } = require('../../lib/storage/embed');
const {
  fuzzyEntitySearch,
  entityProfile,
  walkGraph,
  semanticClaimSearch,
  entityTimeline,
} = require('../../lib/archive/query');

let newsroomId, userId;
let docId;
let ramaphosaId, hichilemaId, ancId;

test.before(async () => {
  const { rows: nrs } = await pool.query('SELECT id FROM newsrooms ORDER BY created_at LIMIT 1');
  const { rows: us } = await pool.query('SELECT id FROM users WHERE newsroom_id = $1 LIMIT 1', [nrs[0].id]);
  newsroomId = nrs[0].id; userId = us[0].id;

  // Wipe + seed a micro graph
  await pool.query('DELETE FROM archive_documents WHERE newsroom_id = $1', [newsroomId]);
  await pool.query('DELETE FROM archive_entities WHERE newsroom_id = $1', [newsroomId]);

  const personType = await findBySlug(newsroomId, 'person');
  const orgType = await findBySlug(newsroomId, 'organisation');

  // Document
  const { rows: [doc] } = await pool.query(
    `INSERT INTO archive_documents (newsroom_id, user_id, filename, mime_type, size_bytes, status,
       published_at, byline, title)
     VALUES ($1, $2, 'q-test.txt', 'text/plain', 100, 'ready', '2024-10-15',
       ARRAY['Naledi Mbeki'], 'SA-Zambia trade talks') RETURNING id`,
    [newsroomId, userId]
  );
  docId = doc.id;

  async function ent(name, typeId) {
    const v = await embedQuery(name);
    const { rows: [r] } = await pool.query(
      `INSERT INTO archive_entities (newsroom_id, type_id, canonical_name, surface_forms, embedding, mention_count)
       VALUES ($1, $2, $3, ARRAY[$3], $4::vector, 1) RETURNING id`,
      [newsroomId, typeId, name, '[' + v.join(',') + ']']
    );
    return r.id;
  }
  ramaphosaId = await ent('Cyril Ramaphosa', personType.id);
  hichilemaId = await ent('Hakainde Hichilema', personType.id);
  ancId = await ent('African National Congress', orgType.id);

  // Mention so entityProfile.documents returns something
  await pool.query(
    `INSERT INTO archive_entity_mentions (newsroom_id, entity_id, document_id, char_start, char_end, surface_text, confidence, extracted_by)
     VALUES ($1, $2, $3, 0, 15, 'Cyril Ramaphosa', 0.95, 'wikineural')`,
    [newsroomId, ramaphosaId, docId]
  );

  // Relationships
  await pool.query(
    `INSERT INTO archive_relationships (newsroom_id, subject_entity_id, predicate, object_entity_id, document_id, confidence, evidence_text, extracted_by)
     VALUES ($1, $2, 'met_with', $3, $4, 0.95, 'Ramaphosa met Hichilema', 'haiku'),
            ($1, $2, 'leads', $5, $4, 0.95, 'Ramaphosa leads the ANC', 'haiku')`,
    [newsroomId, ramaphosaId, hichilemaId, docId, ancId]
  );

  // Claims with BGE-M3 embeddings
  async function claim(text, subId, assertedAt) {
    const v = await embedQuery(text);
    await pool.query(
      `INSERT INTO archive_claims (newsroom_id, document_id, claim_text, subject_entity_id, asserted_at, byline, confidence, embedding, evidence_text, extracted_by)
       VALUES ($1, $2, $3, $4, $5, ARRAY['Naledi Mbeki'], 0.9, $6::vector, $3, 'haiku')`,
      [newsroomId, docId, text, subId, assertedAt, '[' + v.join(',') + ']']
    );
  }
  await claim('Ramaphosa met with Hichilema in Pretoria.', ramaphosaId, '2024-10-15');
  await claim('Ramaphosa announced a logistics framework.', ramaphosaId, '2024-08-22');
});

test.after(async () => {
  await pool.query('DELETE FROM archive_documents WHERE newsroom_id = $1', [newsroomId]);
  await pool.query('DELETE FROM archive_entities WHERE newsroom_id = $1', [newsroomId]);
  await pool.end();
});

test('fuzzyEntitySearch: top match by composite score', async () => {
  const hits = await fuzzyEntitySearch({ newsroomId, query: 'Ramaphosa', k: 3 });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].canonical_name, 'Cyril Ramaphosa');
  assert.ok(hits[0].score > 0.5, 'composite score above 0.5 for a clear match');
});

test('fuzzyEntitySearch: type filter narrows to one type', async () => {
  const hits = await fuzzyEntitySearch({ newsroomId, query: 'Ramaphosa', k: 5, typeSlug: 'organisation' });
  for (const h of hits) assert.equal(h.type_slug, 'organisation');
});

test('entityProfile: returns claims + relationships + documents', async () => {
  const prof = await entityProfile({ newsroomId, entityId: ramaphosaId });
  assert.ok(prof);
  assert.equal(prof.entity.canonical_name, 'Cyril Ramaphosa');
  assert.equal(prof.relationships.length, 2);
  assert.equal(prof.claims.length, 2);
  assert.ok(prof.documents.length >= 1);
});

test('entityProfile: asOf cutoff filters claims', async () => {
  const before = await entityProfile({ newsroomId, entityId: ramaphosaId, asOf: '2024-09-01' });
  assert.equal(before.claims.length, 1, 'only the 2024-08-22 claim should remain');
});

test('entityProfile: returns null for cross-tenant fetch', async () => {
  // Use a UUID that's well-formed but not in this newsroom
  const bogus = '00000000-0000-0000-0000-000000000000';
  const prof = await entityProfile({ newsroomId, entityId: bogus });
  assert.equal(prof, null);
});

test('walkGraph: depth-1 returns direct edges', async () => {
  const rows = await walkGraph({ newsroomId, startEntityId: ramaphosaId, depth: 1 });
  assert.equal(rows.length, 2, 'two outgoing edges at depth 1');
  const predicates = rows.map((r) => r.predicate).sort();
  assert.deepEqual(predicates, ['leads', 'met_with']);
});

test('semanticClaimSearch: ranks by cosine', async () => {
  const claims = await semanticClaimSearch({ newsroomId, query: 'Ramaphosa Pretoria meeting', k: 5 });
  assert.ok(claims.length > 0);
  // The Pretoria-meeting claim should rank higher than the framework one
  assert.match(claims[0].claim_text, /Pretoria|Hichilema/i);
});

test('entityTimeline: chronological order', async () => {
  const tl = await entityTimeline({ newsroomId, entityId: ramaphosaId });
  assert.equal(tl.length, 2);
  // Older claim first (ASC NULLS LAST)
  const dates = tl.map((c) => c.asserted_at && new Date(c.asserted_at).toISOString().slice(0, 10));
  assert.ok(dates[0] <= dates[1]);
});
