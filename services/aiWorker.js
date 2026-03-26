/**
 * ═══════════════════════════════════════════════════════════════
 *  AI WORKER SERVICE — Sequential Queue + Safe Key Rotation
 * ═══════════════════════════════════════════════════════════════
 *
 * Handles all Gemini API communication with:
 *  - Sequential queue (one request at a time, 5s gap)
 *  - Safe key rotation (each key tried ONCE, 5s delay between)
 *  - Token-light prompts (keywords + scores only, not full text)
 *  - Graceful fallback (returns null if all keys fail)
 *  - Non-blocking design (callers provide callbacks)
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { detectRole } = require('./analyzer');

// ═══════════════════════════════════════════════════════════════
//  API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const apiKeys = [];
if (process.env.GEMINI_API_KEY) apiKeys.push(process.env.GEMINI_API_KEY);
if (process.env.GEMINI_API_KEY_FALLBACK) apiKeys.push(process.env.GEMINI_API_KEY_FALLBACK);
if (process.env.GEMINI_API_KEY_FALLBACK_2) apiKeys.push(process.env.GEMINI_API_KEY_FALLBACK_2);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
//  SAFE AI CALL — Try each key ONCE, 5s delay between switches
// ═══════════════════════════════════════════════════════════════

/**
 * Attempts to call Gemini API with safe key rotation.
 *  - Each API key is tried exactly ONCE
 *  - 5-second delay before switching to the next key
 *  - Returns null (not throws) if ALL keys fail
 *
 * @param {string} prompt - The prompt to send
 * @param {function} onStatus - Optional status callback for UX updates
 * @returns {string|null} - AI response text, or null on total failure
 */
async function safeCallAI(prompt, onStatus) {
  if (apiKeys.length === 0) {
    console.error('[aiWorker] No API keys configured');
    return null;
  }

  for (let i = 0; i < apiKeys.length; i++) {
    const keyNum = i + 1;
    try {
      const genAI = new GoogleGenerativeAI(apiKeys[i]);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const msg = err.message || '';
      const isRate = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('Too Many');

      if (isRate) {
        console.log(`[aiWorker] Key #${keyNum} rate-limited.`);
        if (i < apiKeys.length - 1) {
          if (onStatus) onStatus(`⏳ API key #${keyNum} rate-limited. Trying next key in 5s...`);
          await sleep(5000);
        } else {
          console.log('[aiWorker] All keys exhausted. Giving up.');
          if (onStatus) onStatus(`⚠️ All API keys are rate-limited. Using rule-based analysis.`);
        }
      } else {
        console.error(`[aiWorker] Key #${keyNum} non-rate error:`, msg);
        if (i < apiKeys.length - 1) {
          await sleep(2000);
        }
      }
    }
  }

  return null; // All keys failed
}

// ═══════════════════════════════════════════════════════════════
//  SEQUENTIAL QUEUE — One request at a time, 5s gap
// ═══════════════════════════════════════════════════════════════

const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      console.error('[aiWorker] Queue task error:', err.message);
      task.resolve(null);
    }

    // 5-second gap between requests
    if (queue.length > 0) {
      await sleep(5000);
    }
  }

  processing = false;
}

function enqueue(fn) {
  return new Promise((resolve) => {
    queue.push({ fn, resolve });
    processQueue();
  });
}

// ═══════════════════════════════════════════════════════════════
//  TOKEN-LIGHT AI FEEDBACK PROMPT
// ═══════════════════════════════════════════════════════════════

/**
 * Queue an AI feedback request. Uses token-light prompt with only
 * extracted keywords, scores, and role — NOT the full resume/JD text.
 *
 * @param {object} scoreData - { role, finalScore, matched, missing, expScore, projScore, eduScore, fmtScore }
 * @param {function} onStatus - Optional status callback
 * @returns {Promise<string|null>} - AI response or null
 */
function queueAIFeedback(scoreData, onStatus) {
  return enqueue(async () => {
    const prompt = `You are a Senior Technical Recruiter hiring for a ${scoreData.role} role. You are highly critical, direct, and look for top-tier talent.

Here is a candidate's ATS analysis summary:

ATS Score: ${scoreData.finalScore}/10
Detected Role: ${scoreData.role}
Matched Keywords: ${scoreData.matched.join(', ') || 'none'}
Missing Keywords: ${scoreData.missing.join(', ') || 'none'}
Experience Score: ${scoreData.expScore}%
Projects Score: ${scoreData.projScore}%
Education Score: ${scoreData.eduScore}%
Format Score: ${scoreData.fmtScore}%

Provide realistic, non-generic feedback. Format EXACTLY like this (use bullet points):

1. 🚫 Critical Rejection Reasons (Why you'd pass on this candidate)
2. 🎯 Exact Missing Skills / Gaps (Specific tech/tools lacking)
3. 🔥 High-Impact Fixes (What MUST be added to get an interview)
4. ✍️ Suggested Bullet Rewrites (Write 2 example FAANG-level bullets the candidate should use, incorporating missing keywords with metrics and action verbs)

Be concise, structured, and extremely direct. No fluff. Max 300 words.`;

    return await safeCallAI(prompt, onStatus);
  });
}

// ═══════════════════════════════════════════════════════════════
//  RESUME REWRITE PROMPT (needs full text — still optimized)
// ═══════════════════════════════════════════════════════════════

/**
 * Queue a resume rewrite request. This one needs the full resume text
 * but we still trim JD to keywords-only to save tokens.
 *
 * @param {string} resumeText - Full resume text
 * @param {string} jdText - Full JD text
 * @param {string[]} missingKeywords - Missing keywords to inject
 * @param {function} onStatus - Optional status callback
 * @returns {Promise<string|null>} - Rewritten resume text or null
 */
function queueResumeRewrite(resumeText, jdText, missingKeywords, onStatus) {
  return enqueue(async () => {
    const role = detectRole(jdText);
    const prompt = `You are an expert Executive Resume Writer and Senior ATS Optimization Specialist for a top-tier tech company. Rewrite this resume for a ${role} position to guarantee an interview.

Rules:
- Add these missing keywords naturally: ${missingKeywords.slice(0, 15).join(', ')}
- Transform every bullet point to be FAANG-level quality
- Add quantified achievements (use realistic %, $, numbers where appropriate but plausible)
- Use extremely strong action verbs (Architected, Spearheaded, Engineered)
- Align STRICTLY with the Job Description requirements
- Keep ATS-friendly format, professional tone, 1-2 pages
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

Job Description Keywords: ${missingKeywords.slice(0, 20).join(', ')}

Original Resume:
${resumeText.substring(0, 3000)}`;

    return await safeCallAI(prompt, onStatus);
  });
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  queueAIFeedback,
  queueResumeRewrite,
};
