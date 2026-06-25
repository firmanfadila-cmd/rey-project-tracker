/**
 * One-time migration: import existing localStorage data into the database.
 *
 * Usage:
 *   1. In your browser console on the old dashboard, run:
 *      copy(localStorage.getItem('rey_projects_v4'))
 *   2. Paste into a file: data/projects.json
 *   3. Run: node backend/src/db/seed_import.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

const FILE = path.join(__dirname, '../../../data/projects.json');

async function run() {
  if (!fs.existsSync(FILE)) {
    console.error(`File not found: ${FILE}`);
    console.error('Export localStorage first: copy(localStorage.getItem("rey_projects_v4"))');
    process.exit(1);
  }

  const projects = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { rows: [admin] } = await pool.query(`SELECT id FROM users WHERE role='admin' LIMIT 1`);

  for (const p of projects) {
    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects
        (client, project, sub, product, status, phase, pm, revenue, next, remarks,
         plan_start, plan_end, actual_start, actual_end, mono, mono_color, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT DO NOTHING RETURNING id`,
      [p.client, p.project, p.sub||null, p.product||null, p.status||'active',
       p.phase||null, p.pm||null, p.revenue||null, p.next||null, p.remarks||null,
       p.planStart||null, p.planEnd||null, p.actualStart||null, p.actualEnd||null,
       p.mono||null, p.monoColor||null, admin?.id||null]
    );
    if (!proj) { console.log(`Skipped (already exists): ${p.client} — ${p.project}`); continue; }

    if (p.tasks && p.tasks.length) {
      for (const t of p.tasks) {
        await pool.query(
          `INSERT INTO tasks
            (project_id, name, status, progress, plan_start, plan_end, actual_start, actual_end, remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [proj.id, t.name, t.status||'not-started', t.progress||0,
           t.planStart||null, t.planEnd||null, t.actualStart||null, t.actualEnd||null, t.remarks||null]
        );
      }
    }
    console.log(`Imported: ${p.client} — ${p.project} (${p.tasks?.length||0} tasks)`);
  }

  console.log('Done.');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
