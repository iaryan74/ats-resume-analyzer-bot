/**
 * Text extraction module.
 * Extracts and normalizes text from PDF, DOCX, or plain text input.
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract text from a buffer based on MIME type.
 * @param {Buffer} buffer - File content buffer
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted and cleaned text
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
    // Treat as plain text
    raw = buffer.toString('utf-8');
  }

  return cleanText(raw);
}

/**
 * Normalize text: collapse whitespace, strip weird chars, trim.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  return text
    .replace(/[\r\n]+/g, '\n')       // normalize line endings
    .replace(/[^\x20-\x7E\n]/g, ' ') // strip non-ASCII printable chars
    .replace(/[ \t]+/g, ' ')         // collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')      // collapse excessive blank lines
    .trim();
}

module.exports = { extractText, cleanText };
