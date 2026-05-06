// Audience persona helpers — load, upsert, and seed the defaults the
// AGENTS.md spec requires per newsroom: low-data, vernacular-first,
// feature-phone. Defaults are seeded PER newsroom on first call to
// listPersonas() so editors can refine them to their actual audience.
//
// The default seed is deliberately specific about WHO these readers are —
// generic personas produce generic focus-group reactions; opinionated
// defaults produce useful signal even before the newsroom adds custom
// personas of their own.

const { pool } = require('../db');

const DEFAULT_PERSONAS = [
  {
    name: 'Low-data smartphone reader',
    archetype: 'low_data',
    description:
      'Reads news on a smartphone with a tight monthly data budget (1–2 GB), often on a pay-as-you-go plan. Skips images and embedded video. Forwards stories family members will care about over WhatsApp. Will not pay a paywall, will not enter their number for OTP-walled content. Reads in short bursts on the commute.',
    age_range: '25-45',
    location: 'Urban townships and peri-urban areas',
    languages: ['en', 'zu', 'xh', 'sn', 'ny'],
    device: 'low_data_smartphone',
    reading_habits:
      'Headlines first; reads the lede; opens 1-in-5 stories. Bounces from heavy pages. Trusts WhatsApp forwards from named family members more than push notifications from publishers they do not know.',
    primary_platforms: ['whatsapp', 'fb'],
    trust_signals:
      'Named beat reporter they have heard of. Stories that align with what people in their group chats are saying. Photos that look like a real photographer took them, not a stock library.',
    interests: ['cost of living', 'jobs', 'corruption that affects services', 'crime in their area', 'football'],
  },
  {
    name: 'Vernacular-first reader',
    archetype: 'vernacular_first',
    description:
      "Speaks English fluently for work but prefers to read news in their home language. Notices when place names, people's names, and idiom are pronounced or spelled wrong. Will share a story written in their language with people who will not click on the same story in English.",
    age_range: '30-60',
    location: 'Mixed urban / rural; family ties to a specific region',
    languages: ['zu', 'xh', 'st', 'tn', 'ss', 'nso', 'sn', 'nd', 'ny'],
    device: 'smartphone',
    reading_habits:
      'Reads bilingually but emotionally engages with the home-language version. Distrusts heavy English jargon ("stakeholders", "mitigate", "going forward") and abrupt translations that flatten cultural specifics.',
    primary_platforms: ['whatsapp', 'fb', 'newsletter', 'radio'],
    trust_signals:
      'Local figure names spelled correctly. Reference to community structures (chiefs, ward councillors, school principals) by name. Place-name pronunciations the reader would actually say.',
    interests: ['local government', 'land', 'education', 'cultural events', 'family / community stories'],
  },
  {
    name: 'Feature-phone reader',
    archetype: 'feature_phone',
    description:
      'Accesses news primarily over USSD short codes, WhatsApp text, SMS subscriptions, or radio. Cannot view images or video at all. Reads in 160-character chunks. Forwards messages to relatives in the village. Trusts named hosts and beat reporters they have heard before on radio more than they trust any website.',
    age_range: '40-70',
    location: 'Rural areas, smaller towns, low-connectivity neighbourhoods',
    languages: ['en', 'zu', 'xh', 'st', 'sn', 'ny', 'bem'],
    device: 'feature_phone',
    reading_habits:
      'Listens before reads. Reads short text. Wants who-what-where in the first sentence; everything else is bonus. Will not navigate; expects to be sent the story directly.',
    primary_platforms: ['radio', 'whatsapp_text', 'sms'],
    trust_signals:
      'Voices they recognise from radio. Named reporters they have heard before. Stories that match what their pastor / chief / ward councillor said this week.',
    interests: ['weather', 'farming', 'pension and grant news', 'local elections', 'church / community'],
  },
];

/**
 * Insert the default personas for a newsroom if it has none. Idempotent —
 * checks count first; only seeds when zero. Returns the number seeded.
 */
async function seedDefaultsIfEmpty(newsroomId) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audience_personas WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (countRes.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of DEFAULT_PERSONAS) {
      await client.query(
        `INSERT INTO audience_personas
           (newsroom_id, name, archetype, description, age_range, location,
            languages, device, reading_habits, primary_platforms, trust_signals,
            interests, source, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'default', TRUE)`,
        [
          newsroomId,
          p.name,
          p.archetype,
          p.description,
          p.age_range,
          p.location,
          p.languages,
          p.device,
          p.reading_habits,
          p.primary_platforms,
          p.trust_signals,
          p.interests,
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

async function listPersonas(newsroomId) {
  await seedDefaultsIfEmpty(newsroomId);
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, name, archetype, description, age_range, location,
            languages, device, reading_habits, primary_platforms, trust_signals,
            interests, source, is_default, created_at, updated_at
       FROM audience_personas
      WHERE newsroom_id = $1
      ORDER BY is_default DESC, lower(name)`,
    [newsroomId]
  );
  return rows;
}

async function loadPersonas(newsroomId, ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, name, archetype, description, age_range, location,
            languages, device, reading_habits, primary_platforms, trust_signals,
            interests, source, is_default
       FROM audience_personas
      WHERE newsroom_id = $1 AND id = ANY($2::uuid[])
      ORDER BY lower(name)`,
    [newsroomId, ids]
  );
  return rows;
}

/**
 * Render a persona as a compact prompt block — used by the focus-group
 * runner so each persona has a stable description Claude can roleplay
 * against.
 */
function formatPersonaForPrompt(p) {
  const lines = [];
  lines.push(`Persona: ${p.name} (${p.archetype})`);
  if (p.description) lines.push(`  ${p.description}`);
  if (p.age_range) lines.push(`  Age: ${p.age_range}`);
  if (p.location) lines.push(`  Location: ${p.location}`);
  if (p.languages?.length) lines.push(`  Languages: ${p.languages.join(', ')}`);
  if (p.device) lines.push(`  Device: ${p.device}`);
  if (p.reading_habits) lines.push(`  Reading habits: ${p.reading_habits}`);
  if (p.primary_platforms?.length) lines.push(`  Primary platforms: ${p.primary_platforms.join(', ')}`);
  if (p.trust_signals) lines.push(`  Trust signals: ${p.trust_signals}`);
  if (p.interests?.length) lines.push(`  Interests: ${p.interests.join(', ')}`);
  return lines.join('\n');
}

module.exports = { listPersonas, loadPersonas, seedDefaultsIfEmpty, formatPersonaForPrompt, DEFAULT_PERSONAS };
