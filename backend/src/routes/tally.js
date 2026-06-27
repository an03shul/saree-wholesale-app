const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { getCustomers, getStockBalance, detectMode } = require('../services/tally');

// GET /api/tally/customers — Sundry Debtors synced from the shop PC by the agent
router.get('/customers', (req, res) => {
  const rows = db.prepare('SELECT name, phone FROM tally_customers ORDER BY name').all();
  if (!rows.length) {
    return res.status(503).json({ error: 'No customers synced yet. Make sure the sync agent is running on the shop PC.' });
  }
  res.json(rows.map(r => ({ name: r.name, phone: r.phone || '', raw_phone: r.phone || '' })));
});

// GET /api/tally/status — when the sync agent last pushed stock from the shop PC
router.get('/status', (req, res) => {
  const lastSync = db.prepare("SELECT value FROM settings WHERE key='tally_last_sync'").get()?.value || null;
  const count = db.prepare('SELECT COUNT(*) AS c FROM tally_stock').get().c;
  res.json({ synced: !!lastSync, last_sync: lastSync, item_count: count });
});

// GET /api/tally/stock-stream?item_id=X — stream cached stock for each design of
// an item. Reads from the tally_stock cache (kept fresh by the shop-PC agent),
// so it works from the cloud and returns instantly.
router.get('/stock-stream', (req, res) => {
  const { item_id } = req.query;
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  const designs = db.prepare(
    'SELECT * FROM designs WHERE item_id = ? ORDER BY CAST(design_number AS INTEGER), design_number'
  ).all(item_id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const lastSync = db.prepare("SELECT value FROM settings WHERE key='tally_last_sync'").get()?.value || null;
  const totalStock = db.prepare('SELECT COUNT(*) AS c FROM tally_stock').get().c;

  if (!lastSync && totalStock === 0) {
    send('error', { message: 'Tally stock has not synced yet. Make sure the sync agent is running on the shop PC.' });
    res.end();
    return;
  }

  send('mode', { mode: 'agent', last_sync: lastSync });

  const lookup = db.prepare('SELECT qty FROM tally_stock WHERE tally_item_name = ?');
  let completed = 0;
  for (const d of designs) {
    if (res.writableEnded) break;
    let stock = null;
    if (d.tally_item_name) {
      const row = lookup.get(d.tally_item_name);
      stock = row ? row.qty : null;
    }
    send('stock', { id: d.id, design_number: d.design_number, stock, tally_item_name: d.tally_item_name });
    completed++;
  }

  send('done', { total: completed, last_sync: lastSync });
  res.end();
});

module.exports = router;
