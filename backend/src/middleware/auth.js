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
    SELECT s.token, s.created_at, u.id, u.username, u.role, u.brand_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created_at > ?
  `).get(token, expiryCutoff);
  if (!session) {
    // Clean up expired token if it exists
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  req.user = { id: session.id, username: session.username, role: session.role, brand_id: session.brand_id };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Allow any of the given roles (admin is NOT implied — pass it explicitly if wanted).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  };
}

// Human label for a mutating request, from its method + path.
// ponytail: heuristic map covering the main staff work-actions; anything
// unmapped falls back to a readable "<verb> <resource>". Extend the map, not
// every route.
function describeAction(method, urlPath) {
  const parts = urlPath.replace(/^\/api\//, '').split('/').filter(Boolean);
  const resource = parts[0] || '';
  const tail = parts.slice(1).find((s) => !/^\d+$/.test(s)); // first non-id sub-path, e.g. "status", "stock"
  const key = [method, resource, tail].filter(Boolean).join(' ');
  const MAP = {
    'POST designs': 'Added a design', 'PUT designs': 'Edited a design', 'DELETE designs': 'Deleted a design', 'PATCH designs stock': 'Changed stock',
    'POST items': 'Added an item', 'PUT items': 'Edited an item', 'DELETE items': 'Deleted an item', 'PATCH items stock': 'Changed stock',
    'POST brands': 'Added a brand', 'PUT brands': 'Edited a brand', 'DELETE brands': 'Deleted a brand',
    'POST orders': 'Created an order', 'PATCH orders status': 'Updated an order', 'DELETE orders': 'Deleted an order',
    'POST contacts': 'Added a contact', 'PUT contacts': 'Edited a contact', 'DELETE contacts': 'Deleted a contact', 'POST contacts import': 'Imported contacts',
    'POST send': 'Sent a catalog', 'POST send selected': 'Sent a catalog',
    'POST identify': 'Identified a saree',
    'POST files': 'Uploaded a document', 'PUT files': 'Renamed a document', 'DELETE files': 'Deleted a document',
    'POST tasks': 'Assigned a task', 'POST tasks complete': 'Completed a task', 'PATCH tasks reopen': 'Reopened a task', 'PUT tasks': 'Edited a task', 'DELETE tasks': 'Deleted a task',
  };
  if (MAP[key]) return MAP[key];
  const verb = { POST: 'Added', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' }[method] || method;
  return `${verb} ${resource}${tail ? ' (' + tail + ')' : ''}`.trim();
}

// Records one row per successful mutating request into staff_activity for the
// admin "Staff Activity" dashboard. Uses res.on('finish') so it fires exactly
// once regardless of how many auth middlewares ran, and reads req.user after
// routing. GETs (incl. the app's 30s background poll) are ignored, so the
// signal reflects real work — not merely having the app open on Instagram.
function trackStaffActivity(req, res, next) {
  res.on('finish', () => {
    try {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      if (res.statusCode >= 400 || !req.user) return;
      const path = (req.originalUrl || '').split('?')[0];
      if (!path.startsWith('/api/')) return;
      const resource = path.replace(/^\/api\//, '').split('/')[0];
      if (resource === 'auth' || resource === 'push' || resource === 'admin') return; // login/logout, subscriptions, owner housekeeping — not shop work
      db.prepare('INSERT INTO staff_activity (user_id, action) VALUES (?,?)')
        .run(req.user.id, describeAction(req.method, path));
    } catch { /* never let tracking break a response */ }
  });
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

module.exports = { requireAuth, requireAdmin, requireRole, logActivity, trackStaffActivity, describeAction, checkRateLimit, recordFailedAttempt, clearAttempts };
