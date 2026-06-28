require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');

const { requireAuth } = require('./middleware/auth');

const app = express();

// CORS. CORS_ORIGINS is an optional comma-separated list of extra allowed
// origins. On top of that list we always allow:
//   • the gopiramsarees.in domain and its subdomains (the production app)
//   • the Cloudflare Pages project (gopiram-app.pages.dev + preview deploys)
//   • all origins when no list is configured (local LAN dev)
const corsAllowlist = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : null;

function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser clients / same-origin
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (corsAllowlist && corsAllowlist.includes(origin)) return true;
  if (host === 'gopiramsarees.in' || host.endsWith('.gopiramsarees.in')) return true;
  if (host === 'gopiram-app.pages.dev' || host.endsWith('.gopiram-app.pages.dev')) return true;
  if (!corsAllowlist) return true; // dev: no list → allow all
  return false;
}

app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // handle preflight for all routes
app.use(express.json({ limit: '15mb' })); // generous limit for large Tally stock syncs
app.use((req, res, next) => { console.log(`${req.method} ${req.path} auth:${!!req.headers.authorization}`); next(); });
// Serve images from storage (R2 in prod, disk in dev). Handles originals and the
// cached wm/ and thumb/ derivatives. e.g. /uploads/x.jpg, /uploads/wm/x.jpg
const storage = require('./services/storage');
const { getThumbBuffer } = require('./services/thumbnail');
app.get('/uploads/*', async (req, res) => {
  try {
    const key = req.params[0]; // e.g. "x.jpg" or "wm/x.jpg"
    const buf = await storage.getFile(key);
    if (!buf) return res.status(404).end();
    res.set('Content-Type', storage.contentTypeFor(key));
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    res.status(404).end();
  }
});

// Small resized thumbnails for fast in-app display (generated + cached on demand)
app.get('/thumb/:name', async (req, res) => {
  try {
    const buf = await getThumbBuffer(req.params.name);
    if (!buf) return res.status(404).end();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    res.status(404).end();
  }
});

// Public routes (no auth needed)
app.use('/api/auth', require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/catalog', require('./routes/catalog'));
app.use('/api/push', require('./routes/push'));
app.use('/api/orders', require('./routes/orders')); // public POST for catalog orders
// Tally sync agent endpoint — authenticated by its own X-Sync-Token (machine, not user)
app.use('/api/tally-sync', require('./routes/tallySync'));

// All routes below require login
app.use('/api', requireAuth);

app.use('/api/brands',  require('./routes/brands'));
app.use('/api/fabrics', require('./routes/fabrics'));
app.use('/api/work-categories', require('./routes/workCategories'));
app.use('/api/items',   require('./routes/items'));
app.use('/api/designs', require('./routes/designs'));
app.use('/api/contacts',require('./routes/contacts'));
app.use('/api/send',    require('./routes/send'));
app.use('/api/tally',   require('./routes/tally'));
app.use('/api/pdf',     require('./routes/pdf'));
app.use('/api/identify',require('./routes/identify'));
app.use('/api/import',  require('./routes/import'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stats',    require('./routes/stats'));

// Global error handler — any error passed to next(err) or thrown in a handler
// returns a clean 500 instead of hanging the request.
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', req.method, req.path, '-', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Last-resort process guards — log and stay alive instead of crashing the whole
// server because of one bad request or a flaky external call (Tally, WhatsApp).
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err?.message || err);
});

const PORT = process.env.PORT || 3000;

// In production (cloud hosts like Railway/Render), TLS is terminated by the
// platform's load balancer, so the app serves plain HTTP behind it. Locally we
// use the self-signed HTTPS certs so the iPhone can connect over the LAN.
//
// Set SERVE_HTTP=true on the cloud host. Cert paths can be overridden with
// TLS_CERT_PATH / TLS_KEY_PATH (default to the local mkcert files).
const serveHttp = process.env.SERVE_HTTP === 'true';
const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, '../192.168.29.187+2.pem');
const keyPath  = process.env.TLS_KEY_PATH  || path.join(__dirname, '../192.168.29.187+2-key.pem');

if (!serveHttp && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
  };
  https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Gopiram Saree backend running on HTTPS port ${PORT}`);
  });
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gopiram Saree backend running on HTTP port ${PORT}${serveHttp ? ' (TLS terminated upstream)' : ''}`);
  });
}
