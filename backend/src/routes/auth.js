const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth, checkRateLimit, recordFailedAttempt, clearAttempts } = require('../middleware/auth');

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Username and PIN required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || user.pin_hash !== hashPin(pin)) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Wrong username or PIN' });
  }

  clearAttempts(ip);
  // Staff (staff and staff2) can only be logged in on one device at a time — a
  // new login silently invalidates any older sessions. Admins keep unlimited
  // concurrent sessions.
  if (user.role !== 'admin') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  }
  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, user.id);
  db.prepare('INSERT INTO activity_log (user_id, username, action) VALUES (?,?,?)').run(user.id, user.username, 'Logged in');

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'].slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  db.prepare('INSERT INTO activity_log (user_id, username, action) VALUES (?,?,?)').run(req.user.id, req.user.username, 'Logged out');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-pin  (change own PIN)
router.post('/change-pin', requireAuth, (req, res) => {
  const { current_pin, new_pin } = req.body;
  if (!current_pin || !new_pin) return res.status(400).json({ error: 'current_pin and new_pin required' });
  if (String(new_pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.pin_hash !== hashPin(current_pin)) return res.status(401).json({ error: 'Current PIN is wrong' });

  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(new_pin), req.user.id);
  db.prepare('INSERT INTO activity_log (user_id, username, action) VALUES (?,?,?)').run(req.user.id, req.user.username, 'Changed PIN');
  res.json({ success: true });
});

module.exports = router;
