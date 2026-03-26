/**
 * ATS Resume Analyzer — Telegram Bot (v2.0 — Optimized)
 *
 * Features:
 *  - Inline keyboard buttons for smoother UX
 *  - Visual progress bars in score output
 *  - /cancel command
 *  - Graceful error handling
 *  - Multi-format resume support
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

// In-memory per-chat state
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'idle', jdText: '', resumeText: '' });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.set(chatId, { step: 'idle', jdText: '', resumeText: '' });
}

// ─── Helpers ────────────────────────────────────────────────

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

function getMimeType(fileName) {
  if (!fileName) return 'text/plain';
  const ext = fileName.split('.').pop().toLowerCase();
  return {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
  }[ext] || 'text/plain';
}

/**
 * Escape Markdown special chars for safe Telegram rendering.
 */
function escapeMd(text) {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Safe send — falls back to plain text if Markdown fails.
 */
async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (err) {
    if (opts.parse_mode) {
      const plain = text.replace(/[_*`\[\]\\]/g, '');
      return await bot.sendMessage(chatId, plain);
    }
    throw err;
  }
}

/**
 * Generate a visual progress bar.
 */
function progressBar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percent}%`;
}

/**
 * Get score emoji based on percentage.
 */
function scoreEmoji(percent) {
  if (percent >= 80) return '🟢';
  if (percent >= 60) return '🟡';
  if (percent >= 40) return '🟠';
  return '🔴';
}

/**
 * Get final score rating text.
 */
function scoreRating(score) {
  if (score >= 8) return '🌟 Excellent Match';
  if (score >= 6) return '✅ Good Match';
  if (score >= 4) return '⚠️ Needs Improvement';
  return '❌ Poor Match';
}

// ─── Format Output ──────────────────────────────────────────

function formatResults(scoreResult, insights) {
  const b = scoreResult.breakdown;

  let msg = '';
  msg += `╔══════════════════════════════╗\n`;
  msg += `    📊  *ATS ANALYSIS REPORT*\n`;
  msg += `╚══════════════════════════════╝\n\n`;

  // Final Score with visual rating
  msg += `🎯 *Match Score:  ${scoreResult.finalScore} / 10*\n`;
  msg += `${scoreRating(scoreResult.finalScore)}\n`;
  msg += `📈 ATS Pass: ${insights.atsPassProbability}\n\n`;

  // Score Breakdown with progress bars
  msg += `📋 *SCORE BREAKDOWN*\n`;
  msg += `┌──────────────────────────────┐\n`;
  msg += `│ ${scoreEmoji(b.keywords.score)} Keywords     ${progressBar(b.keywords.score)}\n`;
  msg += `│ ${scoreEmoji(b.experience.score)} Experience   ${progressBar(b.experience.score)}\n`;
  msg += `│ ${scoreEmoji(b.projects.score)} Projects     ${progressBar(b.projects.score)}\n`;
  msg += `│ ${scoreEmoji(b.education.score)} Education    ${progressBar(b.education.score)}\n`;
  msg += `│ ${scoreEmoji(b.format.score)} Format       ${progressBar(b.format.score)}\n`;
  msg += `└──────────────────────────────┘\n\n`;

  // Keyword Density
  msg += `🔑 *Keyword Density:* ${insights.keywordDensity}% (${b.keywords.matched.length}/${jdCount(b)} JD terms)\n\n`;

  // Matched Skills
  if (insights.matchedSkills.length > 0) {
    msg += `✅ *Matched Skills:*\n`;
    msg += insights.matchedSkills.map((s) => `  ✔ ${s}`).join('\n') + '\n\n';
  }

  // Missing Skills
  if (insights.missingSkills.length > 0) {
    msg += `❌ *Missing Skills:*\n`;
    msg += insights.missingSkills.map((s) => `  ✘ ${s}`).join('\n') + '\n\n';
  }

  // Top Missing Keywords
  if (insights.topMissingKeywords.length > 3) {
    msg += `🔍 *All Missing Keywords:*\n`;
    msg += `  ${insights.topMissingKeywords.join(' • ')}\n\n`;
  }

  // Weak Sections
  if (insights.weakSections.length > 0) {
    msg += `⚠️ *Areas to Improve:*\n`;
    msg += insights.weakSections.map((w) => `  ${w}`).join('\n') + '\n\n';
  }

  // Key Issues
  if (insights.keyIssues.length > 0) {
    msg += `🚨 *Key Issues:*\n`;
    msg += insights.keyIssues.map((issue, i) => `  ${i + 1}. ${issue}`).join('\n') + '\n\n';
  }

  return msg;
}

function jdCount(breakdown) {
  return (breakdown.keywords.matched.length || 0) + (breakdown.keywords.missing.length || 0);
}

function formatAISuggestions(aiText) {
  let msg = `╔══════════════════════════════╗\n`;
  msg += `   🤖  *AI-POWERED INSIGHTS*\n`;
  msg += `╚══════════════════════════════╝\n\n`;
  msg += escapeMd(aiText) + '\n';
  return msg;
}

// ─── Bot Commands ───────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  const session = getSession(chatId);
  session.step = 'waiting_jd';

  bot.sendMessage(
    chatId,
    `🤖 *ATS Resume Analyzer*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `I'll score your resume against a Job Description and help you get past ATS filters\\.\n\n` +
    `📝 *Step 1 of 2:* Send me the *Job Description*\n\n` +
    `_Paste the text, or upload a PDF/DOCX file\\._\n` +
    `_Use /cancel to start over\\._`,
    { parse_mode: 'MarkdownV2' }
  ).catch(() => {
    bot.sendMessage(
      chatId,
      `🤖 ATS Resume Analyzer\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `I'll score your resume against a Job Description.\n\n` +
      `📝 Step 1 of 2: Send me the Job Description\n` +
      `(Paste text or upload PDF/DOCX)\n\n` +
      `Use /cancel to start over.`
    );
  });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📖 *How to Use:*\n\n` +
    `1️⃣ /start — Begin a new analysis\n` +
    `2️⃣ Send Job Description (text or file)\n` +
    `3️⃣ Send Resume (text, PDF, or DOCX)\n` +
    `4️⃣ Get your ATS score & suggestions\n` +
    `5️⃣ Optionally get an optimized resume\n\n` +
    `📎 *Supported:* PDF, DOCX, TXT\n` +
    `🔄 /cancel — Reset and start over\n` +
    `❓ /help — Show this message`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  bot.sendMessage(chatId, '🔄 Session reset. Send /start to begin a new analysis.');
});

// ─── Handle Documents ───────────────────────────────────────

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  const doc = msg.document;

  if (session.step !== 'waiting_jd' && session.step !== 'waiting_resume') {
    return bot.sendMessage(chatId, '⚠️ Send /start first to begin.');
  }

  try {
    const statusMsg = await bot.sendMessage(chatId, '📥 Processing your file...');

    const buffer = await downloadFile(doc.file_id);
    const mimeType = getMimeType(doc.file_name);
    const text = await extractText(buffer, mimeType);

    if (!text || text.length < 20) {
      return bot.sendMessage(chatId, '❌ Could not extract enough text. Try pasting it directly.');
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (session.step === 'waiting_jd') {
      session.jdText = text;
      session.step = 'waiting_resume';
      bot.sendMessage(
        chatId,
        `✅ *Job Description received!* (${wordCount} words)\n\n` +
        `📄 *Step 2 of 2:* Now send your *Resume*\n` +
        `_(Paste text, or upload PDF/DOCX)_`,
        { parse_mode: 'Markdown' }
      );
    } else {
      session.resumeText = text;
      await processAnalysis(chatId, session);
    }
  } catch (err) {
    console.error('File error:', err.message);
    bot.sendMessage(chatId, '❌ Error processing file. Try pasting the text directly.');
  }
});

// ─── Handle Photos ──────────────────────────────────────────

bot.on('photo', (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '📸 I can\'t read images/scanned documents yet.\n\n' +
    'Please send your resume as:\n' +
    '• PDF file\n' +
    '• DOCX file\n' +
    '• Or paste the text directly'
  );
});

// ─── Handle Text ────────────────────────────────────────────

bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  const session = getSession(chatId);

  if (session.step === 'waiting_jd') {
    if (text.length < 20) {
      return bot.sendMessage(chatId, '⚠️ Too short for a JD. Paste the full job description.');
    }
    session.jdText = text;
    session.step = 'waiting_resume';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    bot.sendMessage(
      chatId,
      `✅ *Job Description received!* (${wordCount} words)\n\n` +
      `📄 *Step 2 of 2:* Now send your *Resume*\n` +
      `_(Paste text, or upload PDF/DOCX)_`,
      { parse_mode: 'Markdown' }
    );
  } else if (session.step === 'waiting_resume') {
    if (text.length < 30) {
      return bot.sendMessage(chatId, '⚠️ Too short for a resume. Paste your full resume.');
    }
    session.resumeText = text;
    await processAnalysis(chatId, session);
  } else {
    bot.sendMessage(chatId, '👋 Send /start to begin analyzing your resume.');
  }
});

// ─── Handle Inline Button Clicks ────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const session = getSession(chatId);
  const data = query.data;

  // Acknowledge the button press
  await bot.answerCallbackQuery(query.id);

  // Remove the inline keyboard
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: query.message.message_id }
    );
  } catch (e) { /* ignore */ }

  if (data === 'optimize_yes' && session.step === 'waiting_optimize') {
    await processOptimization(chatId, session);
  } else if (data === 'optimize_no' && session.step === 'waiting_optimize') {
    bot.sendMessage(
      chatId,
      '👍 No problem! Use the suggestions above to improve manually.\n\n🔄 Send /start for a new analysis.'
    );
    session.step = 'idle';
  } else if (data === 'new_analysis') {
    resetSession(chatId);
    const newSession = getSession(chatId);
    newSession.step = 'waiting_jd';
    bot.sendMessage(
      chatId,
      '📝 Send me the *Job Description* (text or file)',
      { parse_mode: 'Markdown' }
    );
  }
});

// ─── Processing Pipeline ────────────────────────────────────

async function processAnalysis(chatId, session) {
  session.step = 'processing';

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Analyzing your resume against the JD...');

  try {
    // Step 1: Rule-based scoring
    const scoreResult = calculateATSScore(session.jdText, session.resumeText);
    const insights = generateInsights(scoreResult);

    // Store for later
    session.scoreResult = scoreResult;
    session.insights = insights;

    // Step 2: Send rule-based results immediately (don't wait for AI)
    const resultMsg = formatResults(scoreResult, insights);
    await sendLongMessage(chatId, resultMsg, { parse_mode: 'Markdown' });

    // Step 3: AI suggestions (may take time / retry)
    await bot.sendMessage(chatId, '🤖 Getting AI-powered insights...');
    const aiSuggestions = await refineAnalysis(session.resumeText, session.jdText, scoreResult, (statusMsg) => {
      bot.sendMessage(chatId, statusMsg);
    });

    const aiMsg = formatAISuggestions(aiSuggestions);
    await sendLongMessage(chatId, aiMsg, { parse_mode: 'Markdown' });

    // Step 4: Ask about optimization with inline buttons
    session.step = 'waiting_optimize';
    await bot.sendMessage(
      chatId,
      '✨ *Want an ATS-optimized version of your resume?*\n\n' +
      'I\'ll rewrite it to include missing keywords, stronger action verbs, and better structure.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, optimize!', callback_data: 'optimize_yes' },
              { text: '❌ No thanks', callback_data: 'optimize_no' },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error('Analysis error:', err);
    bot.sendMessage(chatId, '❌ Analysis failed. Please try again with /start');
    session.step = 'idle';
  }
}

async function processOptimization(chatId, session) {
  session.step = 'processing';
  await bot.sendMessage(chatId, '⏳ Generating your optimized resume... This may take up to a minute.');

  try {
    const missingKeywords = session.scoreResult?.breakdown?.keywords?.missing || [];
    const optimized = await optimizeResume(session.resumeText, session.jdText, missingKeywords, (statusMsg) => {
      bot.sendMessage(chatId, statusMsg);
    });

    // Send header
    await bot.sendMessage(
      chatId,
      '╔══════════════════════════════╗\n' +
      '    ✨  *OPTIMIZED RESUME*\n' +
      '╚══════════════════════════════╝',
      { parse_mode: 'Markdown' }
    );

    // Send optimized resume as plain text (AI output has unpredictable formatting)
    await sendLongMessage(chatId, optimized);

    // Done — offer new analysis
    await bot.sendMessage(
      chatId,
      '💡 *Tip:* Copy the resume above and customize it further.\n\n' +
      '📊 Want to check how much your score improved?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 New Analysis', callback_data: 'new_analysis' }],
          ],
        },
      }
    );
  } catch (err) {
    console.error('Optimization error:', err);
    bot.sendMessage(chatId, '❌ Optimization failed. Please try /start again.');
  }

  session.step = 'idle';
}

/**
 * Send long messages, splitting at line boundaries to stay under Telegram's 4096 limit.
 */
async function sendLongMessage(chatId, text, opts = {}) {
  const MAX = 4000;
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      await safeSend(chatId, remaining, opts);
      break;
    }
    // Split at last newline before limit
    let splitAt = remaining.lastIndexOf('\n', MAX);
    if (splitAt <= 0) splitAt = MAX;
    await safeSend(chatId, remaining.substring(0, splitAt), opts);
    remaining = remaining.substring(splitAt).trimStart();
  }
}

// ─── Startup ────────────────────────────────────────────────

console.log('🤖 ATS Resume Analyzer Bot v2.0 is running...');
console.log('Send /start to your bot on Telegram to begin!');
