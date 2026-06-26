const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

router.get('/', (req, res) => {
  const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
  res.json(brands);
});

router.get('/:id', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const items = db.prepare('SELECT * FROM items WHERE brand_id = ? ORDER BY name').all(brand.id);
  res.json({ ...brand, items });
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare('INSERT INTO brands (name, description) VALUES (?, ?)').run(name.trim(), description || null);
    res.status(201).json({ id: result.lastInsertRowid, name, description });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Brand name already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  db.prepare('UPDATE brands SET name = ?, description = ? WHERE id = ?').run(name, description, req.params.id);
  res.json({ id: req.params.id, name, description });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required to delete a brand' });
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.user.id);
  if (user.pin_hash !== hashPin(pin)) return res.status(401).json({ error: 'Wrong PIN' });
  db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
