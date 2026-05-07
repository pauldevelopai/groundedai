// Documented IO-network registry — the load-bearing piece for
// catching English-language posts written by bots out of Russia / China
// targeting African audiences as fake "local" voices.
//
// Each default entry is backed by named public reports from credible
// research orgs. None of these attributions are speculative — every one
// is publicly documented in at least one source listed in public_reports.
// Editors refine and add their own as they spot new networks.
//
// Default seed sources used:
//   - Stanford Internet Observatory (SIO) takedown reports
//   - DFRLab (Atlantic Council) — particularly their 2023+ Africa work
//   - Graphika — Doppelganger + Spamouflage tracking
//   - Mandiant — Spamouflage Dragon / Dragonbridge
//   - Meta Quarterly Adversarial Threat Reports (Q4 2022 onward)
//   - Insikt Group — African Initiative attribution

const { pool } = require('../db');

const DEFAULT_NETWORKS = [
  {
    name: 'African Initiative',
    aliases: ['Initiative Africa', 'African Initiative news agency'],
    attributed_to: 'Russia (Wagner-aligned, successor structure post-Prigozhin)',
    attribution_country: 'RU',
    description:
      'A Russian-aligned media operation pretending to be an "African news agency". Explicitly Africa-focused, with documented operations in Mali, Burkina Faso, Niger, Central African Republic, Madagascar, and increasingly Zambia, South Africa, and Mozambique. Promotes Russia-favourable narratives on the Sahel, BRICS, the West, and uses paid African influencers.',
    alignment: 'cib_network',
    confidence: 0.9,
    targets_africa: true,
    known_handles: ['@africainitiative_news', '@africa_initiative', 'africaninitiative'],
    known_domains: ['africaninitiative.com', 'africainitiative.com', 'african-initiative.org', 'africaninitiative.ru'],
    known_phrases: [
      'pan-African', 'multipolar world', 'neo-colonial Western', 'sovereign Africa',
      'reject Western interference', 'BRICS will replace',
    ],
    pattern_notes: [
      'Pretends to be "African" while authored from Russia.',
      'Often pays African influencers / micro-influencers as proxy posters.',
      'Targets Francophone Sahel + Anglophone Southern Africa.',
      'Frequently amplifies Wagner-aligned narratives without naming Wagner.',
    ],
    public_reports: [
      { publisher: 'Stanford Internet Observatory', title: 'Russia\'s African Initiative: a successor IO project', year: 2023, url: 'https://cyber.fsi.stanford.edu' },
      { publisher: 'DFRLab', title: 'Russia\'s expanding influence operations in Africa', year: 2024, url: 'https://medium.com/dfrlab' },
      { publisher: 'Insikt Group (Recorded Future)', title: 'African Initiative attribution', year: 2024, url: 'https://recordedfuture.com' },
    ],
  },
  {
    name: 'Doppelganger',
    aliases: ['RRN', 'Reliable Recent News', 'Structura', 'Social Design Agency campaign'],
    attributed_to: 'Russia (Social Design Agency / Structura)',
    attribution_country: 'RU',
    description:
      'A long-running Russian influence operation that clones legitimate news brands (Bild, Le Parisien, RRN/Reliable Recent News, RBC-Ukraine etc) on near-duplicate spoofed domains. Originally Western-Europe focused; expanded to Africa-targeted content from 2023, including pro-Russia narratives about Mali, Burkina Faso, and the broader BRICS-vs-West framing.',
    alignment: 'cib_network',
    confidence: 0.95,
    targets_africa: true,
    known_handles: ['rrn-news', 'reliablerecentnews', 'rrnnews'],
    known_domains: [
      'rrn-news.com', 'rrnnews.com', 'reliablerecentnews.com',
      'bild.work', 'bild.fyi', 'leparisien.fyi',
      'theguardian.co.com',
    ],
    known_phrases: [
      'Reliable Recent News', 'sources confirm', 'NATO escalation',
      'forced Ukrainisation',
    ],
    pattern_notes: [
      'Clones legitimate news brands on lookalike domains (typo-squat or .fyi/.work TLDs).',
      'Posts seeded across Telegram → Twitter → Facebook in waves.',
      'Domain registrations cluster — many created within weeks of each other.',
      'Africa-targeted articles since 2023 use Africa-relevant vocabulary but identical phrasing patterns to EU-targeted outputs.',
    ],
    public_reports: [
      { publisher: 'Meta', title: 'Q3 2022 Adversarial Threat Report — Doppelganger network takedown', year: 2022, url: 'https://about.fb.com/news/' },
      { publisher: 'EU DisinfoLab', title: 'Doppelganger operation: full report', year: 2022, url: 'https://www.disinfo.eu/doppelganger/' },
      { publisher: 'Graphika', title: 'Bad Reputation: Suspected Russian Actors Behind Doppelganger', year: 2024, url: 'https://graphika.com' },
    ],
  },
  {
    name: 'Spamouflage Dragon',
    aliases: ['Dragonbridge', 'Spamouflage', 'Spamouflage Network'],
    attributed_to: 'China (Ministry of Public Security via Mandiant attribution)',
    attribution_country: 'CN',
    description:
      'Long-running Chinese-state-aligned influence operation. Originally focused on US politics, Hong Kong, and Taiwan; expanding to global topics including Africa-relevant narratives on China\'s Belt and Road Initiative and BRICS expansion. Operates across Facebook, X/Twitter, YouTube, TikTok with high posting volume but historically low engagement.',
    alignment: 'cib_network',
    confidence: 0.9,
    targets_africa: true,
    known_handles: ['spamouflage', 'dragonbridge'],
    known_domains: ['cnhubei.com'],
    known_phrases: [
      'win-win cooperation', 'community of shared future',
      'BRI partnership', 'mutual respect',
    ],
    pattern_notes: [
      'High-volume low-engagement posting across platforms simultaneously.',
      'Mandarin-translated-to-English phrasing artefacts ("on the basis of mutual respect").',
      'Profile photos often AI-generated or scraped stock imagery.',
      'Coordinates posting in waves matching Beijing business hours.',
    ],
    public_reports: [
      { publisher: 'Mandiant / Google Cloud', title: 'Pro-PRC DRAGONBRIDGE Influence Campaign', year: 2022, url: 'https://cloud.google.com/blog/topics/threat-intelligence' },
      { publisher: 'Graphika', title: 'Spamouflage tracking series', year: 2023, url: 'https://graphika.com' },
      { publisher: 'Meta', title: 'Quarterly Adversarial Threat Report — Spamouflage', year: 2023, url: 'https://about.fb.com/news/' },
    ],
  },
  {
    name: 'Secondary Infektion',
    aliases: ['Secondary Infektion network', 'Infektion 2.0'],
    attributed_to: 'Russia (state-aligned, persistent operator)',
    attribution_country: 'RU',
    description:
      'Long-running Russian information operation active since 2014. Plants forged documents and fabricated stories on second-tier platforms (Reddit, Medium, low-traffic forums) hoping to launder them into mainstream coverage. Tactics adopted by other operators including some Africa-targeted networks.',
    alignment: 'cib_network',
    confidence: 0.9,
    targets_africa: false,
    known_handles: [],
    known_domains: [],
    known_phrases: [
      'leaked document', 'classified internal memo',
    ],
    pattern_notes: [
      'Forged-document seeding via low-trust platforms before amplification.',
      'Disposable accounts — burned after one or two posts.',
      'Tactics influence many newer operations including Africa-focused ones.',
    ],
    public_reports: [
      { publisher: 'Graphika', title: 'Secondary Infektion: A Suspected Russian Intelligence Operation', year: 2019, url: 'https://graphika.com/reports/secondary-infektion' },
      { publisher: 'FBI', title: 'PIN: Russian Intelligence Targeting US Voters', year: 2020, url: 'https://www.fbi.gov' },
    ],
  },
  {
    name: 'Wagner-aligned Africa networks (umbrella)',
    aliases: ['Prigozhin Africa networks', 'Wagner Africa IO'],
    attributed_to: 'Russia (Wagner Group / successor structures)',
    attribution_country: 'RU',
    description:
      'Umbrella term for the family of influence operations tied to the late Yevgeny Prigozhin\'s Wagner organisation, including operations in Central African Republic, Madagascar, Mozambique, Sudan, Mali, Burkina Faso. Multiple separate takedowns by Meta + Stanford. After Prigozhin\'s death in 2023, much of this activity rolled into successor structures including African Initiative.',
    alignment: 'cib_network',
    confidence: 0.85,
    targets_africa: true,
    known_handles: [],
    known_domains: [],
    known_phrases: [
      'Wagner is helping', 'security partner', 'protecting sovereignty',
      'French neo-colonialism',
    ],
    pattern_notes: [
      'Pretends to be local African voices while operated from Russia.',
      'Strongest in Francophone Sahel; expanding into Anglophone Southern Africa post-2023.',
      'Pays local micro-influencers as proxy posters.',
      'Takedown waves by Meta + Stanford in 2018, 2019, 2020, 2022, 2023.',
    ],
    public_reports: [
      { publisher: 'Stanford Internet Observatory', title: 'IRA Africa operations across 5 countries', year: 2019, url: 'https://cyber.fsi.stanford.edu/io/news/africa-ira' },
      { publisher: 'Meta', title: 'Quarterly Adversarial Threat Report (multiple — Wagner takedowns)', year: 2023, url: 'https://about.fb.com/news/' },
      { publisher: 'DFRLab', title: 'Wagner Africa media operations', year: 2023, url: 'https://medium.com/dfrlab' },
    ],
  },
];

async function seedDefaultsIfEmpty(newsroomId) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM social_known_networks WHERE newsroom_id = $1`,
    [newsroomId]
  );
  if (countRes.rows[0].n > 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const n of DEFAULT_NETWORKS) {
      await client.query(
        `INSERT INTO social_known_networks
           (newsroom_id, name, aliases, attributed_to, attribution_country, description,
            alignment, confidence, targets_africa,
            known_handles, known_domains, known_phrases, pattern_notes, public_reports,
            source, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, 'default', TRUE)`,
        [
          newsroomId, n.name, n.aliases || [], n.attributed_to, n.attribution_country, n.description,
          n.alignment, n.confidence, !!n.targets_africa,
          n.known_handles || [], n.known_domains || [],
          n.known_phrases || [], n.pattern_notes || [],
          JSON.stringify(n.public_reports || []),
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

async function listNetworks(newsroomId, opts = {}) {
  await seedDefaultsIfEmpty(newsroomId);
  const params = [newsroomId];
  let where = 'newsroom_id = $1';
  if (opts.africaOnly) where += ' AND targets_africa = TRUE';
  const { rows } = await pool.query(
    `SELECT id, name, aliases, attributed_to, attribution_country, description,
            alignment, confidence, targets_africa,
            known_handles, known_domains, known_phrases, pattern_notes, public_reports,
            is_default, source, created_at, updated_at
       FROM social_known_networks
      WHERE ${where}
      ORDER BY targets_africa DESC, alignment ASC, lower(name)`,
    params
  );
  return rows;
}

/**
 * Match a fresh signal against a list of known networks. Pure heuristic
 * matcher (no LLM) — checks handles, domains, and phrases. Returns a
 * list of { network_id, network_name, matched_on } for each match.
 *
 * The agent uses these matches as one of its strongest evidence sources.
 */
function matchAgainstKnownNetworks({ authorHandle, postUrl, sourceDomain, outboundDomains, text }, networks) {
  const matches = [];
  const lowerText = (text || '').toLowerCase();
  const handle = (authorHandle || '').toLowerCase().replace(/^@/, '');
  const domains = new Set([
    ...(sourceDomain ? [sourceDomain.toLowerCase()] : []),
    ...(outboundDomains || []).map(d => String(d).toLowerCase()),
  ]);

  for (const n of networks) {
    const matchedOn = [];
    // Handle match
    if (handle) {
      for (const h of (n.known_handles || [])) {
        const cleaned = h.toLowerCase().replace(/^@/, '');
        if (!cleaned) continue;
        if (cleaned.includes('*')) {
          const re = new RegExp('^' + cleaned.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
          if (re.test(handle)) matchedOn.push(`handle ~ ${h}`);
        } else if (handle === cleaned || handle.includes(cleaned)) {
          matchedOn.push(`handle: ${h}`);
        }
      }
    }
    // Domain match (apex + subdomain match)
    for (const d of (n.known_domains || [])) {
      const cleaned = d.toLowerCase().replace(/^www\./, '');
      if (!cleaned) continue;
      for (const dom of domains) {
        if (dom === cleaned || dom.endsWith('.' + cleaned)) {
          matchedOn.push(`domain: ${d}`);
          break;
        }
      }
    }
    // Phrase match
    for (const p of (n.known_phrases || [])) {
      if (!p) continue;
      if (lowerText.includes(p.toLowerCase())) {
        matchedOn.push(`phrase: "${p}"`);
        if (matchedOn.filter(m => m.startsWith('phrase:')).length >= 3) break;
      }
    }
    if (matchedOn.length > 0) {
      matches.push({
        network_id: n.id,
        network_name: n.name,
        attributed_to: n.attributed_to,
        alignment: n.alignment,
        confidence: n.confidence,
        matched_on: matchedOn,
      });
    }
  }
  // Sort: more matches first, then higher confidence
  matches.sort((a, b) => b.matched_on.length - a.matched_on.length || (b.confidence || 0) - (a.confidence || 0));
  return matches;
}

module.exports = { listNetworks, matchAgainstKnownNetworks, seedDefaultsIfEmpty, DEFAULT_NETWORKS };
