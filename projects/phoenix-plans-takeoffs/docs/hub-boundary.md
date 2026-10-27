# Future Phoenix Hub boundary

This app does not call Hub, does not invent a user id, a grant, or an audit log, and does not ship Hub code.

## Identifiers

| Thing | Id | Notes |
| --- | --- | --- |
| Project | `prj_` + 32 hex chars | One job. Drawings and tasks share it. |
| Document | `doc_` | A named set of revisions. |
| Revision | `rev_` | Immutable PDF SHA-256. A new upload appends a revision. |
| Page | zero-based index inside one revision | Not stable across revisions. Identity is `(revisionId, pageIndex)` plus the page's width, height, and rotation. |
| Annotation | `ann_` | |
| Calibration | `cal_` | One per `(revisionId, pageIndex)`. |
| Measurement | `mea_` | |
| Task | `tsk_` | Optional `link` to `(documentId, revisionId, pageIndex)`. |

Schema name: `phoenix-plans/1`.

## Records

Annotations, calibrations, measurements, and tasks are JSON in that schema. Points are PDF user-space points, origin at the bottom left of the crop box, y upward, before page rotation.

A portable bundle is the sidecar object written by `buildSidecar`: the project plus each pristine PDF as base64. The same object is embedded in an annotated export under the file name `phoenix-plans.json`.

## What crosses the boundary

In: a PDF file the user picks, or a bundle / annotated PDF this app wrote.
Out: a bundle download, or an annotated PDF that still contains the pristine bytes.
Not in or out: Hub sessions, tokens, prices, vendor catalogs, or Reminders.

## How a future Hub page could host it

When Hub already has an approved way to open a tool, that host can load this app at a URL and hand it a bundle the user already stored. This prototype does not define that handoff. It does not read query tokens. A later change can accept a bundle from the host after Hub's own session check, using Hub's existing command and audit path rather than a new one.

Suggested later commands, not implemented: open a project id the host already resolved, focus a revision and page, export a bundle. Each of those waits on Hub's real auth and command contract.

`window.__phoenix` is a local debug handle for the demo script. It is not a Hub API.
