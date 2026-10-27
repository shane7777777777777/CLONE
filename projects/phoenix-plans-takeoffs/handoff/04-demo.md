# 4. Demo

Command: `node scripts/demo.mjs` while `npm run preview` is serving http://127.0.0.1:4173.

Result on 2026-10-27: printed `demo-ok`. Chrome 156.0.8078.47, headless, 1280×860. One browser profile for both tabs.

The script opens the synthetic sample, draws a pen stroke, calibrates the 360 pt scale bar as 30 ft, measures the 120 pt line, adds a task due today, reloads, adds `mixed-pages.pdf` as Rev B, checks Rev A still has the 10 ft row, then saves a second tab against a stale generation.

Screenshots:

- `screenshots/01-library.png` — empty library.
- `screenshots/02-sample-sheet.png` — uncalibrated sheet and the linked sample task.
- `screenshots/03-markup-takeoff-tasks.png` — pen stroke, scale bar, 10 ft distance, square, tasks.
- `screenshots/04-reopened.png` — after reload.
- `screenshots/05-revision-kept.png` — Rev B added, Rev A still present.
- `screenshots/06-conflict.png` — Conflict banner, stored copy not overwritten.

This is a desktop demo. It is not the iPad script.
