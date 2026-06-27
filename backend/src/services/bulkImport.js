const path = require('path');
const { createWorker } = require('tesseract.js');
const { UPLOADS_DIR } = require('../config/paths');

// Pick the most likely design number out of OCR text. Saree tags usually carry
// a 3–6 digit code (sometimes with a letter prefix like D-1024). We grab digit
// runs and prefer the longest; the user corrects anything wrong in review.
function pickDesignNumber(text) {
  if (!text) return null;
  // Prefer codes like "1024", "D-1024", "DN1024"
  const codeMatches = text.match(/\b[A-Z]{0,3}-?\d{3,6}\b/gi) || [];
  const digitMatches = text.match(/\d{3,6}/g) || [];
  const candidates = [...codeMatches, ...digitMatches]
    .map(s => s.trim())
    .filter(Boolean);
  if (!candidates.length) return null;
  // Prefer the longest candidate (more specific), ties keep first seen
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

// OCR a batch of photos with a single shared worker (much faster than one per
// image). Returns draft rows; only the design number is auto-filled — fabric,
// colours and work type are left for the user to batch-set or type.
// Accepts an array of { filename, buffer }. OCRs the buffer directly (works
// regardless of where the file is stored).
async function extractDesignsFromPhotos(photos) {
  const worker = await createWorker('eng');
  const drafts = [];
  try {
    for (const p of photos) {
      let design_number = null;
      try {
        const { data: { text } } = await worker.recognize(p.buffer);
        design_number = pickDesignNumber(text);
      } catch { /* unreadable image → leave blank */ }
      drafts.push({
        photo_path: p.filename,
        design_number,
        colors: null,
        fabric_type: null,
        work_category: null,
        confidence: design_number ? 'medium' : 'low',
      });
    }
  } finally {
    await worker.terminate();
  }
  return drafts;
}

module.exports = { extractDesignsFromPhotos, pickDesignNumber };
