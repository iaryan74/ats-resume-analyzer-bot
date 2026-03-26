/**
 * ═══════════════════════════════════════════════════════════════
 *   ATS RESUME ANALYZER PRO v3.0 — Telegram Bot (Single File)
 * ═══════════════════════════════════════════════════════════════
 *
 * Professional-grade ATS resume analyzer with:
 *  - Rule-based weighted scoring (no AI)
 *  - AI-powered suggestions (1 call)
 *  - AI-powered resume optimization (1 call, on demand)
 *  - PDF + DOCX export of optimized resume
 *  - Inline keyboard buttons
 *  - Clean modular architecture
 *
 * Sections:
 *  1. Configuration & Dependencies
 *  2. Keyword Database
 *  3. Text Extraction
 *  4. Keyword Extraction
 *  5. ATS Scoring Engine
 *  6. Rule-Based Insights
 *  7. AI Integration (max 2 calls)
 *  8. Resume File Generation (DOCX + PDF)
 *  9. Output Formatting
 * 10. Telegram Bot & Conversation Flow
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
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
const PDFDocument = require('pdfkit');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });
const sessions = new Map();
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

/**
 * Extract text from a file buffer based on MIME type.
 */
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

/**
 * Normalize and clean extracted text.
 */
function cleanText(text) {
  return text
    .replace(/[\r\n]+/g, '\n')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ═══════════════════════════════════════════════════════════════
//  4. KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Tokenize text into words and n-grams.
 */
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

/**
 * Extract recognized keywords from a Job Description.
 * Only returns terms found in our keyword database — no random words.
 */
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

/**
 * Detect a named section in resume text.
 * Handles ALL-CAPS, Title Case, markdown, underlined, colon-ended headings.
 */
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
//  5. ATS SCORING ENGINE (Rule-Based — No AI)
// ═══════════════════════════════════════════════════════════════

/**
 * A. Keyword Match (40 weight) — Match JD keywords against resume.
 */
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

/**
 * B. Experience Relevance (20 weight).
 */
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

/**
 * C. Project Relevance (15 weight).
 */
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

/**
 * D. Education & Certifications (10 weight).
 */
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

/**
 * E. ATS Format & Readability (15 weight).
 */
function scoreFormat(resumeText) {
  let score = 0;
  const lines = resumeText.split('\n');
  const details = [];

  // Section headings (25 pts)
  const headingKws = ['experience', 'education', 'skills', 'projects', 'summary', 'certification', 'achievements'];
  let headings = 0;
  for (const sk of headingKws) {
    if (lines.some((l) => l.trim().toLowerCase().includes(sk) && l.trim().length < 50)) headings++;
  }
  score += Math.min(headings * 5, 25);
  details.push(headings >= 4 ? '✓ Good sections' : headings >= 2 ? '⚠ Add more sections' : '✗ Missing section headings');

  // Bullet points (20 pts)
  const bullets = lines.filter((l) => /^\s*[-*•▪▸►·]\s/.test(l) || /^\s*\d+[.)]\s/.test(l)).length;
  score += Math.min(bullets * 2.5, 20);
  details.push(bullets >= 8 ? '✓ Good bullets' : bullets >= 3 ? '⚠ Add more bullets' : '✗ Needs bullet points');

  // Length (15 pts)
  const words = resumeText.split(/\s+/).filter(Boolean).length;
  if (words >= 250 && words <= 1000) { score += 15; details.push(`✓ Good length (${words}w)`); }
  else if (words >= 150 && words <= 1500) { score += 10; details.push(`⚠ OK length (${words}w)`); }
  else { score += 3; details.push(`✗ ${words < 150 ? 'Too short' : 'Too long'} (${words}w)`); }

  // Contact info (20 pts)
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(resumeText);
  const hasPhone = /(\+?\d[\d\s()-]{7,})/.test(resumeText);
  const hasLinkedin = /linkedin/i.test(resumeText);
  if (hasEmail) score += 8;
  if (hasPhone) score += 7;
  if (hasLinkedin) score += 5;
  const contact = [hasEmail && 'email', hasPhone && 'phone', hasLinkedin && 'LinkedIn'].filter(Boolean);
  details.push(contact.length >= 2 ? `✓ Contact: ${contact.join(', ')}` : `⚠ Missing contact info`);

  // ATS-friendly (20 pts)
  const hasTable = /\|.*\|.*\|/.test(resumeText);
  score += hasTable ? 10 : 20;
  if (hasTable) details.push('✗ Avoid tables');

  return { score: Math.min(score, 100), details };
}

/**
 * MAIN SCORER — Run full ATS scoring pipeline.
 */
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
//  6. RULE-BASED INSIGHTS (No AI)
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
  if (b.keywords.missing && b.keywords.missing.length > 3) {
    keyIssues.push(`${b.keywords.missing.length} JD keywords missing from resume`);
  }
  if (b.experience.score < 50) keyIssues.push('Experience doesn\'t match job requirements');
  if (b.projects.score < 50) keyIssues.push('Projects don\'t demonstrate JD-relevant skills');
  if (b.format.score < 60) keyIssues.push('Format may not pass ATS parsing');

  let atsPassProbability;
  if (finalScore >= 7) atsPassProbability = '🟢 HIGH';
  else if (finalScore >= 5) atsPassProbability = '🟡 MEDIUM';
  else atsPassProbability = '🔴 LOW';

  return { matchedSkills, missingSkills, topMissingKeywords, keywordDensity, weakSections, keyIssues, atsPassProbability };
}

// ═══════════════════════════════════════════════════════════════
//  7. AI INTEGRATION (Max 2 Calls)
// ═══════════════════════════════════════════════════════════════

let genAI = null, aiModel = null;

function initAI() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    aiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseRetryDelay(msg) {
  if (!msg) return null;
  const m = msg.match(/retryDelay["\s:]+(\d+\.?\d*)/i) || msg.match(/retry\s+in\s+(\d+\.?\d*)/i);
  return m ? Math.ceil(parseFloat(m[1])) * 1000 + 2000 : null;
}

async function callAI(prompt, onRetry) {
  initAI();
  const MAX = 4, DELAYS = [15000, 30000, 45000, 60000];
  for (let i = 1; i <= MAX; i++) {
    try {
      const result = await aiModel.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const msg = err.message || '';
      const isRate = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('Too Many');
      if (isRate && i < MAX) {
        const delay = parseRetryDelay(msg) || DELAYS[i - 1];
        const sec = Math.round(delay / 1000);
        console.log(`Rate limited (${i}/${MAX}). Waiting ${sec}s...`);
        if (onRetry) onRetry(`⏳ AI rate-limited. Retrying in ${sec}s... (${i}/${MAX})`);
        await sleep(delay);
      } else throw err;
    }
  }
}

/**
 * AI CALL 1: Generate refined feedback.
 */
async function generateAIFeedback(resumeText, jdText, scoreResult, onRetry) {
  const prompt = `You are an expert ATS resume reviewer. Analyze this resume against the job description.

Job Description:
${jdText.substring(0, 1500)}

Resume:
${resumeText.substring(0, 2000)}

ATS Score: ${scoreResult.finalScore}/10
Matched: ${scoreResult.breakdown.keywords.matched.slice(0, 10).join(', ')}
Missing: ${scoreResult.breakdown.keywords.missing.slice(0, 10).join(', ')}

Provide:
1. Top 3 strengths
2. Top 3 missing skills/gaps
3. 3-5 actionable improvements

Be concise, structured, use bullet points.`;

  try {
    return await callAI(prompt, onRetry);
  } catch (e) {
    console.error('AI Call 1 failed:', e.message);
    return 'AI analysis unavailable. Review the rule-based insights above.';
  }
}

/**
 * AI CALL 2: Generate improved resume content.
 */
async function improveResumeContent(resumeText, jdText, missingKeywords, onRetry) {
  const prompt = `You are an expert resume writer and ATS optimization specialist.

Rewrite this resume to match the job description. Rules:
- Add these missing keywords naturally: ${missingKeywords.slice(0, 15).join(', ')}
- Use strong action verbs (achieved, implemented, led, developed)
- Make bullet points quantified and impactful
- Use clear section headings: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION
- Keep it professional, 1-2 pages
- Do NOT fabricate experience

FORMAT YOUR OUTPUT EXACTLY LIKE THIS:
NAME: [candidate name]
SUMMARY: [2-3 line professional summary]
SKILLS: [comma separated skills]
EXPERIENCE:
[Job Title] | [Company] | [Dates]
- [bullet point]
- [bullet point]
PROJECTS:
[Project Name]
- [bullet point]
EDUCATION:
[Degree] | [University] | [Year]

Job Description:
${jdText.substring(0, 1000)}

Original Resume:
${resumeText.substring(0, 3000)}`;

  try {
    return await callAI(prompt, onRetry);
  } catch (e) {
    console.error('AI Call 2 failed:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  8. RESUME FILE GENERATION (DOCX + PDF)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse AI-generated resume text into structured sections.
 */
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

/**
 * Generate DOCX file from resume sections. Returns file path.
 */
async function createDOCXResume(resumeTextContent, chatId) {
  const s = parseResumeText(resumeTextContent);
  const children = [];

  // Helper: add heading
  const addHeading = (text) => {
    children.push(new Paragraph({
      children: [new TextRun({ text, bold: true, size: 28, font: 'Calibri', color: '1F4E79' })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
      border: { bottom: { color: '1F4E79', space: 1, style: BorderStyle.SINGLE, size: 6 } },
    }));
  };

  // Name
  children.push(new Paragraph({
    children: [new TextRun({ text: s.name, bold: true, size: 36, font: 'Calibri', color: '1F4E79' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  // Summary
  if (s.summary) {
    addHeading('PROFESSIONAL SUMMARY');
    children.push(new Paragraph({
      children: [new TextRun({ text: s.summary, size: 22, font: 'Calibri' })],
      spacing: { after: 150 },
    }));
  }

  // Skills
  if (s.skills) {
    addHeading('SKILLS');
    children.push(new Paragraph({
      children: [new TextRun({ text: s.skills, size: 22, font: 'Calibri' })],
      spacing: { after: 150 },
    }));
  }

  // Experience
  if (s.experience.length > 0) {
    addHeading('EXPERIENCE');
    for (const line of s.experience) {
      const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
      children.push(new Paragraph({
        children: [new TextRun({
          text: isBullet ? line.replace(/^[-•*]\s*/, '') : line,
          bold: !isBullet,
          size: 22,
          font: 'Calibri',
        })],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: isBullet ? 50 : 100 },
      }));
    }
  }

  // Projects
  if (s.projects.length > 0) {
    addHeading('PROJECTS');
    for (const line of s.projects) {
      const isBullet = line.startsWith('-') || line.startsWith('•') || line.startsWith('*');
      children.push(new Paragraph({
        children: [new TextRun({
          text: isBullet ? line.replace(/^[-•*]\s*/, '') : line,
          bold: !isBullet,
          size: 22,
          font: 'Calibri',
        })],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: isBullet ? 50 : 100 },
      }));
    }
  }

  // Education
  if (s.education.length > 0) {
    addHeading('EDUCATION');
    for (const line of s.education) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22, font: 'Calibri' })],
        spacing: { after: 80 },
      }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const filePath = path.join(TMP_DIR, `resume_${chatId}.docx`);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Generate PDF file from resume sections. Returns file path.
 */
function createPDFResume(resumeTextContent, chatId) {
  return new Promise((resolve, reject) => {
    const s = parseResumeText(resumeTextContent);
    const filePath = path.join(TMP_DIR, `resume_${chatId}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const PRIMARY = '#1F4E79';
    const TEXT = '#333333';

    // Name
    doc.font('Helvetica-Bold').fontSize(24).fillColor(PRIMARY)
      .text(s.name, { align: 'center' });
    doc.moveDown(0.5);

    // Section helper
    const addSection = (title) => {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(PRIMARY).text(title);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(PRIMARY).lineWidth(1).stroke();
      doc.moveDown(0.2);
    };

    // Summary
    if (s.summary) {
      addSection('PROFESSIONAL SUMMARY');
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(s.summary, { lineGap: 3 });
    }

    // Skills
    if (s.skills) {
      addSection('SKILLS');
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(s.skills, { lineGap: 3 });
    }

    // Experience
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

    // Projects
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

    // Education
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
//  9. OUTPUT FORMATTING
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

async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch {
    const plain = text.replace(/[_*`\[\]\\]/g, '');
    return await bot.sendMessage(chatId, plain);
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

  return msg;
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

// ═══════════════════════════════════════════════════════════════
// 10. TELEGRAM BOT & CONVERSATION FLOW
// ═══════════════════════════════════════════════════════════════

function getSession(chatId) {
  if (!sessions.has(chatId)) sessions.set(chatId, { step: 'idle' });
  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.set(chatId, { step: 'idle' });
}

function getMimeType(fileName) {
  if (!fileName) return 'text/plain';
  const ext = fileName.split('.').pop().toLowerCase();
  return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain' }[ext] || 'text/plain';
}

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
  return new Promise((resolve, reject) => {
    (url.startsWith('https') ? https : http).get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── /start ─────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  const session = getSession(chatId);
  session.step = 'waiting_jd';

  safeSend(chatId,
    `🤖 *Resume Analyzer Pro*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Professional ATS resume analysis with AI-powered insights.\n\n` +
    `📝 *Step 1/2:* Send the *Job Description*\n` +
    `_(Paste text or upload PDF/DOCX)_\n\n` +
    `Commands: /cancel · /help`,
    { parse_mode: 'Markdown' }
  );
});

// ─── /help ──────────────────────────────────────────────────

bot.onText(/\/help/, (msg) => {
  safeSend(msg.chat.id,
    `📖 *Resume Analyzer Pro — Help*\n\n` +
    `1️⃣  /start — New analysis\n` +
    `2️⃣  Send JD (text / PDF / DOCX)\n` +
    `3️⃣  Send Resume (text / PDF / DOCX)\n` +
    `4️⃣  Get ATS score + AI suggestions\n` +
    `5️⃣  Get optimized resume as PDF & DOCX\n\n` +
    `🔄  /cancel — Reset session\n` +
    `❓  /help — This message`,
    { parse_mode: 'Markdown' }
  );
});

// ─── /cancel ────────────────────────────────────────────────

bot.onText(/\/cancel/, (msg) => {
  resetSession(msg.chat.id);
  bot.sendMessage(msg.chat.id, '🔄 Session reset. Send /start for a new analysis.');
});

// ─── Document uploads ───────────────────────────────────────

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (session.step !== 'waiting_jd' && session.step !== 'waiting_resume') {
    return bot.sendMessage(chatId, '⚠️ Send /start first.');
  }

  try {
    await bot.sendMessage(chatId, '📥 Processing file...');
    const buffer = await downloadFile(msg.document.file_id);
    const mimeType = getMimeType(msg.document.file_name);
    const text = await extractText(buffer, mimeType);

    if (!text || text.length < 20) {
      return bot.sendMessage(chatId, '❌ Could not extract text. Try pasting directly.');
    }

    await handleInput(chatId, session, text);
  } catch (err) {
    console.error('File error:', err.message);
    bot.sendMessage(chatId, '❌ Error processing file. Try pasting text directly.');
  }
});

// ─── Photo uploads ──────────────────────────────────────────

bot.on('photo', (msg) => {
  bot.sendMessage(msg.chat.id,
    '📸 Images aren\'t supported yet.\n\nPlease send as: PDF, DOCX, or paste text.');
});

// ─── Text messages ──────────────────────────────────────────

bot.on('text', async (msg) => {
  if (msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (session.step === 'waiting_jd' || session.step === 'waiting_resume') {
    if (msg.text.length < 20) {
      return bot.sendMessage(chatId, `⚠️ Too short. Please send the full ${session.step === 'waiting_jd' ? 'Job Description' : 'Resume'}.`);
    }
    await handleInput(chatId, session, msg.text);
  } else {
    bot.sendMessage(chatId, '👋 Send /start to begin.');
  }
});

// ─── Common input handler ───────────────────────────────────

async function handleInput(chatId, session, text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (session.step === 'waiting_jd') {
    session.jdText = text;
    session.step = 'waiting_resume';
    safeSend(chatId,
      `✅ *JD received* (${wordCount} words)\n\n` +
      `📄 *Step 2/2:* Now send your *Resume*\n` +
      `_(Paste text or upload PDF/DOCX)_`,
      { parse_mode: 'Markdown' }
    );
  } else if (session.step === 'waiting_resume') {
    session.resumeText = text;
    await processAnalysis(chatId, session);
  }
}

// ─── Inline button handler ──────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const session = getSession(chatId);
  await bot.answerCallbackQuery(query.id);

  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId, message_id: query.message.message_id,
    });
  } catch { /* ignore */ }

  if (query.data === 'optimize_yes' && session.step === 'waiting_optimize') {
    await processOptimization(chatId, session);
  } else if (query.data === 'optimize_no') {
    bot.sendMessage(chatId, '👍 Use the suggestions above to improve manually.\n\n🔄 /start for new analysis.');
    session.step = 'idle';
  } else if (query.data === 'new_analysis') {
    resetSession(chatId);
    const s = getSession(chatId);
    s.step = 'waiting_jd';
    safeSend(chatId, '📝 Send the *Job Description*', { parse_mode: 'Markdown' });
  }
});

// ─── Analysis Pipeline ─────────────────────────────────────

async function processAnalysis(chatId, session) {
  session.step = 'processing';
  await bot.sendMessage(chatId, '⏳ Analyzing your resume...');

  try {
    // Rule-based scoring (instant)
    const scoreResult = calculateATSScore(session.jdText, session.resumeText);
    const insights = generateRuleBasedFeedback(scoreResult);
    session.scoreResult = scoreResult;
    session.insights = insights;

    // Send score report immediately
    const report = formatScoreReport(scoreResult, insights);
    await sendLongMessage(chatId, report, { parse_mode: 'Markdown' });

    // AI call 1: suggestions
    await bot.sendMessage(chatId, '🤖 Getting AI-powered suggestions...');
    const aiText = await generateAIFeedback(session.resumeText, session.jdText, scoreResult, (s) => bot.sendMessage(chatId, s));

    let aiMsg = `╔══════════════════════════════════╗\n`;
    aiMsg += `   🤖  *AI SUGGESTIONS*\n`;
    aiMsg += `╚══════════════════════════════════╝\n\n`;
    aiMsg += escapeMd(aiText);
    await sendLongMessage(chatId, aiMsg, { parse_mode: 'Markdown' });

    // Ask about optimization
    session.step = 'waiting_optimize';
    await bot.sendMessage(chatId,
      '✨ *Want a professionally optimized resume?*\n\n' +
      'I\'ll rewrite it with missing keywords, stronger bullets, and send you PDF + DOCX files.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Yes, optimize!', callback_data: 'optimize_yes' },
            { text: '❌ No thanks', callback_data: 'optimize_no' },
          ]],
        },
      }
    );
  } catch (err) {
    console.error('Analysis error:', err);
    bot.sendMessage(chatId, '❌ Error during analysis. Try /start again.');
    session.step = 'idle';
  }
}

// ─── Optimization + File Generation Pipeline ────────────────

async function processOptimization(chatId, session) {
  session.step = 'processing';
  await bot.sendMessage(chatId, '⏳ Generating optimized resume + PDF + DOCX...\nThis may take up to a minute.');

  try {
    const missing = session.scoreResult?.breakdown?.keywords?.missing || [];

    // AI call 2: improve resume
    const improved = await improveResumeContent(session.resumeText, session.jdText, missing, (s) => bot.sendMessage(chatId, s));

    if (!improved) {
      bot.sendMessage(chatId, '❌ Resume optimization failed. Try /start again.');
      session.step = 'idle';
      return;
    }

    // Send text preview
    await safeSend(chatId,
      `╔══════════════════════════════════╗\n` +
      `   ✨  *OPTIMIZED RESUME*\n` +
      `╚══════════════════════════════════╝`, { parse_mode: 'Markdown' }
    );
    await sendLongMessage(chatId, improved);

    // Generate files
    await bot.sendMessage(chatId, '📄 Generating PDF and DOCX files...');

    const [docxPath, pdfPath] = await Promise.all([
      createDOCXResume(improved, chatId),
      createPDFResume(improved, chatId),
    ]);

    // Send files
    await bot.sendDocument(chatId, pdfPath, {
      caption: '📕 Your ATS-Optimized Resume (PDF)',
    }, { filename: 'Optimized_Resume.pdf', contentType: 'application/pdf' });

    await bot.sendDocument(chatId, docxPath, {
      caption: '📘 Your ATS-Optimized Resume (DOCX)',
    }, { filename: 'Optimized_Resume.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    // Cleanup temp files
    try { fs.unlinkSync(pdfPath); fs.unlinkSync(docxPath); } catch { /* ignore */ }

    // Done
    await bot.sendMessage(chatId,
      '✅ *Done!* Your optimized resume has been sent as PDF and DOCX.\n\n' +
      '💡 Review and customize before submitting.\n' +
      '📊 Want to check your improved score?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 New Analysis', callback_data: 'new_analysis' },
          ]],
        },
      }
    );
  } catch (err) {
    console.error('Optimization error:', err);
    bot.sendMessage(chatId, '❌ Error generating files. Try /start again.');
  }

  session.step = 'idle';
}

// ═══════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════');
console.log('  🤖 Resume Analyzer Pro v3.0');
console.log('  Send /start on Telegram to begin');
console.log('═══════════════════════════════════════');
