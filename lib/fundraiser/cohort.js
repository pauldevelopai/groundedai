// Cohort joint-application matcher.
//
// Given an anchor newsroom and a funder, find partner newsrooms whose
// profiles complement the anchor's for a joint application. Scoring is
// transparent and deterministic — set-overlap on focus areas, geography,
// and beats — so editors can see WHY a partner was suggested.
//
// We deliberately do NOT call an LLM for matching itself. The match is
// declarative: "your profile says X, partner's profile says Y, funder cares
// about Z, here's the overlap." The LLM may later be invoked to draft the
// rationale text, but the score and shared-fields are computed from data.

const { pool } = require('../db');

/**
 * Find candidate partner newsrooms for a joint application to a funder.
 * Returns ranked candidates with score + shared dimensions. Does NOT
 * persist matches — the caller decides which to materialise.
 *
 * @param {string} anchorNewsroomId
 * @param {object} funder      — full funder row (must include focus_areas, geography)
 * @param {number} [limit=5]
 */
async function rankCandidates(anchorNewsroomId, funder, limit = 5) {
  const profileRes = await pool.query(
    `SELECT newsroom_id, beats, strengths, geography, primary_languages, mission, tagline
       FROM newsroom_profiles
      WHERE newsroom_id = $1`,
    [anchorNewsroomId]
  );
  const anchor = profileRes.rows[0];
  if (!anchor) {
    return { error: 'no_anchor_profile', candidates: [] };
  }

  // Pull all OTHER newsrooms' profiles. Cohort is small (pilot ≤ ~20
  // newsrooms) so a full scan is fine; we can index later.
  const others = await pool.query(
    `SELECT np.newsroom_id, np.beats, np.strengths, np.geography, np.primary_languages,
            np.mission, np.tagline,
            n.name AS newsroom_name
       FROM newsroom_profiles np
       JOIN newsrooms n ON n.id = np.newsroom_id
      WHERE np.newsroom_id <> $1`,
    [anchorNewsroomId]
  );

  const funderFocus = new Set((funder.focus_areas || []).map(s => s.toLowerCase()));
  const funderGeo = new Set((funder.geography || []).map(s => s.toLowerCase()));

  const anchorStrengths = new Set((anchor.strengths || []).map(s => s.toLowerCase()));
  const anchorBeats = new Set((anchor.beats || []).map(s => s.toLowerCase()));
  const anchorGeo = new Set((anchor.geography || []).map(s => s.toLowerCase()));

  const candidates = [];
  for (const other of others.rows) {
    const oStrengths = new Set((other.strengths || []).map(s => s.toLowerCase()));
    const oBeats = new Set((other.beats || []).map(s => s.toLowerCase()));
    const oGeo = new Set((other.geography || []).map(s => s.toLowerCase()));

    // Shared with anchor: this is the joint-application complementarity.
    const sharedStrengths = setIntersect(anchorStrengths, oStrengths);
    const sharedBeats = setIntersect(anchorBeats, oBeats);
    const sharedGeo = setIntersect(anchorGeo, oGeo);

    // Funder-relevant: does the partner's profile match what the funder cares about?
    const partnerFocusHit = setIntersect(
      new Set([...oStrengths, ...oBeats]),
      funderFocus
    );
    const partnerGeoHit = setIntersect(oGeo, funderGeo);

    // Score: weighted overlaps. Cap each component so a partner with one
    // matching beat doesn't dominate over one with broad alignment.
    const sharedComplement =
      Math.min(sharedStrengths.size, 3) * 0.10 +
      Math.min(sharedBeats.size, 3) * 0.08 +
      Math.min(sharedGeo.size, 2) * 0.10;
    const funderFit =
      Math.min(partnerFocusHit.size, 3) * 0.15 +
      Math.min(partnerGeoHit.size, 2) * 0.10;
    const score = Math.min(1, sharedComplement + funderFit);

    if (score < 0.1) continue;
    candidates.push({
      partnerNewsroomId: other.newsroom_id,
      partnerNewsroomName: other.newsroom_name,
      partnerTagline: other.tagline,
      partnerMission: other.mission,
      score: Number(score.toFixed(3)),
      sharedStrengths: [...sharedStrengths],
      sharedBeats: [...sharedBeats],
      sharedGeography: [...sharedGeo],
      partnerFocusHit: [...partnerFocusHit],
      partnerGeoHit: [...partnerGeoHit],
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { error: null, candidates: candidates.slice(0, limit) };
}

/**
 * Build a one-paragraph human rationale from a candidate's shared fields.
 * Deterministic — no LLM. Keeps the audit trail clear.
 */
function buildRationale(candidate, funderName) {
  const bits = [];
  if (candidate.sharedGeography.length > 0) {
    bits.push(`overlapping coverage in ${candidate.sharedGeography.join(', ')}`);
  }
  if (candidate.sharedBeats.length > 0) {
    bits.push(`shared beats (${candidate.sharedBeats.join(', ')})`);
  }
  if (candidate.sharedStrengths.length > 0) {
    bits.push(`complementary strengths (${candidate.sharedStrengths.join(', ')})`);
  }
  if (candidate.partnerFocusHit.length > 0) {
    bits.push(`partner profile aligns with ${funderName}'s focus on ${candidate.partnerFocusHit.join(', ')}`);
  }
  if (bits.length === 0) {
    return `Possible joint applicant for ${funderName} — review profile to confirm fit.`;
  }
  return `Joint application opportunity for ${funderName}: ${bits.join('; ')}.`;
}

/**
 * Persist a candidate as a proposed cohort match. Idempotent on
 * (anchor, partner, funder) — won't duplicate proposals.
 */
async function persistMatch(anchorNewsroomId, funder, candidate) {
  const rationale = buildRationale(candidate, funder.name);
  const dup = await pool.query(
    `SELECT id FROM fundraiser_cohort_matches
      WHERE anchor_newsroom_id = $1 AND partner_newsroom_id = $2
        AND funder_id = $3 AND status IN ('proposed', 'accepted')`,
    [anchorNewsroomId, candidate.partnerNewsroomId, funder.id]
  );
  if (dup.rows.length > 0) return { matchId: dup.rows[0].id, created: false };
  const { rows } = await pool.query(
    `INSERT INTO fundraiser_cohort_matches
       (funder_id, funder_name, anchor_newsroom_id, partner_newsroom_id,
        rationale, match_score, shared_strengths, shared_geography)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      funder.id,
      funder.name,
      anchorNewsroomId,
      candidate.partnerNewsroomId,
      rationale,
      candidate.score,
      candidate.sharedStrengths,
      candidate.sharedGeography,
    ]
  );
  return { matchId: rows[0].id, created: true, rationale };
}

function setIntersect(a, b) {
  const out = new Set();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

module.exports = { rankCandidates, persistMatch, buildRationale };
