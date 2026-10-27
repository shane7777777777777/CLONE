# Ledger

## Objective

A small Phoenix Plans & Takeoffs companion: plan PDFs, annotation, explicit takeoff, and reminder-style tasks on the same project. A written boundary for a future Phoenix Hub host. Not a general productivity suite.

## Source revisions

- Remote starting revision: `d2a3269d0c1007e16a2f84d44cc0b1503debb2ae` (`main`, 2026-10-20).
- Shane's local checkout at `/Users/shanewarehime/Developer/github/CLONE` was not inspected. Uncommitted work there is unknown.
- Branch: `cursor/phoenix-plans-takeoffs-b9f4`.
- The delivered commit is the tip of that branch. `handoff/02-revision.md` names the implementation commit.

## Decisions

- Web app, not SwiftUI. This host is Linux and cannot compile or run an iPad app. A native PDFKit/PencilKit app would be an unverified claim.
- pdf.js 4.10.38 (Apache-2.0) draws pages. pdf-lib 1.17.1 (MIT) writes annotation objects and a JSON sidecar. The sidecar is the editable model. Page annotations are a visual copy.
- Coordinates are PDF user space, origin bottom-left. Zoom changes the viewport, not the stored points.
- Calibration is stored per revision and page. A new revision does not copy it. Screen pixels are never a construction length.
- Tasks live on the project. Today includes overdue. Upcoming is later only. Completing a parent does not complete subtasks.
- Save uses a generation counter. A stale save becomes a visible conflict and leaves the stored copy in place. A failed save leaves the previous commit in place.
- No Phoenix Hub identity, grant, or audit system is invented here.

## Evidence

- `npm test`: 11 tests passed on Node.js 22.23.4 (2026-10-27).
- `node scripts/demo.mjs` against `vite preview` and Chrome 156: `demo-ok`. Screenshots in `handoff/screenshots/`.
- REA doctor and a public-page browser capture: `evidence/rea/`. PDF Expert was not opened as a binary.

## Known defects

- Some PDF text runs render with overlapping glyphs in pdf.js. The synthetic label used for the demo is legible. Geometry is vector data and is what the measurements use.
- File inputs in the header are cramped.
- Headless Chrome is not an iPad, and pointer pressure was not verified.

## Next action

A person with an iPad and Apple Pencil runs `docs/ipad-acceptance.md`. That gate is pending. Do not treat this packet as Pencil acceptance or Hub integration.
