// Source-reputation helpers + default seed list.
//
// The default seed covers documented Russian-aligned + Chinese-aligned
// state-media properties, including their Africa-targeting sub-brands
// (Sputnik Africa / Sputnik Afrique / CGTN Africa). These are seeded
// PER newsroom on first list call so editors can refine them.
//
// References used to build the seed (all open):
//   - EU vs Disinfo (euvsdisinfo.eu) — Russian state-media properties
//   - DFRLab open reports — China + Russia information operations
//   - GMF ASD (alliancefordemocracy.org) — Authoritarian Interference
//
// This is deliberately a CONSERVATIVE list: only entities that are
// publicly attributed by multiple credible sources. Newsrooms add their
// own notes and can refine alignment per their own reporting.

const { pool } = require('../db');

const DEFAULT_SOURCES = [
  // Russian-aligned (Africa-targeted properties first — most relevant for our newsrooms)
  { identifier: 'sputnikafrica.com', identifier_kind: 'domain', display_name: 'Sputnik Africa',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Africa-targeted Sputnik sub-brand. Successor to French-language Sputnik Afrique. Operated by Rossiya Segodnya.' },
  { identifier: 'sputnikafrique.fr', identifier_kind: 'domain', display_name: 'Sputnik Afrique',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'French-language Africa-targeted Sputnik property.' },
  { identifier: 'sputnikglobe.com', identifier_kind: 'domain', display_name: 'Sputnik (global)',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Sputnik primary global-English property (replaced sputniknews.com).' },
  { identifier: 'sputniknews.com', identifier_kind: 'domain', display_name: 'Sputnik News (legacy)',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Legacy Sputnik domain — many EU-blocked redirects still in circulation.' },
  { identifier: 'rt.com', identifier_kind: 'domain', display_name: 'RT (Russia Today)',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Russian state broadcaster. EU-banned 2022; still accessible in much of Africa.' },
  { identifier: 'tass.com', identifier_kind: 'domain', display_name: 'TASS',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Russian state news agency.' },
  { identifier: 'ria.ru', identifier_kind: 'domain', display_name: 'RIA Novosti',
    alignment: 'state_russia', alignment_confidence: 0.95, country: 'RU',
    notes: 'Russian state news agency. Part of Rossiya Segodnya.' },
  { identifier: 'ruptly.tv', identifier_kind: 'domain', display_name: 'Ruptly',
    alignment: 'state_russia', alignment_confidence: 0.9, country: 'RU',
    notes: 'RT-owned video news agency.' },
  { identifier: 'southfront.org', identifier_kind: 'domain', display_name: 'SouthFront',
    alignment: 'cib_network', alignment_confidence: 0.85, country: 'RU',
    notes: 'Pro-Kremlin amplifier; documented in DFRLab and US Treasury sanctions reporting.' },
  { identifier: 'strategic-culture.org', identifier_kind: 'domain', display_name: 'Strategic Culture Foundation',
    alignment: 'cib_network', alignment_confidence: 0.85, country: 'RU',
    notes: 'GRU-linked outlet per US Treasury reporting (2021).' },

  // Chinese-aligned (Africa-targeted sub-brands first)
  { identifier: 'cgtnafrica.com', identifier_kind: 'domain', display_name: 'CGTN Africa',
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: 'CGTN Africa bureau — Africa-targeted CGTN sub-brand. Operated by China Media Group.' },
  { identifier: 'cgtn.com', identifier_kind: 'domain', display_name: 'CGTN',
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: 'China Global Television Network. State-owned by China Media Group.' },
  { identifier: 'xinhuanet.com', identifier_kind: 'domain', display_name: 'Xinhua News',
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: 'Xinhua News Agency — state news agency.' },
  { identifier: 'peopledaily.com.cn', identifier_kind: 'domain', display_name: "People's Daily",
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: "People's Daily — official CCP newspaper." },
  { identifier: 'globaltimes.cn', identifier_kind: 'domain', display_name: 'Global Times',
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: "People's Daily-affiliated tabloid; nationalist editorial slant." },
  { identifier: 'chinadaily.com.cn', identifier_kind: 'domain', display_name: 'China Daily',
    alignment: 'state_china', alignment_confidence: 0.95, country: 'CN',
    notes: 'China Daily — English-language state newspaper.' },
];

async function seedDefaultsIfEmpty(newsroomId) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM social_sources WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (countRes.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of DEFAULT_SOURCES) {
      await client.query(
        `INSERT INTO social_sources
           (newsroom_id, identifier, identifier_kind, display_name, alignment,
            alignment_confidence, country, notes, source, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'default', TRUE)
         ON CONFLICT (newsroom_id, identifier_kind, identifier) DO NOTHING`,
        [
          newsroomId, s.identifier, s.identifier_kind, s.display_name,
          s.alignment, s.alignment_confidence, s.country, s.notes,
        ]
      );
      inserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return inserted;
}

async function listSources(newsroomId) {
  await seedDefaultsIfEmpty(newsroomId);
  const { rows } = await pool.query(
    `SELECT id, identifier, identifier_kind, display_name,
            alignment, alignment_confidence, country, notes,
            source, is_default, created_at, updated_at
       FROM social_sources
      WHERE newsroom_id = $1
      ORDER BY
        CASE alignment
          WHEN 'state_russia' THEN 0
          WHEN 'state_china' THEN 1
          WHEN 'cib_network' THEN 2
          WHEN 'state_other' THEN 3
          WHEN 'extremist' THEN 4
          ELSE 5
        END,
        lower(identifier)`,
    [newsroomId]
  );
  return rows;
}

/**
 * Match a URL or handle against a newsroom's known sources. Returns the
 * highest-alignment match if any. Used by analyze.js when classifying a
 * fresh signal.
 */
async function matchUrl(newsroomId, url) {
  if (!url) return null;
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
  // Try exact + parent-domain matches (rt.com matches rt.com AND foo.rt.com).
  const segments = host.split('.');
  const candidates = [];
  for (let i = 0; i < segments.length - 1; i++) {
    candidates.push(segments.slice(i).join('.'));
  }
  if (candidates.length === 0) return null;
  const { rows } = await pool.query(
    `SELECT id, identifier, identifier_kind, display_name, alignment,
            alignment_confidence, country, notes
       FROM social_sources
      WHERE newsroom_id = $1 AND identifier_kind = 'domain' AND identifier = ANY($2::text[])
      ORDER BY alignment_confidence DESC NULLS LAST
      LIMIT 1`,
    [newsroomId, candidates]
  );
  return rows[0] || null;
}

module.exports = { listSources, matchUrl, seedDefaultsIfEmpty, DEFAULT_SOURCES };
