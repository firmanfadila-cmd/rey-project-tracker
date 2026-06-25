# REY Project Tracker

Production-grade business development portfolio dashboard for PT Vertika Technologies Nusantara. Multi-device, team-accessible, backed by PostgreSQL.

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT (24h expiry) + bcrypt |
| Frontend | Vanilla JS SPA (no build tools) |
| Fonts | Outfit + Space Mono (Google Fonts) |
| Deploy | Railway |

## Features

- **Login** — JWT-based auth, admin/member roles, no self-registration
- **Project cards** — status badges (Hot / Active / POC / V2 / Done), PM, revenue, progress
- **Detail view** — task table, Gantt chart, editable timeline and project info
- **Task management** — add/edit/delete tasks with plan dates, actual dates, progress %, status, remarks
- **Gantt chart** — plan vs actual bars with today line
- **Filter bar** — filter by product line (Olvo Claims, Olvo UW, Platform) or status
- **Team access** — all data persisted in PostgreSQL, shared across devices and users

## Project Structure

```
rey-project-tracker/
├── backend/
│   ├── src/
│   │   ├── index.js              Express entry point
│   │   ├── routes/
│   │   │   ├── auth.js           POST /api/auth/login
│   │   │   ├── projects.js       GET/POST/PUT/DELETE /api/projects
│   │   │   └── tasks.js          PUT/DELETE /api/tasks
│   │   ├── middleware/
│   │   │   └── auth.js           JWT verification
│   │   └── db/
│   │       ├── pool.js           Postgres connection pool
│   │       ├── migrate.js        Schema migration + admin seed
│   │       ├── seed_import.js    One-time import from localStorage
│   │       └── migrations/
│   │           └── 001_init.sql  users, projects, tasks schema
│   └── package.json
├── frontend/
│   ├── index.html                Login page
│   ├── dashboard.html            Project tracker SPA
│   └── assets/
│       ├── style.css             REY design system (navy #090f18, blue #4da3ff)
│       └── app.js                All frontend logic
└── railway.toml                  Railway deploy config
```

## Local Development

**Prerequisites:** Node.js, PostgreSQL running locally.

```bash
# 1. Create local database
createdb rey_project_tracker

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit DATABASE_URL, JWT_SECRET in backend/.env

# 3. Install dependencies
cd backend && npm install

# 4. Run migrations (creates tables + seeds admin account)
npm run migrate

# 5. Start server
npm start
# → http://localhost:3000
```

Default admin credentials: `admin@rey.id` / `Admin@Rey2026` — change after first login.

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random secret for signing JWTs (min 32 chars) |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` or `production` |

## Deploy to Railway

1. Push repo to GitHub
2. New Railway project → **Deploy from GitHub repo**
3. Add **Postgres** addon → `DATABASE_URL` is auto-injected
4. Set `JWT_SECRET` in Railway environment variables
5. Run migration once via Railway shell:
   ```bash
   npm run migrate
   ```

## Data Migration from Old Dashboard

If you have existing data in the old `localStorage`-based dashboard:

```js
// Run in browser console on the old dashboard:
copy(localStorage.getItem('rey_projects_v4'))
```

Paste the output into `data/projects.json`, then:

```bash
node backend/src/db/seed_import.js
```

## API Reference

All endpoints require `Authorization: Bearer <token>` except login.

```
POST   /api/auth/login              Login → { token, user }

GET    /api/projects                List all projects
POST   /api/projects                Create project
PUT    /api/projects/:id            Update project
DELETE /api/projects/:id            Delete project (admin only)

GET    /api/projects/:id/tasks      List tasks for a project
POST   /api/projects/:id/tasks      Create task
PUT    /api/tasks/:id               Update task
DELETE /api/tasks/:id               Delete task
```

## Design Tokens

| Token | Value |
|---|---|
| Navy | `#090f18` |
| Blue accent | `#4da3ff` |
| Hot / Urgent | `#ff6b6b` |
| Done / Green | `#2dd4a7` |
| POC / Yellow | `#ffd166` |
| V2 / Purple | `#b594f8` |
