const router      = require('express').Router();
const multer      = require('multer');
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

// Files are stored as bytea in Postgres (not on local disk) — Railway's
// container filesystem is ephemeral, so anything written to disk is lost
// on the next deploy/restart. The DB is the only thing that persists.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// multer reports errors (e.g. file too large) via next(err) — without this
// wrapper Express falls through to its default HTML error page instead of JSON.
function uploadSingle(req, res, next) {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ data: null, error: err.message || 'Upload failed' });
    next();
  });
}

router.use(requireAuth);

router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, task_id, filename, mime_type, size_bytes, created_at
       FROM task_attachments WHERE task_id=$1 ORDER BY created_at ASC`,
      [req.params.taskId]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/tasks/:taskId', uploadSingle, async (req, res) => {
  if (!req.file) return res.status(400).json({ data: null, error: 'No file uploaded' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO task_attachments (task_id, filename, mime_type, size_bytes, data, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, task_id, filename, mime_type, size_bytes, created_at`,
      [req.params.taskId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.id]
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT filename, mime_type, data FROM task_attachments WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: 'Not found' });
    const a = rows[0];
    res.setHeader('Content-Type', a.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.filename)}"`);
    res.send(a.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM task_attachments WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
