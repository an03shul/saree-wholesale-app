const express = require('express');
const router = express.Router();
const db = require('../db/database');

// POST /api/tally-sync — receives stock (and optionally customers) from the sync
// agent on the shop's Tally PC. Authenticated with a shared secret in the
// X-Sync-Token header (a machine, not a logged-in user), so it lives OUTSIDE
// the normal user-auth guard.
//
// Backward compatible with the original agent (which sends only
// { items:[{name,qty}], customers:[{name,phone}] }) AND the incremental agent,
// which additionally sends per-row value/units/alter_id, customer balance, and a
// `meta` block describing the sync (mode, company, Tally AlterID watermarks).
//
// Incremental semantics:
//   • meta.mode === 'full'  → the payload is the COMPLETE set; stock rows missing
//     from it are deleted (this is how deletions in Tally propagate).
//   • otherwise (incremental) → upsert only; untouched rows are left alone, and a
//     section the agent skipped (no items) is not cleared. Omitted enriched fields
//     never overwrite a previously-synced value.
router.post('/', express.json({ limit: '8mb' }), (req, res) => {
  const token = req.headers['x-sync-token'];
  if (!process.env.SYNC_AGENT_TOKEN || token !== process.env.SYNC_AGENT_TOKEN) {
    return res.status(401).json({ error: 'Invalid sync token' });
  }

  const meta = (req.body.meta && typeof req.body.meta === 'object') ? req.body.meta : {};
  // Only the incremental agent's EXPLICIT full resync is authoritative enough to
  // delete missing rows. The legacy agent (no meta) stays upsert-only — a
  // transient partial read must never wipe stock.
  const isFull = meta.mode === 'full';
  const items = req.body.items;
  const customers = req.body.customers;
  // A heartbeat/skip cycle may legitimately carry no items — only reject a
  // malformed (present but non-array) items field.
  if (items != null && !Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }

  try {
    // Defensive: ensure table + optional columns exist even if a migration lagged.
    db.exec(`CREATE TABLE IF NOT EXISTS tally_stock (
      tally_item_name TEXT PRIMARY KEY, qty REAL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const col of ['value REAL', 'units TEXT', 'alter_id INTEGER']) {
      try { db.exec(`ALTER TABLE tally_stock ADD COLUMN ${col}`); } catch {}
    }

    // COALESCE(excluded.x, existing.x): an omitted enriched field keeps its prior
    // value instead of being wiped by a lean payload.
    const upsert = db.prepare(`
      INSERT INTO tally_stock (tally_item_name, qty, value, units, alter_id, updated_at)
      VALUES (@name, @qty, @value, @units, @alter_id, CURRENT_TIMESTAMP)
      ON CONFLICT(tally_item_name) DO UPDATE SET
        qty = excluded.qty,
        value = COALESCE(excluded.value, tally_stock.value),
        units = COALESCE(excluded.units, tally_stock.units),
        alter_id = COALESCE(excluded.alter_id, tally_stock.alter_id),
        updated_at = CURRENT_TIMESTAMP
    `);

    let received = 0, skipped = 0, deleted = 0;
    const seen = new Set();
    if (Array.isArray(items) && (items.length || isFull)) {
      db.exec('BEGIN');
      try {
        for (const it of items) {
          const name = it && it.name != null ? String(it.name).trim() : '';
          if (!name) { skipped++; continue; }
          let qty = Number(it.qty); if (!Number.isFinite(qty)) qty = 0;
          const value = Number.isFinite(Number(it.value)) ? Number(it.value) : null;
          const alter_id = Number.isFinite(Number(it.alter_id)) ? Number(it.alter_id) : null;
          const units = it.units != null ? (String(it.units).trim() || null) : null;
          try { upsert.run({ name, qty, value, units, alter_id }); received++; seen.add(name); }
          catch { skipped++; }
        }
        // Full sync is authoritative → drop stock rows no longer present in Tally.
        if (isFull) {
          for (const r of db.prepare('SELECT tally_item_name FROM tally_stock').all()) {
            if (!seen.has(r.tally_item_name)) {
              db.prepare('DELETE FROM tally_stock WHERE tally_item_name = ?').run(r.tally_item_name);
              deleted++;
            }
          }
        }
        db.exec('COMMIT');
      } catch (txErr) { try { db.exec('ROLLBACK'); } catch {} throw txErr; }
    }

    // Customers (Sundry Debtors), optional, same rules.
    let customersReceived = 0;
    if (Array.isArray(customers) && customers.length) {
      db.exec(`CREATE TABLE IF NOT EXISTS tally_customers (
        name TEXT PRIMARY KEY, phone TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      try { db.exec('ALTER TABLE tally_customers ADD COLUMN balance REAL'); } catch {}
      const upsertCust = db.prepare(`
        INSERT INTO tally_customers (name, phone, balance, updated_at)
        VALUES (@name, @phone, @balance, CURRENT_TIMESTAMP)
        ON CONFLICT(name) DO UPDATE SET
          phone = COALESCE(excluded.phone, tally_customers.phone),
          balance = COALESCE(excluded.balance, tally_customers.balance),
          updated_at = CURRENT_TIMESTAMP
      `);
      db.exec('BEGIN');
      try {
        for (const c of customers) {
          const name = c && c.name != null ? String(c.name).trim() : '';
          if (!name) continue;
          const balance = Number.isFinite(Number(c.balance)) ? Number(c.balance) : null;
          upsertCust.run({ name, phone: c.phone ? String(c.phone).trim() : null, balance });
          customersReceived++;
        }
        db.exec('COMMIT');
      } catch { try { db.exec('ROLLBACK'); } catch {} }
    }

    // Persist sync status + Tally AlterID watermarks so the app can show sync
    // health and the agent can resume incrementally after a restart.
    const setSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    const now = new Date().toISOString();
    setSetting.run('tally_last_sync', now);
    const status = {
      last_sync: now,
      mode: meta.mode || 'full',
      company: meta.company || null,
      last_alter_master: meta.lastAlterIdMaster ?? null,
      last_alter_voucher: meta.lastAlterIdVoucher ?? null,
      agent_version: meta.agentVersion || null,
      stock_synced: received,
      stock_deleted: deleted,
      customers_synced: customersReceived,
      stock_total: db.prepare('SELECT COUNT(*) c FROM tally_stock').get().c,
    };
    setSetting.run('tally_sync_status', JSON.stringify(status));

    res.json({ ok: true, received, skipped, deleted, customers: customersReceived, mode: status.mode });
  } catch (e) {
    console.error('tally-sync error:', e.message);
    res.status(500).json({ error: 'sync failed: ' + e.message });
  }
});

module.exports = router;
