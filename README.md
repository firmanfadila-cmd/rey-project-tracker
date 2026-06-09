# REY Project Tracker

Internal business development portfolio dashboard for PT Vertika Technologies Nusantara.

## Overview

Single-file vanilla HTML/CSS/JS dashboard. No build tools, no npm, no framework. Open `index.html` directly in any modern browser.

## Features

- **Project cards** — status badges (Hot / Active / POC / V2 / Done), PM, revenue, progress
- **Full-page detail view** — click any card for task table, Gantt chart, and editable timeline
- **Task management** — add/edit/delete tasks with plan dates, actual dates, day counts, progress %, status, and remarks
- **Gantt chart** — per-project pure CSS chart with plan vs actual bars and today line
- **Persistent state** — all data (tasks, timelines, new projects) saved to `localStorage`
- **New project modal** — add projects from the dashboard with full date and metadata fields
- **Filter bar** — filter by product line (Olvo Claims, Olvo UW, Platform) or status

## Usage

```bash
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

Or host on any static file server / GitHub Pages.

## Data

SEED data (10 active projects) is embedded in `index.html`. Changes made in the browser persist via `localStorage` key `rey_projects_v3`. The SEED serves as the default state — localStorage wins for any project already saved.

## Tech Stack

| Layer | Choice |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, Grid, Flexbox) |
| Logic | Vanilla ES6+ JS |
| Persistence | `localStorage` |
| Fonts | Google Fonts (Outfit + Space Mono) |

## Design Tokens

| Token | Value |
|---|---|
| Navy | `#090f18` |
| Blue accent | `#4da3ff` |
| Hot/Urgent | `#ff6b6b` |
| Done/Green | `#2dd4a7` |
| Warning/POC | `#ffd166` |
| V2/Purple | `#b594f8` |
