/**
 * ATS Scoring Engine (100% rule-based — no AI).
 *
 * Five weighted sub-scores:
 *   A. Keyword Match       — 40%
 *   B. Experience Relevance — 20%
 *   C. Project Relevance    — 15%
 *   D. Education & Certs    — 10%
 *   E. Format & Readability — 15%
 *
 * Final score = weighted sum → scaled to / 10.
 */

const {
  ALL_TECH_KEYWORDS,
  SOFT_SKILLS,
  ACTION_VERBS,
  CERTIFICATIONS,
  DEGREES,
} = require('../data/keywords');

// ─── Helpers ──────────────────────────────────────────────

/**
 * Tokenize text into lowercase words and common multi-word phrases.
 */
function tokenize(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/[\w#+./-]+/g) || [];
  // Also extract 2-word and 3-word n-grams
  const ngrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.push(words[i] + ' ' + words[i + 1]);
    if (i < words.length - 2) {
      ngrams.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
    }
  }
  return { words, ngrams, lower };
}

/**
 * Extract JD keywords — ONLY recognized tech/skill terms from our database.
 * Does NOT add random JD words — this keeps keyword counts accurate.
 */
function extractJDKeywords(jdText) {
  const { words, ngrams } = tokenize(jdText);
  const found = new Set();

  // Check multi-word phrases first (more specific)
  for (const ng of ngrams) {
    if (ALL_TECH_KEYWORDS.has(ng) || SOFT_SKILLS.includes(ng)) {
      found.add(ng);
    }
  }

  // Then single words — only if they're in our keyword database
  for (const w of words) {
    if (ALL_TECH_KEYWORDS.has(w) || SOFT_SKILLS.includes(w)) {
      found.add(w);
    }
  }

  return [...found];
}

/**
 * Detect a named section in the resume text.
 * Handles multiple heading formats: ALL-CAPS, Title Case, markdown, underlined.
 */
function extractSection(resumeText, sectionNames) {
  const lines = resumeText.split('\n');
  let capturing = false;
  let sectionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lower = trimmed.toLowerCase().replace(/[:\-─━═│|*#_]/g, '').trim();

    // Check if this line is a heading:
    // 1. Short line (< 50 chars)
    // 2. Matches common heading patterns
    const isShortLine = trimmed.length > 0 && trimmed.length < 50;
    const isAllCaps = /^[A-Z][A-Z\s&/,.\-()]+$/.test(trimmed);
    const isMarkdownH = /^#{1,3}\s/.test(trimmed);
    const isTitleCase = /^[A-Z][a-zA-Z\s&/,.\-()]*$/.test(trimmed) && trimmed.length < 40;
    const isUnderlined = i + 1 < lines.length && /^[-=─━]{3,}$/.test(lines[i + 1]?.trim());
    const hasColonEnd = /^[A-Za-z\s&/]+:\s*$/.test(trimmed);

    const isHeading = isShortLine && (isAllCaps || isMarkdownH || isTitleCase || isUnderlined || hasColonEnd);

    if (isHeading) {
      const matches = sectionNames.some((n) => lower.includes(n));
      if (matches) {
        capturing = true;
        continue;
      } else if (capturing) {
        // Hit the next section heading — stop capturing
        break;
      }
    }

    if (capturing) {
      sectionLines.push(trimmed);
    }
  }

  return sectionLines.join('\n').trim();
}

// ─── Sub-Scorers ──────────────────────────────────────────

/**
 * A. Keyword Match Score (0–100).
 * Only matches recognized tech/skill keywords from the JD.
 */
function scoreKeywords(jdKeywords, resumeText) {
  const resumeLower = resumeText.toLowerCase();
  const matched = [];
  const missing = [];

  for (const kw of jdKeywords) {
    if (resumeLower.includes(kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const total = jdKeywords.length;
  const score = total > 0 ? (matched.length / total) * 100 : 0;
  const density = total > 0 ? Math.round((matched.length / total) * 100) : 0;

  return { score: Math.min(score, 100), matched, missing, total, density };
}

/**
 * B. Experience Relevance Score (0–100).
 * Checks JD keyword presence + action verbs in experience section.
 * Falls back to full resume if section not detected.
 */
function scoreExperience(jdKeywords, resumeText) {
  let expSection = extractSection(resumeText, [
    'experience', 'work experience', 'professional experience',
    'employment', 'work history', 'career',
  ]);

  // Fallback: if section not found, check entire resume
  const usedFallback = !expSection || expSection.length < 30;
  const textToCheck = usedFallback ? resumeText : expSection;
  const expLower = textToCheck.toLowerCase();
  let hits = 0;

  for (const kw of jdKeywords) {
    if (expLower.includes(kw)) hits++;
  }

  // Check action verbs
  let actionVerbCount = 0;
  for (const verb of ACTION_VERBS) {
    if (expLower.includes(verb)) actionVerbCount++;
  }

  const keywordScore = jdKeywords.length > 0 ? (hits / jdKeywords.length) * 60 : 0;
  const actionScore = Math.min(actionVerbCount * 4, 30);
  // Section structure bonus (10 pts if section heading found)
  const structureBonus = usedFallback ? 0 : 10;
  const score = Math.min(keywordScore + actionScore + structureBonus, 100);

  const details = usedFallback
    ? `No clear Experience section found. ${hits} keywords, ${actionVerbCount} action verbs in full resume`
    : `${hits} JD keywords, ${actionVerbCount} action verbs in Experience section`;

  return { score, details };
}

/**
 * C. Project Relevance Score (0–100).
 * Falls back to full resume if projects not found.
 */
function scoreProjects(jdKeywords, resumeText) {
  let projSection = extractSection(resumeText, [
    'project', 'projects', 'personal projects', 'academic projects',
    'key projects', 'notable projects', 'technical projects',
  ]);

  const usedFallback = !projSection || projSection.length < 20;
  const textToCheck = usedFallback ? resumeText : projSection;
  const projLower = textToCheck.toLowerCase();
  let hits = 0;

  for (const kw of jdKeywords) {
    if (projLower.includes(kw)) hits++;
  }

  const baseScore = jdKeywords.length > 0 ? (hits / jdKeywords.length) * 80 : 0;
  const structureBonus = usedFallback ? 0 : 20;
  const score = Math.min(baseScore + structureBonus, 100);

  const details = usedFallback
    ? `No clear Projects section. ${hits} JD skills found in full resume`
    : `${hits} JD keywords found in Projects section`;

  return { score: Math.max(score, 5), details };
}

/**
 * D. Education & Certifications Score (0–100).
 * Checks both dedicated sections and full resume for degrees/certs.
 */
function scoreEducation(resumeText) {
  const eduSection = extractSection(resumeText, [
    'education', 'academic', 'qualifications', 'qualification',
  ]);
  const certSection = extractSection(resumeText, [
    'certification', 'certifications', 'certificates', 'licenses',
  ]);

  // Check both sections AND full resume for education info
  const resumeLower = resumeText.toLowerCase();
  const sectionText = (eduSection + ' ' + certSection).toLowerCase();
  let score = 0;

  // Check for degrees (in section first, then full resume)
  let degreeFound = false;
  for (const deg of DEGREES) {
    if (sectionText.includes(deg) || resumeLower.includes(deg)) {
      degreeFound = true;
      break;
    }
  }
  if (degreeFound) score += 50;

  // Section structure bonus
  if (eduSection && eduSection.length > 10) score += 10;

  // Check for certifications
  let certCount = 0;
  for (const cert of CERTIFICATIONS) {
    if (resumeLower.includes(cert)) certCount++;
  }
  score += Math.min(certCount * 15, 40);

  return { score: Math.min(score, 100), details: `Degree: ${degreeFound ? 'Yes' : 'No'}, Certs: ${certCount}` };
}

/**
 * E. Format & ATS Readability Score (0–100).
 * Comprehensive format checks with detailed feedback.
 */
function scoreFormat(resumeText) {
  let score = 0;
  const lines = resumeText.split('\n');
  const details = [];

  // 1. Section headings (25 pts)
  const sectionKeywords = [
    'experience', 'education', 'skills', 'projects', 'summary',
    'objective', 'certification', 'contact', 'achievements', 'awards',
  ];
  let headingsFound = 0;
  for (const sk of sectionKeywords) {
    // Check if keyword appears as a standalone heading-like line
    const hasHeading = lines.some((l) => {
      const t = l.trim().toLowerCase();
      return t.includes(sk) && t.length < 50;
    });
    if (hasHeading) headingsFound++;
  }
  score += Math.min(headingsFound * 5, 25);
  if (headingsFound >= 4) details.push('✓ Good section structure');
  else if (headingsFound >= 2) details.push('⚠ Add more section headings');
  else details.push('✗ Missing clear section headings');

  // 2. Bullet points (20 pts)
  const bulletLines = lines.filter((l) => /^\s*[-*•▪▸►·]\s/.test(l) || /^\s*\d+[.)]\s/.test(l));
  const bulletScore = Math.min(bulletLines.length * 2.5, 20);
  score += bulletScore;
  if (bulletLines.length >= 8) details.push('✓ Good use of bullet points');
  else if (bulletLines.length >= 3) details.push('⚠ Add more bullet points');
  else details.push('✗ Needs bullet points for readability');

  // 3. Resume length (15 pts)
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 250 && wordCount <= 1000) {
    score += 15;
    details.push(`✓ Good length (${wordCount} words)`);
  } else if (wordCount >= 150 && wordCount <= 1500) {
    score += 10;
    details.push(`⚠ Acceptable length (${wordCount} words)`);
  } else if (wordCount < 150) {
    score += 3;
    details.push(`✗ Too short (${wordCount} words — aim for 300+)`);
  } else {
    score += 5;
    details.push(`✗ Too long (${wordCount} words — keep under 1000)`);
  }

  // 4. Contact info (20 pts)
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(resumeText);
  const hasPhone = /(\+?\d[\d\s()-]{7,})/.test(resumeText);
  const hasLinkedin = /linkedin/i.test(resumeText);
  let contactScore = 0;
  if (hasEmail) contactScore += 8;
  if (hasPhone) contactScore += 7;
  if (hasLinkedin) contactScore += 5;
  score += contactScore;
  const contactParts = [];
  if (hasEmail) contactParts.push('email');
  if (hasPhone) contactParts.push('phone');
  if (hasLinkedin) contactParts.push('LinkedIn');
  if (contactParts.length >= 2) details.push(`✓ Contact: ${contactParts.join(', ')}`);
  else if (contactParts.length === 1) details.push(`⚠ Only ${contactParts[0]} found — add more`);
  else details.push('✗ No contact info found');

  // 5. ATS-friendly formatting (20 pts)
  let atsScore = 15; // base score
  const hasTable = /\|.*\|.*\|/.test(resumeText);
  if (hasTable) {
    atsScore -= 10;
    details.push('✗ Avoid tables (ATS can\'t parse them)');
  }
  // Check for consistent formatting
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length > 10) atsScore += 5;
  score += Math.max(atsScore, 0);

  return { score: Math.min(score, 100), details };
}

// ─── Main Scorer ──────────────────────────────────────────

/**
 * Run the full ATS scoring pipeline.
 */
function calculateATSScore(jdText, resumeText) {
  const jdKeywords = extractJDKeywords(jdText);

  const keyword = scoreKeywords(jdKeywords, resumeText);
  const experience = scoreExperience(jdKeywords, resumeText);
  const projects = scoreProjects(jdKeywords, resumeText);
  const education = scoreEducation(resumeText);
  const format = scoreFormat(resumeText);

  // Weighted final score (out of 100)
  const weightedScore =
    keyword.score * 0.4 +
    experience.score * 0.2 +
    projects.score * 0.15 +
    education.score * 0.1 +
    format.score * 0.15;

  // Convert to /10 with one decimal
  const finalScore = Math.round(weightedScore) / 10;

  return {
    finalScore: Math.min(finalScore, 10),
    breakdown: {
      keywords: {
        score: Math.round(keyword.score),
        weight: '40%',
        matched: keyword.matched,
        missing: keyword.missing,
        density: keyword.density,
      },
      experience: {
        score: Math.round(experience.score),
        weight: '20%',
        details: experience.details,
      },
      projects: {
        score: Math.round(projects.score),
        weight: '15%',
        details: projects.details,
      },
      education: {
        score: Math.round(education.score),
        weight: '10%',
        details: education.details,
      },
      format: {
        score: Math.round(format.score),
        weight: '15%',
        details: format.details,
      },
    },
    jdKeywords,
  };
}

module.exports = { calculateATSScore, extractJDKeywords };
