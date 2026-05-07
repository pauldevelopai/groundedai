// Pre-LLM structural analysis for a social signal.
//
// The signal pipeline runs in priority order matching how influence-ops
// research actually works:
//
//   1. Page Transparency country (editor-supplied) — strongest signal
//   2. Match against documented IO networks in social_known_networks
//   3. Source-reputation match (rt.com, sputnikafrica.com, etc — Slice 15b)
//   4. Outbound URL forensics (domain age, SSL country, WHOIS country)
//   5. SimHash siblings (other signals with near-duplicate text)
//   6. Account-creation recency
//   7. Language / NER (weakest — bots write in target-audience languages)
//
// Each piece is cheap, deterministic, and explainable. The agent on top
// of this reasons about how the signals combine for an attribution.

const { pool } = require('../db');
const { detectLanguage } = require('./lang');
const { extractEntities } = require('./ner');
const { matchUrl } = require('./sources');
const { extractOutboundUrls, lookupDomain, simhashOf, hamming } = require('./origin');
const { listNetworks, matchAgainstKnownNetworks } = require('./networks');

const COUNTRY_NAME_TO_ISO = {
  russia: 'RU', 'russian federation': 'RU',
  china: 'CN', 'people\'s republic of china': 'CN', 'prc': 'CN',
  belarus: 'BY', iran: 'IR', 'north korea': 'KP', 'dprk': 'KP',
  ukraine: 'UA', usa: 'US', 'united states': 'US',
  uk: 'GB', 'united kingdom': 'GB',
  france: 'FR', germany: 'DE',
  zambia: 'ZM', 'south africa': 'ZA', zimbabwe: 'ZW',
  kenya: 'KE', 'central african republic': 'CF', mali: 'ML',
  'burkina faso': 'BF', niger: 'NE', sudan: 'SD',
  madagascar: 'MG', mozambique: 'MZ',
};

function countryToIso(name) {
  if (!name) return null;
  const k = String(name).trim().toLowerCase();
  return COUNTRY_NAME_TO_ISO[k] || (/^[A-Z]{2}$/.test(name) ? name.toUpperCase() : null);
}

/**
 * Run the full structural analysis on a signal. Returns a JSON object
 * suitable for persistence on social_signals.analysis (and for directly
 * feeding the agent prompt).
 *
 * Heavy domain-lookup work (TLS handshake + WHOIS) runs in parallel
 * with a 6-second cap per domain; we limit the count to 5 to keep the
 * total ingest under ~10s in the worst case.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.postUrl]
 * @param {string} [opts.authorHandle]
 * @param {string} [opts.accountCountry]   Page Transparency declared country
 * @param {string} [opts.accountCreatedAt] ISO datetime
 * @param {string} [opts.profilePhotoUrl]
 * @param {string} [opts.postingCadenceNote]
 * @param {Array}  [opts.nameChangeHistory]
 * @param {string} opts.newsroomId
 * @param {object} [opts.options]
 * @returns {Promise<object>}
 */
async function analyseSignal({
  text, postUrl, authorHandle,
  accountCountry, accountCreatedAt, profilePhotoUrl, postingCadenceNote,
  nameChangeHistory,
  newsroomId, options = {},
}) {
  const sourceDomain = extractDomain(postUrl);
  const { urls: outboundUrls, domains: outboundDomains } = extractOutboundUrls(text || '');

  // Fire all the cheap, parallelisable lookups.
  const [lang, entities, sourceMatch, networks] = await Promise.all([
    detectLanguage(text).catch(() => null),
    extractEntities(text).catch(() => null),
    postUrl ? matchUrl(newsroomId, postUrl) : Promise.resolve(null),
    listNetworks(newsroomId).catch(() => []),
  ]);

  const allEntityNames = entities
    ? [...entities.persons, ...entities.orgs, ...entities.locations]
    : [];

  // Match against documented IO networks.
  const networkMatches = matchAgainstKnownNetworks(
    { authorHandle, postUrl, sourceDomain, outboundDomains, text },
    networks
  );

  // Per-domain forensics (capped to 5 unique domains).
  const lookupTargets = [...new Set([...(sourceDomain ? [sourceDomain] : []), ...outboundDomains])].slice(0, 5);
  let domainFindings = {};
  if (!options.skipDomainLookups && lookupTargets.length > 0) {
    const results = await Promise.all(lookupTargets.map(d => lookupDomain(d).catch(() => null)));
    for (let i = 0; i < lookupTargets.length; i++) {
      if (results[i]) domainFindings[lookupTargets[i]] = results[i];
    }
  }

  // SimHash + sibling search.
  let simhashSigned = null;
  let simhashSiblings = [];
  const sh = simhashOf(text || '');
  if (sh != null) {
    simhashSigned = sh.toString();
    simhashSiblings = await findSimhashSiblings(newsroomId, sh, { excludeUrl: postUrl }).catch(() => []);
  }

  // Account-creation recency
  let accountAgeDays = null;
  if (accountCreatedAt) {
    const dt = Date.parse(accountCreatedAt);
    if (Number.isFinite(dt)) accountAgeDays = Math.max(0, Math.round((Date.now() - dt) / 86400000));
  }

  // Account country normalisation.
  const accountCountryIso = countryToIso(accountCountry);

  // Build origin_signals — the human-readable evidence chain.
  const hints = [];
  let severity = 'low';

  // P1 — Page Transparency country
  if (accountCountryIso) {
    hints.push(`Page Transparency: account admins are based in ${accountCountry} (${accountCountryIso}).`);
    if (['RU', 'CN', 'BY', 'IR', 'KP'].includes(accountCountryIso)) {
      severity = 'high';
      hints.push(`⚠ Admin country (${accountCountryIso}) is a documented influence-operation source. Treat as strong origin evidence.`);
    }
  }
  // P2 — IO network matches
  for (const m of networkMatches) {
    hints.push(`Matches documented network "${m.network_name}" (${m.attributed_to}) on: ${m.matched_on.join('; ')}.`);
    if (severity !== 'critical') severity = 'high';
  }
  // P3 — source-reputation match (existing slice 15b logic)
  if (sourceMatch) {
    if (sourceMatch.alignment === 'state_russia' || sourceMatch.alignment === 'state_china') {
      severity = severity === 'critical' ? 'critical' : 'high';
      hints.push(`Source domain ${sourceMatch.identifier} is documented state-aligned media (${sourceMatch.alignment}).`);
    } else if (sourceMatch.alignment === 'cib_network' || sourceMatch.alignment === 'extremist') {
      severity = 'critical';
      hints.push(`Source domain ${sourceMatch.identifier} is on a documented CIB / extremist list.`);
    }
  }
  // P4 — outbound URL forensics
  for (const [dom, info] of Object.entries(domainFindings)) {
    const bits = [];
    if (info.ssl_age_days != null) bits.push(`SSL cert ${info.ssl_age_days} day${info.ssl_age_days === 1 ? '' : 's'} old`);
    if (info.whois_country) bits.push(`WHOIS country: ${info.whois_country}`);
    if (info.ssl_subject_country) bits.push(`SSL cert country: ${info.ssl_subject_country}`);
    if (info.whois_age_days != null && info.whois_age_days < 90) {
      bits.push('domain registered in last 90 days');
      if (severity === 'low') severity = 'medium';
    } else if (info.ssl_age_days != null && info.ssl_age_days < 90) {
      bits.push('SSL cert issued in last 90 days');
      if (severity === 'low') severity = 'medium';
    }
    if (bits.length > 0) hints.push(`Outbound domain ${dom}: ${bits.join('; ')}.`);
  }
  // P5 — simhash siblings (coordinated copy-paste)
  if (simhashSiblings.length >= 2) {
    severity = severity === 'critical' ? 'critical' : 'high';
    hints.push(`${simhashSiblings.length} near-duplicate text fingerprint${simhashSiblings.length === 1 ? '' : 's'} from other accounts (Hamming ≤ 8) — possible coordinated copy-paste.`);
  } else if (simhashSiblings.length === 1) {
    if (severity === 'low') severity = 'medium';
    hints.push('1 near-duplicate text fingerprint from another account — investigate.');
  }
  // P6 — account-creation recency
  if (accountAgeDays != null && accountAgeDays < 90) {
    if (severity === 'low') severity = 'medium';
    hints.push(`Account created ${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'} ago — recent creation is a low-confidence bot signal.`);
  }
  // P7 — language (weakest)
  if (lang?.primary?.code === 'ru') hints.push('Text is in Russian / Cyrillic — weakest origin signal but worth noting.');
  else if (lang?.primary?.code === 'zh') hints.push('Text is in Chinese / Han — weakest origin signal but worth noting.');

  return {
    lang: lang ? {
      code: lang.primary.code,
      name: lang.primary.name,
      confidence: Number((lang.primary.confidence || 0).toFixed(3)),
      secondary: lang.secondary
        ? { code: lang.secondary.code, name: lang.secondary.name, confidence: Number(lang.secondary.confidence.toFixed(3)) }
        : null,
    } : null,
    entities: entities ? {
      persons: entities.persons,
      orgs: entities.orgs,
      locations: entities.locations,
      misc: entities.misc,
    } : null,
    origin_signals: {
      // Editor-supplied account metadata (priority 1 + 6).
      account_country: accountCountry || null,
      account_country_iso: accountCountryIso,
      account_age_days: accountAgeDays,
      posting_cadence_note: postingCadenceNote || null,
      profile_photo_url: profilePhotoUrl || null,
      name_change_history: Array.isArray(nameChangeHistory) ? nameChangeHistory : [],
      // IO network matches (priority 2).
      network_matches: networkMatches,
      // Source-reputation match (priority 3 — existing).
      source_match: sourceMatch ? {
        source_id: sourceMatch.id,
        identifier: sourceMatch.identifier,
        alignment: sourceMatch.alignment,
        confidence: sourceMatch.alignment_confidence,
      } : null,
      // URL forensics (priority 4).
      outbound_urls: outboundUrls,
      outbound_domains: outboundDomains,
      domain_findings: domainFindings,
      // Simhash siblings (priority 5).
      simhash_siblings: simhashSiblings,
      // Source domain extracted from the post URL.
      domain: sourceDomain,
      // Hint chain (priority-ordered).
      hints,
    },
    text_simhash: simhashSigned,
    entity_names: allEntityNames,
    severity_seed: severity,
    analysed_at: new Date().toISOString(),
    pipeline_versions: {
      lang: 'script-ratio-deterministic',
      ner: 'bert-base-multilingual-cased-ner-hrl',
      origin: 'simhash + ssl-cert + whois-cli + io-network-registry',
    },
  };
}

/**
 * Find existing signals in this newsroom whose simhash is within 8 bits
 * of `simhash`. Caps at 25 results.
 */
async function findSimhashSiblings(newsroomId, simhash, opts = {}) {
  const excludeUrl = opts.excludeUrl;
  // Pre-filter on text_simhash NOT NULL using the index, then post-filter
  // by Hamming distance in JS. With small newsroom volumes this is fast;
  // for larger volumes we can later move to bit-level pre-filtering.
  const params = [newsroomId];
  let where = 'newsroom_id = $1 AND text_simhash IS NOT NULL';
  if (excludeUrl) { params.push(excludeUrl); where += ` AND (post_url IS NULL OR post_url <> $${params.length})`; }
  const { rows } = await pool.query(
    `SELECT id, post_url, author_handle, source_domain, text_simhash, posted_at, created_at
       FROM social_signals
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 500`,
    params
  );
  const target = BigInt(simhash);
  const out = [];
  for (const r of rows) {
    if (r.text_simhash == null) continue;
    const dist = hamming(BigInt(r.text_simhash), target);
    if (dist <= 8) {
      out.push({
        signal_id: r.id,
        post_url: r.post_url,
        author_handle: r.author_handle,
        source_domain: r.source_domain,
        hamming_distance: dist,
        posted_at: r.posted_at,
      });
    }
    if (out.length >= 25) break;
  }
  out.sort((a, b) => a.hamming_distance - b.hamming_distance);
  return out;
}

function extractDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

module.exports = { analyseSignal, extractDomain, findSimhashSiblings, countryToIso };
