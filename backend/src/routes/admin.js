const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notifyUser } = require('../services/pushNotify');

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

// GET /api/admin/manufacturer-notes — the full manufacturer↔admin chat, oldest
// first. The app groups these by brand_id into per-manufacturer threads.
router.get('/manufacturer-notes', (req, res) => {
  res.json(db.prepare(`
    SELECT n.id, n.body, n.created_at, n.brand_id, u.username, u.role AS sender_role, b.name AS brand_name
    FROM manufacturer_notes n
    JOIN users u ON u.id = n.user_id
    LEFT JOIN brands b ON b.id = n.brand_id
    ORDER BY n.created_at ASC
  `).all());
});

// POST /api/admin/manufacturer-notes { brand_id, body } — admin replies into a
// brand's thread (the manufacturer on that brand sees it).
router.post('/manufacturer-notes', (req, res) => {
  const brand_id = Number(req.body.brand_id) || null;
  const body = (req.body.body || '').trim();
  if (!brand_id) return res.status(400).json({ error: 'brand_id required' });
  if (!body) return res.status(400).json({ error: 'Message is required' });
  const r = db.prepare('INSERT INTO manufacturer_notes (user_id, brand_id, body) VALUES (?,?,?)')
    .run(req.user.id, brand_id, body);
  res.status(201).json(db.prepare('SELECT id, body, created_at, brand_id FROM manufacturer_notes WHERE id = ?').get(r.lastInsertRowid));
});

// ── Production requests (admin → manufacturer) ───────────────────────────────
const PR_SELECT = `
  SELECT pr.*, b.name AS brand_name, d.photo_path
  FROM production_requests pr
  LEFT JOIN brands b ON b.id = pr.brand_id
  LEFT JOIN designs d ON d.id = pr.design_id
`;

// GET /api/admin/production-requests — all requests, newest first.
router.get('/production-requests', (req, res) => {
  res.json(db.prepare(`${PR_SELECT} ORDER BY pr.created_at DESC`).all());
});

// POST /api/admin/production-requests { brand_id, design_id?, quantity, due_date?, note? }
router.post('/production-requests', (req, res) => {
  const brand_id = Number(req.body.brand_id) || null;
  if (!brand_id) return res.status(400).json({ error: 'brand_id required' });
  const quantity = Number(req.body.quantity) || null;
  const design_id = Number(req.body.design_id) || null;
  // Denormalize the design label so it survives even if the design is removed.
  let design_number = null, item_name = null;
  if (design_id) {
    const d = db.prepare('SELECT d.design_number, i.name AS item_name FROM designs d JOIN items i ON i.id = d.item_id WHERE d.id = ?').get(design_id);
    if (d) { design_number = d.design_number; item_name = d.item_name; }
  }
  const r = db.prepare(`INSERT INTO production_requests (brand_id, design_id, design_number, item_name, quantity, due_date, note, created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(brand_id, design_id, design_number, item_name, quantity, (req.body.due_date || '').trim() || null, (req.body.note || '').trim() || null, req.user.id);
  // Targeted push to that brand's manufacturer(s).
  const mfgs = db.prepare("SELECT id FROM users WHERE role='manufacturer' AND brand_id = ?").all(brand_id);
  const label = [item_name, design_number && `#${design_number}`].filter(Boolean).join(' ');
  for (const m of mfgs) notifyUser(m.id, { title: 'New production request', body: `${quantity ? quantity + ' pcs' : ''} ${label}`.trim() || 'Open the app for details', url: '/' }).catch(() => {});
  res.status(201).json(db.prepare(`${PR_SELECT} WHERE pr.id = ?`).get(r.lastInsertRowid));
});

// PATCH /api/admin/production-requests/:id — edit qty/due/note/status.
router.patch('/production-requests/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM production_requests WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const fields = [], args = [];
  if ('quantity' in req.body) { fields.push('quantity = ?'); args.push(Number(req.body.quantity) || null); }
  if ('due_date' in req.body) { fields.push('due_date = ?'); args.push((req.body.due_date || '').trim() || null); }
  if ('note' in req.body) { fields.push('note = ?'); args.push((req.body.note || '').trim() || null); }
  if ('status' in req.body) { fields.push('status = ?'); args.push(req.body.status); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  args.push(req.params.id);
  try { db.prepare(`UPDATE production_requests SET ${fields.join(', ')} WHERE id = ?`).run(...args); }
  catch (e) { return res.status(400).json({ error: 'Invalid update (' + e.message + ')' }); }
  res.json(db.prepare(`${PR_SELECT} WHERE pr.id = ?`).get(req.params.id));
});

// DELETE /api/admin/production-requests/:id
router.delete('/production-requests/:id', (req, res) => {
  db.prepare('DELETE FROM production_requests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Start of "today" in IST (shop time) as a UTC "YYYY-MM-DD HH:MM:SS" string, to
// compare against SQLite's UTC created_at. India has no DST → fixed +5:30.
function istDayStartUtc() {
  const IST = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST);
  const midnightIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  return new Date(midnightIst - IST).toISOString().slice(0, 19).replace('T', ' ');
}

// GET /api/admin/staff-activity — per non-admin user: last action time + today's action count
router.get('/staff-activity', (req, res) => {
  const todayStart = istDayStartUtc();
  const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // IST 'YYYY-MM-DD'
  const rows = db.prepare(`
    SELECT u.id, u.username, u.role,
      (SELECT MAX(created_at) FROM staff_activity sa WHERE sa.user_id = u.id) AS last_active,
      (SELECT COUNT(*) FROM staff_activity sa WHERE sa.user_id = u.id AND sa.created_at >= ?) AS actions_today,
      (SELECT a.checked_in_at FROM attendance a WHERE a.user_id = u.id AND a.date = ?) AS checkin_today
    FROM users u
    -- Manufacturers are remote (Surat) — no attendance/check-in, so keep them out
    -- of the staff activity + attendance dashboard.
    WHERE u.role NOT IN ('admin', 'manufacturer')
    ORDER BY last_active DESC
  `).all(todayStart, istDate);
  res.json(rows);
});

// GET /api/admin/staff-activity/:userId — that user's actions today (feed)
router.get('/staff-activity/:userId', (req, res) => {
  const rows = db.prepare(`
    SELECT id, action, created_at FROM staff_activity
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC LIMIT 200
  `).all(req.params.userId, istDayStartUtc());
  res.json(rows);
});

module.exports = router;
