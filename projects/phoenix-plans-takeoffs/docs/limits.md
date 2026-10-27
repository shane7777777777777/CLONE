# Limits

Supported in this build: multipage PDF import (up to 20 MB and 40 pages), thumbnails, zoom, pan, ink, marker, line, rectangle, ellipse, text notes, undo, redo, browser save, conflict and failed-save status, annotated export, sidecar reimport, per-page calibration, distance, count, area, perimeter of that area, and tasks.

Not supported, and not claimed:

- Apple Pencil hover, squeeze, double-tap, haptics, or pressure-shaped strokes. Ink exports as one width.
- System wrist protection. "Pencil only" drops mouse and finger pointers. A touch wider than 40 CSS pixels is ignored while drawing. Neither was tried on an iPad.
- Scale detection. A page with no calibration does not produce a distance or an area.
- Reusing a calibration on another page or revision.
- Pricing, estimates, purchasing.
- Cutouts, arcs, or self-intersecting areas. A self-intersecting polygon is marked unreliable and left out of the numeric total.
- Clouds, callouts, stamps, signatures, audio notes, OCR, form filling, text editing, page reorder.
- Flatten.
- Reminders, Siri, notifications, locations, shared lists.
- Offline app-shell caching. There is a web manifest and no service worker.
- Phoenix Hub login.

A native PDFKit + PencilKit app would be the credible Pencil implementation. It was not built because this machine cannot compile or run it.
