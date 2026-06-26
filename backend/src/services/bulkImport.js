const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { UPLOADS_DIR } = require('../config/paths');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function encodeImage(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// Analyze a single saree photo and extract whatever catalog fields are visible.
// knownFabrics / knownWorkCategories steer the model toward the shop's existing
// taxonomy for consistency. Returns a draft object (fields may be null).
async function extractDesignFromPhoto(photoPath, { fabrics = [], workCategories = [] } = {}) {
  const full = path.join(UPLOADS_DIR, photoPath);
  const base64 = encodeImage(full);
  const mime = mimeType(full);

  const prompt = `You are helping digitize a saree wholesaler's catalog. Look at this ONE saree photo and extract what you can SEE.

Return ONLY a JSON object (no other text), with these keys:
{
  "design_number": "the design/style number if it is visibly printed/written on a tag, label, sticker, or the fabric — otherwise null",
  "colors": "the main visible colours, comma-separated (e.g. 'Red, Gold') — or null",
  "fabric_type": "your best single guess of the fabric, preferring one of this list if it fits: [${fabrics.join(', ')}] — otherwise your own short term, or null",
  "work_category": "the type of work/embellishment, preferring one of this list if it fits: [${workCategories.join(', ')}] — otherwise your own short term, or null",
  "confidence": "high | medium | low — how clearly you could read a design number"
}

Rules:
- Only put a design_number if you can actually read digits/code in the image. Do NOT invent one.
- Be concise. No explanations outside the JSON.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  let parsed = {};
  if (textBlock) {
    try {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch { /* leave parsed empty */ }
  }

  return {
    photo_path: photoPath,
    design_number: parsed.design_number || null,
    colors: parsed.colors || null,
    fabric_type: parsed.fabric_type || null,
    work_category: parsed.work_category || null,
    confidence: parsed.confidence || 'low',
  };
}

module.exports = { extractDesignFromPhoto };
