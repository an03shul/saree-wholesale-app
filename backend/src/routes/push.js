const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Public key for the frontend to subscribe with
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// Resolve the logged-in user from the Bearer token, if present. This route is
// mounted publicly (before requireAuth) so we can't rely on req.user — but the
// PWA does send its auth header, letting us tie the subscription to the user so
// task assignments can target just their devices.
function userIdFromToken(req) {
  const header = req.headers['authorization'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  return row?.user_id || null;
}

// Store a push subscription (called by the PWA after permission granted)
router.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }
  const userId = userIdFromToken(req);
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh, auth = excluded.auth,
      user_id = COALESCE(excluded.user_id, push_subscriptions.user_id)
  `).run(endpoint, keys.p256dh, keys.auth, userId);
  res.json({ success: true });
});

// Remove a subscription (called on logout or permission revoke)
router.delete('/subscribe', (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ success: true });
});

module.exports = router;
