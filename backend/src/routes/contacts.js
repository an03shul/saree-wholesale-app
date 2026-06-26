const express = require('express');
const router = express.Router();
const db = require('../db/database');

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

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
