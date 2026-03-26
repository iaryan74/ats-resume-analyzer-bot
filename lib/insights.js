/**
 * Smart rule-based insights generator (no AI).
 * Produces matched/missing skills, weak sections, and ATS pass probability.
 */

/**
 * Generate insights from scoring results.
 *
 * @param {Object} scoreResult - Output from calculateATSScore
 * @returns {Object} Structured insights
 */
function generateInsights(scoreResult) {
  const { finalScore, breakdown, jdKeywords } = scoreResult;

  // ── Top Matched Skills (up to 5) ─────────────────────────
  const matchedSkills = (breakdown.keywords.matched || []).slice(0, 5);

  // ── Top Missing Skills (up to 5) ──────────────────────────
  const missingSkills = (breakdown.keywords.missing || []).slice(0, 5);

  // ── Top Missing Keywords (all, for bonus section) ─────────
  const topMissingKeywords = (breakdown.keywords.missing || []).slice(0, 10);

  // ── Keyword Density % ─────────────────────────────────────
  const keywordDensity = breakdown.keywords.density || 0;

  // ── Weak Sections ─────────────────────────────────────────
  const weakSections = [];

  if (breakdown.keywords.score < 40) {
    weakSections.push('🔴 Resume severely lacks JD keywords — add relevant skills and tools');
  } else if (breakdown.keywords.score < 60) {
    weakSections.push('🟡 Keyword match is below average — incorporate more JD-specific terms');
  }

  if (breakdown.experience.score < 40) {
    weakSections.push('🔴 Experience section lacks relevant keywords and action verbs');
  } else if (breakdown.experience.score < 60) {
    weakSections.push('🟡 Experience could be stronger — use more action verbs and align with JD');
  }

  if (breakdown.projects.score < 40) {
    weakSections.push('🔴 Projects are not aligned with the job description');
  } else if (breakdown.projects.score < 60) {
    weakSections.push('🟡 Projects could better showcase JD-relevant skills');
  }

  if (breakdown.education.score < 40) {
    weakSections.push('🟡 Education/certifications section needs improvement');
  }

  if (breakdown.format.score < 50) {
    weakSections.push('🔴 Resume format has ATS readability issues');
  } else if (breakdown.format.score < 70) {
    weakSections.push('🟡 Format is okay but could be more ATS-friendly');
  }

  // Add specific format suggestions
  if (Array.isArray(breakdown.format.details)) {
    for (const d of breakdown.format.details) {
      if (d.includes('Needs') || d.includes('Missing') || d.includes('too') || d.includes('Avoid')) {
        weakSections.push(`  ↳ ${d}`);
      }
    }
  }

  // ── Key Issues ────────────────────────────────────────────
  const keyIssues = [];

  if (breakdown.keywords.missing && breakdown.keywords.missing.length > 5) {
    keyIssues.push(`${breakdown.keywords.missing.length} JD keywords are missing from your resume`);
  }

  if (breakdown.experience.score < 50) {
    keyIssues.push('Experience section does not strongly match the job requirements');
  }

  if (breakdown.projects.score < 50) {
    keyIssues.push('Projects section does not demonstrate JD-relevant skills');
  }

  if (breakdown.format.score < 60) {
    keyIssues.push('Resume format may not pass ATS parsing correctly');
  }

  // ── ATS Pass Probability ──────────────────────────────────
  let atsPassProbability;
  if (finalScore >= 7) {
    atsPassProbability = '🟢 HIGH';
  } else if (finalScore >= 5) {
    atsPassProbability = '🟡 MEDIUM';
  } else {
    atsPassProbability = '🔴 LOW';
  }

  return {
    matchedSkills,
    missingSkills,
    topMissingKeywords,
    keywordDensity,
    weakSections,
    keyIssues,
    atsPassProbability,
  };
}

module.exports = { generateInsights };
