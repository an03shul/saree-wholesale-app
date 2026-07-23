const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Shop location for the geofence. Defaults to the Gopiram Sarees storefront
// (Naya Bazaar, Gwalior — same pin as the landing-page map). Override per-shop
// with SHOP_LAT / SHOP_LNG / SHOP_RADIUS_M env vars.
const SHOP_LAT = parseFloat(process.env.SHOP_LAT || '26.1948327');
const SHOP_LNG = parseFloat(process.env.SHOP_LNG || '78.1557818');
// ponytail: 100m tolerates normal GPS drift (indoors it's worse) without letting
// someone check in from home. Tighten via SHOP_RADIUS_M once you see real spread.
const SHOP_RADIUS_M = parseInt(process.env.SHOP_RADIUS_M || '100', 10);

// IST shop calendar date 'YYYY-MM-DD' (India = UTC+5:30, no DST).
function istToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// Haversine distance in metres between two lat/lng points.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// POST /api/attendance/checkin { lat, lng } — mark the current user present today.
// Geo-verified and idempotent (one row per user per IST day; re-taps keep the
// first check-in). Rejects if the phone is outside the shop radius.
router.post('/checkin', (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Location required to check in. Enable location and try again.' });
  }
  const distance = distanceMeters(lat, lng, SHOP_LAT, SHOP_LNG);
  if (distance > SHOP_RADIUS_M) {
    return res.status(403).json({ error: `You appear to be ${distance}m from the shop. Check in from inside the shop.`, distance });
  }
  const date = istToday();
  db.prepare('INSERT OR IGNORE INTO attendance (user_id, date, lat, lng) VALUES (?,?,?,?)')
    .run(req.user.id, date, lat, lng);
  const row = db.prepare('SELECT date, checked_in_at FROM attendance WHERE user_id = ? AND date = ?')
    .get(req.user.id, date);
  res.json({ ...row, distance });
});

// GET /api/attendance/today — current user's check-in status for today.
router.get('/today', (req, res) => {
  const row = db.prepare('SELECT date, checked_in_at FROM attendance WHERE user_id = ? AND date = ?')
    .get(req.user.id, istToday());
  res.json({ checked_in: !!row, checked_in_at: row?.checked_in_at || null });
});

// GET /api/attendance/month?month=YYYY-MM — admin-only monthly report (all
// non-admin staff, one row per present day; null date = never present that month).
router.get('/month', requireAdmin, (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : istToday().slice(0, 7);
  const rows = db.prepare(`
    SELECT u.id AS user_id, u.username, a.date, a.checked_in_at, a.lat
    FROM users u
    LEFT JOIN attendance a ON a.user_id = u.id AND a.date LIKE ?
    WHERE u.role IN ('staff','staff2')
    ORDER BY u.username, a.date
  `).all(month + '-%');
  res.json({ month, rows });
});

// POST /api/attendance/admin-mark { user_id, date } — admin marks a staff present
// for a day (e.g. their phone can't do GPS). No geo: lat/lng stay NULL, which is
// how a manual mark is told apart from a real geo-verified check-in.
router.post('/admin-mark', requireAdmin, (req, res) => {
  const userId = Number(req.body?.user_id);
  const date = String(req.body?.date || '');
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'user_id and date (YYYY-MM-DD) required' });
  }
  if (date > istToday()) return res.status(400).json({ error: 'Cannot mark a future date' });
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (!u || !['staff', 'staff2'].includes(u.role)) return res.status(400).json({ error: 'Not a staff user' });
  db.prepare('INSERT OR IGNORE INTO attendance (user_id, date) VALUES (?,?)').run(userId, date);
  res.json({ success: true, user_id: userId, date });
});

// DELETE /api/attendance/admin-mark { user_id, date } — admin removes a MANUAL
// mark only. Geo-verified check-ins (lat NOT NULL) can't be erased this way, so
// the real attendance record stays trustworthy.
router.delete('/admin-mark', requireAdmin, (req, res) => {
  const userId = Number(req.body?.user_id);
  const date = String(req.body?.date || '');
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'user_id and date required' });
  }
  const r = db.prepare('DELETE FROM attendance WHERE user_id = ? AND date = ? AND lat IS NULL').run(userId, date);
  res.json({ success: true, removed: r.changes });
});

module.exports = router;
module.exports.distanceMeters = distanceMeters; // exported for tests
module.exports.SHOP = { lat: SHOP_LAT, lng: SHOP_LNG, radius: SHOP_RADIUS_M };
