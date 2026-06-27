const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/tally-sync — receives stock levels from the sync agent running on
// the shop's Tally PC. Authenticated with a shared secret in the X-Sync-Token
// header (this is a machine, not a logged-in user), so it lives OUTSIDE the
// normal user-auth guard.
router.post('/', express.json({ limit: '5mb' }), (req, res) => {
  const token = req.headers['x-sync-token'];
  if (!process.env.SYNC_AGENT_TOKEN || token !== process.env.SYNC_AGENT_TOKEN) {
    return res.status(401).json({ error: 'Invalid sync token' });
  }

  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

  try {
    // Ensure the table exists (defensive — in case the migration didn't run)
    db.exec(`CREATE TABLE IF NOT EXISTS tally_stock (
      tally_item_name TEXT PRIMARY KEY,
      qty REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const upsert = db.prepare(`
      INSERT INTO tally_stock (tally_item_name, qty, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tally_item_name) DO UPDATE SET qty = excluded.qty, updated_at = CURRENT_TIMESTAMP
    `);

    let received = 0, skipped = 0;
    // Wrap all upserts in one transaction → a single commit instead of thousands
    // (much faster, far less disk I/O and backup churn for big syncs).
    db.exec('BEGIN');
    try {
      for (const it of items) {
        const name = it && it.name != null ? String(it.name).trim() : '';
        if (!name) { skipped++; continue; }
        let qty = Number(it.qty);
        if (!Number.isFinite(qty)) qty = 0;
        try {
          upsert.run(name, qty);
          received++;
        } catch (rowErr) {
          skipped++; // one bad row shouldn't fail the whole sync
        }
      }
      db.exec('COMMIT');
    } catch (txErr) {
      try { db.exec('ROLLBACK'); } catch {}
      throw txErr;
    }

    // Optional: customers (Sundry Debtors) pushed in the same sync
    let customersReceived = 0;
    const customers = req.body.customers;
    if (Array.isArray(customers) && customers.length) {
      db.exec(`CREATE TABLE IF NOT EXISTS tally_customers (
        name TEXT PRIMARY KEY, phone TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      const upsertCust = db.prepare(`
        INSERT INTO tally_customers (name, phone, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO UPDATE SET phone = excluded.phone, updated_at = CURRENT_TIMESTAMP
      `);
      db.exec('BEGIN');
      try {
        for (const c of customers) {
          const name = c && c.name != null ? String(c.name).trim() : '';
          if (!name) continue;
          upsertCust.run(name, c.phone ? String(c.phone).trim() : null);
          customersReceived++;
        }
        db.exec('COMMIT');
      } catch (cErr) {
        try { db.exec('ROLLBACK'); } catch {}
      }
    }

    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('tally_last_sync', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(new Date().toISOString());

    res.json({ ok: true, received, skipped, customers: customersReceived });
  } catch (e) {
    console.error('tally-sync error:', e.message);
    res.status(500).json({ error: 'sync failed: ' + e.message });
  }
});

module.exports = router;
