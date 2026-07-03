const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.put('/:id', async (req, res) => {
  const { name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks, parent_id } = req.body;
  if (!name) return res.status(400).json({ data: null, error: 'name is required' });
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET
        name=$1, status=$2, progress=$3, plan_start=$4, plan_end=$5,
        actual_start=$6, actual_end=$7, remarks=$8, parent_id=$9, updated_at=now()
       WHERE id=$10 RETURNING *`,
      [name, status||'not-started', progress||0,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null,
       remarks||null, parent_id||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ data: null, error: 'Not found' });
    res.json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
