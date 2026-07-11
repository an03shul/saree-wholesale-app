const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/database');
const storage = require('../services/storage');
const { requireAuth, requireAdmin, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

const SELECT = `
  SELECT f.*, b.name AS brand_name, u.username AS uploaded_by_name
  FROM files f
  LEFT JOIN brands b ON b.id = f.brand_id
  LEFT JOIN users u ON u.id = f.uploaded_by
`;

// POST /api/files — upload any doc type (admin/accountant) or invoice/orderform (manufacturer).
router.post('/', requireRole('admin', 'accountant', 'manufacturer'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });
  let { type, label } = req.body;
  let brand_id = req.body.brand_id ? Number(req.body.brand_id) : null;

  // Role decides what a user may upload and for whom.
  if (req.user.role === 'manufacturer') {
    if (!['invoice', 'orderform'].includes(type)) return res.status(400).json({ error: 'type must be invoice or orderform' });
    brand_id = req.user.brand_id; // locked to their own brand
    if (!brand_id) return res.status(400).json({ error: 'Your account is not linked to a brand' });
  } else if (!['discount', 'invoice', 'orderform'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const path = storage.generateKey(req.file.originalname || 'doc');
  await storage.putFile(path, req.file.buffer);
  const r = db.prepare('INSERT INTO files (type, brand_id, label, path, uploaded_by) VALUES (?,?,?,?,?)')
    .run(type, brand_id, (label || '').trim() || null, path, req.user.id);
  res.status(201).json(db.prepare(`${SELECT} WHERE f.id = ?`).get(r.lastInsertRowid));
});

// GET /api/files?type=&brand_id= — admin/accountant see all; manufacturer sees own brand only.
router.get('/', requireRole('admin', 'accountant', 'manufacturer'), (req, res) => {
  const where = [], args = [];
  if (req.user.role === 'manufacturer') { where.push('f.brand_id = ?'); args.push(req.user.brand_id); }
  else if (req.query.brand_id) { where.push('f.brand_id = ?'); args.push(Number(req.query.brand_id)); }
  if (req.query.type) { where.push('f.type = ?'); args.push(req.query.type); }
  const sql = `${SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY f.created_at DESC`;
  res.json(db.prepare(sql).all(...args));
});

// GET /api/files/:id/download — auth-gated stream (financial docs stay off public /uploads).
router.get('/:id/download', requireRole('admin', 'accountant', 'manufacturer'), async (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'manufacturer' && f.brand_id !== req.user.brand_id) return res.status(403).json({ error: 'Not allowed' });
  const buf = await storage.getFile(f.path);
  if (!buf) return res.status(404).json({ error: 'File missing' });
  res.set('Content-Type', storage.contentTypeFor(f.path));
  res.set('Content-Disposition', `attachment; filename="${(f.label || f.type)}${require('path').extname(f.path)}"`);
  res.send(buf);
});

// DELETE /api/files/:id — admin only.
router.delete('/:id', requireAdmin, async (req, res) => {
  const f = db.prepare('SELECT path FROM files WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  await storage.deleteFile(f.path);
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
