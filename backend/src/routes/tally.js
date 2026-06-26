const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { getCustomers, getStockBalance, detectMode } = require('../services/tally');

// GET /api/tally/customers — fetch Sundry Debtors from Tally
router.get('/customers', async (req, res) => {
  const { customers, error } = await getCustomers();
  if (error) return res.status(503).json({ error });
  res.json(customers);
});

// GET /api/tally/status — check which mode is active
router.get('/status', async (req, res) => {
  const mode = await detectMode();
  res.json({ mode, available: !!mode });
});

// GET /api/tally/stock-stream?item_id=X  — SSE stream of stock for all designs of an item
// Sends one event per design as it's fetched from Tally, then a "done" event.
router.get('/stock-stream', async (req, res) => {
  const { item_id } = req.query;
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  const designs = db.prepare(
    'SELECT * FROM designs WHERE item_id = ? ORDER BY CAST(design_number AS INTEGER), design_number'
  ).all(item_id);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const mode = await detectMode();
  if (!mode) {
    send('error', { message: 'Tally is not reachable. Make sure Tally is open.' });
    res.end();
    return;
  }

  send('mode', { mode });

  let completed = 0;
  for (const d of designs) {
    if (res.writableEnded) break;

    let stock = null;
    if (d.tally_item_name) {
      stock = await getStockBalance(d.tally_item_name);
      // Cache in DB
      db.prepare(
        'UPDATE designs SET tally_stock_cache = ?, tally_stock_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(stock, d.id);
    }

    send('stock', { id: d.id, design_number: d.design_number, stock, tally_item_name: d.tally_item_name });
    completed++;
  }

  send('done', { total: completed });
  res.end();
});

module.exports = router;
