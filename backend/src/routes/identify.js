const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { identifyDesign } = require('../services/identify');
const { TEMP_UPLOADS_DIR } = require('../config/paths');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = TEMP_UPLOADS_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `mystery-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const photoPath = req.file.path;
  try {
    const result = await identifyDesign(photoPath);
    res.json(result);
  } catch (e) {
    console.error('Identify error:', e);
    res.status(500).json({ error: e.message || 'Identification failed' });
  } finally {
    // Clean up temp file
    fs.unlink(photoPath, () => {});
  }
});

module.exports = router;
