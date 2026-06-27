const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { getStockForDesigns } = require('../services/tally');
const { sendDesignUpdates } = require('../services/whatsapp');

// Send all in-stock designs of an item to a recipient
router.post('/', async (req, res) => {
  const { item_id, recipient } = req.body;
  if (!item_id || !recipient) return res.status(400).json({ error: 'item_id and recipient are required' });

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!item.in_stock) return res.json({ sent: 0, message: 'This item is marked out of stock' });

  let designs = db.prepare('SELECT * FROM designs WHERE item_id = ? AND in_stock = 1 ORDER BY design_number').all(item_id);

  // enrich with Tally stock
  designs = await getStockForDesigns(designs);

  // filter out designs with 0 stock (only filter if Tally is reachable i.e. stock !== null)
  const toSend = designs.filter(d => d.stock === null || d.stock > 0);
  if (toSend.length === 0) return res.json({ sent: 0, message: 'All designs are out of stock' });

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await sendDesignUpdates(toSend.map(d => ({ ...d, item_name: item.name })), recipient, baseUrl);
    res.json({ sent: toSend.length, skipped: designs.length - toSend.length });
  } catch (e) {
    console.error('WhatsApp send failed:', e.response?.data || e.message);
    res.status(502).json({ error: 'Could not send via WhatsApp. Check the WhatsApp setup and try again.' });
  }
});

// Send specific selected designs to a recipient
router.post('/selected', async (req, res) => {
  const { design_ids, recipient } = req.body;
  if (!design_ids?.length || !recipient) return res.status(400).json({ error: 'design_ids and recipient are required' });

  const placeholders = design_ids.map(() => '?').join(',');
  let designs = db.prepare(`SELECT d.*, i.name as item_name FROM designs d JOIN items i ON i.id = d.item_id WHERE d.id IN (${placeholders}) AND d.in_stock = 1 AND i.in_stock = 1`).all(...design_ids);
  if (!designs.length) return res.status(404).json({ error: 'No designs found or all are out of stock' });

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await sendDesignUpdates(designs, recipient, baseUrl);
    res.json({ sent: designs.length });
  } catch (e) {
    console.error('WhatsApp send failed:', e.response?.data || e.message);
    res.status(502).json({ error: 'Could not send via WhatsApp. Check the WhatsApp setup and try again.' });
  }
});

// Filtered preview across a whole brand (all items) — by price range, work category, fabric type
router.get('/filter/:brandId', async (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.brandId);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const { min_rate, max_rate, work_categories, fabric_types, in_stock_only } = req.query;

  const conditions = ['i.brand_id = ?'];
  const params = [brand.id];

  if (min_rate) { conditions.push('d.rate >= ?'); params.push(parseFloat(min_rate)); }
  if (max_rate) { conditions.push('d.rate <= ?'); params.push(parseFloat(max_rate)); }

  if (work_categories) {
    const cats = work_categories.split(',').filter(Boolean);
    if (cats.length) {
      conditions.push(`d.work_category IN (${cats.map(() => '?').join(',')})`);
      params.push(...cats);
    }
  }
  if (fabric_types) {
    const fabs = fabric_types.split(',').filter(Boolean);
    if (fabs.length) {
      conditions.push(`d.fabric_type IN (${fabs.map(() => '?').join(',')})`);
      params.push(...fabs);
    }
  }
  if (in_stock_only === 'true') {
    conditions.push('d.in_stock = 1 AND i.in_stock = 1');
  }

  const designs = db.prepare(`
    SELECT d.*, i.name AS item_name, b.name AS brand_name
    FROM designs d
    JOIN items i ON i.id = d.item_id
    JOIN brands b ON b.id = i.brand_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY d.rate, CAST(d.design_number AS INTEGER), d.design_number
  `).all(...params);

  res.json({ brand, count: designs.length, designs });
});

// Preview: get in-stock designs without sending
router.get('/preview/:itemId', async (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let designs = db.prepare('SELECT * FROM designs WHERE item_id = ? ORDER BY CAST(design_number AS INTEGER), design_number').all(item.id);
  designs = await getStockForDesigns(designs);

  res.json({
    item,
    designs: designs.map(d => ({
      ...d,
      in_stock: d.in_stock !== 0 && (d.stock === null || d.stock > 0)
    }))
  });
});

module.exports = router;
