// Pre-LLM structural analysis for a social signal. Lang detection + NER +
// source-reputation match. Produces a stable JSON shape that the agent
// either consumes directly or persists onto the signal row.
//
// Crucially, this layer does NOT reach for Claude. The structural signals
// it produces are deterministic and explainable, and they serve as the
// scaffold for the Claude-driven origin attribution / framing reasoning
// that lib/agents/social_listener.js does on top of them.

const { detectLanguage } = require('./lang');
const { extractEntities } = require('./ner');
const { matchUrl } = require('./sources');

/**
 * Run the structural analysis pipeline. Returns a JSON object suitable
 * for persistence on social_signals.analysis.
 *
 * @param {object} opts
 * @param {string} opts.text          the post body
 * @param {string} [opts.postUrl]     the post / source URL (used to extract a domain to match)
 * @param {string} [opts.authorHandle]
 * @param {string} opts.newsroomId
 * @returns {Promise<object>}
 */
async function analyseSignal({ text, postUrl, authorHandle, newsroomId }) {
  const [lang, entities, sourceMatch] = await Promise.all([
    detectLanguage(text).catch(() => null),
    extractEntities(text).catch(() => null),
    postUrl ? matchUrl(newsroomId, postUrl) : Promise.resolve(null),
  ]);

  const allEntityNames = entities
    ? [...entities.persons, ...entities.orgs, ...entities.locations]
    : [];

  const sourceDomain = extractDomain(postUrl);

  // Initial severity heuristic. The agent can override.
  let severity = 'low';
  const originHints = [];
  if (sourceMatch) {
    if (sourceMatch.alignment === 'state_russia' || sourceMatch.alignment === 'state_china') {
      severity = 'high';
      originHints.push(`source domain match: ${sourceMatch.identifier} (${sourceMatch.alignment})`);
    } else if (sourceMatch.alignment === 'cib_network') {
      severity = 'high';
      originHints.push(`source domain on documented CIB list: ${sourceMatch.identifier}`);
    } else if (sourceMatch.alignment === 'extremist') {
      severity = 'critical';
      originHints.push(`source domain on extremist list: ${sourceMatch.identifier}`);
    }
  }
  if (lang?.primary?.code === 'ru') {
    originHints.push(`text language is Russian (confidence ${(lang.primary.confidence * 100).toFixed(0)}%)`);
  } else if (lang?.primary?.code === 'zh') {
    originHints.push(`text language is Chinese (confidence ${(lang.primary.confidence * 100).toFixed(0)}%)`);
  }

  return {
    lang: lang
      ? {
          code: lang.primary.code,
          name: lang.primary.name,
          confidence: Number(lang.primary.confidence?.toFixed(3) ?? 0),
          secondary: lang.secondary
            ? { code: lang.secondary.code, name: lang.secondary.name, confidence: Number(lang.secondary.confidence.toFixed(3)) }
            : null,
        }
      : null,
    entities: entities
      ? {
          persons: entities.persons,
          orgs: entities.orgs,
          locations: entities.locations,
          misc: entities.misc,
        }
      : null,
    origin_signals: {
      source_match: sourceMatch ? {
        source_id: sourceMatch.id,
        identifier: sourceMatch.identifier,
        alignment: sourceMatch.alignment,
        confidence: sourceMatch.alignment_confidence,
      } : null,
      domain: sourceDomain,
      hints: originHints,
    },
    entity_names: allEntityNames,
    severity_seed: severity,
    analysed_at: new Date().toISOString(),
    pipeline_versions: { lang: 'script-ratio-deterministic', ner: 'bert-base-multilingual-cased-ner-hrl' },
  };
}

function extractDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

module.exports = { analyseSignal, extractDomain };
