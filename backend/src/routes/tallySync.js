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

  const upsert = db.prepare(`
    INSERT INTO tally_stock (tally_item_name, qty, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tally_item_name) DO UPDATE SET qty = excluded.qty, updated_at = CURRENT_TIMESTAMP
  `);

  let received = 0;
  for (const it of items) {
    if (!it || !it.name) continue;
    upsert.run(String(it.name).trim(), Number(it.qty) || 0);
    received++;
  }

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('tally_last_sync', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(new Date().toISOString());

  res.json({ ok: true, received });
});

module.exports = router;
