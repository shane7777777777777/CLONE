# Export fidelity

The project record is the editable copy. The original PDF bytes are stored by SHA-256 and are not rewritten when you annotate.

| Item | In the project | In the exported PDF |
| --- | --- | --- |
| Ink, marker, line, rectangle, ellipse, note | JSON annotation | PDF annotation (`Ink`, `Line`, `Square`, `Circle`, `FreeText`). Not drawn into the page content stream. |
| Distance, area, count | JSON measurement | A visual annotation plus the quantity in the contents string. The number is recomputed from calibration on import of the sidecar. |
| Calibration | One record per revision and page | Sidecar only. Another viewer does not learn a scale from it. |
| Tasks | JSON on the project | Sidecar only. Not Apple Reminders. |
| Pristine pages | Original bytes | Embedded again inside `phoenix-plans.json` as base64, keyed by SHA-256. |

`phoenix-plans.json` is a PDF file attachment. `flattened` in that file is `false`.

Reimport:

- Sidecar present and every pristine hash matches: restore the project and the original bytes. Fidelity: `sidecar`.
- Hash mismatch: stop. The stored project is not replaced.
- No sidecar: copy standard annotations into a new project and delete those annotation objects from the stored PDF so the file is not the only editable copy. There is no calibration and there are no tasks. Fidelity: `annotations-only`.

There is no Flatten command. A basic viewer may not draw the annotation objects. That is the same limitation Readdle documents. Flattening would be a second file, and it is not implemented.

pdf.js text rendering can overlap some Helvetica runs. Measurements use the stored points, not the pixels of that text.
