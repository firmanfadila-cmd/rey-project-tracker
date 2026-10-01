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

const ATTACHMENTS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', a.id, 'kind', a.kind, 'filename', a.filename,
      'mime_type', a.mime_type, 'size_bytes', a.size_bytes,
      'url', a.url, 'label', a.label, 'created_at', a.created_at
    ) ORDER BY a.created_at ASC)
    FROM issue_comment_attachments a WHERE a.comment_id = c.id
  ), '[]'::json) AS attachments`;

router.get('/:id/comments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS author_name, ${ATTACHMENTS_SUBQUERY}
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

// Matches "@Name" substrings against real user names rather than a generic
// word-boundary regex, since display names can contain spaces (e.g.
// "@Firman Fadila") that a \w-based mention regex would cut short.
async function extractMentionedUserIds(body, excludeUserId) {
  const { rows: users } = await pool.query('SELECT id, name FROM users');
  const lowerBody = body.toLowerCase();
  const matched = new Set();
  users
    .sort((a, b) => b.name.length - a.name.length)
    .forEach(u => {
      if (u.id === excludeUserId) return;
      if (lowerBody.includes('@' + u.name.toLowerCase())) matched.add(u.id);
    });
  return [...matched];
}

router.post('/:id/comments', async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ data: null, error: 'body is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO issue_comments (issue_id, author, body)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, body.trim()]
    );
    const comment = rows[0];

    const mentionedIds = await extractMentionedUserIds(comment.body, req.user.id);
    for (const recipientId of mentionedIds) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, issue_id, comment_id)
         VALUES ($1,$2,'issue_mention',$3,$4)`,
        [recipientId, req.user.id, req.params.id, comment.id]
      );
    }

    const { rows: withAuthor } = await pool.query(
      `SELECT c.*, u.name AS author_name, ${ATTACHMENTS_SUBQUERY}
       FROM issue_comments c LEFT JOIN users u ON u.id=c.author WHERE c.id=$1`,
      [comment.id]
    );
    res.status(201).json({ data: withAuthor[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
