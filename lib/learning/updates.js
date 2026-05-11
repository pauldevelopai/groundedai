// Learning-layer updates feed. Curated AI-ethics / data-law / security /
// governance / press-freedom items that are relevant to African newsrooms.
//
// Default seed: ~10 real, citable updates from named public sources.
// These are conservative picks — only items where the source is named,
// the URL is public, and the relevance to an African newsroom is direct.
// Newsroom admins refine these and add their own.
//
// Cohort-shared updates have newsroom_id = NULL. Per-newsroom private
// notes have newsroom_id set.

const { pool } = require('../db');

const DEFAULT_UPDATES = [
  {
    title: 'POPIA enforcement: Information Regulator publishes annual report',
    body:
      'South Africa\'s Information Regulator publishes annual enforcement reports under POPIA (Protection of Personal Information Act). Newsrooms processing personal data — sources, audience analytics, contributor records — should review the most recent report for enforcement priorities, especially around data retention, journalistic exemption boundaries, and breach-notification timelines.',
    kind: 'data_law',
    severity: 'advisory',
    source_publisher: 'Information Regulator (South Africa)',
    source_url: 'https://inforegulator.org.za/',
    published_at: '2024-06-01',
    applies_to_agents: ['operations', 'distributor', 'audience'],
    country_scope: ['ZA'],
  },
  {
    title: 'EU AI Act: high-risk system classification',
    body:
      'The EU AI Act classifies certain content-generation and biometric-identification systems as "high-risk", with documentation + human-oversight requirements. Africa-based newsrooms publishing into the EU market or using EU-routed AI services should map their workflows against the Act\'s obligations. Particular attention: synthetic-media disclosure (Art. 50) and high-risk-system documentation.',
    kind: 'governance',
    severity: 'advisory',
    source_publisher: 'European Union',
    source_url: 'https://artificialintelligenceact.eu/',
    published_at: '2024-08-01',
    applies_to_agents: ['producer', 'translator', 'verifier'],
    country_scope: ['EU', 'global'],
  },
  {
    title: 'African Union Continental AI Strategy',
    body:
      'The African Union published a Continental AI Strategy in 2024, framing AI development priorities for member states. Newsrooms should track how this is translated into national policy, particularly around AI in elections, content moderation, and platform regulation.',
    kind: 'governance',
    severity: 'info',
    source_publisher: 'African Union',
    source_url: 'https://au.int/',
    published_at: '2024-08-01',
    applies_to_agents: [],
    country_scope: ['ZA', 'ZW', 'ZM', 'KE', 'global'],
  },
  {
    title: 'Meta Adversarial Threat Reports — quarterly',
    body:
      'Meta publishes quarterly Adversarial Threat Reports detailing coordinated inauthentic behaviour networks taken down on Facebook + Instagram. African newsrooms covering disinformation should track these — they routinely name specific Russia-aligned and China-aligned operations targeting African audiences (e.g. Doppelganger, Spamouflage Dragon, Wagner-affiliated networks). Anchor\'s Social Listener registry mirrors documented entries.',
    kind: 'platform_takedown',
    severity: 'advisory',
    source_publisher: 'Meta',
    source_url: 'https://about.fb.com/news/tag/coordinated-inauthentic-behavior/',
    published_at: '2024-08-01',
    applies_to_agents: ['social_listener', 'verifier'],
    country_scope: ['global'],
  },
  {
    title: 'Stanford Internet Observatory — African Initiative attribution',
    body:
      'Stanford Internet Observatory (and Insikt Group / Recorded Future) published attribution research naming the "African Initiative" as a Russia-linked information operation explicitly targeting African audiences (Mali, Burkina Faso, CAR, increasingly Zambia / SA / Mozambique). Newsrooms reporting on Russia-Africa narratives should treat content from this network as documented foreign influence.',
    kind: 'security',
    severity: 'advisory',
    source_publisher: 'Stanford Internet Observatory',
    source_url: 'https://cyber.fsi.stanford.edu/io',
    published_at: '2023-11-01',
    applies_to_agents: ['social_listener', 'verifier'],
    country_scope: ['ZA', 'ZW', 'ZM', 'KE'],
  },
  {
    title: 'MISA Africa — annual State of Press Freedom',
    body:
      'Media Institute of Southern Africa publishes an annual State of Press Freedom report covering Zambia, Zimbabwe, South Africa, and other SADC countries. Newsrooms in the cohort should review for trends in journalist safety, legal threats, and media-law changes.',
    kind: 'press_freedom',
    severity: 'info',
    source_publisher: 'MISA Africa',
    source_url: 'https://www.misa.org/',
    published_at: '2024-05-01',
    applies_to_agents: ['operations'],
    country_scope: ['ZA', 'ZW', 'ZM'],
  },
  {
    title: 'CIPESA — State of Internet Freedom in Africa',
    body:
      'Collaboration on International ICT Policy for East and Southern Africa (CIPESA) publishes annual State of Internet Freedom in Africa reports covering surveillance, internet shutdowns, content regulation, and digital rights across the continent. Direct relevance to newsrooms covering digital-rights stories.',
    kind: 'press_freedom',
    severity: 'info',
    source_publisher: 'CIPESA',
    source_url: 'https://cipesa.org/',
    published_at: '2024-09-01',
    applies_to_agents: [],
    country_scope: ['ZA', 'ZW', 'ZM', 'KE'],
  },
  {
    title: 'Anthropic deprecation policy — Claude model lifecycle',
    body:
      'Anthropic publishes deprecation timelines for Claude model versions. Anchor pins to Claude Haiku 4.5 (id claude-haiku-4-5-20251001) for every agent. When Anthropic announces the eventual deprecation of this model, the Anchor migration plan is to bump to the successor Haiku version and re-test prompts. The local-Ollama fallback (lib/claude.js) covers availability gaps in the meantime.',
    kind: 'model_change',
    severity: 'info',
    source_publisher: 'Anthropic',
    source_url: 'https://docs.anthropic.com/en/docs/about-claude/model-deprecations',
    published_at: '2025-10-01',
    applies_to_agents: [],
    country_scope: ['global'],
  },
  {
    title: 'Hugging Face — Transformers.js model availability',
    body:
      'Anchor uses Transformers.js for in-process OSS models (BGE-M3 for embeddings, Whisper-base for STT, BERT multilingual NER, Wikineural). When a model is moved between organisations on Hugging Face (e.g. Xenova → onnx-community), in-process loaders fail until the loader path is updated. Track HF announcements for repository moves; Anchor includes deterministic fallbacks where possible (e.g. script-ratio language detection).',
    kind: 'model_change',
    severity: 'info',
    source_publisher: 'Hugging Face',
    source_url: 'https://huggingface.co/',
    published_at: '2024-12-01',
    applies_to_agents: ['archivist', 'producer', 'social_listener'],
    country_scope: ['global'],
  },
  {
    title: 'Convention 108+ ratifications across Africa',
    body:
      'Council of Europe Convention 108+ is the international framework for personal-data protection. Several African countries are in various stages of ratification or aligning national law with its principles (notably Senegal, Mauritius, Cabo Verde). Newsrooms processing personal data of EU + Convention-state subjects should track which states their reporting touches.',
    kind: 'data_law',
    severity: 'info',
    source_publisher: 'Council of Europe',
    source_url: 'https://www.coe.int/en/web/data-protection/convention108-and-protocol',
    published_at: '2024-01-01',
    applies_to_agents: ['operations', 'audience'],
    country_scope: ['global'],
  },
];

async function seedDefaultsIfEmpty() {
  // Cohort-shared defaults are stored with newsroom_id=NULL. Seed once
  // for the cohort (not per-newsroom) — every newsroom sees the same
  // shared feed plus their own private notes.
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM learning_updates WHERE is_default = TRUE`);
  if (r.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of DEFAULT_UPDATES) {
      await client.query(
        `INSERT INTO learning_updates
           (newsroom_id, title, body, kind, severity,
            source_publisher, source_url, published_at,
            applies_to_agents, country_scope, is_default, source)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7::date, $8, $9, TRUE, 'default')`,
        [
          u.title, u.body, u.kind, u.severity,
          u.source_publisher, u.source_url, u.published_at,
          u.applies_to_agents, u.country_scope,
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

/**
 * List updates visible to a newsroom: cohort-shared defaults + their
 * own private notes. Acknowledgement decisions are joined in.
 */
async function listUpdates(newsroomId, opts = {}) {
  await seedDefaultsIfEmpty();
  const params = [newsroomId];
  let where = '(u.newsroom_id IS NULL OR u.newsroom_id = $1)';
  if (opts.kind) { params.push(opts.kind); where += ` AND u.kind = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT u.id, u.newsroom_id, u.title, u.body, u.kind, u.severity,
            u.source_publisher, u.source_url, u.published_at,
            u.applies_to_agents, u.country_scope,
            u.is_default, u.source, u.created_at, u.updated_at,
            ack.decision AS ack_decision, ack.notes AS ack_notes,
            ack.updated_at AS ack_updated_at
       FROM learning_updates u
       LEFT JOIN learning_update_acknowledgements ack
         ON ack.update_id = u.id AND ack.newsroom_id = $1
      WHERE ${where}
      ORDER BY
        CASE u.severity WHEN 'urgent' THEN 0 WHEN 'advisory' THEN 1 ELSE 2 END,
        u.published_at DESC NULLS LAST,
        u.created_at DESC`,
    params
  );
  return rows;
}

module.exports = { listUpdates, seedDefaultsIfEmpty, DEFAULT_UPDATES };
