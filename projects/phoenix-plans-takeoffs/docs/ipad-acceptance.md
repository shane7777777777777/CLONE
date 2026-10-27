# iPad and Apple Pencil acceptance

Status: **PENDING**. The checks below were not run. Desktop Chrome and the Node tests are not a substitute.

Use an iPad with an Apple Pencil, the current Safari, and this app served over HTTPS on the same LAN. No customer drawings. Use `fixtures/known-geometry.pdf` and `fixtures/mixed-pages.pdf`.

1. Open the app. Confirm the sheet is light and the chrome is dark with red and gold.
2. Import `known-geometry.pdf`. Pinch-zoom and drag with a finger. Turn on Pencil only. Draw with the Pencil and rest the palm on the glass. Record whether the palm creates a stroke.
3. Draw a pen stroke and a marker stroke. Undo and redo. Reload the tab. Confirm both strokes are still there.
4. Calibrate the long horizontal scale bar as 30 ft. Draw the shorter horizontal line with Distance. The row must read 10 ft. Change nothing and open page controls: that calibration must not appear on a different page.
5. Import `mixed-pages.pdf` as a new revision. Rev A must still open with the 10 ft row. Rev B must say the page is not calibrated.
6. Add a task due today, flag it, add a subtask, and link it to Rev A page 1. Complete only the subtask. The parent must stay open.
7. Export the annotated PDF. Open it in a second viewer if one is available. Note whether ink is visible. Reimport it here and confirm the 10 ft row and the task returned.
8. In two tabs, edit and save the same project. The second save must show Conflict and must not discard the first tab's stored copy.
9. Record Pencil pressure, tilt, hover, and squeeze as observed or absent. This build does not use pressure to change width.

Write the device model, iPadOS version, Safari version, and pass/fail for each step. Until that sheet exists, Pencil acceptance stays pending.
