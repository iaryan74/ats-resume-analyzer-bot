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
 * Extract JD keywords that are recognized technical/soft-skill terms.
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
  // Then single words
  for (const w of words) {
    if (ALL_TECH_KEYWORDS.has(w) || SOFT_SKILLS.includes(w)) {
      found.add(w);
    }
  }

  // Also include any remaining unique significant words from JD
  // that appear to be skills (not stop-words)
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very',
    'just', 'about', 'above', 'after', 'again', 'all', 'also', 'am',
    'any', 'as', 'back', 'because', 'before', 'between', 'both',
    'come', 'day', 'each', 'even', 'first', 'get', 'give', 'good',
    'he', 'her', 'here', 'him', 'his', 'how', 'i', 'into', 'it',
    'its', 'know', 'like', 'look', 'make', 'me', 'most', 'my',
    'new', 'now', 'only', 'other', 'our', 'out', 'over', 'own',
    'part', 'people', 'say', 'she', 'some', 'take', 'tell', 'that',
    'their', 'them', 'these', 'they', 'thing', 'think', 'this',
    'those', 'time', 'two', 'up', 'us', 'use', 'want', 'way',
    'we', 'well', 'what', 'when', 'which', 'who', 'why', 'work',
    'year', 'you', 'your', 'etc', 'such', 'through', 'while',
    'more', 'able', 'strong', 'experience', 'role', 'team',
    'company', 'job', 'position', 'candidate', 'apply', 'required',
    'preferred', 'including', 'using', 'working', 'within', 'across',
    'ensure', 'support', 'based', 'related', 'relevant', 'key',
    'ideal', 'plus', 'years', 'minimum', 'senior', 'junior', 'mid',
    'level', 'full', 'stack', 'end', 'type', 'looking',
  ]);

  // Add JD-specific meaningful words (>3 chars, not stop words) as extra keywords
  for (const w of words) {
    if (w.length > 3 && !STOP_WORDS.has(w) && /^[a-z]/.test(w)) {
      // Only add if it looks like a skill/tech term (appears multiple times or is notable)
      found.add(w);
    }
  }

  return [...found];
}

/**
 * Detect a named section in the resume text.
 * Returns the text within that section (until the next heading).
 */
function extractSection(resumeText, sectionNames) {
  const lines = resumeText.split('\n');
  let capturing = false;
  let sectionLines = [];

  const headingRegex = /^[A-Z][A-Z\s&/,.-]{2,}$/; // ALL-CAPS headings
  const mixedHeadingRegex = /^#{1,3}\s|^[A-Z][a-zA-Z\s&/,.-]{2,}:?\s*$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Check if this line is a section heading
    const isHeading = headingRegex.test(trimmed) || mixedHeadingRegex.test(trimmed);

    if (isHeading) {
      if (sectionNames.some((n) => lower.includes(n))) {
        capturing = true;
        continue;
      } else if (capturing) {
        break; // hit next section, stop
      }
    }

    if (capturing) {
      sectionLines.push(trimmed);
    }
  }

  return sectionLines.join('\n');
}

// ─── Sub-Scorers ──────────────────────────────────────────

/**
 * A. Keyword Match Score (0–100).
 * Returns { score, matched, missing, total, density }
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
 */
function scoreExperience(jdKeywords, resumeText) {
  const expSection = extractSection(resumeText, [
    'experience', 'work experience', 'professional experience',
    'employment', 'work history', 'career',
  ]);

  if (!expSection || expSection.length < 30) return { score: 20, details: 'Experience section not found or too short' };

  const expLower = expSection.toLowerCase();
  let hits = 0;

  // Check JD keywords in experience section
  for (const kw of jdKeywords) {
    if (expLower.includes(kw)) hits++;
  }

  // Check action verbs
  let actionVerbCount = 0;
  for (const verb of ACTION_VERBS) {
    if (expLower.includes(verb)) actionVerbCount++;
  }

  const keywordScore = jdKeywords.length > 0 ? (hits / jdKeywords.length) * 70 : 0;
  const actionScore = Math.min(actionVerbCount * 3, 30); // up to 30 points for action verbs
  const score = Math.min(keywordScore + actionScore, 100);

  return { score, details: `${hits} JD keywords found, ${actionVerbCount} action verbs` };
}

/**
 * C. Project Relevance Score (0–100).
 */
function scoreProjects(jdKeywords, resumeText) {
  const projSection = extractSection(resumeText, [
    'project', 'projects', 'personal projects', 'academic projects',
    'key projects', 'notable projects',
  ]);

  if (!projSection || projSection.length < 20) return { score: 20, details: 'Projects section not found or too short' };

  const projLower = projSection.toLowerCase();
  let hits = 0;

  for (const kw of jdKeywords) {
    if (projLower.includes(kw)) hits++;
  }

  const score = jdKeywords.length > 0 ? Math.min((hits / jdKeywords.length) * 100, 100) : 0;
  return { score: Math.max(score, 10), details: `${hits} JD keywords found in projects` };
}

/**
 * D. Education & Certifications Score (0–100).
 */
function scoreEducation(resumeText) {
  const eduSection = extractSection(resumeText, [
    'education', 'academic', 'qualifications', 'qualification',
  ]);
  const certSection = extractSection(resumeText, [
    'certification', 'certifications', 'certificates', 'licenses',
  ]);

  const combined = (eduSection + ' ' + certSection).toLowerCase();
  let score = 0;

  // Check for degrees
  let degreeFound = false;
  for (const deg of DEGREES) {
    if (combined.includes(deg)) {
      degreeFound = true;
      break;
    }
  }
  if (degreeFound) score += 50;

  // Check for certifications
  let certCount = 0;
  for (const cert of CERTIFICATIONS) {
    if (combined.includes(cert)) certCount++;
  }
  score += Math.min(certCount * 15, 50);

  // If no education section found but resume mentions degrees elsewhere
  if (!degreeFound) {
    const resumeLower = resumeText.toLowerCase();
    for (const deg of DEGREES) {
      if (resumeLower.includes(deg)) {
        score += 30;
        break;
      }
    }
  }

  return { score: Math.min(score, 100), details: `Degree: ${degreeFound ? 'Yes' : 'No'}, Certs: ${certCount}` };
}

/**
 * E. Format & ATS Readability Score (0–100).
 */
function scoreFormat(resumeText) {
  let score = 0;
  const lines = resumeText.split('\n');
  const details = [];

  // 1. Check for section headings (20 pts)
  const sectionKeywords = [
    'experience', 'education', 'skills', 'projects', 'summary',
    'objective', 'certification', 'contact', 'achievements',
  ];
  let headingsFound = 0;
  for (const sk of sectionKeywords) {
    const regex = new RegExp(`^.*${sk}.*$`, 'im');
    if (regex.test(resumeText)) headingsFound++;
  }
  const headingScore = Math.min(headingsFound * 5, 20);
  score += headingScore;
  if (headingsFound >= 3) details.push('Good section structure');
  else details.push('Needs more clear sections');

  // 2. Check for bullet points (20 pts)
  const bulletLines = lines.filter((l) => /^\s*[-*•▪▸►]\s/.test(l) || /^\s*\d+[.)]\s/.test(l));
  const bulletScore = Math.min(bulletLines.length * 2, 20);
  score += bulletScore;
  if (bulletLines.length >= 5) details.push('Good use of bullet points');
  else details.push('Add more bullet points');

  // 3. Check resume length (20 pts)
  const wordCount = resumeText.split(/\s+/).length;
  if (wordCount >= 200 && wordCount <= 1200) {
    score += 20;
    details.push('Good resume length');
  } else if (wordCount < 200) {
    score += 5;
    details.push('Resume too short');
  } else {
    score += 10;
    details.push('Resume may be too long');
  }

  // 4. Contact info presence (20 pts)
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(resumeText);
  const hasPhone = /(\+?\d[\d\s()-]{7,})/.test(resumeText);
  if (hasEmail) score += 10;
  if (hasPhone) score += 10;
  if (hasEmail && hasPhone) details.push('Contact info present');
  else details.push('Missing contact info');

  // 5. No problematic formatting (20 pts)
  // ATS bots struggle with tables, images, headers/footers
  const hasTable = /\|.*\|.*\|/.test(resumeText);
  if (!hasTable) {
    score += 15;
  } else {
    details.push('Avoid tables for ATS');
  }
  // Consistent formatting bonus
  score += 5;

  return { score: Math.min(score, 100), details };
}

// ─── Main Scorer ──────────────────────────────────────────

/**
 * Run the full ATS scoring pipeline.
 *
 * @param {string} jdText - Job description text
 * @param {string} resumeText - Resume text
 * @returns {Object} Full scoring results
 */
function calculateATSScore(jdText, resumeText) {
  // Extract keywords from JD
  const jdKeywords = extractJDKeywords(jdText);

  // Run sub-scorers
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

  // Convert to /10
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
