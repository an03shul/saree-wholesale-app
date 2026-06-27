const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/database');
const storage = require('./storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function mimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function identifyDesign(mysteryBuffer, mysteryMime = 'image/jpeg') {
  // Load all designs that have photos (cap at 25 for the comparison)
  const designs = db.prepare(`
    SELECT d.*, i.name AS item_name, b.name AS brand_name
    FROM designs d
    JOIN items i ON i.id = d.item_id
    JOIN brands b ON b.id = i.brand_id
    WHERE d.photo_path IS NOT NULL
    LIMIT 25
  `).all();

  // Fetch catalog photo bytes from storage
  const withPhoto = [];
  for (const d of designs) {
    const buf = await storage.getFile(d.photo_path);
    if (buf) withPhoto.push({ ...d, _buf: buf });
  }

  if (withPhoto.length === 0) {
    return { matches: [], message: 'No catalog photos found to compare against. Please add photos to your designs first.' };
  }

  const catalogSubset = withPhoto;
  const mysteryBase64 = mysteryBuffer.toString('base64');

  const catalogParts = catalogSubset.map((d, i) => {
    const base64 = d._buf.toString('base64');
    const mime = mimeType(d.photo_path);
    return [
      {
        type: 'text',
        text: `[Catalog item ${i + 1}] Brand: ${d.brand_name} | Item: ${d.item_name} | Design: ${d.design_number} | Fabric: ${d.fabric_type || 'N/A'} | Colors: ${d.colors || 'N/A'} | Rate: ₹${d.rate} | ID: ${d.id}`,
      },
      {
        type: 'image',
        source: { type: 'base64', media_type: mime, data: base64 },
      },
    ];
  }).flat();

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'I am showing you an unknown saree/fabric piece that a customer has returned. I need you to identify which item from my catalog it matches.',
          },
          {
            type: 'text',
            text: 'MYSTERY PHOTO (the unknown piece):',
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: mysteryMime, data: mysteryBase64 },
          },
          {
            type: 'text',
            text: `Now here are ${catalogSubset.length} catalog items to compare against:`,
          },
          ...catalogParts,
          {
            type: 'text',
            text: `Compare the mystery photo against all catalog items above. Look at: color/pattern/design, fabric texture, weave type, border style, and overall appearance.

Return ONLY a JSON array (no other text) of the top 3 matches sorted by confidence, like:
[
  {"id": <design_id>, "confidence": "high|medium|low", "reason": "brief reason"},
  {"id": <design_id>, "confidence": "high|medium|low", "reason": "brief reason"},
  {"id": <design_id>, "confidence": "high|medium|low", "reason": "brief reason"}
]

If none match well, return an empty array [].`,
          },
        ],
      },
    ],
  });

  // Extract the text from the response (skip thinking blocks)
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) return { matches: [], message: 'No response from AI' };

  let parsed;
  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return { matches: [], message: 'Could not parse AI response' };
  }

  // Enrich with full design data
  const matches = parsed.map(m => {
    const design = withPhoto.find(d => d.id === m.id);
    if (!design) return null;
    return {
      id: design.id,
      design_number: design.design_number,
      item_name: design.item_name,
      brand_name: design.brand_name,
      fabric_type: design.fabric_type,
      colors: design.colors,
      rate: design.rate,
      pcs_per_set: design.pcs_per_set,
      photo_path: design.photo_path,
      confidence: m.confidence,
      reason: m.reason,
    };
  }).filter(Boolean);

  return { matches };
}

module.exports = { identifyDesign };
