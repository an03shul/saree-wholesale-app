const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/database');
const storage = require('../services/storage');
const { requireAuth, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

// Everything here is manufacturer-only and scoped to their linked brand.
router.use(requireAuth, requireRole('manufacturer'));
router.use((req, res, next) => {
  if (!req.user.brand_id) return res.status(400).json({ error: 'Your account is not linked to a brand' });
  next();
});

// POST /dispatch-photo — attach a dispatched-item photo to an existing design
// in the manufacturer's brand, matched by design number.
router.post('/dispatch-photo', upload.single('photo'), async (req, res) => {
  const num = (req.body.design_number || '').trim();
  if (!num) return res.status(400).json({ error: 'design_number required' });
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  // ponytail: design_number isn't globally unique — take the first match in the brand.
  const design = db.prepare(`
    SELECT d.id FROM designs d JOIN items i ON i.id = d.item_id
    WHERE i.brand_id = ? AND d.design_number = ? LIMIT 1
  `).get(req.user.brand_id, num);
  if (!design) return res.status(404).json({ error: `Design ${num} not found in your catalog` });
  const filename = storage.generateKey(req.file.originalname || 'dispatch.jpg');
  await storage.putFile(filename, req.file.buffer);
  db.prepare('UPDATE designs SET photo_path = ? WHERE id = ?').run(filename, design.id);
  res.json({ success: true, design_id: design.id, photo_path: filename, design_number: num });
});

// GET /stock — the brand's designs + stock (Tally cache qty).
router.get('/stock', (req, res) => {
  res.json(db.prepare(`
    SELECT d.id, d.design_number, d.rate, d.in_stock, d.photo_path,
           d.tally_stock_cache AS qty, i.name AS item_name
    FROM designs d JOIN items i ON i.id = d.item_id
    WHERE i.brand_id = ?
    ORDER BY i.name, CAST(d.design_number AS INTEGER), d.design_number
  `).all(req.user.brand_id));
});

// GET /sales — orders for the brand.
router.get('/sales', (req, res) => {
  const brand = db.prepare('SELECT name FROM brands WHERE id = ?').get(req.user.brand_id);
  // ponytail: match by joined brand_id, plus denormalized brand_name for custom-form orders.
  res.json(db.prepare(`
    SELECT o.*, COALESCE(d.design_number, o.design_number) AS design_number,
           COALESCE(i.name, o.item_name) AS item_name, d.photo_path
    FROM orders o
    LEFT JOIN designs d ON d.id = o.design_id
    LEFT JOIN items i ON i.id = d.item_id
    WHERE i.brand_id = ? OR o.brand_name = ?
    ORDER BY o.created_at DESC
  `).all(req.user.brand_id, brand ? brand.name : ''));
});

module.exports = router;
