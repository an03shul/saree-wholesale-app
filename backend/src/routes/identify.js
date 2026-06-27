const express = require('express');
const router = express.Router();
const multer = require('multer');
const { identifyDesign } = require('../services/identify');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  try {
    const result = await identifyDesign(req.file.buffer, req.file.mimetype);
    res.json(result);
  } catch (e) {
    console.error('Identify error:', e);
    res.status(500).json({ error: e.message || 'Identification failed' });
  }
});

module.exports = router;
