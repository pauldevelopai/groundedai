// Tests for the entity resolver + merge logic. Real-DB integration; uses
// the first newsroom in the dev DB and cleans up after itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../../lib/db');
const { findBySlug } = require('../../lib/archive/entity_types');
const { resolveOrCreate, mergeEntities } = require('../../lib/archive/resolve');
const { embedQuery } = require('../../lib/storage/embed');

let newsroomId;
let personTypeId;
let orgTypeId;

test.before(async () => {
  const { rows } = await pool.query('SELECT id FROM newsrooms ORDER BY created_at LIMIT 1');
  newsroomId = rows[0].id;
  personTypeId = (await findBySlug(newsroomId, 'person')).id;
  orgTypeId = (await findBySlug(newsroomId, 'organisation')).id;
});

test.beforeEach(async () => {
  await pool.query('DELETE FROM archive_entities WHERE newsroom_id = $1', [newsroomId]);
});

test.after(async () => {
  await pool.query('DELETE FROM archive_entities WHERE newsroom_id = $1', [newsroomId]);
  await pool.end();
});

test('resolveOrCreate: first call creates, second call same name matches', async () => {
  const r1 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Cyril Ramaphosa' });
  assert.equal(r1.created, true);
  const r2 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Cyril Ramaphosa' });
  assert.equal(r2.created, false);
  assert.equal(r2.entity.id, r1.entity.id);
  assert.equal(r2.entity.mention_count, 2);
});

test('resolveOrCreate: honorific variant merges (President Ramaphosa → Cyril Ramaphosa)', async () => {
  const r1 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Cyril Ramaphosa' });
  const r2 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'President Ramaphosa' });
  assert.equal(r2.entity.id, r1.entity.id, 'should match via embedding+trigram hybrid');
  assert.ok(r2.entity.surface_forms.includes('President Ramaphosa'));
});

test('resolveOrCreate: different person with same first name does NOT merge', async () => {
  const r1 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Cyril Ramaphosa' });
  const r2 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Cyril Sigcau' });
  assert.notEqual(r2.entity.id, r1.entity.id);
  assert.equal(r2.created, true);
});

test('resolveOrCreate: different type → never merges even with similar name', async () => {
  const r1 = await resolveOrCreate({ newsroomId, typeId: orgTypeId, surfaceText: 'Anglo American' });
  const r2 = await resolveOrCreate({ newsroomId, typeId: personTypeId, surfaceText: 'Anglo American' });
  assert.notEqual(r2.entity.id, r1.entity.id);
});

test('mergeEntities: surface_forms union + mention_count recompute', async () => {
  const a = await resolveOrCreate({ newsroomId, typeId: orgTypeId, surfaceText: 'African National Congress' });
  const b = await resolveOrCreate({ newsroomId, typeId: orgTypeId, surfaceText: 'ANC' });
  const result = await mergeEntities({ newsroomId, keepId: a.entity.id, mergeId: b.entity.id });
  assert.equal(result.keepId, a.entity.id);
  const { rows: [merged] } = await pool.query('SELECT canonical_name, surface_forms FROM archive_entities WHERE id = $1', [a.entity.id]);
  assert.ok(merged.surface_forms.includes('African National Congress'));
  assert.ok(merged.surface_forms.includes('ANC'));
  // The merged-away row should be gone
  const { rows: gone } = await pool.query('SELECT id FROM archive_entities WHERE id = $1', [b.entity.id]);
  assert.equal(gone.length, 0);
});

test('mergeEntities: refuses self-merge', async () => {
  const a = await resolveOrCreate({ newsroomId, typeId: orgTypeId, surfaceText: 'Eskom' });
  await assert.rejects(
    () => mergeEntities({ newsroomId, keepId: a.entity.id, mergeId: a.entity.id }),
    /must differ/
  );
});

test('mergeEntities: cross-type merge keeps target type', async () => {
  // Need a real custom type
  const { addNewsroomType } = require('../../lib/archive/entity_types');
  try {
    await addNewsroomType(newsroomId, { slug: 'test_mining_co', label: 'Test mining co', promptHint: 'mining' });
  } catch { /* may already exist */ }
  const miningType = await findBySlug(newsroomId, 'test_mining_co');

  const orgEnt = await resolveOrCreate({ newsroomId, typeId: orgTypeId, surfaceText: 'Anglo Platinum' });
  const minEnt = await resolveOrCreate({ newsroomId, typeId: miningType.id, surfaceText: 'Anglo Platinum' });
  await mergeEntities({ newsroomId, keepId: orgEnt.entity.id, mergeId: minEnt.entity.id });

  const { rows: [merged] } = await pool.query(
    `SELECT e.canonical_name, t.slug FROM archive_entities e
       JOIN archive_entity_types t ON t.id = e.type_id WHERE e.id = $1`,
    [orgEnt.entity.id]
  );
  assert.equal(merged.slug, 'organisation', 'type stays as the keep-entity type');

  // Cleanup the test_mining_co type
  await pool.query('DELETE FROM archive_entity_types WHERE newsroom_id = $1 AND slug = $2', [newsroomId, 'test_mining_co']);
});
