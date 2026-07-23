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
 *   8. Admin override: mark present (admin-only, no future dates, non-staff blocked);
 *      unmark removes a manual day but can NOT erase a geo-verified check-in.
 *   9. Accountants are on-site staff: their check-in works and shows in the report.
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
const acctId = db.prepare("INSERT INTO users (username,pin_hash,role) VALUES ('meena','x','accountant')").run().lastInsertRowid;

// 1. Geofence maths
assert.equal(att.distanceMeters(S.lat, S.lng, S.lat, S.lng), 0, 'same point = 0m');
assert.ok(att.distanceMeters(S.lat + northMeters(50), S.lng, S.lat, S.lng) < S.radius, '50m is inside the radius');
assert.ok(att.distanceMeters(S.lat + northMeters(150), S.lng, S.lat, S.lng) > S.radius, '150m is outside the radius');
console.log(`✓ geofence maths (shop ${S.lat},${S.lng} · radius ${S.radius}m)`);

// Minimal app that injects an authenticated user, so we exercise the real routes.
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { id: Number(req.headers['x-uid']) || uid, role: req.headers['x-role'] || 'staff' }; next(); });
app.use('/api/attendance', att);

const srv = app.listen(0, async () => {
  const port = srv.address().port;
  const req = (method, path, body, role, asUid) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ port, path, method, headers: { 'Content-Type': 'application/json', 'x-role': role || 'staff', ...(asUid ? { 'x-uid': String(asUid) } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
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

    // 8. Admin override — manual mark (no geo), staff blocked, future blocked,
    //    unmark removes a manual day, and a geo-verified check-in can't be erased.
    const istNow = Date.now() + 5.5 * 3600 * 1000;
    const yesterday = new Date(istNow - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(istNow + 86400000).toISOString().slice(0, 10);

    r = await req('POST', '/api/attendance/admin-mark', { user_id: uid, date: yesterday }, 'admin');
    assert.equal(r.status, 200, 'admin can mark present');
    const mrow = db.prepare('SELECT lat FROM attendance WHERE user_id = ? AND date = ?').get(uid, yesterday);
    assert.ok(mrow && mrow.lat === null, 'manual mark has NULL lat (not geo)');
    console.log('✓ admin manual mark → present, no geo (lat NULL)');

    r = await req('POST', '/api/attendance/admin-mark', { user_id: uid, date: yesterday }, 'staff');
    assert.equal(r.status, 403, 'staff blocked from admin-mark');
    console.log('✓ staff blocked from admin-mark → 403');

    r = await req('POST', '/api/attendance/admin-mark', { user_id: uid, date: tomorrow }, 'admin');
    assert.equal(r.status, 400, 'future date rejected');
    console.log('✓ future date rejected → 400');

    r = await req('DELETE', '/api/attendance/admin-mark', { user_id: uid, date: yesterday }, 'admin');
    assert.equal(r.body.removed, 1, 'manual mark removed');
    console.log('✓ admin unmark removes the manual day');

    const shopDate = db.prepare('SELECT date FROM attendance WHERE user_id = ? AND lat IS NOT NULL').get(uid).date;
    r = await req('DELETE', '/api/attendance/admin-mark', { user_id: uid, date: shopDate }, 'admin');
    assert.equal(r.body.removed, 0, 'geo-verified not removable via unmark');
    assert.ok(db.prepare('SELECT 1 FROM attendance WHERE user_id = ? AND date = ?').get(uid, shopDate), 'verified row intact');
    console.log('✓ geo-verified check-in cannot be erased by unmark');

    // 9. Accountants are on-site staff too — check-in works and they appear in
    //    the monthly report (manufacturer, being remote, is excluded elsewhere).
    r = await req('POST', '/api/attendance/checkin', { lat: S.lat, lng: S.lng }, 'accountant', acctId);
    assert.equal(r.status, 200, 'accountant at-shop check-in accepted');
    r = await req('GET', '/api/attendance/today', null, 'accountant', acctId);
    assert.equal(r.body.checked_in, true, 'accountant today reflects check-in');
    r = await req('GET', '/api/attendance/month', null, 'admin');
    assert.ok(r.body.rows.some(x => x.username === 'meena' && x.date), 'accountant present-day in month report');
    console.log('✓ accountant check-in from shop → 200 and appears in the report');

    console.log('\nALL PASS — attendance check-in + admin override + accountant verified.');
  } catch (e) {
    console.error('\nFAIL:', e.message); process.exitCode = 1;
  } finally {
    srv.close();
    try { require('fs').unlinkSync(process.env.DB_PATH); } catch {}
  }
});
