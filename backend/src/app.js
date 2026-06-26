require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');

const { requireAuth } = require('./middleware/auth');

const app = express();

// CORS allowlist. In production set CORS_ORIGINS to a comma-separated list of
// allowed origins (e.g. "https://app.gopiramsaree.app"). If unset, allow all
// (fine for local LAN dev, not for production).
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true;
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // handle preflight for all routes
app.use(express.json());
app.use((req, res, next) => { console.log(`${req.method} ${req.path} auth:${!!req.headers.authorization}`); next(); });
const { UPLOADS_DIR } = require('./config/paths');
app.use('/uploads', express.static(UPLOADS_DIR));

// Public routes (no auth needed)
app.use('/api/auth', require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/catalog', require('./routes/catalog'));

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
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stats',    require('./routes/stats'));

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
