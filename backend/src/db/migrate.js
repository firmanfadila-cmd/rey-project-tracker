require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');
const pool   = require('./pool');

async function migrate() {
  const sql1 = fs.readFileSync(path.join(__dirname, 'migrations/001_init.sql'), 'utf8');
  await pool.query(sql1);
  const sql2 = fs.readFileSync(path.join(__dirname, 'migrations/002_add_badge_deadline.sql'), 'utf8');
  await pool.query(sql2);
  const sql3 = fs.readFileSync(path.join(__dirname, 'migrations/003_add_task_parent.sql'), 'utf8');
  await pool.query(sql3);
  const sql4 = fs.readFileSync(path.join(__dirname, 'migrations/004_add_task_attachments.sql'), 'utf8');
  await pool.query(sql4);
  const sql5 = fs.readFileSync(path.join(__dirname, 'migrations/005_add_project_go_live.sql'), 'utf8');
  await pool.query(sql5);
  const sql6 = fs.readFileSync(path.join(__dirname, 'migrations/006_add_project_revenue.sql'), 'utf8');
  await pool.query(sql6);
  const sql7 = fs.readFileSync(path.join(__dirname, 'migrations/007_add_issues.sql'), 'utf8');
  await pool.query(sql7);
  console.log('Schema migrated.');

  const hash = await bcrypt.hash('Admin@Rey2026', 10);
  await pool.query(
    `INSERT INTO users (email, name, password, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    ['admin@rey.id', 'Admin', hash]
  );
  console.log('Admin user seeded: admin@rey.id / Admin@Rey2026');
  await pool.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
