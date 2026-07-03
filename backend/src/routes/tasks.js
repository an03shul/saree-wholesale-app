const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notifyUser } = require('../services/pushNotify');

// All task routes require login.
router.use(requireAuth);

// Shared SELECT — joins the assignee, and any linked design/order so the card
// can show context ("Design 1234", "Order · Rajesh") without extra round-trips.
const TASK_SELECT = `
  SELECT t.*,
         u.username        AS assigned_to_name,
         d.design_number   AS design_number,
         d.photo_path      AS design_photo,
         o.customer_name   AS order_customer
  FROM tasks t
  LEFT JOIN users u   ON u.id = t.assigned_to
  LEFT JOIN designs d ON d.id = t.design_id
  LEFT JOIN orders o  ON o.id = t.order_id
`;

function getTask(id) {
  return db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
}

// GET /api/tasks — admin sees all; staff/staff2 see only their own.
router.get('/', (req, res) => {
  // Pending first, then by due date (soonest first, nulls last), then newest.
  const order = ` ORDER BY (t.status='done'),
    CASE WHEN t.status='done' THEN 1 WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
    t.due_date ASC, t.created_at DESC`;
  const rows = req.user.role === 'admin'
    ? db.prepare(`${TASK_SELECT}${order}`).all()
    : db.prepare(`${TASK_SELECT} WHERE t.assigned_to = ?${order}`).all(req.user.id);
  res.json(rows);
});

// POST /api/tasks (admin) — assign a task to a single user.
router.post('/', requireAdmin, (req, res) => {
  const { title, description, assigned_to, due_date, design_id, order_id } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required' });

  const assignee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(assigned_to);
  if (!assignee) return res.status(404).json({ error: 'Assignee not found' });

  const result = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, assigned_by, assigned_by_name, due_date, design_id, order_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    String(title).trim(), (description || '').trim() || null,
    assignee.id, req.user.id, req.user.username,
    due_date || null, design_id || null, order_id || null,
  );

  db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
    .run(req.user.id, req.user.username, 'Assigned task', `"${String(title).trim()}" → ${assignee.username}`);

  // Targeted push — only the assignee's devices, no-op if VAPID isn't configured.
  notifyUser(assignee.id, { title: 'New task assigned', body: String(title).trim(), url: '/' }).catch(() => {});

  res.status(201).json(getTask(result.lastInsertRowid));
});

// PUT /api/tasks/:id (admin) — edit / reassign an existing task.
router.put('/:id', requireAdmin, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, assigned_to, due_date, design_id, order_id } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required' });
  const assignee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(assigned_to);
  if (!assignee) return res.status(404).json({ error: 'Assignee not found' });

  const reassigned = task.assigned_to !== assignee.id;

  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, assigned_to = ?, due_date = ?, design_id = ?, order_id = ?
    WHERE id = ?
  `).run(
    String(title).trim(), (description || '').trim() || null, assignee.id,
    due_date || null, design_id || null, order_id || null, task.id,
  );

  db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
    .run(req.user.id, req.user.username, 'Edited task', `"${String(title).trim()}"${reassigned ? ` → ${assignee.username}` : ''}`);

  if (reassigned) {
    notifyUser(assignee.id, { title: 'Task assigned to you', body: String(title).trim(), url: '/' }).catch(() => {});
  }
  res.json(getTask(task.id));
});

// POST /api/tasks/:id/complete — mark done with an optional note.
// Allowed for the admin or the assignee.
router.post('/:id/complete', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role !== 'admin' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Not your task' });
  }

  const note = (req.body?.completion_note || '').trim() || null;
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, completion_note = ? WHERE id = ?")
    .run(new Date().toISOString(), note, task.id);
  res.json(getTask(task.id));
});

// PATCH /api/tasks/:id/reopen — back to pending, clears the completion record.
// Allowed for the admin or the assignee.
router.patch('/:id/reopen', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role !== 'admin' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Not your task' });
  }
  db.prepare("UPDATE tasks SET status = 'pending', completed_at = NULL, completion_note = NULL WHERE id = ?")
    .run(task.id);
  res.json(getTask(task.id));
});

// DELETE /api/tasks/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?,?,?,?)')
    .run(req.user.id, req.user.username, 'Deleted task', `"${task.title}"`);
  res.json({ success: true });
});

module.exports = router;
