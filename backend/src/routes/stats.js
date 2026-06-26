const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const brands   = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
  const items    = db.prepare('SELECT COUNT(*) as c FROM items').get().c;
  const designs  = db.prepare('SELECT COUNT(*) as c FROM designs').get().c;
  const pending  = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'").get().c;
  res.json({ brands, items, designs, pending_orders: pending });
});

module.exports = router;
