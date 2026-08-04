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
  // LEFT JOIN so collections NOT matched to a Tally item still surface (as
  // qty=null → "stock unknown") instead of silently vanishing — an empty
  // out-of-stock list must mean "verified healthy", not "no data".
  const collections = db.prepare(`
    SELECT i.name, ts.qty, ts.value FROM items i
    LEFT JOIN tally_stock ts ON ts.tally_item_name = i.tally_item_name
    WHERE i.brand_id = ?
    ORDER BY ts.qty ASC
  `).all(B);
  // NB: null qty must be excluded explicitly — `null <= 0` is true in JS.
  const outOfStock = collections.filter(c => c.qty !== null && c.qty <= 0);
  const lowStock = collections.filter(c => c.qty !== null && c.qty > 0 && c.qty <= 5);
  const stockUnknown = collections.filter(c => c.qty === null);

  // B6 — demand for a rolling window, with piece count AND ₹ value.
  // value = quantity × the linked design's rate; catalog orders with no linked
  // design contribute 0, so revenue is an estimate (labelled as such in the UI).
  const windowSel = `
    SELECT COUNT(*) AS orders, COALESCE(SUM(o.quantity), 0) AS pieces,
           ROUND(COALESCE(SUM(o.quantity * COALESCE(d.rate, 0)), 0)) AS value
  `;
  const period = (days) => db.prepare(`${windowSel} ${ordersFrom} AND o.created_at >= datetime('now', ?)`).get(B, brandName, `-${days} days`);
  const between = (fromD, toD) => db.prepare(`${windowSel} ${ordersFrom} AND o.created_at >= datetime('now', ?) AND o.created_at < datetime('now', ?)`).get(B, brandName, `-${fromD} days`, `-${toD} days`);
  const week = period(7);
  const month = period(30);
  const prevMonth = between(60, 30); // 31–60 days ago, for the 30-day % change

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

  // Demand trend — pieces & ₹ per week for the last 8 weeks (0 = current week),
  // gap-filled in JS so the chart always has 8 continuous points, oldest first.
  const trendRaw = db.prepare(`
    SELECT CAST((julianday('now') - julianday(o.created_at)) / 7 AS INTEGER) AS weeks_ago,
           COALESCE(SUM(o.quantity), 0) AS pieces,
           ROUND(COALESCE(SUM(o.quantity * COALESCE(d.rate, 0)), 0)) AS value
    ${ordersFrom} AND o.created_at >= datetime('now', '-56 days')
    GROUP BY weeks_ago
  `).all(B, brandName);
  const trendMap = new Map(trendRaw.map(r => [r.weeks_ago, r]));
  const trend = [];
  for (let w = 7; w >= 0; w--) {
    const r = trendMap.get(w) || { pieces: 0, value: 0 };
    trend.push({ label: w === 0 ? 'now' : `${w}w`, pieces: r.pieces, value: r.value });
  }

  // Demand by collection — pieces & ₹ over the last 90 days.
  const byCollection = db.prepare(`
    SELECT COALESCE(i.name, o.item_name) AS name,
           COALESCE(SUM(o.quantity), 0) AS pieces,
           ROUND(COALESCE(SUM(o.quantity * COALESCE(d.rate, 0)), 0)) AS value
    ${ordersFrom} AND o.created_at >= datetime('now', '-90 days')
      AND COALESCE(i.name, o.item_name) IS NOT NULL
    GROUP BY 1 ORDER BY pieces DESC LIMIT 8
  `).all(B, brandName);

  // Reorder priorities — the most actionable list: design-linked demand (90d)
  // whose collection is low/zero OR has unknown stock → "make these next".
  const reorder = db.prepare(`
    SELECT d.design_number, i.name AS item_name,
           COALESCE(SUM(o.quantity), 0) AS demand, ts.qty
    FROM orders o
    JOIN designs d ON d.id = o.design_id
    JOIN items i ON i.id = d.item_id
    LEFT JOIN tally_stock ts ON ts.tally_item_name = i.tally_item_name
    WHERE i.brand_id = ? AND o.created_at >= datetime('now', '-90 days')
    GROUP BY d.id
    HAVING ts.qty IS NULL OR ts.qty <= 5
    ORDER BY demand DESC LIMIT 6
  `).all(B);

  // Production workload — request counts by status.
  const requestStatus = db.prepare(`
    SELECT status, COUNT(*) AS n FROM production_requests WHERE brand_id = ? GROUP BY status
  `).all(B);

  // Portfolio totals (all-time demand + catalog size + live stock).
  const catalog = db.prepare(`
    SELECT (SELECT COUNT(*) FROM designs d JOIN items i ON i.id = d.item_id WHERE i.brand_id = ?) AS designs,
           (SELECT COUNT(*) FROM items WHERE brand_id = ?) AS collections
  `).get(B, B);
  const allTime = db.prepare(`${windowSel} ${ordersFrom}`).get(B, brandName);
  const totals = {
    designs: catalog.designs,
    collections: catalog.collections,
    stock: collections.reduce((s, c) => s + (c.qty || 0), 0),
    stockValue: Math.round(collections.reduce((s, c) => s + (c.value || 0), 0)),
    orders: allTime.orders,
    pieces: allTime.pieces,
    value: allTime.value,
  };

  res.json({
    totals, week, month, prevMonth, trend, byCollection, reorder,
    outOfStock, lowStock, stockUnknown, topDesigns, byStatus, urgent, requestStatus, photos,
  });
});

// GET /requests — production requests for this manufacturer's brand.
router.get('/requests', (req, res) => {
  res.json(db.prepare(`
    SELECT pr.id, pr.design_number, pr.item_name, pr.quantity, pr.due_date, pr.note,
           pr.status, pr.created_at, d.photo_path
    FROM production_requests pr LEFT JOIN designs d ON d.id = pr.design_id
    WHERE pr.brand_id = ? ORDER BY pr.status='dispatched', pr.created_at DESC
  `).all(req.user.brand_id));
});

// PATCH /requests/:id/status — manufacturer moves a request forward.
const MFG_STATUSES = ['accepted', 'in_progress', 'dispatched'];
router.patch('/requests/:id/status', (req, res) => {
  const status = req.body.status;
  if (!MFG_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const pr = db.prepare('SELECT id, brand_id FROM production_requests WHERE id = ?').get(req.params.id);
  if (!pr || pr.brand_id !== req.user.brand_id) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE production_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true, status });
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

// GET /design-submissions — this manufacturer's own pending submissions.
router.get('/design-submissions', (req, res) => {
  res.json(db.prepare(`
    SELECT s.id, s.design_number, s.rate, s.pcs_per_set, s.photo_path, s.new_item_name,
           s.created_at, i.name AS item_name
    FROM design_submissions s LEFT JOIN items i ON i.id = s.item_id
    WHERE s.brand_id = ? ORDER BY s.created_at DESC
  `).all(req.user.brand_id));
});

// POST /design-submissions — propose a new design. Either item_id (existing
// collection in the brand) or new_item_name (collection to create on approve).
// Stays in staging until an admin approves; never touches the live catalog.
router.post('/design-submissions', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  const design_number = (req.body.design_number || '').trim();
  const rate = parseFloat(req.body.rate);
  const pcs_per_set = parseInt(req.body.pcs_per_set);
  if (!design_number) return res.status(400).json({ error: 'design_number required' });
  if (!(rate >= 0)) return res.status(400).json({ error: 'valid rate required' });
  if (!(pcs_per_set >= 1)) return res.status(400).json({ error: 'valid pcs_per_set required' });

  let item_id = null, new_item_name = null;
  if (req.body.item_id) {
    item_id = Number(req.body.item_id);
    const item = db.prepare('SELECT id FROM items WHERE id = ? AND brand_id = ?').get(item_id, req.user.brand_id);
    if (!item) return res.status(404).json({ error: 'Collection not found in your brand' });
  } else {
    new_item_name = (req.body.new_item_name || '').trim();
    if (!new_item_name) return res.status(400).json({ error: 'Pick a collection or name a new one' });
  }

  const filename = storage.generateKey(req.file.originalname || 'design.jpg');
  await storage.putFile(filename, req.file.buffer);
  const r = db.prepare(`
    INSERT INTO design_submissions (brand_id, submitted_by, item_id, new_item_name, design_number, rate, pcs_per_set, photo_path)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.user.brand_id, req.user.id, item_id, new_item_name, design_number, rate, pcs_per_set, filename);
  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

module.exports = router;
