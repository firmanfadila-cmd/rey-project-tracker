const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/projects/:projectId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM project_revenue WHERE project_id=$1 ORDER BY month ASC',
      [req.params.projectId]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

// One row per (project, month) — posting the same month again updates it,
// so the frontend can use a single "save" action for both add and edit.
router.post('/projects/:projectId', async (req, res) => {
  const { month, potential_revenue, actual_revenue, notes } = req.body;
  if (!month) return res.status(400).json({ data: null, error: 'month is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO project_revenue (project_id, month, potential_revenue, actual_revenue, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, month) DO UPDATE SET
         potential_revenue = EXCLUDED.potential_revenue,
         actual_revenue    = EXCLUDED.actual_revenue,
         notes             = EXCLUDED.notes,
         updated_at        = now()
       RETURNING *`,
      [req.params.projectId, month, potential_revenue || null, actual_revenue || null, notes || null]
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM project_revenue WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
