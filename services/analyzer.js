/**
 * ═══════════════════════════════════════════════════════════════
 *  ANALYZER SERVICE — Rule-Based ATS Scoring & Insights
 * ═══════════════════════════════════════════════════════════════
 *
 * Zero AI dependency. Handles:
 *  - Keyword database
 *  - Text extraction (PDF, DOCX, plain text)
 *  - Tokenization & keyword extraction
 *  - ATS scoring engine (5 weighted pillars)
 *  - Role detection
 *  - Rule-based feedback (rejection reasons, impact fixes)
 *  - Fallback AI suggestions (for when Gemini is down)
 *  - Output formatting
 *  - DOCX + PDF resume file generation
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
const PDFDocument = require('pdfkit');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ═══════════════════════════════════════════════════════════════
//  KEYWORD DATABASE
// ═══════════════════════════════════════════════════════════════

const PROGRAMMING_LANGUAGES = [
  'javascript','typescript','python','java','c++','c#','c','ruby','go','golang',
  'rust','swift','kotlin','php','scala','perl','r','matlab','dart','lua',
  'haskell','elixir','clojure','objective-c','shell','bash','powershell',
  'sql','html','css','sass','less','graphql','solidity','assembly',
];

const FRAMEWORKS = [
  'react','reactjs','react.js','angular','angularjs','vue','vuejs','vue.js',
  'next.js','nextjs','nuxt','svelte','gatsby','express','expressjs','nestjs',
  'fastify','koa','django','flask','fastapi','spring','spring boot','springboot',
  'rails','ruby on rails','laravel','symfony','.net','asp.net','flutter',
  'react native','ionic','electron','tensorflow','pytorch','keras',
  'scikit-learn','pandas','numpy','matplotlib','opencv','langchain',
  'bootstrap','tailwind','tailwindcss','material ui','mui','chakra ui',
  'jquery','three.js','redux','zustand','mobx','rxjs',
];

const TOOLS = [
  'git','github','gitlab','bitbucket','docker','kubernetes','k8s',
  'jenkins','travis ci','circle ci','github actions','terraform',
  'ansible','puppet','aws','amazon web services','azure','gcp',
  'google cloud','firebase','heroku','vercel','netlify','digitalocean',
  'cloudflare','nginx','apache','linux','ubuntu','postman','swagger',
  'jira','confluence','trello','figma','sketch','adobe xd',
  'webpack','vite','babel','eslint','prettier','npm','yarn','pnpm',
  'pip','conda','maven','gradle','cmake',
];

const DATABASES = [
  'mysql','postgresql','postgres','mongodb','redis','elasticsearch',
  'sqlite','mariadb','oracle','sql server','mssql','dynamodb',
  'cassandra','neo4j','firebase firestore','supabase','cockroachdb',
  'rabbitmq','kafka','celery','memcached',
];

const CONCEPTS = [
  'rest','restful','api','graphql','grpc','websocket','microservices',
  'serverless','event-driven','ci/cd','devops','agile','scrum','kanban',
  'tdd','bdd','unit testing','integration testing','e2e testing',
  'machine learning','deep learning','nlp','natural language processing',
  'computer vision','data science','data engineering','data analytics',
  'big data','etl','data pipeline','oop','functional programming',
  'design patterns','solid','clean architecture','domain driven design',
  'oauth','jwt','authentication','authorization','encryption',
  'cybersecurity','responsive design','accessibility','seo',
  'performance optimization','caching','load balancing',
  'distributed systems','cloud computing','containerization',
  'blockchain','web3','smart contracts',
];

const SOFT_SKILLS = [
  'leadership','communication','teamwork','collaboration',
  'problem solving','problem-solving','critical thinking',
  'time management','project management','mentoring',
  'adaptability','creativity','innovation','attention to detail',
  'analytical','strategic thinking','decision making',
  'presentation','negotiation','stakeholder management','cross-functional',
];

const ACTION_VERBS = [
  'achieved','administered','analyzed','architected','automated',
  'built','collaborated','configured','created','debugged',
  'delivered','deployed','designed','developed','documented',
  'engineered','enhanced','established','evaluated','executed',
  'implemented','improved','increased','integrated','launched',
  'led','maintained','managed','mentored','migrated',
  'monitored','optimized','orchestrated','organized','performed',
  'pioneered','planned','programmed','reduced','refactored',
  'resolved','revamped','reviewed','scaled','secured','simplified',
  'spearheaded','streamlined','supervised','tested','trained',
  'transformed','troubleshot','upgraded','utilized',
];

const CERTIFICATIONS = [
  'aws certified','azure certified','google cloud certified',
  'comptia','cissp','ceh','ccna','pmp','scrum master','csm',
  'itil','togaf','six sigma','kubernetes certified','cka','ckad',
  'oracle certified','salesforce certified',
];

const DEGREES = [
  'bachelor','bachelors',"bachelor's",'b.s.','bs','b.sc','bsc',
  'b.tech','btech','b.e.','be','bca','bba',
  'master','masters',"master's",'m.s.','ms','m.sc','msc',
  'm.tech','mtech','m.e.','me','mca','mba',
  'ph.d','phd','doctorate','diploma','associate',
  'computer science','information technology','software engineering',
  'electrical engineering','data science','mathematics','statistics',
];

const ALL_TECH_KEYWORDS = new Set([
  ...PROGRAMMING_LANGUAGES, ...FRAMEWORKS, ...TOOLS, ...DATABASES, ...CONCEPTS,
]);

// ═══════════════════════════════════════════════════════════════
//  TEXT EXTRACTION
// ═══════════════════════════════════════════════════════════════

async function extractText(buffer, mimeType) {
  let raw = '';
  if (mimeType === 'application/pdf') {
    const data = await pdfParse(buffer);
    raw = data.text;
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    raw = result.value;
  } else {
    raw = buffer.toString('utf-8');
  }
  return cleanText(raw);
}

function cleanText(text) {
  return text
    .replace(/[\r\n]+/g, '\n')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getMimeType(fileName) {
  if (!fileName) return 'text/plain';
  const ext = fileName.split('.').pop().toLowerCase();
  return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain' }[ext] || 'text/plain';
}

// ═══════════════════════════════════════════════════════════════
//  TOKENIZATION & KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════════

function tokenize(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/[\w#+./-]+/g) || [];
  const ngrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.push(words[i] + ' ' + words[i + 1]);
    if (i < words.length - 2) {
      ngrams.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
    }
  }
  return { words, ngrams, lower };
}

function extractKeywords(jdText) {
  const { words, ngrams } = tokenize(jdText);
  const found = new Set();
  for (const ng of ngrams) {
    if (ALL_TECH_KEYWORDS.has(ng) || SOFT_SKILLS.includes(ng)) found.add(ng);
  }
  for (const w of words) {
    if (ALL_TECH_KEYWORDS.has(w) || SOFT_SKILLS.includes(w)) found.add(w);
  }
  return [...found];
}

function extractSection(resumeText, sectionNames) {
  const lines = resumeText.split('\n');
  let capturing = false;
  const sectionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lower = trimmed.toLowerCase().replace(/[:\-─━═│|*#_]/g, '').trim();
    const isShortLine = trimmed.length > 0 && trimmed.length < 50;
    const isAllCaps = /^[A-Z][A-Z\s&/,.\-()]+$/.test(trimmed);
    const isMarkdownH = /^#{1,3}\s/.test(trimmed);
    const isTitleCase = /^[A-Z][a-zA-Z\s&/,.\-()]*$/.test(trimmed) && trimmed.length < 40;
    const isUnderlined = i + 1 < lines.length && /^[-=─━]{3,}$/.test(lines[i + 1]?.trim());
    const hasColonEnd = /^[A-Za-z\s&/]+:\s*$/.test(trimmed);
    const isHeading = isShortLine && (isAllCaps || isMarkdownH || isTitleCase || isUnderlined || hasColonEnd);

    if (isHeading) {
      if (sectionNames.some((n) => lower.includes(n))) { capturing = true; continue; }
      else if (capturing) break;
    }
    if (capturing) sectionLines.push(trimmed);
  }
  return sectionLines.join('\n').trim();
}

// ═══════════════════════════════════════════════════════════════
//  ATS SCORING ENGINE (Rule-Based — No AI)
// ═══════════════════════════════════════════════════════════════

function scoreKeywords(jdKeywords, resumeText) {
  const resumeLower = resumeText.toLowerCase();
  const matched = [], missing = [];
  for (const kw of jdKeywords) {
    (resumeLower.includes(kw) ? matched : missing).push(kw);
  }
  const total = jdKeywords.length;
  const score = total > 0 ? (matched.length / total) * 100 : 0;
  const density = total > 0 ? Math.round((matched.length / total) * 100) : 0;
  return { score: Math.min(score, 100), matched, missing, total, density };
}

function scoreExperience(jdKeywords, resumeText) {
  let section = extractSection(resumeText, [
    'experience', 'work experience', 'professional experience', 'employment', 'career',
  ]);
  const fallback = !section || section.length < 30;
  const text = (fallback ? resumeText : section).toLowerCase();

  let kwHits = 0;
  for (const kw of jdKeywords) { if (text.includes(kw)) kwHits++; }
  let verbHits = 0;
  for (const v of ACTION_VERBS) { if (text.includes(v)) verbHits++; }

  const kwScore = jdKeywords.length > 0 ? (kwHits / jdKeywords.length) * 60 : 0;
  const verbScore = Math.min(verbHits * 4, 30);
  const structBonus = fallback ? 0 : 10;
  return {
    score: Math.min(kwScore + verbScore + structBonus, 100),
    details: fallback
      ? `No Experience section found. ${kwHits} keywords, ${verbHits} verbs in full resume`
      : `${kwHits} JD keywords, ${verbHits} action verbs in Experience section`,
  };
}

function scoreProjects(jdKeywords, resumeText) {
  let section = extractSection(resumeText, [
    'project', 'projects', 'personal projects', 'academic projects', 'technical projects',
  ]);
  const fallback = !section || section.length < 20;
  const text = (fallback ? resumeText : section).toLowerCase();

  let hits = 0;
  for (const kw of jdKeywords) { if (text.includes(kw)) hits++; }

  const base = jdKeywords.length > 0 ? (hits / jdKeywords.length) * 80 : 0;
  return {
    score: Math.min(base + (fallback ? 0 : 20), 100),
    details: fallback
      ? `No Projects section. ${hits} JD skills found in resume`
      : `${hits} JD keywords found in Projects`,
  };
}

function scoreEducation(resumeText) {
  const resumeLower = resumeText.toLowerCase();
  const eduSection = extractSection(resumeText, ['education', 'academic', 'qualifications']);
  const certSection = extractSection(resumeText, ['certification', 'certifications', 'certificates']);
  let score = 0;

  let degreeFound = false;
  for (const deg of DEGREES) {
    if (resumeLower.includes(deg)) { degreeFound = true; break; }
  }
  if (degreeFound) score += 50;
  if (eduSection && eduSection.length > 10) score += 10;

  let certCount = 0;
  for (const cert of CERTIFICATIONS) { if (resumeLower.includes(cert)) certCount++; }
  score += Math.min(certCount * 15, 40);

  return { score: Math.min(score, 100), details: `Degree: ${degreeFound ? 'Yes' : 'No'}, Certs: ${certCount}` };
}

function scoreFormat(resumeText) {
  let score = 0;
  const lines = resumeText.split('\n');
  const details = [];

  const headingKws = ['experience', 'education', 'skills', 'projects', 'summary', 'certification', 'achievements'];
  let headings = 0;
  for (const sk of headingKws) {
    if (lines.some((l) => l.trim().toLowerCase().includes(sk) && l.trim().length < 50)) headings++;
  }
  score += Math.min(headings * 5, 25);
  details.push(headings >= 4 ? '✓ Good sections' : headings >= 2 ? '⚠ Add more sections' : '✗ Missing section headings');

  const bullets = lines.filter((l) => /^\s*[-*•▪▸►·]\s/.test(l) || /^\s*\d+[.)]\s/.test(l)).length;
  score += Math.min(bullets * 2.5, 20);
  details.push(bullets >= 8 ? '✓ Good bullets' : bullets >= 3 ? '⚠ Add more bullets' : '✗ Needs bullet points');

  const words = resumeText.split(/\s+/).filter(Boolean).length;
  if (words >= 250 && words <= 1000) { score += 15; details.push(`✓ Good length (${words}w)`); }
  else if (words >= 150 && words <= 1500) { score += 10; details.push(`⚠ OK length (${words}w)`); }
  else { score += 3; details.push(`✗ ${words < 150 ? 'Too short' : 'Too long'} (${words}w)`); }

  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(resumeText);
  const hasPhone = /(\+?\d[\d\s()-]{7,})/.test(resumeText);
  const hasLinkedin = /linkedin/i.test(resumeText);
  if (hasEmail) score += 8;
  if (hasPhone) score += 7;
  if (hasLinkedin) score += 5;
  const contact = [hasEmail && 'email', hasPhone && 'phone', hasLinkedin && 'LinkedIn'].filter(Boolean);
  details.push(contact.length >= 2 ? `✓ Contact: ${contact.join(', ')}` : `⚠ Missing contact info`);

  const hasTable = /\|.*\|.*\|/.test(resumeText);
  score += hasTable ? 10 : 20;
  if (hasTable) details.push('✗ Avoid tables');

  return { score: Math.min(score, 100), details };
}

function calculateATSScore(jdText, resumeText) {
  const jdKeywords = extractKeywords(jdText);
  const kw = scoreKeywords(jdKeywords, resumeText);
  const exp = scoreExperience(jdKeywords, resumeText);
  const proj = scoreProjects(jdKeywords, resumeText);
  const edu = scoreEducation(resumeText);
  const fmt = scoreFormat(resumeText);

  const weighted = kw.score * 0.4 + exp.score * 0.2 + proj.score * 0.15 + edu.score * 0.1 + fmt.score * 0.15;
  const finalScore = Math.round(weighted) / 10;

  return {
    finalScore: Math.min(finalScore, 10),
    breakdown: {
      keywords: { score: Math.round(kw.score), weight: '40%', matched: kw.matched, missing: kw.missing, density: kw.density },
      experience: { score: Math.round(exp.score), weight: '20%', details: exp.details },
      projects: { score: Math.round(proj.score), weight: '15%', details: proj.details },
      education: { score: Math.round(edu.score), weight: '10%', details: edu.details },
      format: { score: Math.round(fmt.score), weight: '15%', details: fmt.details },
    },
    jdKeywords,
  };
}

// ═══════════════════════════════════════════════════════════════
//  ROLE DETECTION
// ═══════════════════════════════════════════════════════════════

function detectRole(jdText) {
  const lower = jdText.toLowerCase();
  if (lower.match(/frontend|react|angular|vue|ui |user interface/)) return 'Frontend Engineer';
  if (lower.match(/backend|node|java |spring|api |express/)) return 'Backend Engineer';
  if (lower.match(/data |ml |machine learning|python|sql |analytics/)) return 'Data/ML Engineer';
  if (lower.match(/devops|aws|kubernetes|docker|ci\/cd|cloud/)) return 'DevOps/Cloud Engineer';
  if (lower.match(/fullstack|full stack/)) return 'Full Stack Engineer';
  if (lower.match(/product manager|pm |scrum/)) return 'Product Manager';
  return 'Software Professional';
}

// ═══════════════════════════════════════════════════════════════
//  RULE-BASED FEEDBACK (No AI)
// ═══════════════════════════════════════════════════════════════

function generateRuleBasedFeedback(scoreResult) {
  const { finalScore, breakdown } = scoreResult;
  const b = breakdown;

  const matchedSkills = (b.keywords.matched || []).slice(0, 5);
  const missingSkills = (b.keywords.missing || []).slice(0, 5);
  const topMissingKeywords = (b.keywords.missing || []).slice(0, 10);
  const keywordDensity = b.keywords.density || 0;

  const weakSections = [];
  if (b.keywords.score < 40) weakSections.push('🔴 Resume severely lacks JD keywords');
  else if (b.keywords.score < 60) weakSections.push('🟡 Keyword match below average');

  if (b.experience.score < 40) weakSections.push('🔴 Experience lacks relevant keywords/verbs');
  else if (b.experience.score < 60) weakSections.push('🟡 Strengthen experience with action verbs');

  if (b.projects.score < 40) weakSections.push('🔴 Projects not aligned with JD');
  else if (b.projects.score < 60) weakSections.push('🟡 Projects could showcase more JD skills');

  if (b.education.score < 40) weakSections.push('🟡 Education/certifications need improvement');
  if (b.format.score < 50) weakSections.push('🔴 Resume format has ATS issues');

  if (Array.isArray(b.format.details)) {
    for (const d of b.format.details) {
      if (d.startsWith('✗') || d.startsWith('⚠')) weakSections.push(`  ↳ ${d}`);
    }
  }

  const keyIssues = [];
  const rejectionReasons = [];
  const impactFixes = [];

  if (b.keywords.missing && b.keywords.missing.length > 3) {
    keyIssues.push(`${b.keywords.missing.length} JD keywords missing from resume`);
    rejectionReasons.push(`Missing critical skills: Lacking ${b.keywords.missing.length} key terms from JD`);
    impactFixes.push(`Add missing keywords natively: ${missingSkills.join(', ')}`);
  }
  if (b.experience.score < 50) {
    keyIssues.push('Experience doesn\'t match job requirements');
    rejectionReasons.push('Weak experience alignment: Achievements do not strongly reflect required JD competencies');
    impactFixes.push('Quantify your experience using metrics (e.g., Improved by X%)');
  }
  if (b.projects.score < 50) {
    keyIssues.push('Projects don\'t demonstrate JD-relevant skills');
    rejectionReasons.push('Poor project relevance: Projects fail to demonstrate the exact tech stack required');
    impactFixes.push('Align projects explicitly with the JD technology stack');
  }
  if (b.format.score < 60) {
    keyIssues.push('Format may not pass ATS parsing');
    rejectionReasons.push('ATS Parsing Risk: Format issues might prevent ATS from reading your resume');
    impactFixes.push('Simplify layout, remove tables, and ensure standard ATS headings');
  }

  let atsPassProbability;
  if (finalScore >= 7) atsPassProbability = '🟢 HIGH';
  else if (finalScore >= 5) atsPassProbability = '🟡 MEDIUM';
  else atsPassProbability = '🔴 LOW';

  return { matchedSkills, missingSkills, topMissingKeywords, keywordDensity, weakSections, keyIssues, atsPassProbability, rejectionReasons, impactFixes };
}

// ═══════════════════════════════════════════════════════════════
//  FALLBACK SUGGESTIONS (When AI is unavailable)
// ═══════════════════════════════════════════════════════════════

function generateFallbackSuggestions(scoreResult, role) {
  const b = scoreResult.breakdown;
  const missing = (b.keywords.missing || []).slice(0, 8);
  const matched = (b.keywords.matched || []).slice(0, 5);

  let msg = `🤖 *AI-Free Recruiter Suggestions*\n`;
  msg += `_(Based on rule-based analysis for ${role})_\n\n`;

  // Rejection Reasons
  msg += `🚫 *Why You Might Get Rejected:*\n`;
  if (missing.length > 0) msg += `  • Resume is missing ${missing.length} critical JD skills: ${missing.slice(0, 4).join(', ')}\n`;
  if (b.experience.score < 50) msg += `  • Experience section doesn't clearly demonstrate JD-relevant competencies\n`;
  if (b.projects.score < 50) msg += `  • Projects don't align with the required tech stack\n`;
  if (b.format.score < 60) msg += `  • Resume format may fail ATS parsing\n`;
  msg += `\n`;

  // High-Impact Fixes
  msg += `🔥 *High-Impact Fixes:*\n`;
  if (missing.length > 0) msg += `  • Add these skills to relevant experience bullets: ${missing.join(', ')}\n`;
  msg += `  • Quantify achievements with metrics (e.g., "Improved load time by 40%")\n`;
  msg += `  • Use strong action verbs: Architected, Spearheaded, Engineered, Optimized\n`;
  if (b.format.score < 70) msg += `  • Ensure clear section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION\n`;
  msg += `\n`;

  // Strengths
  if (matched.length > 0) {
    msg += `✅ *Strengths:*\n`;
    msg += `  • Matched ${matched.length} key skills: ${matched.join(', ')}\n`;
    if (b.experience.score >= 60) msg += `  • Experience section is reasonably well structured\n`;
    if (b.format.score >= 70) msg += `  • Resume format is ATS-friendly\n`;
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  OUTPUT FORMATTING
// ═══════════════════════════════════════════════════════════════

function progressBar(pct, w = 10) {
  const f = Math.round((pct / 100) * w);
  return '█'.repeat(f) + '░'.repeat(w - f) + ` ${pct}%`;
}

function scoreEmoji(pct) {
  if (pct >= 80) return '🟢'; if (pct >= 60) return '🟡'; if (pct >= 40) return '🟠'; return '🔴';
}

function scoreRating(s) {
  if (s >= 8) return '🌟 Excellent Match';
  if (s >= 6) return '✅ Good Match';
  if (s >= 4) return '⚠️ Needs Improvement';
  return '❌ Poor Match';
}

function escapeMd(t) {
  return t ? t.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1') : '';
}

function formatScoreReport(scoreResult, insights) {
  const b = scoreResult.breakdown;
  const total = (b.keywords.matched.length || 0) + (b.keywords.missing.length || 0);

  let msg = '';
  msg += `╔══════════════════════════════════╗\n`;
  msg += `   📊  *RESUME MATCH REPORT*\n`;
  msg += `╚══════════════════════════════════╝\n\n`;

  msg += `🎯 *Score: ${scoreResult.finalScore} / 10*\n`;
  msg += `${scoreRating(scoreResult.finalScore)}\n`;
  msg += `📈 ATS Pass Probability: ${insights.atsPassProbability}\n\n`;

  msg += `🧠 *Recruiter Insight:* "Your resume matches ~${Math.round(scoreResult.finalScore * 10)}% of JD expectations."\n\n`;

  msg += `📋 *Breakdown:*\n`;
  msg += `┌────────────────────────────────┐\n`;
  msg += `│ ${scoreEmoji(b.keywords.score)} Keywords     ${progressBar(b.keywords.score)}\n`;
  msg += `│ ${scoreEmoji(b.experience.score)} Experience   ${progressBar(b.experience.score)}\n`;
  msg += `│ ${scoreEmoji(b.projects.score)} Projects     ${progressBar(b.projects.score)}\n`;
  msg += `│ ${scoreEmoji(b.education.score)} Education    ${progressBar(b.education.score)}\n`;
  msg += `│ ${scoreEmoji(b.format.score)} ATS Format   ${progressBar(b.format.score)}\n`;
  msg += `└────────────────────────────────┘\n\n`;

  msg += `🔑 *Keyword Density:* ${insights.keywordDensity}% (${b.keywords.matched.length}/${total} terms)\n\n`;

  if (insights.matchedSkills.length > 0) {
    msg += `✅ *Matched Skills:*\n`;
    msg += insights.matchedSkills.map((s) => `  ✔ ${s}`).join('\n') + '\n\n';
  }

  if (insights.missingSkills.length > 0) {
    msg += `❌ *Missing Skills:*\n`;
    msg += insights.missingSkills.map((s) => `  ✘ ${s}`).join('\n') + '\n\n';
  }

  if (insights.topMissingKeywords.length > 3) {
    msg += `🔍 *All Missing Keywords:*\n`;
    msg += `  ${insights.topMissingKeywords.join(' · ')}\n\n`;
  }

  if (insights.weakSections.length > 0) {
    msg += `⚠️ *Areas to Improve:*\n`;
    msg += insights.weakSections.map((w) => `  ${w}`).join('\n') + '\n\n';
  }

  if (insights.keyIssues.length > 0) {
    msg += `🚨 *Key Issues:*\n`;
    msg += insights.keyIssues.map((iss, i) => `  ${i + 1}. ${iss}`).join('\n') + '\n\n';
  }

  if (insights.rejectionReasons && insights.rejectionReasons.length > 0) {
    msg += `🚫 *Why You Might Get Rejected:*\n`;
    msg += insights.rejectionReasons.map((r) => `  • ${r}`).join('\n') + '\n\n';
  }

  if (insights.impactFixes && insights.impactFixes.length > 0) {
    msg += `🔥 *High Impact Fixes:*\n`;
    msg += insights.impactFixes.map((f) => `  • ${f}`).join('\n') + '\n\n';
  }

  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  RESUME FILE GENERATION (DOCX + PDF)
// ═══════════════════════════════════════════════════════════════

function parseResumeText(text) {
  const sections = {
    name: '', summary: '', skills: '', experience: [], projects: [], education: [],
  };

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let currentSection = '';

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('NAME:')) { sections.name = line.replace(/^NAME:\s*/i, ''); continue; }
    if (upper.startsWith('SUMMARY:')) { sections.summary = line.replace(/^SUMMARY:\s*/i, ''); currentSection = 'summary'; continue; }
    if (upper.startsWith('SKILLS:')) { sections.skills = line.replace(/^SKILLS:\s*/i, ''); currentSection = 'skills'; continue; }
    if (upper === 'EXPERIENCE:' || upper === 'EXPERIENCE' || upper.startsWith('WORK EXPERIENCE')) { currentSection = 'experience'; continue; }
    if (upper === 'PROJECTS:' || upper === 'PROJECTS') { currentSection = 'projects'; continue; }
    if (upper === 'EDUCATION:' || upper === 'EDUCATION') { currentSection = 'education'; continue; }

    if (currentSection === 'summary' && !sections.summary) sections.summary = line;
    else if (currentSection === 'summary') sections.summary += ' ' + line;
    else if (currentSection === 'experience') sections.experience.push(line);
    else if (currentSection === 'projects') sections.projects.push(line);
    else if (currentSection === 'education') sections.education.push(line);
  }

  if (!sections.name) sections.name = 'Candidate';
  return sections;
}

async function createDOCXResume(resumeTextContent, chatId) {
  const s = parseResumeText(resumeTextContent);
  const children = [];

  const addHeading = (text) => {
    children.push(new Paragraph({
      children: [new TextRun({ text, bold: true, size: 28, font: 'Calibri', color: '1F4E79' })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
      border: { bottom: { color: '1F4E79', space: 1, style: BorderStyle.SINGLE, size: 6 } },
    }));
  };

  children.push(new Paragraph({
    children: [new TextRun({ text: s.name, bold: true, size: 36, font: 'Calibri', color: '1F4E79' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  if (s.summary) {
    addHeading('PROFESSIONAL SUMMARY');
    children.push(new Paragraph({
      children: [new TextRun({ text: s.summary, size: 22, font: 'Calibri' })],
      spacing: { after: 150 },
    }));
  }

  if (s.skills) {
    addHeading('SKILLS');
    children.push(new Paragraph({
      children: [new TextRun({ text: s.skills, size: 22, font: 'Calibri' })],
      spacing: { after: 150 },
    }));
  }

  if (s.experience.length > 0) {
    addHeading('EXPERIENCE');
    for (const line of s.experience) {
      const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
      children.push(new Paragraph({
        children: [new TextRun({
          text: isBullet ? line.replace(/^[-•*]\s*/, '') : line,
          bold: !isBullet, size: 22, font: 'Calibri',
        })],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: isBullet ? 50 : 100 },
      }));
    }
  }

  if (s.projects.length > 0) {
    addHeading('PROJECTS');
    for (const line of s.projects) {
      const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
      children.push(new Paragraph({
        children: [new TextRun({
          text: isBullet ? line.replace(/^[-•*]\s*/, '') : line,
          bold: !isBullet, size: 22, font: 'Calibri',
        })],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: isBullet ? 50 : 100 },
      }));
    }
  }

  if (s.education.length > 0) {
    addHeading('EDUCATION');
    for (const line of s.education) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22, font: 'Calibri' })],
        spacing: { after: 80 },
      }));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const filePath = path.join(TMP_DIR, `resume_${chatId}.docx`);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function createPDFResume(resumeTextContent, chatId) {
  return new Promise((resolve, reject) => {
    const s = parseResumeText(resumeTextContent);
    const filePath = path.join(TMP_DIR, `resume_${chatId}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const PRIMARY = '#1F4E79';
    const TEXT = '#333333';

    doc.font('Helvetica-Bold').fontSize(24).fillColor(PRIMARY).text(s.name, { align: 'center' });
    doc.moveDown(0.5);

    const addSection = (title) => {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(PRIMARY).text(title);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(PRIMARY).lineWidth(1).stroke();
      doc.moveDown(0.2);
    };

    if (s.summary) {
      addSection('PROFESSIONAL SUMMARY');
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(s.summary, { lineGap: 3 });
    }

    if (s.skills) {
      addSection('SKILLS');
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(s.skills, { lineGap: 3 });
    }

    if (s.experience.length > 0) {
      addSection('EXPERIENCE');
      for (const line of s.experience) {
        const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
        if (isBullet) {
          doc.font('Helvetica').fontSize(10.5).fillColor(TEXT)
            .text(`  •  ${line.replace(/^[-•*]\s*/, '')}`, { lineGap: 2, indent: 10 });
        } else {
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#444444').text(line, { lineGap: 2 });
        }
      }
    }

    if (s.projects.length > 0) {
      addSection('PROJECTS');
      for (const line of s.projects) {
        const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
        if (isBullet) {
          doc.font('Helvetica').fontSize(10.5).fillColor(TEXT)
            .text(`  •  ${line.replace(/^[-•*]\s*/, '')}`, { lineGap: 2, indent: 10 });
        } else {
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#444444').text(line, { lineGap: 2 });
        }
      }
    }

    if (s.education.length > 0) {
      addSection('EDUCATION');
      for (const line of s.education) {
        doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(line, { lineGap: 3 });
      }
    }

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Text extraction
  extractText,
  cleanText,
  getMimeType,
  // Scoring
  calculateATSScore,
  extractKeywords,
  // Feedback
  detectRole,
  generateRuleBasedFeedback,
  generateFallbackSuggestions,
  // Formatting
  formatScoreReport,
  escapeMd,
  // File generation
  createDOCXResume,
  createPDFResume,
};
