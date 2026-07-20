const router      = require('express').Router();
const bcrypt      = require('bcrypt');
const pool        = require('../db/pool');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ data: null, error: 'Admin only' });
  next();
}

// Lightweight, non-admin-gated listing for @mention autocomplete — name only,
// no email/role/password, available to any authenticated user.
router.get('/mentionable', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM users ORDER BY name ASC');
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { email, name, password, role } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ data: null, error: 'Email, name, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ data: null, error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), name, hash, role === 'admin' ? 'admin' : 'member']
    );
    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    if (err.code === '23505') { // unique_violation on email
      return res.status(409).json({ data: null, error: 'A user with that email already exists' });
    }
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ data: null, error: 'You cannot delete your own account' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ data: null, error: 'Server error' });
  }
});

module.exports = router;
