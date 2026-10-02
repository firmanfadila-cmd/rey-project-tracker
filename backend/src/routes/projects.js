const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// The PM field stays free text (many real team members have no login here),
// but when it exactly matches a registered user's name we link pm_user_id so
// that person can be notified — same name-matching approach as @mentions.
async function findUserIdByName(name) {
  if (!name) return null;
  const { rows } = await pool.query('SELECT id FROM users WHERE lower(name) = lower($1) LIMIT 1', [name.trim()]);
  return rows.length ? rows[0].id : null;
}

async function notifyPmAssigned(projectId, pmUserId, actorId) {
  if (!pmUserId || pmUserId === actorId) return;
  await pool.query(
    `INSERT INTO notifications (recipient_id, actor_id, type, project_id)
     VALUES ($1,$2,'project_pm_assigned',$3)`,
    [pmUserId, actorId, projectId]
  );
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
        (SELECT count(*) FROM issues i
         WHERE i.project_id = p.id AND i.status IN ('Open','In Progress'))::int AS open_issues_count
       FROM projects p
       ORDER BY p.updated_at DESC`
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const { client, project, sub, product, status, phase, pm, revenue, next, remarks,
          plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline,
          is_live, go_live_date } = req.body;
  if (!client || !project) {
    return res.status(400).json({ data: null, error: 'client and project are required' });
  }
  try {
    const pmUserId = await findUserIdByName(pm);
    const { rows } = await pool.query(
      `INSERT INTO projects
        (client, project, sub, product, status, phase, pm, pm_user_id, revenue, next, remarks,
         plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline,
         is_live, go_live_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [client, project, sub||null, product||null, status||'active', phase||null,
       pm||null, pmUserId, revenue||null, next||null, remarks||null,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null,
       mono||null, mono_color||null, badge||null, deadline||null,
       !!is_live, go_live_date||null, req.user.id]
    );
    await notifyPmAssigned(rows[0].id, pmUserId, req.user.id);
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  const { client, project, sub, product, status, phase, pm, revenue, next, remarks,
          plan_start, plan_end, actual_start, actual_end, mono, mono_color, badge, deadline,
          is_live, go_live_date } = req.body;
  try {
    const { rows: before } = await pool.query('SELECT pm_user_id FROM projects WHERE id=$1', [req.params.id]);
    if (!before.length) return res.status(404).json({ data: null, error: 'Not found' });
    const pmUserId = await findUserIdByName(pm);

    const { rows } = await pool.query(
      `UPDATE projects SET
        client=$1, project=$2, sub=$3, product=$4, status=$5, phase=$6,
        pm=$7, pm_user_id=$8, revenue=$9, next=$10, remarks=$11,
        plan_start=$12, plan_end=$13, actual_start=$14, actual_end=$15,
        mono=$16, mono_color=$17, badge=$18, deadline=$19,
        is_live=$20, go_live_date=$21, updated_at=now()
       WHERE id=$22 RETURNING *`,
      [client, project, sub||null, product||null, status||'active', phase||null,
       pm||null, pmUserId, revenue||null, next||null, remarks||null,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null,
       mono||null, mono_color||null, badge||null, deadline||null,
       !!is_live, go_live_date||null, req.params.id]
    );
    if (pmUserId && pmUserId !== before[0].pm_user_id) {
      await notifyPmAssigned(req.params.id, pmUserId, req.user.id);
    }
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
  const { name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks, parent_id } = req.body;
  if (!name) return res.status(400).json({ data: null, error: 'name is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks
        (project_id, name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks, parent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, name, status||'not-started', progress||0,
       plan_start||null, plan_end||null, actual_start||null, actual_end||null, remarks||null, parent_id||null]
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.get('/:id/issues', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, u.name AS reporter_name,
        (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id)::int AS comment_count
       FROM issues i
       LEFT JOIN users u ON u.id = i.reporter
       WHERE i.project_id=$1
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/:id/issues', async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ data: null, error: 'title is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO issues (project_id, title, description, status, reporter)
       VALUES ($1,$2,$3,'Open',$4) RETURNING *`,
      [req.params.id, title, description || null, req.user.id]
    );
    const { rows: withReporter } = await pool.query(
      `SELECT i.*, u.name AS reporter_name, 0 AS comment_count
       FROM issues i LEFT JOIN users u ON u.id=i.reporter WHERE i.id=$1`,
      [rows[0].id]
    );
    res.status(201).json({ data: withReporter[0], error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
