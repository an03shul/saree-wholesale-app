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
  // item_qty is the collection's live Tally stock (same for every design in the
  // item) — the manufacturer view groups by item and shows this as the total.
  res.json(db.prepare(`
    SELECT d.id, d.item_id, d.design_number, d.rate, d.in_stock, d.photo_path,
           i.name AS item_name, ts.qty AS item_qty
    FROM designs d JOIN items i ON i.id = d.item_id
    LEFT JOIN tally_stock ts ON ts.tally_item_name = i.tally_item_name
    WHERE i.brand_id = ?
    ORDER BY i.name, CAST(d.design_number AS INTEGER), d.design_number
  `).all(req.user.brand_id));
});

// GET /insights — analytics for the manufacturer's brand, one payload.
// Orders are attributed to the brand via the linked design OR the denormalized
// brand_name (catalog orders). ponytail: multi-design catalog orders carry
// brand_name, so design_ids parsing isn't needed for attribution.
router.get('/insights', (req, res) => {
  const B = req.user.brand_id;
  const brandName = db.prepare('SELECT name FROM brands WHERE id = ?').get(B)?.name || '';
  // Reusable brand filter for orders
  const ordersFrom = `
    FROM orders o
    LEFT JOIN designs d ON d.id = o.design_id
    LEFT JOIN items i ON i.id = d.item_id
    WHERE (i.brand_id = ? OR o.brand_name = ?)
  `;

  // A3/A4 — collection stock: linked collections with their live Tally qty
  const collections = db.prepare(`
    SELECT i.name, ts.qty FROM items i
    JOIN tally_stock ts ON ts.tally_item_name = i.tally_item_name
    WHERE i.brand_id = ?
    ORDER BY ts.qty ASC
  `).all(B);
  const outOfStock = collections.filter(c => c.qty <= 0);
  const lowStock = collections.filter(c => c.qty > 0 && c.qty <= 5);

  // B6 — orders this week / month (count + pieces)
  const period = (days) => db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(o.quantity), 0) AS pieces
    ${ordersFrom} AND o.created_at >= datetime('now', ?)
  `).get(B, brandName, `-${days} days`);
  const week = period(7);
  const month = period(30);

  // B7 — top-selling designs, last 90 days
  const topDesigns = db.prepare(`
    SELECT COALESCE(d.design_number, o.design_number) AS design_number,
           COALESCE(i.name, o.item_name) AS item_name,
           COUNT(*) AS orders, COALESCE(SUM(o.quantity), 0) AS pieces
    ${ordersFrom} AND o.created_at >= datetime('now', '-90 days')
      AND COALESCE(d.design_number, o.design_number) IS NOT NULL
    GROUP BY 1, 2
    ORDER BY pieces DESC LIMIT 5
  `).all(B, brandName);

  // B8 — pending vs completed (all time)
  const byStatus = db.prepare(`
    SELECT o.status, COUNT(*) AS n ${ordersFrom} GROUP BY o.status
  `).all(B, brandName);

  // B10 — urgent: designs with pending orders whose collection is out of stock
  const urgent = db.prepare(`
    SELECT d.design_number, i.name AS item_name,
           COALESCE(SUM(o.quantity), 0) AS pending_pieces, ts.qty
    FROM orders o
    JOIN designs d ON d.id = o.design_id
    JOIN items i ON i.id = d.item_id
    JOIN tally_stock ts ON ts.tally_item_name = i.tally_item_name
    WHERE i.brand_id = ? AND o.status = 'pending' AND ts.qty <= 0
    GROUP BY d.id ORDER BY pending_pieces DESC
  `).all(B);

  // C11 — photo coverage
  const photos = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN d.photo_path IS NULL OR d.photo_path = '' THEN 1 ELSE 0 END) AS missing
    FROM designs d JOIN items i ON i.id = d.item_id WHERE i.brand_id = ?
  `).get(B);

  res.json({ outOfStock, lowStock, week, month, topDesigns, byStatus, urgent, photos });
});

// GET /notes — the full private chat thread for this manufacturer's brand
// (their messages + admin replies), oldest first for chat display.
router.get('/notes', (req, res) => {
  res.json(db.prepare(`
    SELECT n.id, n.body, n.created_at, u.role AS sender_role
    FROM manufacturer_notes n JOIN users u ON u.id = n.user_id
    WHERE n.brand_id = ?
    ORDER BY n.created_at ASC
  `).all(req.user.brand_id));
});

// POST /notes — send a message to the admin (private to this brand's thread).
router.post('/notes', (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Note is required' });
  const r = db.prepare('INSERT INTO manufacturer_notes (user_id, brand_id, body) VALUES (?,?,?)')
    .run(req.user.id, req.user.brand_id, body);
  res.status(201).json(db.prepare('SELECT id, body, created_at FROM manufacturer_notes WHERE id = ?').get(r.lastInsertRowid));
});

module.exports = router;
