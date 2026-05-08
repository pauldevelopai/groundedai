// Africa-grounded credibility map seed for the four pilot countries
// (South Africa, Zimbabwe, Zambia, Kenya). Each outlet entry carries a
// credibility_score that the Verifier uses as a PRIOR, not a verdict —
// the agent still reasons claim-by-claim. The notes + public_sources
// fields explain why each score is what it is.
//
// Scoring philosophy:
//   0.85+ → investigative non-profits with strong public track records
//           AND mainstream privates with consistent editorial
//           independence
//   0.70-0.84 → established mainstream privates / regionals
//   0.55-0.69 → state broadcasters and outlets with documented
//               periodic political-pressure / ownership concerns
//   0.40-0.54 → state party-organs / outlets known for partisan
//               agitation / ownership-flagged outlets with editorial
//               concerns
//
// Editors refine per their own reporting. The defaults are conservative
// reflections of well-documented public assessments only.

const { pool } = require('../db');

const DEFAULT_OUTLETS = [
  // ─── South Africa ──────────────────────────────────────────────────────
  {
    name: 'amaBhungane', country: 'ZA', url: 'amabhungane.org',
    ownership: 'Independent non-profit (amaBhungane Centre for Investigative Journalism)',
    alignment_notes: 'Independent investigative outlet; no advertising-revenue conflicts.',
    credibility_score: 0.95,
    beat_strengths: ['investigations', 'state capture', 'corruption', 'court reporting'],
    notes: 'Long-running investigative non-profit. Broke much of the original Gupta-leaks reporting alongside Daily Maverick. Public-interest litigation track record.',
    public_sources: [{ publisher: 'Press Council of South Africa', title: 'Member outlet record', url: 'https://presscouncil.org.za' }],
  },
  {
    name: 'Daily Maverick', country: 'ZA', url: 'dailymaverick.co.za',
    ownership: 'Independent (Maverick Media)',
    alignment_notes: 'Independent; reader-funded model.',
    credibility_score: 0.85,
    beat_strengths: ['politics', 'investigations', 'long-form analysis', 'ANC factional reporting'],
    notes: 'Independent online with strong investigative track record (Scorpio investigations unit). Reader-funded model insulates it from advertiser pressure.',
    public_sources: [{ publisher: 'Press Council of South Africa', title: 'Member outlet', url: 'https://presscouncil.org.za' }],
  },
  {
    name: 'Mail & Guardian', country: 'ZA', url: 'mg.co.za',
    ownership: 'Mail & Guardian Media Trust',
    alignment_notes: 'Independent; trust-owned.',
    credibility_score: 0.85,
    beat_strengths: ['politics', 'investigations', 'long-form'],
    notes: 'One of South Africa\'s longest-running independent papers. Originally Weekly Mail; weathered apartheid-era and post-1994 financial pressures.',
    public_sources: [{ publisher: 'Press Council of South Africa', title: 'Member outlet', url: 'https://presscouncil.org.za' }],
  },
  {
    name: 'News24', country: 'ZA', url: 'news24.com',
    ownership: 'Naspers / Media24',
    alignment_notes: 'Mainstream commercial; group-aligned editorial standards.',
    credibility_score: 0.8,
    beat_strengths: ['breaking news', 'politics', 'business'],
    notes: 'Largest English-language news website in SA. Generally credible mainstream coverage; standard commercial-press caveats apply.',
    public_sources: [{ publisher: 'Press Council of South Africa', title: 'Member outlet', url: 'https://presscouncil.org.za' }],
  },
  {
    name: 'TimesLIVE / Sunday Times', country: 'ZA', url: 'timeslive.co.za',
    alt_urls: ['sundaytimes.co.za'],
    ownership: 'Arena Holdings (Tiso Blackstar Group successor)',
    alignment_notes: 'Mainstream commercial.',
    credibility_score: 0.78,
    beat_strengths: ['politics', 'business', 'sports'],
    notes: 'Sunday Times has historic investigative reputation; weathered some scandals (e.g. SARS rogue-unit reporting that was later retracted in part). Generally credible day-to-day.',
    public_sources: [{ publisher: 'Press Council of South Africa', title: 'Member outlet', url: 'https://presscouncil.org.za' }],
  },
  {
    name: 'City Press', country: 'ZA', url: 'news24.com/citypress',
    ownership: 'Media24',
    credibility_score: 0.75,
    beat_strengths: ['politics', 'investigations'],
    notes: 'Sunday paper, part of Media24. Solid investigative track record.',
    public_sources: [],
  },
  {
    name: 'The Citizen', country: 'ZA', url: 'citizen.co.za',
    ownership: 'Caxton',
    credibility_score: 0.7,
    beat_strengths: ['breaking news', 'sports'],
    notes: 'Mainstream daily; tabloid format but generally factual.',
    public_sources: [],
  },
  {
    name: 'SABC News', country: 'ZA', url: 'sabcnews.com',
    ownership: 'State-owned (South African Broadcasting Corporation)',
    alignment_notes: 'Public broadcaster; periodic political-pressure concerns documented over multiple administrations.',
    credibility_score: 0.65,
    beat_strengths: ['national breaking news', 'parliamentary coverage'],
    known_issues: [
      'Documented editorial-interference periods under Hlaudi Motsoeneng (2014-2017); Constitutional Court found SANEF v Motsoeneng in 2017.',
    ],
    notes: 'Public broadcaster. Generally credible on routine coverage; track record of political-pressure incidents under specific administrations. Treat partisan stories with extra scrutiny.',
    public_sources: [{ publisher: 'Constitutional Court of South Africa', title: 'SANEF v Motsoeneng (2017)', url: 'https://collections.concourt.org.za' }],
  },
  {
    name: 'eNCA', country: 'ZA', url: 'enca.com',
    ownership: 'eMedia Holdings',
    credibility_score: 0.75,
    beat_strengths: ['breaking news', 'politics', 'TV news'],
    notes: 'Largest private TV news channel. Generally credible mainstream coverage.',
    public_sources: [],
  },
  {
    name: 'Independent Online (IOL)', country: 'ZA', url: 'iol.co.za',
    ownership: 'Independent Media (Sekunjalo / Iqbal Survé)',
    alignment_notes: 'Mainstream privately-owned; ownership-related editorial concerns documented.',
    credibility_score: 0.5,
    beat_strengths: ['regional Cape Town coverage'],
    known_issues: [
      'Documented editorial-direction concerns since Sekunjalo acquisition (2013).',
      'Resignations / public letters from senior journalists citing interference.',
      'Press Council and SANEF have criticised specific coverage at multiple points.',
    ],
    notes: 'Once-mainstream titles (Cape Argus, Star, Pretoria News, Cape Times, Mercury) consolidated under one ownership group with documented editorial-interference concerns. Verify claims independently.',
    public_sources: [
      { publisher: 'SANEF', title: 'Statements on Independent Media editorial concerns (multiple)', url: 'https://sanef.org.za' },
    ],
  },
  {
    name: 'Sowetan', country: 'ZA', url: 'sowetanlive.co.za',
    ownership: 'Arena Holdings',
    credibility_score: 0.7,
    beat_strengths: ['township coverage', 'social affairs'],
    notes: 'Long-running daily focused on township and working-class audiences.',
    public_sources: [],
  },
  {
    name: 'BizNews', country: 'ZA', url: 'biznews.com',
    ownership: 'Independent (Alec Hogg)',
    alignment_notes: 'Editorial slant: pro-business, free-market commentary.',
    credibility_score: 0.65,
    beat_strengths: ['business', 'finance'],
    notes: 'Business-focused independent. Editorial slant clear in commentary; news coverage generally factual.',
    public_sources: [],
  },

  // ─── Zimbabwe ──────────────────────────────────────────────────────────
  {
    name: 'NewsDay (Zimbabwe)', country: 'ZW', url: 'newsday.co.zw',
    ownership: 'Alpha Media Holdings',
    alignment_notes: 'Private; editorially independent of state.',
    credibility_score: 0.7,
    beat_strengths: ['politics', 'opposition coverage'],
    notes: 'Daily title in the AMH stable. Has faced legal pressure historically but maintains independent editorial line.',
    public_sources: [{ publisher: 'Voluntary Media Council of Zimbabwe', title: 'Member outlet', url: 'https://vmcz.co.zw' }],
  },
  {
    name: 'The Standard', country: 'ZW', url: 'thestandard.co.zw',
    ownership: 'Alpha Media Holdings',
    credibility_score: 0.7,
    beat_strengths: ['politics', 'investigations', 'long-form'],
    notes: 'Sunday paper in the AMH stable. Decent investigative reporting; faces same pressure environment as other private titles.',
    public_sources: [],
  },
  {
    name: 'Zimbabwe Independent', country: 'ZW', url: 'theindependent.co.zw',
    ownership: 'Alpha Media Holdings',
    credibility_score: 0.7,
    beat_strengths: ['business', 'politics'],
    notes: 'Weekly business/politics paper in the AMH stable.',
    public_sources: [],
  },
  {
    name: 'ZimLive', country: 'ZW', url: 'zimlive.com',
    ownership: 'Independent (UK-based diaspora outlet)',
    credibility_score: 0.75,
    beat_strengths: ['breaking news', 'politics', 'human rights'],
    notes: 'Diaspora-based independent online. Often more candid than in-country outlets due to operating outside Zimbabwe\'s legal pressure environment. Some sourcing reliant on stringers — confirm critical claims.',
    public_sources: [],
  },
  {
    name: 'The Herald (Zimbabwe)', country: 'ZW', url: 'herald.co.zw',
    ownership: 'State-owned (Zimpapers, ruling-party aligned)',
    alignment_notes: 'State / ZANU-PF aligned. Government-line on political coverage.',
    credibility_score: 0.45,
    beat_strengths: ['government announcements', 'state-side coverage'],
    known_issues: [
      'Government / ZANU-PF editorial line documented across multiple election cycles.',
      'Names of opposition figures often editorialised; opposition perspectives under-represented.',
    ],
    notes: 'State-aligned daily. Useful as a primary source for government positions; treat political coverage and opposition references with scrutiny.',
    public_sources: [{ publisher: 'MISA Zimbabwe', title: 'State media bias reports (multiple)', url: 'https://zimbabwe.misa.org' }],
  },
  {
    name: 'The Chronicle (Zimbabwe)', country: 'ZW', url: 'chronicle.co.zw',
    ownership: 'State-owned (Zimpapers)',
    credibility_score: 0.45,
    beat_strengths: ['Bulawayo regional coverage'],
    known_issues: ['State-aligned; same caveats as The Herald.'],
    notes: 'Zimpapers Bulawayo-based daily. State-aligned.',
    public_sources: [],
  },
  {
    name: 'Sunday Mail (Zimbabwe)', country: 'ZW', url: 'sundaymail.co.zw',
    ownership: 'State-owned (Zimpapers)',
    credibility_score: 0.45,
    known_issues: ['State-aligned weekly.'],
    notes: 'Zimpapers Sunday title. Same caveats as Herald / Chronicle.',
    public_sources: [],
  },
  {
    name: '263Chat', country: 'ZW', url: '263chat.com',
    ownership: 'Independent online',
    credibility_score: 0.65,
    beat_strengths: ['breaking news', 'social-media-savvy reporting'],
    notes: 'Independent online with active social audience. Quality varies — confirm critical claims.',
    public_sources: [],
  },
  {
    name: 'New Zimbabwe', country: 'ZW', url: 'newzimbabwe.com',
    ownership: 'Independent diaspora online',
    credibility_score: 0.6,
    beat_strengths: ['politics', 'breaking news'],
    notes: 'UK-based diaspora outlet. Mixed quality — strong on opposition coverage; some sensational headlines.',
    public_sources: [],
  },
  {
    name: 'Bulawayo24', country: 'ZW', url: 'bulawayo24.com',
    credibility_score: 0.55,
    notes: 'Online aggregator + originator. Quality varies. Confirm critical claims independently.',
    public_sources: [],
  },
  {
    name: 'VOA Studio 7 (Zimbabwe)', country: 'ZW', url: 'voazimbabwe.com',
    ownership: 'US Agency for Global Media (US government-funded)',
    alignment_notes: 'US-government-funded broadcaster; editorially independent under USAGM firewall.',
    credibility_score: 0.75,
    beat_strengths: ['politics', 'human rights'],
    notes: 'US-government-funded but operates under documented editorial firewall. Disclose funding when citing.',
    public_sources: [{ publisher: 'USAGM', title: 'International Broadcasting Act firewall provisions', url: 'https://www.usagm.gov' }],
  },

  // ─── Zambia ────────────────────────────────────────────────────────────
  {
    name: 'News Diggers!', country: 'ZM', url: 'diggers.news',
    ownership: 'Independent (Diggers Media Limited)',
    alignment_notes: 'Independent; reader/grant-funded.',
    credibility_score: 0.85,
    beat_strengths: ['investigations', 'politics', 'court reporting', 'mining sector'],
    notes: 'Independent investigative paper — strongest documentary track record in Zambia. Court-reporting-heavy. Has weathered legal pressure under multiple administrations.',
    public_sources: [{ publisher: 'MISA Zambia', title: 'Press freedom annual report', url: 'https://www.misa.org' }],
  },
  {
    name: 'The Mast (Zambia)', country: 'ZM', url: 'themastonline.com',
    ownership: 'Independent (successor to The Post staff after 2016 closure)',
    alignment_notes: 'Independent; opposition-friendly editorial line historically.',
    credibility_score: 0.7,
    beat_strengths: ['politics', 'opposition coverage'],
    notes: 'Founded by former The Post journalists after that paper\'s 2016 closure. Independent; partisan editorial line acknowledged in commentary, news generally factual.',
    public_sources: [{ publisher: 'CPJ', title: 'Reports on Zambia press environment', url: 'https://cpj.org/africa/zambia' }],
  },
  {
    name: 'Lusaka Times', country: 'ZM', url: 'lusakatimes.com',
    ownership: 'Independent online',
    credibility_score: 0.55,
    beat_strengths: ['breaking news'],
    notes: 'Online news + commentary. Mixed quality — strong as a primary-source aggregator; weaker on original reporting. Confirm critical claims.',
    public_sources: [],
  },
  {
    name: 'Zambia Daily Mail', country: 'ZM', url: 'daily-mail.co.zm',
    ownership: 'State-owned',
    alignment_notes: 'State-owned; government-line on political coverage.',
    credibility_score: 0.55,
    beat_strengths: ['government announcements', 'official ceremonies'],
    known_issues: ['State-aligned editorial line; opposition coverage often partisan.'],
    notes: 'State-owned daily. Useful as a primary source for government positions.',
    public_sources: [],
  },
  {
    name: 'Times of Zambia', country: 'ZM', url: 'times.co.zm',
    ownership: 'State-owned',
    credibility_score: 0.55,
    known_issues: ['State-aligned; same caveats as Daily Mail.'],
    notes: 'State-owned daily. Government-aligned.',
    public_sources: [],
  },
  {
    name: 'ZNBC', country: 'ZM', url: 'znbc.co.zm',
    ownership: 'State-owned (Zambia National Broadcasting Corporation)',
    credibility_score: 0.55,
    known_issues: ['State broadcaster; political coverage tracks government line.'],
    notes: 'State broadcaster. Generally credible on routine coverage; political coverage tracks government.',
    public_sources: [],
  },
  {
    name: 'Mwebantu', country: 'ZM', url: 'mwebantu.com',
    ownership: 'Independent online',
    credibility_score: 0.5,
    notes: 'Online aggregator + originator. Variable quality — confirm critical claims.',
    public_sources: [],
  },
  {
    name: 'Zambian Observer', country: 'ZM', url: 'zambianobserver.com',
    ownership: 'Independent online',
    alignment_notes: 'Editorial slant noted; quality variable.',
    credibility_score: 0.45,
    known_issues: ['Variable accuracy; partisan framing on political stories.'],
    notes: 'Online outlet. Treat critical claims as starting points for verification, not as confirmed.',
    public_sources: [],
  },

  // ─── Kenya ─────────────────────────────────────────────────────────────
  {
    name: 'Daily Nation / Nation Media Group', country: 'KE', url: 'nation.africa',
    alt_urls: ['nation.co.ke'],
    ownership: 'Nation Media Group (Aga Khan Fund for Economic Development majority)',
    alignment_notes: 'Mainstream commercial; foundation-owned majority shareholder provides some insulation from local political pressure.',
    credibility_score: 0.85,
    beat_strengths: ['politics', 'investigations', 'business', 'East Africa regional coverage'],
    notes: 'East Africa\'s largest media group. Nation Africa is the cross-regional brand. Strong investigative track record; AKFED ownership provides editorial-independence buffer.',
    public_sources: [{ publisher: 'Reuters Institute Digital News Report', title: 'Kenya country profile (annual)', url: 'https://reutersinstitute.politics.ox.ac.uk' }],
  },
  {
    name: 'The Standard (Kenya)', country: 'KE', url: 'standardmedia.co.ke',
    ownership: 'Standard Group',
    credibility_score: 0.75,
    beat_strengths: ['politics', 'breaking news'],
    notes: 'Long-running daily. Generally credible mainstream coverage.',
    public_sources: [],
  },
  {
    name: 'Citizen TV / Royal Media Services', country: 'KE', url: 'citizen.digital',
    ownership: 'Royal Media Services',
    credibility_score: 0.75,
    beat_strengths: ['breaking news', 'TV news'],
    notes: 'Largest TV news audience in Kenya. Generally credible mainstream coverage.',
    public_sources: [],
  },
  {
    name: 'The Star (Kenya)', country: 'KE', url: 'the-star.co.ke',
    ownership: 'Radio Africa Group',
    credibility_score: 0.7,
    beat_strengths: ['politics', 'breaking news'],
    notes: 'Daily; generally credible. Editorial line varies by section.',
    public_sources: [],
  },
  {
    name: 'Capital FM / Capital News', country: 'KE', url: 'capitalfm.co.ke',
    ownership: 'Capital Group',
    credibility_score: 0.7,
    beat_strengths: ['breaking news', 'business'],
    notes: 'Radio + online news. Generally credible.',
    public_sources: [],
  },
  {
    name: 'The East African', country: 'KE', url: 'theeastafrican.co.ke',
    ownership: 'Nation Media Group',
    credibility_score: 0.85,
    beat_strengths: ['regional politics', 'business', 'analysis'],
    notes: 'Regional weekly covering Kenya, Uganda, Tanzania, Rwanda, Burundi, South Sudan. Strong analytical reporting.',
    public_sources: [],
  },
  {
    name: 'Africa Uncensored', country: 'KE', url: 'africauncensored.online',
    ownership: 'Independent investigative',
    credibility_score: 0.85,
    beat_strengths: ['investigations', 'long-form'],
    notes: 'Independent investigative outlet — John-Allan Namu\'s organisation. Documentary-style investigations.',
    public_sources: [],
  },
  {
    name: 'The Elephant', country: 'KE', url: 'theelephant.info',
    ownership: 'Independent',
    credibility_score: 0.8,
    beat_strengths: ['analysis', 'long-form', 'commentary'],
    notes: 'Independent platform for long-form analysis. Commentary-heavy; declared editorial perspective on extractive politics.',
    public_sources: [],
  },
  {
    name: 'KBC', country: 'KE', url: 'kbc.co.ke',
    ownership: 'State-owned (Kenya Broadcasting Corporation)',
    credibility_score: 0.6,
    known_issues: ['State broadcaster; political coverage tracks government line.'],
    notes: 'Kenya\'s public broadcaster. Government-line on political stories; routine coverage generally factual.',
    public_sources: [],
  },
  {
    name: 'KTN News', country: 'KE', url: 'ktnnews.com',
    ownership: 'Standard Group',
    credibility_score: 0.7,
    beat_strengths: ['TV news', 'investigations'],
    notes: 'TV news arm of Standard Group. Generally credible.',
    public_sources: [],
  },
  {
    name: 'Tuko.co.ke', country: 'KE', url: 'tuko.co.ke',
    ownership: 'Genesis Media (Legit Media network)',
    credibility_score: 0.5,
    known_issues: ['High-volume online aggregator; sensationalist headlines; quality varies.'],
    notes: 'High-traffic online aggregator. Useful for surface-level breaking news; verify substantive claims independently.',
    public_sources: [],
  },
];

async function seedDefaultsIfEmpty(newsroomId) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM verifier_outlets WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (countRes.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const o of DEFAULT_OUTLETS) {
      await client.query(
        `INSERT INTO verifier_outlets
           (newsroom_id, name, country, url, alt_urls, ownership, alignment_notes,
            credibility_score, beat_strengths, beat_weaknesses, known_issues,
            notes, public_sources, source, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, 'default', TRUE)
         ON CONFLICT DO NOTHING`,
        [
          newsroomId, o.name, o.country, o.url || null,
          o.alt_urls || [], o.ownership || null, o.alignment_notes || null,
          o.credibility_score, o.beat_strengths || [], o.beat_weaknesses || [],
          o.known_issues || [], o.notes || null,
          JSON.stringify(o.public_sources || []),
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

async function listOutlets(newsroomId, opts = {}) {
  await seedDefaultsIfEmpty(newsroomId);
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (opts.country) { params.push(opts.country); where += ` AND country = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, name, country, url, alt_urls, ownership, alignment_notes,
            credibility_score, beat_strengths, beat_weaknesses, known_issues,
            notes, public_sources, source, is_default, created_at, updated_at
       FROM verifier_outlets
      WHERE ${where}
      ORDER BY country, credibility_score DESC NULLS LAST, lower(name)`,
    params
  );
  return rows;
}

/**
 * Match URLs found in a piece of text against the credibility map.
 * Returns a per-URL findings map suitable for direct persistence on
 * verifier_runs.matched_outlet_findings.
 */
async function matchUrlsAgainstOutlets(newsroomId, urls) {
  const findings = {};
  if (!Array.isArray(urls) || urls.length === 0) return findings;
  const hosts = new Set();
  for (const u of urls) {
    try { hosts.add(new URL(u).hostname.toLowerCase().replace(/^www\./, '')); }
    catch { /* skip malformed */ }
  }
  if (hosts.size === 0) return findings;

  // Build candidate apex domains for each host. e.g. opinion.dailymaverick.co.za
  // expands to [opinion.dailymaverick.co.za, dailymaverick.co.za, co.za].
  const candidates = new Set();
  for (const host of hosts) {
    const parts = host.split('.');
    for (let i = 0; i < parts.length - 1; i++) candidates.add(parts.slice(i).join('.'));
  }

  const { rows } = await pool.query(
    `SELECT id, name, country, url, alt_urls, credibility_score,
            ownership, alignment_notes, known_issues, notes
       FROM verifier_outlets
      WHERE newsroom_id = $1
        AND (lower(url) = ANY($2::text[]) OR lower(url::text) = ANY($2::text[])
             OR EXISTS (
               SELECT 1 FROM unnest(alt_urls) au
                WHERE lower(au) = ANY($2::text[])
             ))`,
    [newsroomId, [...candidates]]
  );

  for (const host of hosts) {
    const apexCandidates = (() => {
      const parts = host.split('.');
      const out = [];
      for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
      return out;
    })();
    const match = rows.find(r =>
      apexCandidates.includes(String(r.url || '').toLowerCase().replace(/^www\./, '')) ||
      (Array.isArray(r.alt_urls) && r.alt_urls.some(au =>
        apexCandidates.includes(String(au).toLowerCase().replace(/^www\./, ''))
      ))
    );
    if (match) {
      findings[host] = {
        outlet_id: match.id,
        name: match.name,
        country: match.country,
        credibility_score: match.credibility_score != null ? Number(match.credibility_score) : null,
        ownership: match.ownership,
        alignment_notes: match.alignment_notes,
        known_issues: match.known_issues || [],
        notes: match.notes,
      };
    }
  }
  return findings;
}

function formatOutletsForPrompt(findings) {
  const entries = Object.entries(findings || {});
  if (entries.length === 0) return null;
  const lines = ['Outlets matched against your credibility map:'];
  for (const [host, info] of entries) {
    const score = info.credibility_score != null ? `${(info.credibility_score * 100).toFixed(0)}%` : 'unscored';
    lines.push(`  · ${host} → ${info.name} (${info.country}, credibility ${score})`);
    if (info.ownership) lines.push(`      ownership: ${info.ownership}`);
    if (Array.isArray(info.known_issues) && info.known_issues.length > 0) {
      for (const issue of info.known_issues) lines.push(`      ⚠ ${issue}`);
    }
    if (info.notes) lines.push(`      ${info.notes}`);
  }
  return lines.join('\n');
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)]+/gi;
function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_RE) || [];
  return matches.map(m => m.replace(/[.,;!?)>\]]+$/, ''));
}

module.exports = {
  listOutlets,
  matchUrlsAgainstOutlets,
  formatOutletsForPrompt,
  extractUrls,
  seedDefaultsIfEmpty,
  DEFAULT_OUTLETS,
};
