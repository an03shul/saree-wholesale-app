const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { UPLOADS_DIR } = require('../config/paths');
const { extractDesignsFromPhotos } = require('../services/bulkImport');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// POST /api/import/analyze — upload up to 20 photos, AI-extract draft fields for each.
// Photos are stored immediately so they can be attached on save without re-upload.
router.post('/analyze', requireAdmin, upload.array('photos', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No photos uploaded' });

  try {
    const drafts = await extractDesignsFromPhotos(req.files.map(f => f.filename));
    res.json({ drafts });
  } catch (e) {
    // OCR engine failed entirely — still return the photos so they can be filled in manually
    const drafts = req.files.map(f => ({
      photo_path: f.filename,
      design_number: null, colors: null, fabric_type: null,
      work_category: null, confidence: 'low',
    }));
    res.json({ drafts });
  }
});

// POST /api/import/save — bulk-create designs under an item from confirmed drafts.
// Each draft already has a photo_path (uploaded during /analyze).
router.post('/save', requireAdmin, express.json(), (req, res) => {
  const { item_id, designs } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id is required' });
  if (!Array.isArray(designs) || !designs.length) return res.status(400).json({ error: 'No designs to save' });

  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const insert = db.prepare(
    'INSERT INTO designs (item_id, design_number, photo_path, rate, colors, fabric_type, pcs_per_set, work_category) VALUES (?,?,?,?,?,?,?,?)'
  );

  const existsStmt = db.prepare('SELECT 1 FROM designs WHERE item_id = ? AND design_number = ? LIMIT 1');
  const seenInBatch = new Set();

  const results = { saved: 0, skipped: [] };
  for (const d of designs) {
    if (!d.design_number || d.rate == null || d.rate === '') {
      results.skipped.push({ photo_path: d.photo_path, reason: 'missing design number or rate' });
      continue;
    }
    const num = String(d.design_number).trim();
    // Skip duplicates — already in this item, or repeated within this batch
    if (seenInBatch.has(num) || existsStmt.get(item_id, num)) {
      results.skipped.push({ photo_path: d.photo_path, reason: 'duplicate design number' });
      continue;
    }
    seenInBatch.add(num);
    try {
      insert.run(
        item_id,
        String(d.design_number).trim(),
        d.photo_path || null,
        parseFloat(d.rate),
        d.colors || null,
        d.fabric_type || null,
        parseInt(d.pcs_per_set) || 1,
        d.work_category || null,
      );
      results.saved++;
    } catch (e) {
      results.skipped.push({
        photo_path: d.photo_path,
        reason: e.message.includes('UNIQUE') ? 'duplicate design number' : e.message,
      });
    }
  }

  res.json(results);
});

module.exports = router;
