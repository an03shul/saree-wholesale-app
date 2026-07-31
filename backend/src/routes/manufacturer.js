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
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  // The app sends design_id (picked from the manufacturer's own catalog, exact).
  // design_number is kept as a fallback for direct API callers.
  const id = Number(req.body.design_id) || null;
  const num = (req.body.design_number || '').trim();
  if (!id && !num) return res.status(400).json({ error: 'design required' });
  const design = id
    ? db.prepare(`SELECT d.id FROM designs d JOIN items i ON i.id = d.item_id
                  WHERE i.brand_id = ? AND d.id = ?`).get(req.user.brand_id, id)
    // ponytail: design_number isn't globally unique — take the first match in the brand.
    : db.prepare(`SELECT d.id FROM designs d JOIN items i ON i.id = d.item_id
                  WHERE i.brand_id = ? AND d.design_number = ? LIMIT 1`).get(req.user.brand_id, num);
  if (!design) return res.status(404).json({ error: num ? `Design ${num} not found in your catalog` : 'Design not found in your catalog' });
  const filename = storage.generateKey(req.file.originalname || 'dispatch.jpg');
  await storage.putFile(filename, req.file.buffer);
  db.prepare('UPDATE designs SET photo_path = ? WHERE id = ?').run(filename, design.id);
  res.json({ success: true, design_id: design.id, photo_path: filename, design_number: num });
});

// GET /stock — the brand's designs + live Tally stock. Qty comes from the
// tally_stock cache (kept fresh by the shop-PC sync agent) joined on the
// design's tally_item_name — same source the shop's own stock view uses.
router.get('/stock', (req, res) => {
  res.json(db.prepare(`
    SELECT d.id, d.design_number, d.rate, d.in_stock, d.photo_path,
           ts.qty AS qty, i.name AS item_name
    FROM designs d JOIN items i ON i.id = d.item_id
    LEFT JOIN tally_stock ts ON ts.tally_item_name = COALESCE(i.tally_item_name, d.tally_item_name)
    WHERE i.brand_id = ?
    ORDER BY i.name, CAST(d.design_number AS INTEGER), d.design_number
  `).all(req.user.brand_id));
});

// GET /notes — the manufacturer's own private notes (newest first).
router.get('/notes', (req, res) => {
  res.json(db.prepare('SELECT id, body, created_at FROM manufacturer_notes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

// POST /notes — leave a private note that only the admin can read.
router.post('/notes', (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Note is required' });
  const r = db.prepare('INSERT INTO manufacturer_notes (user_id, brand_id, body) VALUES (?,?,?)')
    .run(req.user.id, req.user.brand_id, body);
  res.status(201).json(db.prepare('SELECT id, body, created_at FROM manufacturer_notes WHERE id = ?').get(r.lastInsertRowid));
});

module.exports = router;
