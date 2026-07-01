const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Get all items (optionally filter by brand)
router.get('/', (req, res) => {
  const { brand_id } = req.query;
  const items = brand_id
    ? db.prepare('SELECT * FROM items WHERE brand_id = ? ORDER BY in_stock DESC, name').all(brand_id)
    : db.prepare('SELECT i.*, b.name as brand_name FROM items i LEFT JOIN brands b ON i.brand_id = b.id ORDER BY i.in_stock DESC, i.name').all();
  res.json(items);
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT i.*, b.name as brand_name FROM items i LEFT JOIN brands b ON i.brand_id = b.id WHERE i.id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const designs = db.prepare('SELECT * FROM designs WHERE item_id = ? ORDER BY design_number').all(item.id);
  res.json({ ...item, designs });
});

router.post('/', (req, res) => {
  const { name, description, brand_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!brand_id) return res.status(400).json({ error: 'brand_id is required' });
  const result = db.prepare('INSERT INTO items (name, description, brand_id) VALUES (?, ?, ?)').run(name.trim(), description || null, brand_id);
  res.status(201).json({ id: result.lastInsertRowid, name, description, brand_id });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, description, brand_id } = req.body;
  db.prepare('UPDATE items SET name = ?, description = ?, brand_id = ? WHERE id = ?').run(name, description, brand_id, req.params.id);
  res.json({ id: req.params.id, name, description, brand_id });
});

router.patch('/:id/stock', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT in_stock FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const newVal = item.in_stock ? 0 : 1;
  db.prepare('UPDATE items SET in_stock = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ in_stock: newVal });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
