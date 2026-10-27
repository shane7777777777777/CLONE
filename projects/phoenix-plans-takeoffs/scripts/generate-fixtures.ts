import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

import { KNOWN_GEOMETRY, MIXED_PAGES } from "../src/fixtures/geometry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const fixed = new Date(Date.UTC(2026, 0, 15));

async function finish(document: PDFDocument, name: string): Promise<void> {
  document.setTitle("Synthetic plan - not for construction");
  document.setAuthor("Phoenix Plans synthetic fixture");
  document.setProducer("Phoenix Plans synthetic fixture");
  document.setCreator("Phoenix Plans synthetic fixture");
  document.setCreationDate(fixed);
  document.setModificationDate(fixed);
  const bytes = await document.save({ useObjectStreams: false });
  await writeFile(join(root, name), bytes);
}

async function knownGeometry(): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([KNOWN_GEOMETRY.page.width, KNOWN_GEOMETRY.page.height]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.07, 0.07, 0.07);
  // One text run. pdf.js in this build overlaps a separate Helvetica run; the geometry below is vectors.
  page.drawText("Job 100 yard office. Synthetic plan, not for construction.", {
    x: 72,
    y: 720,
    size: 12,
    font,
    color: ink,
  });
  page.drawLine({
    start: KNOWN_GEOMETRY.scale.a,
    end: KNOWN_GEOMETRY.scale.b,
    thickness: 2,
    color: ink,
  });
  page.drawText("Scale bar: 360 pt. Do not infer a scale.", { x: 72, y: 372, size: 10, font, color: ink });
  page.drawLine({
    start: KNOWN_GEOMETRY.distance.a,
    end: KNOWN_GEOMETRY.distance.b,
    thickness: 1.5,
    color: ink,
  });
  page.drawRectangle({
    x: KNOWN_GEOMETRY.square.a.x,
    y: KNOWN_GEOMETRY.square.a.y,
    width: KNOWN_GEOMETRY.square.b.x - KNOWN_GEOMETRY.square.a.x,
    height: KNOWN_GEOMETRY.square.c.y - KNOWN_GEOMETRY.square.b.y,
    borderWidth: 1.5,
    borderColor: ink,
  });
  await finish(document, "known-geometry.pdf");
}

async function mixedPages(): Promise<void> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const spec of MIXED_PAGES) {
    const page = document.addPage([spec.width, spec.height]);
    if (spec.rotation) page.setRotation(degrees(spec.rotation));
    page.drawText(spec.label, { x: 36, y: 36, size: 18, font, color: rgb(0, 0, 0) });
  }
  await finish(document, "mixed-pages.pdf");
}

async function main(): Promise<void> {
  await mkdir(root, { recursive: true });
  await knownGeometry();
  await mixedPages();
  await writeFile(join(root, "malformed-text.pdf"), "this is not a pdf\n");
  await writeFile(join(root, "malformed-truncated.pdf"), "%PDF-1.4\n1 0 obj\n<<");
  await writeFile(
    join(root, "known-geometry.json"),
    `${JSON.stringify({ note: "Coordinates are PDF user space, origin bottom-left. Tests must not read pixels.", ...KNOWN_GEOMETRY }, null, 2)}\n`,
  );
}

await main();
