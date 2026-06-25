const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const { client, project, sub, product, status, phase, pm, revenue, next, remarks,
          plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline } = req.body;
  if (!client || !project) {
    return res.status(400).json({ data: null, error: 'client and project are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects
        (client, project, sub, product, status, phase, pm, revenue, next, remarks,
         plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [client, project, sub||null, product||null, status||'active', phase||null,
       pm||null, revenue||null, next||null, remarks||null,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null,
       mono||null, mono_color||null, badge||null, deadline||null, req.user.id]
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { client, project, sub, product, status, phase, pm, revenue, next, remarks,
          plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE projects SET
        client=$1, project=$2, sub=$3, product=$4, status=$5, phase=$6,
        pm=$7, revenue=$8, next=$9, remarks=$10,
        plan_start=$11, plan_end=$12, actual_start=$13, actual_end=$14,
        mono=$15, mono_color=$16, badge=$17, deadline=$18, updated_at=now()
       WHERE id=$19 RETURNING *`,
      [client, project, sub||null, product||null, status||'active', phase||null,
       pm||null, revenue||null, next||null, remarks||null,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null,
       mono||null, mono_color||null, badge||null, deadline||null, req.params.id]
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
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.get('/:id/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tasks WHERE project_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/:id/tasks', async (req, res) => {
  const { name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks } = req.body;
  if (!name) return res.status(400).json({ data: null, error: 'name is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks
        (project_id, name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, name, status||'not-started', progress||0,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null, remarks||null]
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
