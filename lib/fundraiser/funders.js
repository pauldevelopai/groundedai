// Funder library helpers — load, list, seed defaults, format for prompts.
//
// Default funders are the major media-development donors active in Africa.
// Each is seeded PER newsroom (idempotent on first listFunders() call) so
// editors can refine the metadata to their own programme history (e.g.
// add their actual programme officer, override the application_structure
// when the funder updates its form).
//
// The default application_structure is what the funder's public guidelines
// describe at time of writing. Newsrooms should overwrite when they get
// the live form. Treated as best-effort scaffolding, not authoritative.

const { pool } = require('../db');

const DEFAULT_FUNDERS = [
  {
    name: 'Open Society Foundations — Independent Journalism',
    type: 'foundation',
    description:
      'OSF supports independent media that strengthens accountability, particularly in countries where press freedom is contested. Long-running funder of African investigative outlets.',
    focus_areas: ['independent media', 'investigative journalism', 'press freedom', 'accountability'],
    geography: ['Africa', 'Global'],
    typical_grant_range: '$50k–$500k',
    application_url: 'https://www.opensocietyfoundations.org/grants',
    application_structure: [
      { section: 'Organisation summary', word_limit: 250, prompt: 'Who you are, why you exist, what your standing in the field is.' },
      { section: 'Project description', word_limit: 800, prompt: 'What you propose to do, the problem it addresses, the change you expect to produce.' },
      { section: 'Outcomes and indicators', word_limit: 400, prompt: 'How you will measure whether the project worked. Be concrete.' },
      { section: 'Budget narrative', word_limit: 400, prompt: 'Explain the major budget categories and why each line is necessary.' },
      { section: 'Risks and mitigation', word_limit: 250, prompt: 'What could go wrong; how you will respond.' },
    ],
  },
  {
    name: 'MacArthur Foundation — Journalism & Media',
    type: 'foundation',
    description:
      'MacArthur supports nonprofit news organisations producing accountability journalism. Often funds multi-year general operating support for established outlets.',
    focus_areas: ['nonprofit news', 'accountability', 'investigative', 'public interest media'],
    geography: ['Global', 'Africa'],
    typical_grant_range: '$100k–$1M',
    application_url: 'https://www.macfound.org/programs/journalism',
    application_structure: [
      { section: 'Letter of inquiry', word_limit: 400, prompt: 'Brief introduction to your organisation and the work you would like MacArthur to consider.' },
      { section: 'Programme rationale', word_limit: 600, prompt: 'Why this work matters now, what gap it fills, and your track record on it.' },
      { section: 'Two-year plan', word_limit: 800, prompt: 'Concrete activities and milestones across the proposed period.' },
      { section: 'Budget summary', word_limit: 200, prompt: 'Total request, organisational budget, and other secured / pending support.' },
    ],
  },
  {
    name: 'Luminate',
    type: 'foundation',
    description:
      'Luminate (formerly Omidyar Network media work) backs independent media building strong democracies. Active investor in African newsroom infrastructure and convening.',
    focus_areas: ['independent media', 'civic empowerment', 'media viability', 'data & democracy'],
    geography: ['Africa', 'Global'],
    typical_grant_range: '$200k–$2M',
    application_url: 'https://luminategroup.com/work-with-us',
    application_structure: [
      { section: 'Theory of change', word_limit: 500, prompt: 'How does your work change the system you operate in? Be specific about the mechanism.' },
      { section: 'Activities', word_limit: 800, prompt: 'What will you actually do over the grant period?' },
      { section: 'Sustainability plan', word_limit: 400, prompt: 'How will the work continue after this grant.' },
      { section: 'Team', word_limit: 300, prompt: 'Who is doing the work and why they are the right people.' },
    ],
  },
  {
    name: 'Google News Initiative — Innovation Challenge Africa',
    type: 'corporate',
    description:
      'GNI funds product / business / journalism experiments at small-to-mid African outlets. Time-limited project funding rather than core support.',
    focus_areas: ['innovation', 'product', 'audience growth', 'business sustainability', 'misinformation'],
    geography: ['Africa', 'Sub-Saharan Africa'],
    typical_grant_range: '$25k–$300k',
    application_url: 'https://newsinitiative.withgoogle.com/innovation-challenges',
    application_structure: [
      { section: 'Project summary', word_limit: 200, prompt: 'One-paragraph elevator pitch.' },
      { section: 'Problem and opportunity', word_limit: 400, prompt: 'What audience problem this solves; what evidence the problem is real.' },
      { section: 'Solution', word_limit: 600, prompt: 'What you will build / test, and how.' },
      { section: 'Key metrics', word_limit: 250, prompt: 'How success will be measured. Numbers, not adjectives.' },
      { section: 'Budget', word_limit: 200, prompt: 'High-level budget breakdown.' },
    ],
  },
  {
    name: 'Ford Foundation — Public Interest Media',
    type: 'foundation',
    description:
      'Ford supports media that advances racial, social, and economic justice. Long-time supporter of African investigative reporting collaborations.',
    focus_areas: ['public interest journalism', 'social justice', 'racial equity', 'investigative collaboration'],
    geography: ['Africa', 'Global'],
    typical_grant_range: '$100k–$750k',
    application_url: 'https://www.fordfoundation.org/work/our-grants',
    application_structure: [
      { section: 'Mission alignment', word_limit: 300, prompt: 'Connect your work to Ford\'s social-justice framing — be specific about whose lives the work changes.' },
      { section: 'Programme description', word_limit: 700, prompt: 'What you will produce, how, with whom.' },
      { section: 'Equity strategy', word_limit: 400, prompt: 'How marginalised communities are represented in production, leadership, and audience.' },
      { section: 'Budget narrative', word_limit: 350, prompt: 'Explain the budget categories.' },
    ],
  },
  {
    name: 'International Fund for Public Interest Media (IFPIM)',
    type: 'foundation',
    description:
      'IFPIM is the largest dedicated multilateral fund for independent media in low- and middle-income countries. Strong Africa portfolio.',
    focus_areas: ['independent media', 'public interest', 'low-and-middle-income countries', 'media viability'],
    geography: ['Africa', 'Global South'],
    typical_grant_range: '$50k–$500k',
    application_url: 'https://ifpim.org/funding',
    application_structure: [
      { section: 'Public interest journalism case', word_limit: 500, prompt: 'Show that your work is genuinely public-interest journalism — accountability, not advocacy.' },
      { section: 'Editorial independence', word_limit: 350, prompt: 'How is your editorial independence protected from advertisers, owners, government, and parties?' },
      { section: 'Programme of work', word_limit: 700, prompt: 'What will the IFPIM grant fund.' },
      { section: 'Risk and safety', word_limit: 300, prompt: 'Reporter safety, legal exposure, digital security; what you do about each.' },
      { section: 'Budget', word_limit: 200, prompt: 'Categories and totals.' },
    ],
  },
  {
    name: 'Konrad Adenauer Stiftung — Media Africa Programme',
    type: 'foundation',
    description:
      'KAS funds media development across Sub-Saharan Africa, particularly training, regulatory advocacy, and political reporting capacity.',
    focus_areas: ['media training', 'political reporting', 'press freedom advocacy', 'regulatory'],
    geography: ['Sub-Saharan Africa'],
    typical_grant_range: '$10k–$150k',
    application_url: 'https://www.kas.de/en/web/medien-afrika',
    application_structure: [
      { section: 'Background', word_limit: 250, prompt: 'About your organisation and the political-media context you operate in.' },
      { section: 'Project objectives', word_limit: 350, prompt: 'What the project should achieve; tie to KAS strategic priorities (democracy, rule of law, plurality).' },
      { section: 'Activities and timeline', word_limit: 500, prompt: 'Workshops, productions, deliverables, dates.' },
      { section: 'Budget', word_limit: 200, prompt: 'Per-activity costs.' },
    ],
  },
  {
    name: 'Hewlett Foundation — Cyber & Democracy / Information Integrity',
    type: 'foundation',
    description:
      'Hewlett supports work on information integrity, anti-misinformation infrastructure, and the civic use of data. Active in African research collaborations.',
    focus_areas: ['information integrity', 'misinformation', 'fact-checking', 'civic data'],
    geography: ['Global', 'Africa'],
    typical_grant_range: '$75k–$500k',
    application_url: 'https://hewlett.org/grants',
    application_structure: [
      { section: 'Problem framing', word_limit: 400, prompt: 'The information-integrity problem you are addressing.' },
      { section: 'Approach', word_limit: 600, prompt: 'What you will do; what makes the approach distinct.' },
      { section: 'Evidence base', word_limit: 350, prompt: 'Research / pilot data showing the approach has merit.' },
      { section: 'Budget', word_limit: 200, prompt: 'High-level breakdown.' },
    ],
  },
];

async function seedDefaultsIfEmpty(newsroomId) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM funders WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (countRes.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const f of DEFAULT_FUNDERS) {
      await client.query(
        `INSERT INTO funders
           (newsroom_id, name, type, description, focus_areas, geography,
            typical_grant_range, application_url, application_structure,
            source, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'default', TRUE)`,
        [
          newsroomId,
          f.name,
          f.type,
          f.description,
          f.focus_areas,
          f.geography,
          f.typical_grant_range,
          f.application_url,
          JSON.stringify(f.application_structure),
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

async function listFunders(newsroomId) {
  await seedDefaultsIfEmpty(newsroomId);
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, name, type, description, focus_areas, geography,
            typical_grant_range, application_url, application_structure,
            deadlines, notes, source, is_default, created_at, updated_at
       FROM funders
      WHERE newsroom_id = $1
      ORDER BY is_default DESC, lower(name)`,
    [newsroomId]
  );
  return rows;
}

async function loadFunder(newsroomId, funderId) {
  const { rows } = await pool.query(
    `SELECT id, newsroom_id, name, type, description, focus_areas, geography,
            typical_grant_range, application_url, application_structure,
            deadlines, notes
       FROM funders
      WHERE newsroom_id = $1 AND id = $2`,
    [newsroomId, funderId]
  );
  return rows[0] || null;
}

/**
 * Compact prompt block describing a funder for the brief writer. Skips
 * empty fields. Application structure is rendered as a numbered list so
 * Claude knows exactly which sections to fill, with word limits.
 */
function formatFunderForPrompt(funder) {
  if (!funder) return null;
  const lines = [];
  lines.push(`Funder: ${funder.name}`);
  if (funder.type) lines.push(`Type: ${funder.type}`);
  if (funder.description) lines.push(`About: ${funder.description}`);
  if (funder.focus_areas?.length) lines.push(`Focus areas: ${funder.focus_areas.join(', ')}`);
  if (funder.geography?.length) lines.push(`Geography: ${funder.geography.join(', ')}`);
  if (funder.typical_grant_range) lines.push(`Typical grant size: ${funder.typical_grant_range}`);
  const structure = Array.isArray(funder.application_structure) ? funder.application_structure : [];
  if (structure.length > 0) {
    lines.push('Application structure (use these section titles and respect the word limits):');
    structure.forEach((s, i) => {
      const title = s.section || `Section ${i + 1}`;
      const limit = s.word_limit ? ` (≤ ${s.word_limit} words)` : '';
      const prompt = s.prompt ? ` — ${s.prompt}` : '';
      lines.push(`  ${i + 1}. ${title}${limit}${prompt}`);
    });
  }
  return lines.join('\n');
}

module.exports = {
  listFunders,
  loadFunder,
  seedDefaultsIfEmpty,
  formatFunderForPrompt,
  DEFAULT_FUNDERS,
};
