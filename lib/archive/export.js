// Signed JSON dataset export for the archive knowledge graph.
//
// Produces a single self-contained bundle:
//
//   {
//     "version": 1,
//     "manifest": {
//       generated_at, generator, newsroom_anonymous_id,
//       filters, counts,
//       public_key, fingerprint, content_hash, signature
//     },
//     "data": {
//       entity_types: [...], documents: [...], entities: [...],
//       mentions: [...], relationships: [...], claims: [...]
//     }
//   }
//
// Verification by a consumer (no Grounded involvement):
//   1. Re-canonicalise data → SHA-256 → must equal manifest.content_hash.
//   2. ed25519 verify(manifest.signature, manifest.content_hash, public_key) → ok.
//
// Anonymisation: filters.anonymiseByline strips byline arrays; the
// newsroom_anonymous_id is HMAC-SHA-256(newsroom_id, GROUNDED_DISTRIBUTION_KEY)
// so consumers can join exports from the same newsroom over time without
// learning the newsroom_id.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { encryptJson, decryptJson } = require('../distribution/crypto');

const BUNDLE_VERSION = 1;
const CACHE_DIR = path.join('/tmp', 'grounded-exports');

// ─── Key management ────────────────────────────────────────────────────────
// One ed25519 signing keypair per newsroom. Generated lazily on first
// export. Private key is encrypted at rest with GROUNDED_DISTRIBUTION_KEY
// (same AES-256-GCM wrapping used for distribution credentials).

async function ensureNewsroomKeypair(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, public_key, private_key_encrypted, fingerprint
       FROM archive_newsroom_keys WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (rows.length > 0) {
    const row = rows[0];
    const privateKeyRaw = decryptJson(row.private_key_encrypted);
    return {
      id: row.id,
      publicKey: row.public_key,
      privateKeyRaw,
      fingerprint: row.fingerprint,
    };
  }
  // Generate a fresh ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  // Export the raw 32-byte public key (last 32 bytes of the DER, but Node
  // gives us a JWK we can extract from cleanly)
  const pubRaw = publicKey.export({ format: 'jwk' }).x;          // base64url; we want base64
  const pubB64 = Buffer.from(pubRaw, 'base64url').toString('base64');
  const privJwk = privateKey.export({ format: 'jwk' });
  // Store the JWK so we can re-construct a KeyObject for signing later
  const fingerprint = crypto.createHash('sha256').update(Buffer.from(pubB64, 'base64')).digest('base64');
  const encrypted = encryptJson(privJwk);

  const { rows: [created] } = await pool.query(
    `INSERT INTO archive_newsroom_keys (newsroom_id, public_key, private_key_encrypted, fingerprint)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [newsroomId, pubB64, encrypted, fingerprint]
  );
  return {
    id: created.id,
    publicKey: pubB64,
    privateKeyRaw: privJwk,
    fingerprint,
  };
}

// ─── Canonical JSON ────────────────────────────────────────────────────────
// Deterministic byte representation: object keys sorted alphabetically at
// every level. Arrays stay in source order (the export module produces them
// in a stable order via ORDER BY). No trailing whitespace. UTF-8 bytes.

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  // Dates: emit ISO-8601. pg returns TIMESTAMPTZ as a Date instance; after
  // JSON.parse those become strings. We must produce identical output for
  // both forms or content_hash won't round-trip on verify.
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  // Buffer, BigInt, etc. → coerce
  return JSON.stringify(String(value));
}

function sha256Base64(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('base64');
}

function anonymiseNewsroomId(newsroomId) {
  const secret = process.env.GROUNDED_DISTRIBUTION_KEY || newsroomId; // dev fallback
  return crypto.createHmac('sha256', secret).update(newsroomId).digest('base64');
}

// ─── Bundle generation ────────────────────────────────────────────────────

/**
 * Build the data block from current DB state under the given filters.
 * Filters are simple; only beat / fromDate / toDate / includeClaims /
 * includeRelationships / anonymiseByline are honoured. Filtering at the
 * document level cascades: if a document is excluded, its entities/claims/
 * relationships only appear via OTHER documents (entities can be shared).
 */
async function loadDataBlock({ newsroomId, filters }) {
  const f = filters || {};
  const params = [newsroomId];
  const conds = ['d.newsroom_id = $1'];
  if (f.beat) {
    params.push(f.beat);
    conds.push(`d.beat = $${params.length}`);
  }
  if (f.fromDate) {
    params.push(f.fromDate);
    conds.push(`d.published_at >= $${params.length}`);
  }
  if (f.toDate) {
    params.push(f.toDate);
    conds.push(`d.published_at <= $${params.length}`);
  }
  const docWhere = conds.join(' AND ');

  // Documents — stable order by published_at then id
  const { rows: documents } = await pool.query(
    `SELECT d.id, d.title, d.filename, d.byline, d.beat, d.story_type,
            d.published_at, d.source_url, d.canonical_url, d.created_at
       FROM archive_documents d
      WHERE ${docWhere}
      ORDER BY d.published_at NULLS LAST, d.id`,
    params
  );
  const docIds = documents.map((d) => d.id);

  // Entity types visible to this newsroom (universal + custom)
  const { rows: entityTypes } = await pool.query(
    `SELECT id, slug, label, prompt_hint, kind, source_model, description
       FROM archive_entity_types
      WHERE newsroom_id IS NULL OR newsroom_id = $1
      ORDER BY kind, slug`,
    [newsroomId]
  );

  // Mentions (only for the documents in scope)
  const { rows: mentions } = docIds.length === 0 ? { rows: [] } : await pool.query(
    `SELECT id, entity_id, document_id, chunk_id, char_start, char_end,
            surface_text, confidence, extracted_by, created_at
       FROM archive_entity_mentions
      WHERE document_id = ANY($1)
      ORDER BY document_id, char_start`,
    [docIds]
  );

  // Entities — only those touched by in-scope mentions
  const entityIds = Array.from(new Set(mentions.map((m) => m.entity_id)));
  const { rows: entities } = entityIds.length === 0 ? { rows: [] } : await pool.query(
    `SELECT e.id, e.type_id, e.canonical_name, e.surface_forms,
            e.mention_count, e.metadata, e.wikidata_qid,
            e.first_seen_at, e.last_seen_at
       FROM archive_entities e
      WHERE e.id = ANY($1)
      ORDER BY e.canonical_name, e.id`,
    [entityIds]
  );

  // Relationships
  let relationships = [];
  if (f.includeRelationships !== false && docIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, subject_entity_id, predicate, object_entity_id, document_id,
              confidence, evidence_text, char_offset, extracted_by, created_at
         FROM archive_relationships
        WHERE document_id = ANY($1)
        ORDER BY document_id, id`,
      [docIds]
    );
    relationships = rows;
  }

  // Claims
  let claims = [];
  if (f.includeClaims !== false && docIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, document_id, chunk_id, claim_text, subject_entity_id,
              predicate, object_entity_id, asserted_at, byline,
              confidence, evidence_text, char_offset, extracted_by, created_at
         FROM archive_claims
        WHERE document_id = ANY($1)
        ORDER BY asserted_at NULLS LAST, id`,
      [docIds]
    );
    claims = rows;
  }

  // Optional anonymisation
  if (f.anonymiseByline) {
    for (const d of documents) d.byline = null;
    for (const c of claims) c.byline = null;
  }

  return {
    entity_types: entityTypes,
    documents,
    entities,
    mentions,
    relationships,
    claims,
  };
}

/**
 * Create a signed dataset bundle. Writes the JSON to CACHE_DIR and records
 * the export row.
 *
 * @param {object} args
 * @param {string} args.newsroomId
 * @param {string} args.userId
 * @param {string} [args.title]
 * @param {object} [args.filters]
 * @returns {Promise<{ exportId, manifest, bundlePath, sizeBytes }>}
 */
async function createExport({ newsroomId, userId, title, filters = {} }) {
  // Insert pending row first so the UI can show progress
  const exportTitle = (title && String(title).trim()) || `Archive export ${new Date().toISOString().slice(0, 10)}`;
  const { rows: [exportRow] } = await pool.query(
    `INSERT INTO archive_dataset_exports
       (newsroom_id, user_id, title, filters, counts, status)
     VALUES ($1, $2, $3, $4::jsonb, '{}'::jsonb, 'pending')
     RETURNING id`,
    [newsroomId, userId, exportTitle, JSON.stringify(filters)]
  );
  const exportId = exportRow.id;

  try {
    await pool.query(
      `UPDATE archive_dataset_exports SET status = 'generating' WHERE id = $1`,
      [exportId]
    );

    const key = await ensureNewsroomKeypair(newsroomId);
    const data = await loadDataBlock({ newsroomId, filters });
    const counts = {
      documents: data.documents.length,
      entities: data.entities.length,
      mentions: data.mentions.length,
      relationships: data.relationships.length,
      claims: data.claims.length,
      entity_types: data.entity_types.length,
    };

    // Canonicalise + hash the data block
    const canonical = canonicalize(data);
    const contentHash = sha256Base64(Buffer.from(canonical, 'utf8'));

    // Sign content_hash bytes with the newsroom's ed25519 key
    const privKeyObj = crypto.createPrivateKey({ key: key.privateKeyRaw, format: 'jwk' });
    const signature = crypto.sign(
      null, // ed25519 doesn't take a hash algorithm
      Buffer.from(contentHash, 'base64'),
      privKeyObj
    ).toString('base64');

    const manifest = {
      version: BUNDLE_VERSION,
      generated_at: new Date().toISOString(),
      generator: 'grounded-archive-export',
      newsroom_anonymous_id: anonymiseNewsroomId(newsroomId),
      filters,
      counts,
      public_key: key.publicKey,
      key_fingerprint: key.fingerprint,
      content_hash: contentHash,
      signature,
    };

    const bundle = { version: BUNDLE_VERSION, manifest, data };
    const json = JSON.stringify(bundle, null, 2);

    // Write to cache dir
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const bundlePath = path.join(CACHE_DIR, `${exportId}.json`);
    fs.writeFileSync(bundlePath, json, 'utf8');
    const sizeBytes = Buffer.byteLength(json, 'utf8');

    // Bundle expires after 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    await pool.query(
      `UPDATE archive_dataset_exports
          SET status = 'ready', counts = $1::jsonb, content_hash = $2, signature = $3,
              public_key = $4, manifest = $5::jsonb, size_bytes = $6, bundle_path = $7,
              completed_at = NOW(), expires_at = $8
        WHERE id = $9`,
      [JSON.stringify(counts), contentHash, signature, key.publicKey,
       JSON.stringify(manifest), sizeBytes, bundlePath, expiresAt, exportId]
    );

    return { exportId, manifest, bundlePath, sizeBytes };
  } catch (err) {
    await pool.query(
      `UPDATE archive_dataset_exports SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [err.message || String(err), exportId]
    );
    throw err;
  }
}

/**
 * Verify a bundle. Used by tests + can be exposed as a public endpoint for
 * consumers that want to check provenance without a Grounded account.
 *
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return { valid: false, reason: 'not an object' };
  if (bundle.version !== BUNDLE_VERSION) return { valid: false, reason: `unsupported version ${bundle.version}` };
  const m = bundle.manifest;
  if (!m || !m.content_hash || !m.signature || !m.public_key) {
    return { valid: false, reason: 'manifest missing required fields' };
  }
  // 1. Recompute content_hash
  const canonical = canonicalize(bundle.data);
  const recomputed = sha256Base64(Buffer.from(canonical, 'utf8'));
  if (recomputed !== m.content_hash) {
    return { valid: false, reason: 'content_hash mismatch — data has been tampered with' };
  }
  // 2. Verify signature
  try {
    const pubBuf = Buffer.from(m.public_key, 'base64');
    const pubKeyObj = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: pubBuf.toString('base64url') },
      format: 'jwk',
    });
    const ok = crypto.verify(
      null,
      Buffer.from(m.content_hash, 'base64'),
      pubKeyObj,
      Buffer.from(m.signature, 'base64')
    );
    if (!ok) return { valid: false, reason: 'signature does not match' };
  } catch (e) {
    return { valid: false, reason: `signature verification error: ${e.message}` };
  }
  return { valid: true };
}

module.exports = {
  ensureNewsroomKeypair,
  createExport,
  verifyBundle,
  canonicalize,
  sha256Base64,
  BUNDLE_VERSION,
};
