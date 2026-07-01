const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, phone, type } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  try {
    const result = db.prepare('INSERT INTO contacts (name, phone, type) VALUES (?,?,?)').run(name, phone, type || 'individual');
    res.status(201).json({ id: result.lastInsertRowid, name, phone, type });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { name, phone, type } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const existing = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  try {
    db.prepare('UPDATE contacts SET name = ?, phone = ?, type = ? WHERE id = ?')
      .run(name, phone, type || 'individual', req.params.id);
    res.json({ id: Number(req.params.id), name, phone, type: type || 'individual' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone already exists' });
    throw e;
  }
});

// Bulk import (admin only). Idempotent: existing phones are skipped, not overwritten.
router.post('/import', requireAdmin, (req, res) => {
  const list = Array.isArray(req.body?.contacts) ? req.body.contacts : null;
  if (!list) return res.status(400).json({ error: 'contacts array required' });
  const ins = db.prepare('INSERT OR IGNORE INTO contacts (name, phone, type) VALUES (?,?,?)');
  let imported = 0, skipped = 0;
  for (const c of list) {
    const name = (c?.name || '').trim();
    const phone = (c?.phone || '').trim();
    if (!name || !phone) { skipped++; continue; }
    const result = ins.run(name, phone, c.type || 'individual');
    if (result.changes > 0) imported++; else skipped++;
  }
  res.json({ imported, skipped, total: list.length });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
