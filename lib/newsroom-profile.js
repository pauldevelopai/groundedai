// Newsroom-profile helpers — load / upsert / format.
// Other agents that need the profile (Fundraiser, Audience, Producer,
// Drafter) call loadProfile() server-side and consume the structured
// result. UI uses upsertProfile() for editor saves.

const { pool } = require('./db');

/**
 * Load the profile for a newsroom. Returns null if no row yet.
 */
async function loadProfile(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, tagline, mission, strengths, beats, geography,
            audience_summary, audience_size_monthly, audience_demographics,
            primary_platforms, primary_languages,
            voice, style_notes, ethics_policy,
            impact_stories, awards, additional_notes, metadata,
            updated_by, created_at, updated_at
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [newsroomId]
  );
  return rows[0] || null;
}

/**
 * Upsert: create the row on first call; update on subsequent calls.
 * Caller passes only the fields they want to set; everything else is
 * preserved (or DEFAULT on create).
 */
async function upsertProfile(newsroomId, userId, patch) {
  const fields = [
    'tagline', 'mission',
    'strengths', 'beats', 'geography',
    'audience_summary', 'audience_size_monthly', 'audience_demographics',
    'primary_platforms', 'primary_languages',
    'voice', 'style_notes', 'ethics_policy',
    'impact_stories', 'awards',
    'additional_notes', 'metadata',
  ];

  // Build INSERT ... ON CONFLICT DO UPDATE that only sets fields actually
  // present in patch. Defaults from the table schema cover the rest on insert.
  const insertCols = ['newsroom_id', 'updated_by'];
  const insertVals = [newsroomId, userId || null];
  const updateSets = ['updated_by = EXCLUDED.updated_by', 'updated_at = NOW()'];
  for (const f of fields) {
    if (patch[f] === undefined) continue;
    insertCols.push(f);
    insertVals.push(serialiseValue(f, patch[f]));
    updateSets.push(`${f} = EXCLUDED.${f}`);
  }
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    INSERT INTO newsroom_profiles (${insertCols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (newsroom_id) DO UPDATE SET ${updateSets.join(', ')}
    RETURNING id, newsroom_id, tagline, mission, strengths, beats, geography,
              audience_summary, audience_size_monthly, audience_demographics,
              primary_platforms, primary_languages,
              voice, style_notes, ethics_policy,
              impact_stories, awards, additional_notes, metadata,
              updated_by, created_at, updated_at
  `;
  const { rows } = await pool.query(sql, insertVals);
  return rows[0];
}

function serialiseValue(field, value) {
  // JSONB fields need stringification.
  if (
    field === 'audience_demographics' ||
    field === 'impact_stories' ||
    field === 'awards' ||
    field === 'metadata'
  ) {
    return JSON.stringify(value ?? (field === 'audience_demographics' || field === 'metadata' ? {} : []));
  }
  // INTEGER nullable
  if (field === 'audience_size_monthly') {
    if (value === null || value === '' || value === undefined) return null;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  // TEXT[] fields — accept either array or comma-separated string
  if (
    field === 'strengths' ||
    field === 'beats' ||
    field === 'geography' ||
    field === 'primary_platforms' ||
    field === 'primary_languages'
  ) {
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }
  // TEXT
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

/**
 * Render the profile as a compact block of text downstream agents can
 * include verbatim in a Claude prompt as system context. Skips empty
 * fields. Stable order so prompts are reproducible.
 */
function formatForPrompt(profile) {
  if (!profile) return null;
  const lines = [];
  if (profile.tagline) lines.push(`Newsroom tagline: ${profile.tagline}`);
  if (profile.mission) lines.push(`Mission: ${profile.mission}`);
  if (profile.strengths?.length) lines.push(`Strengths: ${profile.strengths.join(', ')}`);
  if (profile.beats?.length) lines.push(`Beats: ${profile.beats.join(', ')}`);
  if (profile.geography?.length) lines.push(`Coverage areas: ${profile.geography.join(', ')}`);
  if (profile.primary_languages?.length) lines.push(`Primary languages: ${profile.primary_languages.join(', ')}`);
  if (profile.primary_platforms?.length) lines.push(`Primary platforms: ${profile.primary_platforms.join(', ')}`);
  if (profile.audience_summary) lines.push(`Audience summary: ${profile.audience_summary}`);
  if (profile.audience_size_monthly) lines.push(`Approx monthly readers: ${profile.audience_size_monthly}`);
  if (profile.voice) lines.push(`Voice: ${profile.voice}`);
  if (profile.style_notes) lines.push(`Style notes: ${profile.style_notes}`);
  if (profile.ethics_policy) lines.push(`Ethics policy: ${profile.ethics_policy}`);
  if (Array.isArray(profile.impact_stories) && profile.impact_stories.length) {
    lines.push('Impact stories:');
    for (const s of profile.impact_stories) {
      if (!s || typeof s !== 'object') continue;
      const bits = [s.headline, s.year, s.outcome].filter(Boolean).join(' — ');
      if (bits) lines.push(`  · ${bits}`);
    }
  }
  // Optional house-style fingerprint (Step 4 of the consolidation plan).
  // Gated by GROUNDED_STYLE_FINGERPRINT_IN_PROMPT=on so we can review real
  // outputs before flipping. With the flag off, the prompt is byte-identical
  // to before this change.
  if (process.env.GROUNDED_STYLE_FINGERPRINT_IN_PROMPT === 'on') {
    const fp = profile.metadata?.house_style_fingerprint;
    if (fp) {
      try {
        const { formatBandedBlock } = require('./newsroom-profile/style-fingerprint');
        const block = formatBandedBlock(fp);
        if (block) lines.push(block);
      } catch (e) {
        // non-fatal
      }
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

module.exports = { loadProfile, upsertProfile, formatForPrompt };
