// Pilot newsroom seed — 5 ZimZam newsrooms named in HANDOFF §1.
//
// Run: npm run seed:pilots
//
// Idempotent — safe to re-run. Each newsroom gets:
//   - a stable airtable_record_id placeholder (will be reconciled by the
//     post-pilot Airtable sync via the upsert key)
//   - an admin user with a generated initial password (printed once)
//   - a starter newsroom_profile with mission / beats / geography / voice
//     notes drafted from public bios. Editors refine on first login.
//
// Initial passwords are randomly generated per seed run and printed to the
// console. NEVER commit a .seed-passwords file; share each password
// out-of-band with the newsroom's AI champion.

const crypto = require('node:crypto');
const { pool } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

// ─── The 5 pilot newsrooms ──────────────────────────────────────────────────

const PILOTS = [
  {
    airtable_record_id: 'recPILOT_CAPITALFM_LSK',
    name: 'Capital FM Lusaka',
    country: 'ZM',
    status: 'pilot',
    admin_email: 'champion@capitalfm.co.zm',
    profile: {
      tagline: 'Independent radio + news from Lusaka.',
      mission: 'Capital FM Lusaka broadcasts independent news, talk, and music for an urban Zambian audience. The newsroom files live bulletins, talk segments, and digital reporting.',
      strengths: ['live news', 'talk radio', 'urban audience', 'breaking news'],
      beats: ['politics', 'business', 'economy', 'local government', 'lifestyle'],
      geography: ['Lusaka', 'Zambia', 'Copperbelt'],
      primary_languages: ['en', 'bem', 'ny'],
      primary_platforms: ['radio', 'web', 'whatsapp'],
      voice: 'Clear, conversational, accessible. Treats listeners as informed adults.',
      style_notes: 'Lead with the news, not the framing. Use ZMW for kwacha. Spell out acronyms on first use.',
      ethics_policy: 'Two-source rule for accusations against named individuals. Right of reply within 24h before publication.',
    },
  },
  {
    airtable_record_id: 'recPILOT_ENVIROPRESS',
    name: 'EnviroPress',
    country: 'ZM',
    status: 'pilot',
    admin_email: 'champion@enviropress.zm',
    profile: {
      tagline: 'Environmental journalism for Zambia and the Zambezi basin.',
      mission: 'EnviroPress reports on climate, conservation, water, mining impacts, and rural environmental governance in Zambia and the Zambezi basin. Long-form investigative with explanatory desk pieces.',
      strengths: ['environmental investigation', 'climate', 'mining accountability', 'data journalism', 'visual reporting'],
      beats: ['climate change', 'mining', 'water', 'conservation', 'rural governance', 'wildlife'],
      geography: ['Zambia', 'Zambezi basin', 'Copperbelt', 'North-Western Province', 'Luangwa'],
      primary_languages: ['en'],
      primary_platforms: ['web', 'newsletter', 'whatsapp'],
      voice: 'Careful, explanatory, on the side of communities affected by environmental harm. Skeptical of corporate and state PR.',
      style_notes: 'Always name the affected community before the harming actor. Use metric units. Cite specific permits / regulations.',
      ethics_policy: 'Disclose any funding tied to environmental topics covered. No conflicts of interest. Mining-company sources flagged with company name.',
    },
  },
  {
    airtable_record_id: 'recPILOT_MAKANDAY',
    name: 'MakanDay',
    country: 'ZM',
    status: 'pilot',
    admin_email: 'champion@makanday.com',
    profile: {
      tagline: 'Investigative journalism for Zambia.',
      mission: 'MakanDay is an investigative newsroom focused on accountability — public procurement, regulatory capture, political finance, and the rule of law in Zambia.',
      strengths: ['investigations', 'document-driven reporting', 'court coverage', 'public records'],
      beats: ['investigations', 'corruption', 'courts', 'public finance', 'procurement', 'political party finance'],
      geography: ['Zambia', 'Lusaka', 'Copperbelt'],
      primary_languages: ['en'],
      primary_platforms: ['web', 'newsletter'],
      voice: 'Restrained, evidence-led, comfortable with complexity. Avoids editorialising; lets the documents speak.',
      style_notes: 'Every claim about a named individual or entity carries a source. Use ZMW. Spell out ACC, FIC, ZRA on first use.',
      ethics_policy: 'POPIA-aligned data handling. All subjects of investigations receive a right-of-reply letter with a 7-day window before publication.',
    },
  },
  {
    airtable_record_id: 'recPILOT_MARICHO',
    name: 'Maricho Media',
    country: 'ZW',
    status: 'pilot',
    admin_email: 'champion@marichomedia.co.zw',
    profile: {
      tagline: 'Digital-first reporting from Zimbabwe.',
      mission: 'Maricho Media covers Zimbabwean politics, economy, and civil society for a digital-first audience inside and outside the country. Mix of original reporting and explainers.',
      strengths: ['digital reporting', 'politics', 'civil society', 'diaspora audience'],
      beats: ['politics', 'economy', 'ZANU-PF', 'opposition', 'civil society', 'diaspora'],
      geography: ['Zimbabwe', 'Harare', 'Bulawayo', 'Manicaland', 'South Africa diaspora'],
      primary_languages: ['en', 'sn', 'nd'],
      primary_platforms: ['web', 'x', 'whatsapp', 'fb'],
      voice: 'Punchy, sceptical of all sides, accessible to a young audience without dumbing down.',
      style_notes: 'Use USD when a price is quoted in USD; convert ZWL only when needed. Spell out ZANU-PF, ZEC, ZACC on first use.',
      ethics_policy: 'Press-freedom defences first. Source-protection mandatory. Anonymous sources must be corroborated by a second on-the-record source unless the editor signs off in writing.',
    },
  },
  {
    airtable_record_id: 'recPILOT_VICFALLS',
    name: 'VicFallsLive',
    country: 'ZW',
    status: 'pilot',
    admin_email: 'champion@vicfallslive.com',
    profile: {
      tagline: 'News from Victoria Falls and the Zambezi region.',
      mission: 'VicFallsLive is the local newsroom for Victoria Falls, Hwange, and the Zambezi region. Tourism, conservation, cross-border trade, and local governance.',
      strengths: ['hyperlocal', 'tourism', 'wildlife', 'cross-border', 'Hwange National Park'],
      beats: ['tourism', 'wildlife', 'local government', 'cross-border trade', 'conservation'],
      geography: ['Victoria Falls', 'Hwange', 'Matabeleland North', 'Zambezi region', 'Livingstone'],
      primary_languages: ['en', 'nd'],
      primary_platforms: ['web', 'whatsapp', 'fb'],
      voice: 'Hyperlocal, plain, oriented to residents and to the tourism trade that anchors the local economy.',
      style_notes: 'Always note when an event affects cross-border travel. Use USD for tourism prices, ZWL only when official. Spell out HNP for Hwange National Park.',
      ethics_policy: 'Tourism-operator sources disclosed by name. No paid editorial.',
    },
  },
];

function genPassword() {
  // 16 url-safe chars — enough entropy, easy to share
  return crypto.randomBytes(12).toString('base64url');
}

async function upsertNewsroom(p) {
  const { rows } = await pool.query(
    `INSERT INTO newsrooms (airtable_record_id, name, country, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (airtable_record_id) DO UPDATE
        SET name = EXCLUDED.name, country = EXCLUDED.country,
            status = EXCLUDED.status, updated_at = NOW()
     RETURNING id, name, (xmax = 0) AS was_inserted`,
    [p.airtable_record_id, p.name, p.country, p.status]
  );
  return rows[0];
}

async function ensureAdmin(newsroomId, email) {
  const existing = await pool.query(
    `SELECT id FROM users WHERE newsroom_id = $1 AND email = $2`,
    [newsroomId, email]
  );
  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, password: null }; // existing — don't reset
  }
  const password = genPassword();
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (newsroom_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     RETURNING id`,
    [newsroomId, email, hash]
  );
  return { id: rows[0].id, password };
}

async function ensureJurisdiction(newsroomId, jurisdiction) {
  // Sets newsroom_profile.metadata.jurisdiction if not already set.
  // The metadata column is JSONB; we use jsonb_set with create_missing=true.
  await pool.query(
    `UPDATE newsroom_profiles
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{jurisdiction}',
              to_jsonb($2::text),
              true
            ),
            updated_at = NOW()
      WHERE newsroom_id = $1
        AND (metadata->>'jurisdiction' IS NULL OR metadata->>'jurisdiction' = '')`,
    [newsroomId, jurisdiction]
  );
}

// Sample external-tool inventory rows so a fresh pilot newsroom has
// something for the Digital Security Audit to score on first run.
// Idempotent: skipped if any rows already exist for the newsroom.
const SAMPLE_SECURITY_TOOLS = [
  {
    vendor: 'OpenAI',
    tool_name: 'ChatGPT',
    data_residency: 'US',
    declared_use: 'Drafting social copy and headline variants',
    data_kinds_exposed: ['unpublished_drafts'],
    notes: 'Free tier currently — Enterprise upgrade under review.',
  },
  {
    vendor: 'Google',
    tool_name: 'Google Workspace (Docs / Gmail / Drive)',
    data_residency: 'US',
    declared_use: 'Editorial docs, story drafts, internal email',
    data_kinds_exposed: ['unpublished_drafts', 'source_contacts'],
    notes: 'Default newsroom workspace.',
  },
  {
    vendor: 'Meta',
    tool_name: 'WhatsApp Business',
    data_residency: 'US',
    declared_use: 'Tip line + audience comms',
    data_kinds_exposed: ['source_contacts', 'audience_pii'],
    notes: 'Source contacts arrive here via the tip-line number.',
  },
];

async function seedSecurityInventory(newsroomId, addedByUserId) {
  const existing = await pool.query(
    `SELECT 1 FROM security_external_tools WHERE newsroom_id = $1 LIMIT 1`,
    [newsroomId]
  );
  if (existing.rows.length > 0) return { seeded: false };

  for (const t of SAMPLE_SECURITY_TOOLS) {
    await pool.query(
      `INSERT INTO security_external_tools
         (newsroom_id, added_by, vendor, tool_name, data_residency,
          declared_use, data_kinds_exposed, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newsroomId, addedByUserId,
        t.vendor, t.tool_name, t.data_residency, t.declared_use,
        t.data_kinds_exposed, t.notes,
      ]
    );
  }
  return { seeded: true, count: SAMPLE_SECURITY_TOOLS.length };
}

async function upsertProfile(newsroomId, userId, profile) {
  // Use the same shape as lib/newsroom-profile.js#upsertProfile so the seed
  // matches what the workspace would write. Fields not present here stay at
  // their defaults.
  const cols = [
    'newsroom_id', 'tagline', 'mission', 'strengths', 'beats',
    'geography', 'primary_languages', 'primary_platforms', 'voice',
    'style_notes', 'ethics_policy', 'updated_by',
  ];
  const vals = [
    newsroomId, profile.tagline || null, profile.mission || null,
    profile.strengths || [], profile.beats || [], profile.geography || [],
    profile.primary_languages || [], profile.primary_platforms || [],
    profile.voice || null, profile.style_notes || null,
    profile.ethics_policy || null, userId,
  ];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(
    `INSERT INTO newsroom_profiles (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (newsroom_id) DO UPDATE SET
        tagline = COALESCE(newsroom_profiles.tagline, EXCLUDED.tagline),
        mission = COALESCE(newsroom_profiles.mission, EXCLUDED.mission),
        strengths = CASE WHEN cardinality(newsroom_profiles.strengths) = 0
                         THEN EXCLUDED.strengths ELSE newsroom_profiles.strengths END,
        beats = CASE WHEN cardinality(newsroom_profiles.beats) = 0
                     THEN EXCLUDED.beats ELSE newsroom_profiles.beats END,
        geography = CASE WHEN cardinality(newsroom_profiles.geography) = 0
                         THEN EXCLUDED.geography ELSE newsroom_profiles.geography END,
        primary_languages = CASE WHEN cardinality(newsroom_profiles.primary_languages) = 0
                                 THEN EXCLUDED.primary_languages ELSE newsroom_profiles.primary_languages END,
        primary_platforms = CASE WHEN cardinality(newsroom_profiles.primary_platforms) = 0
                                 THEN EXCLUDED.primary_platforms ELSE newsroom_profiles.primary_platforms END,
        voice = COALESCE(newsroom_profiles.voice, EXCLUDED.voice),
        style_notes = COALESCE(newsroom_profiles.style_notes, EXCLUDED.style_notes),
        ethics_policy = COALESCE(newsroom_profiles.ethics_policy, EXCLUDED.ethics_policy),
        updated_at = NOW()`,
    vals
  );
}

async function main() {
  console.log('Seeding 5 pilot newsrooms…\n');
  const credentials = [];

  for (const p of PILOTS) {
    const nr = await upsertNewsroom(p);
    const flag = nr.was_inserted ? '✓ created' : '· already exists';
    console.log(`${flag}: ${nr.name} (${nr.id})`);

    const admin = await ensureAdmin(nr.id, p.admin_email);
    if (admin.password) {
      console.log(`  ↪ admin ${p.admin_email} created, password: ${admin.password}`);
      credentials.push({ newsroom: nr.name, email: p.admin_email, password: admin.password });
    } else {
      console.log(`  ↪ admin ${p.admin_email} already exists (password not reset)`);
    }

    await upsertProfile(nr.id, admin.id, p.profile);
    console.log(`  ↪ profile draft applied (existing editor-set fields preserved)`);

    await ensureJurisdiction(nr.id, p.country);
    console.log(`  ↪ jurisdiction set to ${p.country} (for Security Audit scoring)`);

    const sec = await seedSecurityInventory(nr.id, admin.id);
    if (sec.seeded) console.log(`  ↪ seeded ${sec.count} sample external tools (ChatGPT / Workspace / WhatsApp Business)`);
    else console.log(`  ↪ security inventory already populated (skipped)`);
  }

  if (credentials.length > 0) {
    console.log('\n──────────────────────────────────────────────────────');
    console.log('Initial admin credentials — share each out-of-band:');
    console.log('──────────────────────────────────────────────────────');
    for (const c of credentials) {
      console.log(`  ${c.newsroom}`);
      console.log(`    email:    ${c.email}`);
      console.log(`    password: ${c.password}`);
      console.log('');
    }
    console.log('They will not be shown again. Save them now if you need them later.');
  } else {
    console.log('\nNo new credentials — all admins already existed.');
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => pool.end());
