const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const storage = require('../services/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

// Save an uploaded file to storage and return its generated filename (photo_path)
async function saveUpload(file) {
  if (!file) return null;
  const filename = storage.generateKey(file.originalname);
  await storage.putFile(filename, file.buffer);
  return filename;
}

router.get('/item/:itemId', (req, res) => {
  const designs = db.prepare('SELECT * FROM designs WHERE item_id = ? ORDER BY in_stock DESC, CAST(design_number AS INTEGER), design_number').all(req.params.itemId);
  res.json(designs);
});

// GET /api/designs/search?q=... — search all designs across all items/brands
router.get('/search', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const designs = db.prepare(`
    SELECT d.*, i.name AS item_name, b.id AS brand_id, b.name AS brand_name
    FROM designs d
    JOIN items i ON i.id = d.item_id
    JOIN brands b ON b.id = i.brand_id
    WHERE d.design_number LIKE ? OR i.name LIKE ? OR b.name LIKE ?
    ORDER BY b.name, i.name, CAST(d.design_number AS INTEGER), d.design_number
    LIMIT 50
  `).all(q, q, q);
  res.json(designs);
});

// GET /api/designs/:id — single design with item + brand info (used by QR scanner)
router.get('/:id', (req, res) => {
  const design = db.prepare(`
    SELECT d.*, i.name AS item_name, i.description AS item_description, b.name AS brand_name
    FROM designs d
    JOIN items i ON i.id = d.item_id
    JOIN brands b ON b.id = i.brand_id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  res.json(design);
});

router.post('/item/:itemId', (req, res, next) => {
  // Accept both JSON and multipart/form-data
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return upload.single('photo')(req, res, next);
  next();
}, async (req, res) => {
  const { design_number, rate, colors, fabric_type, pcs_per_set, tally_item_name, work_category } = req.body;
  if (!design_number || !rate || !pcs_per_set) {
    return res.status(400).json({ error: 'design_number, rate, pcs_per_set are required' });
  }
  // Reject duplicate design number within the same item
  const dup = db.prepare('SELECT 1 FROM designs WHERE item_id = ? AND design_number = ? LIMIT 1')
    .get(req.params.itemId, String(design_number).trim());
  if (dup) {
    return res.status(409).json({ error: `Design ${design_number} already exists for this item` });
  }
  try {
    const photo_path = await saveUpload(req.file);
    const result = db.prepare(
      'INSERT INTO designs (item_id, design_number, photo_path, rate, colors, fabric_type, pcs_per_set, tally_item_name, work_category) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(req.params.itemId, design_number, photo_path, parseFloat(rate), colors || null, fabric_type || null, parseInt(pcs_per_set), tally_item_name || null, work_category || null);
    res.status(201).json({ id: result.lastInsertRowid, design_number, photo_path, rate, colors, fabric_type, pcs_per_set, tally_item_name, work_category });
  } catch (e) {
    console.error('Design save error:', e.message);
    if (e.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Design number already exists for this item' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAdmin, upload.single('photo'), async (req, res) => {
  const { design_number, rate, colors, fabric_type, pcs_per_set, tally_item_name, work_category, item_id } = req.body;
  const existing = db.prepare('SELECT * FROM designs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Design not found' });
  const photo_path = req.file ? await saveUpload(req.file) : existing.photo_path;
  db.prepare(
    'UPDATE designs SET design_number=?, photo_path=?, rate=?, colors=?, fabric_type=?, pcs_per_set=?, tally_item_name=?, work_category=?, item_id=? WHERE id=?'
  ).run(design_number || existing.design_number, photo_path, parseFloat(rate) || existing.rate, colors || existing.colors, fabric_type || existing.fabric_type, parseInt(pcs_per_set) || existing.pcs_per_set, tally_item_name || existing.tally_item_name, work_category !== undefined ? (work_category || null) : existing.work_category, item_id || existing.item_id, req.params.id);
  res.json({ id: req.params.id, design_number, photo_path, rate, colors, fabric_type, pcs_per_set, work_category, item_id: item_id || existing.item_id });
});

router.patch('/:id/stock', requireAdmin, (req, res) => {
  const design = db.prepare('SELECT in_stock FROM designs WHERE id = ?').get(req.params.id);
  if (!design) return res.status(404).json({ error: 'Design not found' });
  const newVal = design.in_stock ? 0 : 1;
  db.prepare('UPDATE designs SET in_stock = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ in_stock: newVal });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const design = db.prepare('SELECT * FROM designs WHERE id = ?').get(req.params.id);
  if (design?.photo_path) {
    const fn = design.photo_path;
    await storage.deleteFile(fn);
    await storage.deleteFile(`wm/${fn}`);
    await storage.deleteFile(`thumb/${fn}`);
  }
  db.prepare('DELETE FROM designs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
