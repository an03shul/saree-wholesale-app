/**
 * Attendance / geo check-in — verification notes + runnable self-check.
 *
 * Run:  cd backend && node test/attendance.verify.js
 * (No test runner is configured for this repo; this is a standalone assert-based
 *  script. It uses a throwaway temp DB and never touches the real gopiram.db.)
 *
 * What it verifies (the deployed logic in src/routes/attendance.js):
 *   1. Geofence maths (Haversine) — same point = 0m; distances are sane.
 *   2. Check-in FROM THE SHOP is accepted (200) and recorded with GPS + IST date.
 *   3. Within the radius is accepted; outside is rejected (403) with distance.
 *   4. Missing GPS is rejected (400).
 *   5. One check-in per staff per IST day (idempotent; keeps the first).
 *   6. GET /today reflects the check-in.
 *   7. The monthly report is admin-only (staff → 403, admin → 200).
 *
 * Shop location + radius come from src/routes/attendance.js (env-overridable via
 * SHOP_LAT / SHOP_LNG / SHOP_RADIUS_M; defaults = Gwalior storefront, 100m).
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(os.tmpdir(), `attendance-verify-${Date.now()}.db`);

const db = require('../src/db/database');
const att = require('../src/routes/attendance');
const S = att.SHOP; // { lat, lng, radius }

const northMeters = (m) => m / 111320; // metres -> Δlatitude

const uid = db.prepare("INSERT INTO users (username,pin_hash,role) VALUES ('ramesh','x','staff')").run().lastInsertRowid;

// 1. Geofence maths
assert.equal(att.distanceMeters(S.lat, S.lng, S.lat, S.lng), 0, 'same point = 0m');
assert.ok(att.distanceMeters(S.lat + northMeters(50), S.lng, S.lat, S.lng) < S.radius, '50m is inside the radius');
assert.ok(att.distanceMeters(S.lat + northMeters(150), S.lng, S.lat, S.lng) > S.radius, '150m is outside the radius');
console.log(`✓ geofence maths (shop ${S.lat},${S.lng} · radius ${S.radius}m)`);

// Minimal app that injects an authenticated user, so we exercise the real routes.
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { id: uid, role: req.headers['x-role'] || 'staff' }; next(); });
app.use('/api/attendance', att);

const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const req = (method, path, body, role) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ port, path, method, headers: { 'Content-Type': 'application/json', 'x-role': role || 'staff', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve({ status: resp.statusCode, body: JSON.parse(b || '{}') })); });
    if (data) r.write(data); r.end();
  });

  try {
    // 2 & 3. Check-in from the shop, within radius, outside radius
    let r = await req('POST', '/api/attendance/checkin', { lat: S.lat, lng: S.lng });
    assert.equal(r.status, 200, 'at-shop check-in accepted'); assert.ok(r.body.checked_in_at, 'record created');
    console.log(`✓ check-in from the shop → 200 (recorded ${r.body.checked_in_at})`);

    r = await req('POST', '/api/attendance/checkin', { lat: S.lat + northMeters(50), lng: S.lng });
    assert.equal(r.status, 200, '50m accepted');
    console.log('✓ 50m from shop → 200 (within radius)');

    r = await req('POST', '/api/attendance/checkin', { lat: S.lat + northMeters(150), lng: S.lng });
    assert.equal(r.status, 403, '150m rejected'); assert.match(r.body.error, /from the shop/);
    console.log(`✓ 150m from shop → 403 ("${r.body.error}")`);

    // 4. Missing GPS
    r = await req('POST', '/api/attendance/checkin', {});
    assert.equal(r.status, 400, 'missing location rejected');
    console.log('✓ missing GPS → 400');

    // 5. Idempotent one-per-day (keeps first check-in coords)
    const rows = db.prepare('SELECT * FROM attendance WHERE user_id = ?').all(uid);
    assert.equal(rows.length, 1, 'one check-in row per day');
    assert.equal(rows[0].lat, S.lat, 'kept the first check-in coords');
    console.log('✓ idempotent: one check-in per IST day, first one kept');

    // 6. GET /today
    r = await req('GET', '/api/attendance/today');
    assert.equal(r.body.checked_in, true, 'today reflects the check-in');
    console.log('✓ GET /today → checked_in: true');

    // 7. Monthly report is admin-only
    r = await req('GET', '/api/attendance/month', null, 'staff');
    assert.equal(r.status, 403, 'staff blocked from month report');
    r = await req('GET', '/api/attendance/month', null, 'admin');
    assert.equal(r.status, 200, 'admin gets month report'); assert.ok(Array.isArray(r.body.rows));
    console.log('✓ monthly report admin-only (staff → 403, admin → 200)');

    console.log('\nALL PASS — attendance check-in verified.');
  } catch (e) {
    console.error('\nFAIL:', e.message); process.exitCode = 1;
  } finally {
    srv.close();
    try { require('fs').unlinkSync(process.env.DB_PATH); } catch {}
  }
});
