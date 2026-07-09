const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

const ROLES = ['admin', 'staff', 'staff2', 'accountant', 'manufacturer'];

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.role, u.brand_id, b.name AS brand_name, u.created_at
    FROM users u LEFT JOIN brands b ON b.id = u.brand_id ORDER BY u.created_at
  `).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', (req, res) => {
  const { username, pin, role } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Username and PIN required' });
  if (String(pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });

  try {
    const safeRole = ROLES.includes(role) ? role : 'staff';
    // brand_id only meaningful for manufacturers (they're scoped to one brand).
    const brand_id = safeRole === 'manufacturer' && req.body.brand_id ? Number(req.body.brand_id) : null;
    const result = db.prepare('INSERT INTO users (username, pin_hash, role, brand_id) VALUES (?,?,?,?)')
      .run(username.trim().toLowerCase(), hashPin(pin), safeRole, brand_id);
    db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
      .run(req.user.id, req.user.username, 'Added user', `username: ${username}, role: ${safeRole}`);
    res.status(201).json({ id: result.lastInsertRowid, username, role: safeRole, brand_id });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    throw e;
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
    .run(req.user.id, req.user.username, 'Removed user', `username: ${user.username}`);
  res.json({ success: true });
});

// POST /api/admin/users/:id/reset-pin
router.post('/users/:id/reset-pin', (req, res) => {
  const { new_pin } = req.body;
  if (!new_pin || String(new_pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(new_pin), req.params.id);
  db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
    .run(req.user.id, req.user.username, 'Reset PIN', `for user: ${user.username}`);
  res.json({ success: true });
});

// GET /api/admin/activity?limit=50
router.get('/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const logs = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(logs);
});

module.exports = router;
