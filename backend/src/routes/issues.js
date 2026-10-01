const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const VALID_STATUS = ['Open', 'In Progress', 'Resolved', 'Closed'];

router.put('/:id', async (req, res) => {
  const { title, description, status } = req.body;
  if (!title) return res.status(400).json({ data: null, error: 'title is required' });
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ data: null, error: 'invalid status' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE issues SET
        title=$1, description=$2, status=$3, updated_at=now()
       WHERE id=$4 RETURNING *`,
      [title, description || null, status || 'Open', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: 'Not found' });
    res.json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ data: null, error: 'Admin only' });
  }
  try {
    await pool.query('DELETE FROM issues WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS author_name
       FROM issue_comments c
       LEFT JOIN users u ON u.id = c.author
       WHERE c.issue_id=$1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/:id/comments', async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ data: null, error: 'body is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO issue_comments (issue_id, author, body)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, body.trim()]
    );
    const { rows: withAuthor } = await pool.query(
      `SELECT c.*, u.name AS author_name FROM issue_comments c LEFT JOIN users u ON u.id=c.author WHERE c.id=$1`,
      [rows[0].id]
    );
    res.status(201).json({ data: withAuthor[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
