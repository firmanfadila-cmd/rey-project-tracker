const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.type, n.read, n.created_at,
        n.issue_id, i.title AS issue_title, i.project_id,
        p.client AS project_client, p.project AS project_name,
        n.comment_id, c.body AS comment_body,
        u.name AS actor_name
       FROM notifications n
       LEFT JOIN issues i ON i.id = n.issue_id
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN issue_comments c ON c.id = n.comment_id
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.recipient_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read=true WHERE id=$1 AND recipient_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ data: { read: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET read=true WHERE recipient_id=$1 AND read=false`, [req.user.id]);
    res.json({ data: { read: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
