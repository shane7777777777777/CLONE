# 5. Tests

Command: `npx vitest run` in `projects/phoenix-plans-takeoffs`.

Node.js 22.23.4. Vitest 3.2.4. 2026-10-27.

Result: 2 files, 11 tests, all passed.

| Test | What it checks |
| --- | --- |
| known geometry | Content stream contains the 360 pt scale bar (`72 360 m`, `432 360 l`), the 120 pt line, and the 144 pt square. Calibrating that bar as 30 ft yields 10 ft and 144 ft² with perimeter 48 ft. A count is `3 count`. |
| calibration scope | Another page stays uncalibrated. A new revision keeps the old PDF hash and does not receive the calibration. |
| units | 10 ft is 120 in and about 3.048 m, only when a display unit is requested. |
| mixed pages and zoom | Page sizes and a 90° rotation match the fixture. A point round-trips through the pdf.js viewport at scale 1 and 2.5, and on the rotated page. |
| malformed PDFs | Text and a truncated `%PDF` create no revision. |
| save / interrupt | Reopen matches the SHA-256. A throw after the pending write leaves generation 1 and zero annotations. |
| conflict | The second editor keeps its note in memory. The store still has the first editor's note. Status is `conflict`. |
| export / reimport | Exported bytes differ from the pristine hash. The pristine bytes in memory are unchanged. An Ink annotation contains 72 and 360. The content stream still has `72 360 m` and does not contain `/Ink`. Sidecar reimport restores the task link and the pristine hash. |
| tasks | Today includes the parent and its open subtask, not a completed item. Upcoming is the later date. |
| missing blob | Save refuses a revision with no PDF bytes. |
| IndexedDB | The same interrupt behaviour through `fake-indexeddb`. |

These tests do not render on an iPad and do not move a Pencil. `docs/ipad-acceptance.md` is pending.
