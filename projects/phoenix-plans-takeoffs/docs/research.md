# Research notes

Public pages fetched on 2026-10-27. No PDF Expert account, no upload, no binary.

## PDF Expert (Readdle)

Observed on the public help center and product pages:

- Measure tools are Distance, Area, and Perimeter, after Calibrate. Units named there: millimetres, metres, inches, and feet. The help page says the app can detect scale and also accepts a manual scale or a known dimension. Construction tools are part of a paid subscription.
  https://support.readdle.com/pdfexpert/en_US/construction-tools/scale-and-measure-drawings
- iPad drawing is Pen or Marker, with color, thickness, pen tip sensitivity, and marker opacity. Two-finger scroll while drawing. A separate Wrist protection setting. Zoom Writing. Eraser. Undo.
  https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/draw-on-a-pdf-file
- Apple Pencil: hover, haptic feedback, double-tap, and Squeeze on Apple Pencil Pro. Those are iPadOS gestures.
  https://support.readdle.com/pdfexpert/en_US/customize-pdf-expert/work-with-apple-pencil-in-pdf-expert
- Flatten is a separate copy. Readdle tells people to keep a master because a flattened file cannot be edited.
  https://support.readdle.com/pdfexpert/en_US/organize-pdfs/save-the-file-as-flatten
- Annotations can be invisible in a simple viewer while remaining in the file. Flattening is their way to force a basic viewer to show them.
  https://support.readdle.com/pdfexpert/en_US/troubleshooting/annotations-made-in-pdf-expert-are-not-displayed-correctly-in-a-third-party-app-on-ios
- URL schemes open a file already on the device (`pdfe:///`, `pdfefile:///`). That is not an embeddable editor and not a web API.
  https://support.readdle.com/pdfexpert/en_US/scripting-and-url-schemes/url-schemes
- The iOS feature page lists reading, text and image edit, highlight, notes, Pencil drawing, audio notes, page organize, conversion, forms, sign, and redact. It does not offer an SDK.
  https://pdfexpert.com/ios/features

Not observed: a count tool, an embeddable PDF Expert component, or a public annotation API. This app does not detect scale. Counts are a takeoff need from the brief, not a PDF Expert feature copied from the measure article.

## Apple PDFKit and PencilKit

WWDC22 session 10089, "What's new in PDFKit":

- `PDFPageOverlayViewProvider` (iOS 16 / macOS Ventura) asks the app for a view when a page is about to appear. `overlayViewFor` supplies it. PDFKit sizes and rotates it. `willEndDisplayingOverlayView` is the place to keep the view's data. The sample uses a `PKCanvasView`.
- PDFKit does not write the PencilKit drawing into the PDF by itself. The app has to incorporate it on save.
- https://developer.apple.com/videos/play/wwdc2022/10089/

The protocol reference page did not return method text to this agent (it is a scripted documentation app). The session transcript above is the source for the method names.

A native port would use that overlay for live Pencil drawing, then write PDF annotations. `PDFDocumentWriteOption.burnInAnnotationsOption` flattens. This project does not flatten the only copy.

## Reminders

https://support.apple.com/guide/reminders/view-reminder-lists-remnd854fc47/mac

- Today includes items due today and overdue items.
- Flagged is a smart list.
- Scheduled is every item with a date, grouped by date. This app's Upcoming list is later than today only, so a dated item is in one list.
- Subtasks exist. Completing, deleting, or moving a parent also completes, deletes, or moves its subtasks. This app does not cascade completion.
- Priority low / medium / high is a sort key on that guide. Tags and dates are filters on the smart-list guide.

No notification, Siri, location, or iCloud sync is implemented or claimed.

## Libraries

- pdf.js: Apache-2.0. https://github.com/mozilla/pdf.js/blob/master/LICENSE and `pdfjs-dist@4.10.38` `license` field.
- pdf-lib: MIT. `pdf-lib@1.17.1` `license` field. The upstream LICENSE URL returned 404 at fetch time; the installed package metadata is the source used here.

## Browser pointer input

MDN Pointer Events: `pointerType`, `pressure` (0–1, and 0.5 when a button is down and the hardware does not report pressure), tilt, twist, width, height.
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

WebKit changeset 240632 (2019): a stylus produces `pointerType` `"pen"` and supplies pressure, tiltX, and tiltY.
https://trac.webkit.org/changeset/240632/webkit

What a browser cannot honestly claim from this host: Apple Pencil hover, squeeze, double-tap, haptic feedback, or system wrist protection. Palm rejection in Safari is not something this Linux run observed. The app can ignore non-pen pointers when "Pencil only" is on, and it ignores a touch whose contact box is wider than 40 CSS pixels. Both are unverified on iPad.

## REA

See `handoff/07-clone-rea.md`. Reading the REA source is not a REA run. The runs that did happen are recorded there.
