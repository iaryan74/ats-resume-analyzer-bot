/**
 * ═══════════════════════════════════════════════════════════════
 *   ATS RESUME ANALYZER PRO v5.0 — 100% Free, Zero AI
 * ═══════════════════════════════════════════════════════════════
 *
 * Professional-grade ATS resume analyzer with:
 *  - Rule-based weighted scoring (no AI)
 *  - Smart recruiter-style feedback (no AI)
 *  - Rule-based resume improvement (no AI)
 *  - PDF + DOCX export
 *  - Inline keyboard buttons
 *  - Zero external API costs
 */

// ═══════════════════════════════════════════════════════════════
//  1. CONFIGURATION & DEPENDENCIES
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
const PDFDocument = require('pdfkit');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN not set'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });
const sessions = new Map();
const cooldowns = new Map();
const COOLDOWN_MS = 30000;
const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ═══════════════════════════════════════════════════════════════
//  2. KEYWORD DATABASE
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
//  3. TEXT EXTRACTION
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
  return text.replace(/[\r\n]+/g, '\n').replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ═══════════════════════════════════════════════════════════════
//  4. KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════════

function tokenize(text) {
  const lower = text.toLowerCase();
  const words = lower.match(/[\w#+./-]+/g) || [];
  const ngrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.push(words[i] + ' ' + words[i + 1]);
    if (i < words.length - 2) ngrams.push(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
  }
  return { words, ngrams, lower };
}

function extractKeywords(jdText) {
  const { words, ngrams } = tokenize(jdText);
  const found = new Set();
  for (const ng of ngrams) { if (ALL_TECH_KEYWORDS.has(ng) || SOFT_SKILLS.includes(ng)) found.add(ng); }
  for (const w of words) { if (ALL_TECH_KEYWORDS.has(w) || SOFT_SKILLS.includes(w)) found.add(w); }
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
//  5. ATS SCORING ENGINE
// ═══════════════════════════════════════════════════════════════

function scoreKeywords(jdKeywords, resumeText) {
  const resumeLower = resumeText.toLowerCase();
  const matched = [], missing = [];
  for (const kw of jdKeywords) { (resumeLower.includes(kw) ? matched : missing).push(kw); }
  const total = jdKeywords.length;
  const score = total > 0 ? (matched.length / total) * 100 : 0;
  const density = total > 0 ? Math.round((matched.length / total) * 100) : 0;
  return { score: Math.min(score, 100), matched, missing, total, density };
}

function scoreExperience(jdKeywords, resumeText) {
  let section = extractSection(resumeText, ['experience','work experience','professional experience','employment','career']);
  const fallback = !section || section.length < 30;
  const text = (fallback ? resumeText : section).toLowerCase();
  let kwHits = 0; for (const kw of jdKeywords) { if (text.includes(kw)) kwHits++; }
  let verbHits = 0; for (const v of ACTION_VERBS) { if (text.includes(v)) verbHits++; }
  const kwScore = jdKeywords.length > 0 ? (kwHits / jdKeywords.length) * 60 : 0;
  const verbScore = Math.min(verbHits * 4, 30);
  const structBonus = fallback ? 0 : 10;
  return {
    score: Math.min(kwScore + verbScore + structBonus, 100),
    details: fallback ? `No Experience section found. ${kwHits} keywords, ${verbHits} verbs in full resume`
      : `${kwHits} JD keywords, ${verbHits} action verbs in Experience section`,
  };
}

function scoreProjects(jdKeywords, resumeText) {
  let section = extractSection(resumeText, ['project','projects','personal projects','academic projects','technical projects']);
  const fallback = !section || section.length < 20;
  const text = (fallback ? resumeText : section).toLowerCase();
  let hits = 0; for (const kw of jdKeywords) { if (text.includes(kw)) hits++; }
  const base = jdKeywords.length > 0 ? (hits / jdKeywords.length) * 80 : 0;
  return {
    score: Math.min(base + (fallback ? 0 : 20), 100),
    details: fallback ? `No Projects section. ${hits} JD skills found in resume` : `${hits} JD keywords found in Projects`,
  };
}

function scoreEducation(resumeText) {
  const resumeLower = resumeText.toLowerCase();
  let score = 0;
  let degreeFound = false;
  for (const deg of DEGREES) { if (resumeLower.includes(deg)) { degreeFound = true; break; } }
  if (degreeFound) score += 50;
  const eduSection = extractSection(resumeText, ['education','academic','qualifications']);
  if (eduSection && eduSection.length > 10) score += 10;
  let certCount = 0;
  for (const cert of CERTIFICATIONS) { if (resumeLower.includes(cert)) certCount++; }
  score += Math.min(certCount * 15, 40);
  return { score: Math.min(score, 100), details: `Degree: ${degreeFound ? 'Yes' : 'No'}, Certs: ${certCount}` };
}

function scoreFormat(resumeText) {
  let score = 0; const lines = resumeText.split('\n'); const details = [];
  const headingKws = ['experience','education','skills','projects','summary','certification','achievements'];
  let headings = 0;
  for (const sk of headingKws) { if (lines.some((l) => l.trim().toLowerCase().includes(sk) && l.trim().length < 50)) headings++; }
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
  if (hasEmail) score += 8; if (hasPhone) score += 7; if (hasLinkedin) score += 5;
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
//  6. ROLE DETECTION & SMART FEEDBACK (Replaces AI)
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

function generateSmartFeedback(scoreResult, jdText) {
  const role = detectRole(jdText);
  const b = scoreResult.breakdown;
  const missing = (b.keywords.missing || []).slice(0, 5);
  const matched = (b.keywords.matched || []).slice(0, 5);
  const allMissing = b.keywords.missing || [];

  let msg = `╔══════════════════════════════════╗\n`;
  msg += `   🤖  *AI\\-Style Recruiter Analysis*\n`;
  msg += `╚══════════════════════════════════╝\n\n`;
  msg += `🎭 *Detected Role:* ${role}\n\n`;

  // ── Rejection Reasons ──
  msg += `🚫 *Why You Might Get Rejected:*\n`;
  if (allMissing.length > 0) msg += `  • Missing ${allMissing.length} critical JD skills: ${missing.join(', ')}\n`;
  if (b.experience.score < 60) msg += `  • Experience section is weak — lacks quantified achievements and JD-relevant action verbs\n`;
  if (b.projects.score < 60) msg += `  • Projects don't demonstrate the required ${role} tech stack\n`;
  if (b.format.score < 60) msg += `  • Resume format may fail ATS parsing — missing standard headings or bullet structure\n`;
  if (b.education.score < 50) msg += `  • Education/certifications section is thin — consider adding relevant certs\n`;
  if (allMissing.length === 0 && b.experience.score >= 60 && b.projects.score >= 60) {
    msg += `  • No critical red flags — but every detail matters at the interview stage\n`;
  }
  msg += `\n`;

  // ── Strengths ──
  msg += `✅ *Strengths:*\n`;
  if (matched.length > 0) msg += `  • Demonstrates ${matched.length} key skills: ${matched.join(', ')}\n`;
  if (b.experience.score >= 60) msg += `  • Experience section shows relevant industry exposure\n`;
  if (b.projects.score >= 60) msg += `  • Projects align well with JD requirements\n`;
  if (b.format.score >= 70) msg += `  • Resume format is clean and ATS-compatible\n`;
  if (b.education.score >= 60) msg += `  • Education credentials are solid\n`;
  if (matched.length === 0 && b.experience.score < 60) msg += `  • Resume structure is parseable — a solid foundation to build on\n`;
  msg += `\n`;

  // ── High-Impact Fixes ──
  msg += `🔥 *High\\-Impact Fixes:*\n`;
  if (missing.length > 0) msg += `  • Weave these keywords into your experience bullets: *${missing.join(', ')}*\n`;
  if (b.experience.score < 60) msg += `  • Quantify achievements: "Improved X by Y%" instead of "Worked on X"\n`;
  msg += `  • Lead bullets with power verbs: Architected, Spearheaded, Engineered, Optimized\n`;
  if (b.projects.score < 60) msg += `  • Reframe projects to explicitly mention ${role}-relevant technologies\n`;
  if (b.format.score < 70) msg += `  • Add clear section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION\n`;
  msg += `  • Add measurable impact: revenue, users, performance gains, team size\n`;

  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  7. RULE-BASED RESUME IMPROVEMENT (Replaces AI Rewrite)
// ═══════════════════════════════════════════════════════════════

function improveResumeWithoutAI(resumeText, missingKeywords) {
  let lines = resumeText.split('\n');
  let improved = [];
  let hasSkillsSection = false;
  let inExperience = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const upper = trimmed.toUpperCase();

    // Detect skills section
    if (upper.includes('SKILLS') && trimmed.length < 50) {
      hasSkillsSection = true;
      improved.push(lines[i]);
      // Check if next line has skills listed — inject missing ones
      if (i + 1 < lines.length && lines[i + 1].trim().length > 0 && !lines[i + 1].trim().match(/^[A-Z]{2,}/)) {
        const existing = lines[i + 1].trim();
        const toAdd = missingKeywords.slice(0, 8).filter(k => !existing.toLowerCase().includes(k));
        if (toAdd.length > 0) {
          improved.push(existing + ', ' + toAdd.join(', '));
          i++; // skip the original skills line
        }
      }
      continue;
    }

    // Detect experience section
    if (upper.match(/^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE)/)) {
      inExperience = true;
      improved.push(lines[i]);
      continue;
    }
    if (inExperience && trimmed.length < 50 && trimmed.length > 0 && /^[A-Z]/.test(trimmed) && !trimmed.startsWith('-') && !trimmed.startsWith('•')) {
      if (upper.match(/^(EDUCATION|PROJECTS|SKILLS|CERTIFICATION|SUMMARY)/)) {
        inExperience = false;
      }
    }

    // Strengthen weak bullets in experience
    if (inExperience && (trimmed.startsWith('- ') || trimmed.startsWith('• '))) {
      const bullet = trimmed.replace(/^[-•]\s*/, '');
      const lower = bullet.toLowerCase();
      // If bullet doesn't start with a strong verb, strengthen it
      const startsWithVerb = ACTION_VERBS.some(v => lower.startsWith(v));
      if (!startsWithVerb && bullet.length > 10) {
        const verbs = ['Developed', 'Engineered', 'Implemented', 'Architected', 'Optimized'];
        const verb = verbs[i % verbs.length];
        improved.push(`- ${verb} ${bullet.charAt(0).toLowerCase() + bullet.slice(1)}`);
        continue;
      }
    }

    improved.push(lines[i]);
  }

  // If no skills section found, inject one near the top
  if (!hasSkillsSection && missingKeywords.length > 0) {
    const insertIdx = Math.min(3, improved.length);
    const skillsBlock = [
      '',
      'SKILLS',
      missingKeywords.slice(0, 12).join(', '),
      '',
    ];
    improved.splice(insertIdx, 0, ...skillsBlock);
  }

  // Append suggested keywords section
  if (missingKeywords.length > 0) {
    improved.push('');
    improved.push('SUGGESTED KEYWORDS TO ADD');
    improved.push(missingKeywords.slice(0, 15).join(', '));
  }

  return improved.join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  8. RULE-BASED INSIGHTS
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
    for (const d of b.format.details) { if (d.startsWith('✗') || d.startsWith('⚠')) weakSections.push(`  ↳ ${d}`); }
  }

  const keyIssues = [], rejectionReasons = [], impactFixes = [];
  if (b.keywords.missing && b.keywords.missing.length > 3) {
    keyIssues.push(`${b.keywords.missing.length} JD keywords missing`);
    rejectionReasons.push(`Missing critical skills: ${b.keywords.missing.length} key terms from JD`);
    impactFixes.push(`Add missing keywords: ${missingSkills.join(', ')}`);
  }
  if (b.experience.score < 50) {
    keyIssues.push('Experience doesn\'t match job requirements');
    rejectionReasons.push('Weak experience alignment');
    impactFixes.push('Quantify experience using metrics (Improved by X%)');
  }
  if (b.projects.score < 50) {
    keyIssues.push('Projects don\'t demonstrate JD-relevant skills');
    rejectionReasons.push('Poor project relevance');
    impactFixes.push('Align projects with the JD technology stack');
  }
  if (b.format.score < 60) {
    keyIssues.push('Format may not pass ATS parsing');
    impactFixes.push('Simplify layout and ensure standard headings');
  }

  let atsPassProbability;
  if (finalScore >= 7) atsPassProbability = '🟢 HIGH';
  else if (finalScore >= 5) atsPassProbability = '🟡 MEDIUM';
  else atsPassProbability = '🔴 LOW';

  return { matchedSkills, missingSkills, topMissingKeywords, keywordDensity, weakSections, keyIssues, atsPassProbability, rejectionReasons, impactFixes };
}

// ═══════════════════════════════════════════════════════════════
//  9. OUTPUT FORMATTING
// ═══════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function progressBar(pct, w = 10) {
  const f = Math.round((pct / 100) * w);
  return '█'.repeat(f) + '░'.repeat(w - f) + ` ${pct}%`;
}
function scoreEmoji(pct) { if (pct >= 80) return '🟢'; if (pct >= 60) return '🟡'; if (pct >= 40) return '🟠'; return '🔴'; }
function scoreRating(s) { if (s >= 8) return '🌟 Excellent Match'; if (s >= 6) return '✅ Good Match'; if (s >= 4) return '⚠️ Needs Improvement'; return '❌ Poor Match'; }
function escapeMd(t) { return t ? t.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1') : ''; }

async function safeSend(chatId, text, opts = {}) {
  try { return await bot.sendMessage(chatId, text, opts); }
  catch { const plain = text.replace(/[_*`\[\]\\]/g, ''); return await bot.sendMessage(chatId, plain); }
}

async function sendLongMessage(chatId, text, opts = {}) {
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 4000) { await safeSend(chatId, remaining, opts); break; }
    let idx = remaining.lastIndexOf('\n', 3900);
    if (idx <= 0) idx = 3900;
    await safeSend(chatId, remaining.substring(0, idx), opts);
    remaining = remaining.substring(idx).trimStart();
  }
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
  if (insights.matchedSkills.length > 0) { msg += `✅ *Matched Skills:*\n`; msg += insights.matchedSkills.map((s) => `  ✔ ${s}`).join('\n') + '\n\n'; }
  if (insights.missingSkills.length > 0) { msg += `❌ *Missing Skills:*\n`; msg += insights.missingSkills.map((s) => `  ✘ ${s}`).join('\n') + '\n\n'; }
  if (insights.topMissingKeywords.length > 3) { msg += `🔍 *All Missing Keywords:*\n  ${insights.topMissingKeywords.join(' · ')}\n\n`; }
  if (insights.weakSections.length > 0) { msg += `⚠️ *Areas to Improve:*\n`; msg += insights.weakSections.map((w) => `  ${w}`).join('\n') + '\n\n'; }
  if (insights.rejectionReasons && insights.rejectionReasons.length > 0) { msg += `🚫 *Why You Might Get Rejected:*\n`; msg += insights.rejectionReasons.map((r) => `  • ${r}`).join('\n') + '\n\n'; }
  if (insights.impactFixes && insights.impactFixes.length > 0) { msg += `🔥 *High Impact Fixes:*\n`; msg += insights.impactFixes.map((f) => `  • ${f}`).join('\n') + '\n\n'; }
  return msg;
}

// ═══════════════════════════════════════════════════════════════
// 10. RESUME FILE GENERATION (DOCX + PDF)
// ═══════════════════════════════════════════════════════════════

function parseResumeText(text) {
  const sections = { name: '', summary: '', skills: '', experience: [], projects: [], education: [] };
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
    if (upper === 'SKILLS' || upper === 'SUMMARY' || upper === 'SUGGESTED KEYWORDS TO ADD') { currentSection = upper === 'SKILLS' ? 'skills_next' : (upper === 'SUMMARY' ? 'summary' : 'suggested'); continue; }
    if (currentSection === 'skills_next') { sections.skills = line; currentSection = ''; continue; }
    if (currentSection === 'suggested') continue; // skip suggested keywords section in file gen
    if (currentSection === 'summary' && !sections.summary) sections.summary = line;
    else if (currentSection === 'summary') sections.summary += ' ' + line;
    else if (currentSection === 'experience') sections.experience.push(line);
    else if (currentSection === 'projects') sections.projects.push(line);
    else if (currentSection === 'education') sections.education.push(line);
  }
  if (!sections.name) {
    // Try to extract name from first line
    const firstLine = text.split('\n').find(l => l.trim().length > 0 && l.trim().length < 40);
    sections.name = firstLine ? firstLine.trim() : 'Candidate';
  }
  return sections;
}

async function createDOCXResume(resumeTextContent, chatId) {
  const s = parseResumeText(resumeTextContent);
  const children = [];
  const addHeading = (text) => {
    children.push(new Paragraph({ children: [new TextRun({ text, bold: true, size: 28, font: 'Calibri', color: '1F4E79' })], heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 }, border: { bottom: { color: '1F4E79', space: 1, style: BorderStyle.SINGLE, size: 6 } } }));
  };
  children.push(new Paragraph({ children: [new TextRun({ text: s.name, bold: true, size: 36, font: 'Calibri', color: '1F4E79' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
  if (s.summary) { addHeading('PROFESSIONAL SUMMARY'); children.push(new Paragraph({ children: [new TextRun({ text: s.summary, size: 22, font: 'Calibri' })], spacing: { after: 150 } })); }
  if (s.skills) { addHeading('SKILLS'); children.push(new Paragraph({ children: [new TextRun({ text: s.skills, size: 22, font: 'Calibri' })], spacing: { after: 150 } })); }
  const addBullets = (arr) => { for (const line of arr) { const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*'); children.push(new Paragraph({ children: [new TextRun({ text: isBullet ? line.replace(/^[-•*]\s*/, '') : line, bold: !isBullet, size: 22, font: 'Calibri' })], bullet: isBullet ? { level: 0 } : undefined, spacing: { after: isBullet ? 50 : 100 } })); } };
  if (s.experience.length > 0) { addHeading('EXPERIENCE'); addBullets(s.experience); }
  if (s.projects.length > 0) { addHeading('PROJECTS'); addBullets(s.projects); }
  if (s.education.length > 0) { addHeading('EDUCATION'); for (const line of s.education) { children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22, font: 'Calibri' })], spacing: { after: 80 } })); } }
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
    const P = '#1F4E79', T = '#333333';
    doc.font('Helvetica-Bold').fontSize(24).fillColor(P).text(s.name, { align: 'center' }); doc.moveDown(0.5);
    const addSec = (title) => { doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(13).fillColor(P).text(title); doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(P).lineWidth(1).stroke(); doc.moveDown(0.2); };
    if (s.summary) { addSec('PROFESSIONAL SUMMARY'); doc.font('Helvetica').fontSize(10.5).fillColor(T).text(s.summary, { lineGap: 3 }); }
    if (s.skills) { addSec('SKILLS'); doc.font('Helvetica').fontSize(10.5).fillColor(T).text(s.skills, { lineGap: 3 }); }
    const addPdfBullets = (arr) => { for (const line of arr) { const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*'); if (isBullet) { doc.font('Helvetica').fontSize(10.5).fillColor(T).text(`  •  ${line.replace(/^[-•*]\s*/, '')}`, { lineGap: 2, indent: 10 }); } else { doc.moveDown(0.2); doc.font('Helvetica-Bold').fontSize(11).fillColor('#444444').text(line, { lineGap: 2 }); } } };
    if (s.experience.length > 0) { addSec('EXPERIENCE'); addPdfBullets(s.experience); }
    if (s.projects.length > 0) { addSec('PROJECTS'); addPdfBullets(s.projects); }
    if (s.education.length > 0) { addSec('EDUCATION'); for (const line of s.education) { doc.font('Helvetica').fontSize(10.5).fillColor(T).text(line, { lineGap: 3 }); } }
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════
// 11. TELEGRAM BOT & CONVERSATION FLOW
// ═══════════════════════════════════════════════════════════════

function getSession(chatId) { if (!sessions.has(chatId)) sessions.set(chatId, { step: 'idle' }); return sessions.get(chatId); }
function resetSession(chatId) { sessions.set(chatId, { step: 'idle' }); }
function checkCooldown(chatId) { const last = cooldowns.get(chatId); return !last || (Date.now() - last) >= COOLDOWN_MS; }
function setCooldown(chatId) { cooldowns.set(chatId, Date.now()); }
function getMimeType(fileName) { if (!fileName) return 'text/plain'; const ext = fileName.split('.').pop().toLowerCase(); return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain' }[ext] || 'text/plain'; }

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  return new Promise((resolve, reject) => {
    (url.startsWith('https') ? https : http).get(url, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject); }).on('error', reject);
  });
}

// ─── Commands ───────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id; resetSession(chatId); const session = getSession(chatId); session.step = 'waiting_jd';
  safeSend(chatId, `🤖 *Resume Analyzer Pro*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\nProfessional ATS resume analysis — 100% free, zero AI costs.\n\n📝 *Step 1/2:* Send the *Job Description*\n_(Paste text or upload PDF/DOCX)_\n\nCommands: /cancel · /help`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  safeSend(msg.chat.id, `📖 *Resume Analyzer Pro — Help*\n\n1️⃣  /start — New analysis\n2️⃣  Send JD (text / PDF / DOCX)\n3️⃣  Send Resume (text / PDF / DOCX)\n4️⃣  Get ATS score + recruiter feedback\n5️⃣  Get optimized resume as PDF & DOCX\n\n🔄  /cancel — Reset\n❓  /help — This message`, { parse_mode: 'Markdown' });
});

bot.onText(/\/cancel/, (msg) => { resetSession(msg.chat.id); bot.sendMessage(msg.chat.id, '🔄 Session reset. Send /start for a new analysis.'); });

bot.on('document', async (msg) => {
  const chatId = msg.chat.id; const session = getSession(chatId);
  if (session.step !== 'waiting_jd' && session.step !== 'waiting_resume') return bot.sendMessage(chatId, '⚠️ Send /start first.');
  try {
    await bot.sendMessage(chatId, '📥 Processing file...');
    const buffer = await downloadFile(msg.document.file_id);
    const mimeType = getMimeType(msg.document.file_name);
    const text = await extractText(buffer, mimeType);
    if (!text || text.length < 20) return bot.sendMessage(chatId, '❌ Could not extract text. Try pasting directly.');
    await handleInput(chatId, session, text);
  } catch (err) { console.error('File error:', err.message); bot.sendMessage(chatId, '❌ Error processing file. Try pasting text directly.'); }
});

bot.on('photo', (msg) => { bot.sendMessage(msg.chat.id, '📸 Images aren\'t supported yet.\n\nPlease send as: PDF, DOCX, or paste text.'); });

bot.on('text', async (msg) => {
  if (msg.text.startsWith('/')) return;
  const chatId = msg.chat.id; const session = getSession(chatId);
  if (session.step === 'waiting_jd' || session.step === 'waiting_resume') {
    if (msg.text.length < 20) return bot.sendMessage(chatId, `⚠️ Too short. Please send the full ${session.step === 'waiting_jd' ? 'Job Description' : 'Resume'}.`);
    await handleInput(chatId, session, msg.text);
  } else { bot.sendMessage(chatId, '👋 Send /start to begin.'); }
});

async function handleInput(chatId, session, text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (session.step === 'waiting_jd') {
    session.jdText = text; session.step = 'waiting_resume';
    safeSend(chatId, `✅ *JD received* (${wordCount} words)\n\n📄 *Step 2/2:* Now send your *Resume*\n_(Paste text or upload PDF/DOCX)_`, { parse_mode: 'Markdown' });
  } else if (session.step === 'waiting_resume') {
    if (!checkCooldown(chatId)) return safeSend(chatId, '⏳ Please wait 30 seconds before running another analysis.');
    session.resumeText = text; setCooldown(chatId);
    await processAnalysis(chatId, session);
  }
}

// ─── Inline Buttons ─────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id; const session = getSession(chatId);
  await bot.answerCallbackQuery(query.id);
  try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }); } catch {}
  if (query.data === 'optimize_yes' && session.step === 'waiting_optimize') { await processOptimization(chatId, session); }
  else if (query.data === 'optimize_no') { bot.sendMessage(chatId, '👍 Use the suggestions above to improve manually.\n\n🔄 /start for new analysis.'); session.step = 'idle'; }
  else if (query.data === 'new_analysis') { resetSession(chatId); const s = getSession(chatId); s.step = 'waiting_jd'; safeSend(chatId, '📝 Send the *Job Description*', { parse_mode: 'Markdown' }); }
});

// ─── Analysis Pipeline (Zero AI) ────────────────────────────
async function processAnalysis(chatId, session) {
  session.step = 'processing';
  const loadMsg = await bot.sendMessage(chatId, '🔍 Scanning resume like an ATS...');
  await sleep(800);
  bot.editMessageText('📊 Calculating match score...', { chat_id: chatId, message_id: loadMsg.message_id }).catch(() => {});

  try {
    const scoreResult = calculateATSScore(session.jdText, session.resumeText);
    const insights = generateRuleBasedFeedback(scoreResult);
    session.scoreResult = scoreResult;

    await sleep(500);
    bot.editMessageText('🤖 Thinking like a senior recruiter...', { chat_id: chatId, message_id: loadMsg.message_id }).catch(() => {});

    // Send score report
    const report = formatScoreReport(scoreResult, insights);
    await sendLongMessage(chatId, report, { parse_mode: 'Markdown' });

    // Smart feedback (replaces AI)
    const smartFeedback = generateSmartFeedback(scoreResult, session.jdText);
    await sendLongMessage(chatId, smartFeedback, { parse_mode: 'MarkdownV2' });

    bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});

    // Offer optimization
    session.step = 'waiting_optimize';
    await bot.sendMessage(chatId,
      '✨ *Want a professionally optimized resume?*\n\n' +
      'I\'ll improve it with missing keywords, stronger bullets, and send you PDF + DOCX files.',
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[ { text: '✅ Yes, optimize!', callback_data: 'optimize_yes' }, { text: '❌ No thanks', callback_data: 'optimize_no' } ]] } }
    );
  } catch (err) { console.error('Analysis error:', err); bot.sendMessage(chatId, '❌ Error during analysis. Try /start again.'); session.step = 'idle'; }
}

// ─── Optimization Pipeline (Zero AI) ────────────────────────
async function processOptimization(chatId, session) {
  session.step = 'processing';
  const loadMsg = await bot.sendMessage(chatId, '🔍 Optimizing resume with smart rules...');
  await sleep(1000);
  bot.editMessageText('✍️ Strengthening bullets and injecting keywords...', { chat_id: chatId, message_id: loadMsg.message_id }).catch(() => {});

  try {
    const missing = session.scoreResult?.breakdown?.keywords?.missing || [];
    const improved = improveResumeWithoutAI(session.resumeText, missing);

    await safeSend(chatId, `╔══════════════════════════════════╗\n   ✨  *OPTIMIZED RESUME*\n╚══════════════════════════════════╝`, { parse_mode: 'Markdown' });
    await sendLongMessage(chatId, improved);

    bot.editMessageText('📄 Generating PDF and DOCX files...', { chat_id: chatId, message_id: loadMsg.message_id }).catch(() => {});
    const [docxPath, pdfPath] = await Promise.all([ createDOCXResume(improved, chatId), createPDFResume(improved, chatId) ]);

    await bot.sendDocument(chatId, pdfPath, { caption: '📕 Your Optimized Resume (PDF)' }, { filename: 'Optimized_Resume.pdf', contentType: 'application/pdf' });
    await bot.sendDocument(chatId, docxPath, { caption: '📘 Your Optimized Resume (DOCX)' }, { filename: 'Optimized_Resume.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    try { fs.unlinkSync(pdfPath); fs.unlinkSync(docxPath); } catch {}

    await safeSend(chatId, `📈 *Improvement Summary:*\n  • Missing keywords injected into Skills section\n  • Weak bullets strengthened with action verbs\n  • Resume improved using smart rule-based optimization\n\n💡 Review and customize before submitting.`, { parse_mode: 'Markdown' });
    bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, '✅ *Done!* Your optimized resume has been sent.\n\n📊 Want to check your improved score?', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[ { text: '🔄 New Analysis', callback_data: 'new_analysis' } ]] } });
  } catch (err) { console.error('Optimization error:', err); bot.sendMessage(chatId, '❌ Error generating files. Try /start again.'); }
  session.step = 'idle';
}

// ═══════════════════════════════════════════════════════════════
//  STARTUP + HEALTH CHECK SERVER (for Render free tier)
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'Resume Analyzer Pro v5.0', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

console.log('═══════════════════════════════════════');
console.log('  🤖 Resume Analyzer Pro v5.0');
console.log('  100% Free — Zero AI Dependencies');
console.log('  Send /start on Telegram to begin');
console.log('═══════════════════════════════════════');
