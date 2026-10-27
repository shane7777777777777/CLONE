# 6. Defects and limits

Fixed before this packet:

- Drawing did nothing until the overlay accepted hits on empty SVG.
- "Saved" was matched inside the word "Unsaved" by the demo, so it clicked before the page had rendered.
- IndexedDB completion listeners are attached before the request is awaited.
- A second demo tab used a separate browser profile, so it could not see the save. The app itself shares one origin's database. The demo now uses one profile.
- A second `render()` on the same canvas is cancelled.

Still true:

- pdf.js overlaps some Helvetica text runs. The synthetic sheet uses a label that renders clearly in the screenshots. Vector geometry is unaffected and is what calibration uses. Imported plans can still show overlapping text.
- The header file pickers are narrow.
- Two open tabs can show a blank sheet for a moment if a render is cancelled.
- Pencil pressure, palm rejection, hover, and squeeze were not observed.
- No service worker, so a refresh needs the server.
- Export annotations are standard PDF objects. A simple viewer may hide them until a future, separate flattened copy exists. This build will not flatten the only copy.
- Area of a self-intersecting polygon is marked unreliable and excluded from the total.

Platform: Linux Chrome for the UI. Node for the tests. No iPad. No Hub. No production deploy.
