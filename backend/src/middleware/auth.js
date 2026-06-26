const db = require('../db/database');

const SESSION_DAYS = 30;

// In-memory rate limiter: max 5 failed attempts per IP per 15 minutes
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const max = 5;
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + window };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window; }
  if (entry.count >= max) return false;
  return true;
}
function recordFailedAttempt(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + window };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window; }
  entry.count++;
  loginAttempts.set(ip, entry);
}
function clearAttempts(ip) { loginAttempts.delete(ip); }

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  // Also accept token via query param (needed for EventSource/SSE which can't set headers)
  const queryToken = req.query.token;
  if (!header && !queryToken) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const token = queryToken || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const expiryCutoff = new Date(Date.now() - SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const session = db.prepare(`
    SELECT s.token, s.created_at, u.id, u.username, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created_at > ?
  `).get(token, expiryCutoff);
  if (!session) {
    // Clean up expired token if it exists
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  req.user = { id: session.id, username: session.username, role: session.role };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function logActivity(action, getDetails) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400 && req.user) {
        const details = typeof getDetails === 'function' ? getDetails(req, body) : getDetails;
        db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
          .run(req.user.id, req.user.username, action, details || null);
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { requireAuth, requireAdmin, logActivity, checkRateLimit, recordFailedAttempt, clearAttempts };
