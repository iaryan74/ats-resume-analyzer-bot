/**
 * AI integration module — uses Google Gemini (max 2 calls).
 *
 * Call 1: Refine rule-based analysis with AI insights.
 * Call 2: (Optional) Rewrite resume to be ATS-optimized.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

const MAX_RETRIES = 4;
const DEFAULT_DELAYS = [15000, 30000, 45000, 60000]; // 15s, 30s, 45s, 60s

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse retry delay from Gemini error message.
 * Looks for patterns like "retryDelay":"38s" or "retry in 14.6s"
 */
function parseRetryDelay(errorMessage) {
  if (!errorMessage) return null;
  // Match "retryDelay":"XXs" pattern
  const match = errorMessage.match(/retryDelay["\s:]+(\d+\.?\d*)/i);
  if (match) {
    return Math.ceil(parseFloat(match[1])) * 1000 + 2000; // add 2s buffer
  }
  // Match "retry in XX" pattern
  const match2 = errorMessage.match(/retry\s+in\s+(\d+\.?\d*)/i);
  if (match2) {
    return Math.ceil(parseFloat(match2[1])) * 1000 + 2000;
  }
  return null;
}

/**
 * Check if an error is a rate-limit error.
 */
function isRateLimitError(error) {
  const msg = error.message || '';
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Too Many Requests')
  );
}

/**
 * Generate content with retry logic for rate-limit errors.
 * @param {string} prompt - The prompt to send
 * @param {Function} [onRetry] - Optional callback called with wait time message
 */
async function generateWithRetry(prompt, onRetry) {
  initAI();
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        // Parse actual delay from error, or use default
        const parsedDelay = parseRetryDelay(error.message);
        const delay = parsedDelay || DEFAULT_DELAYS[attempt - 1];
        const delaySec = Math.round(delay / 1000);
        console.log(`Rate limited (attempt ${attempt}/${MAX_RETRIES}). Waiting ${delaySec}s before retry...`);
        if (onRetry) {
          onRetry(`⏳ AI is rate-limited. Retrying in ${delaySec}s... (attempt ${attempt}/${MAX_RETRIES})`);
        }
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

function initAI() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
}

/**
 * AI Call 1: Refine analysis and generate actionable suggestions.
 *
 * @param {string} resumeText - Resume text
 * @param {string} jdText - Job description text
 * @param {Object} ruleBasedResults - Output from scorer + insights
 * @returns {Promise<string>} AI-refined suggestions
 */
async function refineAnalysis(resumeText, jdText, ruleBasedResults, onRetry) {
  initAI();

  const prompt = `You are an expert ATS resume reviewer. Analyze this resume against the job description.

Job Description (summary):
${jdText.substring(0, 1500)}

Resume (summary):
${resumeText.substring(0, 2000)}

Rule-based ATS Score: ${ruleBasedResults.finalScore}/10
Matched Keywords: ${ruleBasedResults.breakdown.keywords.matched.slice(0, 10).join(', ')}
Missing Keywords: ${ruleBasedResults.breakdown.keywords.missing.slice(0, 10).join(', ')}

Provide:
1. Top 3 strengths of this resume for the role
2. Top 3 critical missing skills/gaps
3. 3-5 specific, actionable improvements the candidate should make

Keep it concise, structured, and use bullet points. Do not repeat the score.`;

  try {
    return await generateWithRetry(prompt, onRetry);
  } catch (error) {
    console.error('AI Call 1 failed:', error.message);
    return 'AI analysis unavailable. Please review the rule-based insights above.';
  }
}

/**
 * AI Call 2: Rewrite resume to be ATS-optimized for the JD.
 *
 * @param {string} resumeText - Original resume text
 * @param {string} jdText - Job description text
 * @param {string[]} missingKeywords - Keywords to incorporate
 * @returns {Promise<string>} Optimized resume text
 */
async function optimizeResume(resumeText, jdText, missingKeywords, onRetry) {
  initAI();

  const prompt = `You are an expert resume writer and ATS optimization specialist.

Rewrite the following resume to better match this job description. Rules:
- Add these missing keywords naturally: ${missingKeywords.slice(0, 15).join(', ')}
- Use strong action verbs (achieved, implemented, led, developed, etc.)
- Improve bullet points to be quantified and impactful
- Ensure ATS-friendly format: clear section headings, no tables/graphics
- Keep it professional, concise, and 1-2 pages equivalent
- Maintain the candidate's actual experience — do NOT fabricate

Job Description:
${jdText.substring(0, 1000)}

Original Resume:
${resumeText.substring(0, 3000)}

Output the optimized resume in clean plain text format with clear section headings.`;

  try {
    return await generateWithRetry(prompt, onRetry);
  } catch (error) {
    console.error('AI Call 2 failed:', error.message);
    return 'Resume optimization failed. Please try again later.';
  }
}

module.exports = { refineAnalysis, optimizeResume };
