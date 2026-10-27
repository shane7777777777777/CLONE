# Phoenix Plans & Takeoffs

Isolated companion for marking up plan PDFs, taking explicit measurements, and keeping task notes on the same job. It is not part of the REA runtime and it does not connect to Phoenix Hub.

Synthetic data only. The sample job is "Job 100 — Yard office" for a fictional customer, Northwind Fabrication.

## Run

Requirements: Node.js 22.19 or newer. This packet was built and tested with Node.js 22.23.4.

```bash
cd projects/phoenix-plans-takeoffs
npm ci
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:4173 . Choose **Open synthetic sample**.

`npm run dev` serves the same app with the TypeScript source. `npm run demo` drives the synthetic project in headless Chrome and writes `handoff/screenshots/`. The preview server must already be running for the demo script.

## What it does

Import a multipage PDF, page through it, zoom and pan, draw ink, marker, lines, rectangles, ellipses, and notes, undo and redo, save in this browser, export an annotated PDF, and reopen. Calibrate each page from a known length. Measure distance, counts, and area. Capture tasks with a date, flag, priority, tags, subtasks, and a link to a revision page.

The editable copy is the project record. Export adds PDF annotations and embeds that record. It does not replace the pristine PDF and it does not flatten.

## Limits

Desktop Chrome is what was exercised. iPad and Apple Pencil acceptance is pending. There is no Reminders sync, no notification, no pricing, and no Hub login. Details are in `docs/limits.md` and `handoff/`.
