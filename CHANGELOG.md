# Changelog

All notable changes to REY Project Tracker are documented here.

## [Unreleased]

### Fixed
- **Plan start/end dates saved as "Invalid Date".** Postgres `DATE` columns were parsed into JS `Date` objects by the `pg` driver, then serialized to UTC timestamps in API responses (e.g. `2026-08-01` → `2026-07-31T17:00:00.000Z` at UTC+7). The frontend expected plain `YYYY-MM-DD` strings, so date parsing broke. Fixed by keeping `DATE` columns as raw strings via a `pg` type parser override (`backend/src/db/pool.js`).

### Added
- Admin user management — list, create, and delete team accounts from a "Manage Users" panel (admin-only, JWT-gated).
- Subtasks, file attachments, go-live tracking, and monthly revenue entry APIs.
- Subtask plan-date validation — warns (non-blocking) when a subtask's dates fall outside its parent task's plan range.
- Task card UI and rey.id-branded visual redesign (navy `#0d1b2a` / blue `#4da3ff`).
