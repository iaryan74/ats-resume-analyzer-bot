/**
 * ATS Resume Analyzer — Telegram Bot
 *
 * Conversation flow:
 *  1. /start → welcome, ask for JD
 *  2. Receive JD → ask for resume
 *  3. Receive resume → score, analyze, respond
 *  4. Ask "Want optimized resume?" → if yes, AI call 2
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');
const { extractText } = require('./lib/extractor');
const { calculateATSScore } = require('./lib/scorer');
const { generateInsights } = require('./lib/insights');
const { refineAnalysis, optimizeResume } = require('./lib/ai');

// ─── Configuration ──────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// In-memory per-chat conversation state (stateless — lost on restart)
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'idle', jdText: '', resumeText: '' });
  }
  return sessions.get(chatId);
}

// ─── Helper: Download File from Telegram ────────────────────

async function downloadFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Detect MIME type from Telegram file info.
 */
function getMimeType(fileName) {
  if (!fileName) return 'text/plain';
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeMap = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
  };
  return mimeMap[ext] || 'text/plain';
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Escape special Markdown characters in text to prevent Telegram parse errors.
 */
function escapeMd(text) {
  if (!text) return '';
  return text
    .replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Safely send a message — falls back to plain text if Markdown parsing fails.
 */
async function safeSendMessage(chatId, text, opts = {}) {
  try {
    await bot.sendMessage(chatId, text, opts);
  } catch (err) {
    // If Markdown parse failed, retry without parse_mode
    if (opts.parse_mode) {
      const plain = text.replace(/[_*`\[\]]/g, '');
      await bot.sendMessage(chatId, plain);
    } else {
      throw err;
    }
  }
}

// ─── Format Output Message ──────────────────────────────────

function formatResults(scoreResult, insights, aiSuggestions) {
  const b = scoreResult.breakdown;

  let msg = `📊 *ATS Resume Analysis Report*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Final Score
  msg += `🎯 *Match Score: ${scoreResult.finalScore}/10*\n`;
  msg += `📈 ATS Pass Probability: ${insights.atsPassProbability}\n\n`;

  // Breakdown
  msg += `📋 *Score Breakdown:*\n`;
  msg += `├─ 🔑 Keywords: ${b.keywords.score}% _(weight: ${b.keywords.weight})_\n`;
  msg += `├─ 💼 Experience: ${b.experience.score}% _(weight: ${b.experience.weight})_\n`;
  msg += `├─ 🛠 Projects: ${b.projects.score}% _(weight: ${b.projects.weight})_\n`;
  msg += `├─ 🎓 Education: ${b.education.score}% _(weight: ${b.education.weight})_\n`;
  msg += `└─ 📄 ATS Format: ${b.format.score}% _(weight: ${b.format.weight})_\n\n`;

  // Keyword Density
  msg += `📊 *Keyword Density:* ${insights.keywordDensity}%\n\n`;

  // Matched Skills
  if (insights.matchedSkills.length > 0) {
    msg += `✅ *Matched Skills:*\n`;
    msg += insights.matchedSkills.map((s) => `  • ${s}`).join('\n') + '\n\n';
  }

  // Missing Skills
  if (insights.missingSkills.length > 0) {
    msg += `❌ *Missing Skills:*\n`;
    msg += insights.missingSkills.map((s) => `  • ${s}`).join('\n') + '\n\n';
  }

  // Top Missing Keywords (bonus)
  if (insights.topMissingKeywords.length > 5) {
    msg += `🔍 *Top Missing Keywords:*\n`;
    msg += insights.topMissingKeywords.map((k) => `  • ${k}`).join('\n') + '\n\n';
  }

  // Weak Sections
  if (insights.weakSections.length > 0) {
    msg += `⚠️ *Weak Sections:*\n`;
    msg += insights.weakSections.map((w) => `  ${w}`).join('\n') + '\n\n';
  }

  // Key Issues
  if (insights.keyIssues.length > 0) {
    msg += `🚨 *Key Issues:*\n`;
    msg += insights.keyIssues.map((i, idx) => `  ${idx + 1}. ${i}`).join('\n') + '\n\n';
  }

  // AI-Refined Suggestions
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🤖 *AI-Powered Suggestions:*\n\n`;
  msg += escapeMd(aiSuggestions) + '\n';

  return msg;
}

// ─── Bot Handlers ───────────────────────────────────────────

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  session.step = 'waiting_jd';
  session.jdText = '';
  session.resumeText = '';

  bot.sendMessage(
    chatId,
    `👋 *Welcome to ATS Resume Analyzer!*\n\n` +
    `I'll analyze your resume against a Job Description and give you:\n` +
    `• ATS Match Score (out of 10)\n` +
    `• Detailed breakdown\n` +
    `• Missing skills & keywords\n` +
    `• AI-powered suggestions\n` +
    `• Optional ATS-optimized resume\n\n` +
    `📝 *Step 1:* Send me the *Job Description*\n` +
    `_(You can paste text or upload a PDF/DOCX file)_`,
    { parse_mode: 'Markdown' }
  );
});

// /help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📖 *How to use ATS Resume Analyzer:*\n\n` +
    `1️⃣ Send /start to begin\n` +
    `2️⃣ Paste or upload your Job Description\n` +
    `3️⃣ Paste or upload your Resume\n` +
    `4️⃣ Get your ATS score & analysis\n` +
    `5️⃣ Optionally get an optimized resume\n\n` +
    `📎 *Supported formats:* PDF, DOCX, TXT, or plain text\n` +
    `🔄 Send /start anytime to restart`,
    { parse_mode: 'Markdown' }
  );
});

// Handle document uploads
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  const doc = msg.document;

  if (session.step !== 'waiting_jd' && session.step !== 'waiting_resume') {
    bot.sendMessage(chatId, '⚠️ Please send /start first to begin the analysis.');
    return;
  }

  try {
    bot.sendMessage(chatId, '📥 Downloading and processing your file...');

    const buffer = await downloadFile(doc.file_id);
    const mimeType = getMimeType(doc.file_name);
    const text = await extractText(buffer, mimeType);

    if (!text || text.length < 20) {
      bot.sendMessage(chatId, '❌ Could not extract enough text from the file. Please try pasting the text directly.');
      return;
    }

    if (session.step === 'waiting_jd') {
      session.jdText = text;
      session.step = 'waiting_resume';
      bot.sendMessage(
        chatId,
        `✅ *Job Description received!* (${text.split(/\s+/).length} words extracted)\n\n` +
        `📄 *Step 2:* Now send me your *Resume*\n` +
        `_(Paste text or upload a PDF/DOCX file)_`,
        { parse_mode: 'Markdown' }
      );
    } else if (session.step === 'waiting_resume') {
      session.resumeText = text;
      await processAnalysis(chatId, session);
    }
  } catch (err) {
    console.error('File processing error:', err);
    bot.sendMessage(chatId, '❌ Error processing your file. Please try pasting the text directly.');
  }
});

// Handle text messages
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands
  if (text.startsWith('/')) return;

  const session = getSession(chatId);

  if (session.step === 'waiting_jd') {
    if (text.length < 20) {
      bot.sendMessage(chatId, '⚠️ That seems too short for a Job Description. Please send more details.');
      return;
    }
    session.jdText = text;
    session.step = 'waiting_resume';
    bot.sendMessage(
      chatId,
      `✅ *Job Description received!* (${text.split(/\s+/).length} words)\n\n` +
      `📄 *Step 2:* Now send me your *Resume*\n` +
      `_(Paste text or upload a PDF/DOCX file)_`,
      { parse_mode: 'Markdown' }
    );
  } else if (session.step === 'waiting_resume') {
    if (text.length < 20) {
      bot.sendMessage(chatId, '⚠️ That seems too short for a Resume. Please send more details.');
      return;
    }
    session.resumeText = text;
    await processAnalysis(chatId, session);
  } else if (session.step === 'waiting_optimize') {
    const lower = text.toLowerCase().trim();
    if (lower === 'yes' || lower === 'y') {
      await processOptimization(chatId, session);
    } else if (lower === 'no' || lower === 'n') {
      bot.sendMessage(
        chatId,
        `👍 No problem! Use the suggestions above to improve your resume manually.\n\n` +
        `🔄 Send /start to analyze another resume.`,
        { parse_mode: 'Markdown' }
      );
      session.step = 'idle';
    } else {
      bot.sendMessage(chatId, '🤔 Please reply with *Yes* or *No*.', { parse_mode: 'Markdown' });
    }
  } else {
    bot.sendMessage(
      chatId,
      `👋 Hi! Send /start to begin analyzing your resume against a Job Description.`
    );
  }
});

// ─── Processing Pipeline ────────────────────────────────────

async function processAnalysis(chatId, session) {
  session.step = 'processing';

  bot.sendMessage(chatId, '⏳ *Analyzing your resume...* This may take a moment.', { parse_mode: 'Markdown' });

  try {
    // Step 1: Rule-based scoring
    const scoreResult = calculateATSScore(session.jdText, session.resumeText);

    // Step 2: Generate rule-based insights
    const insights = generateInsights(scoreResult);

    // Step 3: AI Call 1 — refine analysis
    const aiSuggestions = await refineAnalysis(session.resumeText, session.jdText, scoreResult, (statusMsg) => {
      bot.sendMessage(chatId, statusMsg);
    });

    // Store results for potential optimization
    session.scoreResult = scoreResult;
    session.insights = insights;

    // Format and send results
    const resultMsg = formatResults(scoreResult, insights, aiSuggestions);

    // Telegram messages have a 4096 char limit — split if needed
    if (resultMsg.length > 4000) {
      const mid = resultMsg.lastIndexOf('\n', 3900);
      await safeSendMessage(chatId, resultMsg.substring(0, mid), { parse_mode: 'Markdown' });
      await safeSendMessage(chatId, resultMsg.substring(mid), { parse_mode: 'Markdown' });
    } else {
      await safeSendMessage(chatId, resultMsg, { parse_mode: 'Markdown' });
    }

    // Ask about optimization
    session.step = 'waiting_optimize';
    await bot.sendMessage(
      chatId,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *Want an ATS-optimized version of your resume?*\n\n` +
      `I'll rewrite your resume to:\n` +
      `• Add missing keywords naturally\n` +
      `• Improve bullet points with action verbs\n` +
      `• Make it more ATS-friendly\n\n` +
      `Reply *Yes* or *No*`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Analysis error:', err);
    bot.sendMessage(chatId, '❌ An error occurred during analysis. Please try again with /start');
    session.step = 'idle';
  }
}

async function processOptimization(chatId, session) {
  session.step = 'processing';
  bot.sendMessage(chatId, '⏳ *Generating your optimized resume...* This may take a moment.', { parse_mode: 'Markdown' });

  try {
    const missingKeywords = session.scoreResult?.breakdown?.keywords?.missing || [];
    const optimized = await optimizeResume(session.resumeText, session.jdText, missingKeywords, (statusMsg) => {
      bot.sendMessage(chatId, statusMsg);
    });

    // Send optimized resume
    let optimizedMsg = `✅ *ATS-Optimized Resume:*\n`;
    optimizedMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    optimizedMsg += optimized;

    // Split if too long (Telegram limit)
    const chunks = [];
    let remaining = optimizedMsg;
    while (remaining.length > 0) {
      if (remaining.length <= 4000) {
        chunks.push(remaining);
        break;
      }
      const splitAt = remaining.lastIndexOf('\n', 3900);
      const idx = splitAt > 0 ? splitAt : 3900;
      chunks.push(remaining.substring(0, idx));
      remaining = remaining.substring(idx);
    }

    for (const chunk of chunks) {
      // Send optimized resume as plain text — AI output has unpredictable formatting
      await bot.sendMessage(chatId, chunk);
    }

    await bot.sendMessage(
      chatId,
      `\n💡 *Tip:* Copy the optimized resume above and tailor it further to your style.\n\n` +
      `🔄 Send /start to analyze another resume.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Optimization error:', err);
    bot.sendMessage(chatId, '❌ Resume optimization failed. Please try again with /start');
  }

  session.step = 'idle';
}

// ─── Startup ────────────────────────────────────────────────

console.log('🤖 ATS Resume Analyzer Bot is running...');
console.log('Send /start to your bot on Telegram to begin!');
