const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/orders — all orders, newest first, with design info
router.get('/', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*,
      d.design_number, d.photo_path,
      i.name AS item_name,
      b.name AS brand_name
    FROM orders o
    LEFT JOIN designs d ON d.id = o.design_id
    LEFT JOIN items i ON i.id = d.item_id
    LEFT JOIN brands b ON b.id = i.brand_id
    ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

// POST /api/orders — create new order/inquiry
router.post('/', (req, res) => {
  const { design_id, customer_name, customer_phone, quantity, note, source } = req.body;
  if (!customer_name) return res.status(400).json({ error: 'customer_name is required' });
  const validSources = ['design_card', 'orders_tab'];
  const src = validSources.includes(source) ? source : 'orders_tab';
  const result = db.prepare(
    'INSERT INTO orders (design_id, customer_name, customer_phone, quantity, note, status, source) VALUES (?,?,?,?,?,?,?)'
  ).run(design_id || null, customer_name.trim(), customer_phone?.trim() || null, quantity || 1, note?.trim() || null, 'pending', src);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/orders/:id/status — update status
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'dispatched', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ status });
});

// DELETE /api/orders/:id
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
