import { PDFArray, PDFDocument, PDFHexString, PDFName, type PDFPage } from "pdf-lib";

import { boundsOf } from "../domain/geometry.js";
import {
  evaluateArea,
  evaluateDistance,
} from "../domain/measurements.js";
import {
  calibrationFor,
  type Annotation,
  type Measurement,
  type Point,
  type Project,
} from "../domain/model.js";
import { bytesToBase64 } from "./bytes.js";

export const SIDECAR_NAME = "phoenix-plans.json";

export interface PhoenixSidecar {
  schema: "phoenix-plans/1";
  kind: "phoenix-plans-sidecar";
  exportedAt: string;
  fidelity: "editable-annotations-plus-sidecar";
  flattened: false;
  note: string;
  project: Project;
  pdfs: { sha256: string; base64: string }[];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function rgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const value = Number.parseInt(cleaned, 16);
  if (!Number.isFinite(value) || cleaned.length !== 6) return [0.07, 0.07, 0.07];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function text(value: string): PDFHexString {
  return PDFHexString.fromText(value);
}

function ensureAnnots(page: PDFPage): PDFArray {
  const existing = page.node.Annots();
  if (existing) return existing;
  const created = page.doc.context.obj([]);
  page.node.set(PDFName.of("Annots"), created);
  const annots = page.node.Annots();
  if (!annots) throw new Error("Could not attach an annotation array to the page.");
  return annots;
}

function addAnnot(page: PDFPage, raw: Record<string, unknown>): void {
  const annot = page.doc.context.obj({
    Type: "Annot",
    F: 4,
    P: page.ref,
    ...raw,
  });
  const ref = page.doc.context.register(annot);
  ensureAnnots(page).push(ref);
}

function rectFromPoints(points: Point[], pad: number): number[] {
  const box = boundsOf(points, pad);
  return [round(box.minX), round(box.minY), round(box.maxX), round(box.maxY)];
}

function addInk(page: PDFPage, annotation: Extract<Annotation, { type: "ink" | "highlight" }>): void {
  const strokes = annotation.strokes.filter((stroke) => stroke.length > 1);
  if (strokes.length === 0) return;
  const points = strokes.flat();
  addAnnot(page, {
    Subtype: "Ink",
    Rect: rectFromPoints(points, annotation.width),
    InkList: strokes.map((stroke) => stroke.flatMap((point) => [round(point.x), round(point.y)])),
    C: rgb(annotation.color),
    CA: annotation.opacity,
    Border: [0, 0, annotation.width],
    BS: { W: annotation.width, S: "S" },
    NM: text(annotation.id),
    Contents: text(annotation.type === "highlight" ? "phoenix:highlight" : "phoenix:ink"),
  });
}

function addShape(page: PDFPage, annotation: Extract<Annotation, { type: "line" | "rect" | "ellipse" }>): void {
  const common = {
    C: rgb(annotation.color),
    Border: [0, 0, annotation.width],
    BS: { W: annotation.width, S: "S" },
    NM: text(annotation.id),
  };
  if (annotation.type === "line") {
    addAnnot(page, {
      ...common,
      Subtype: "Line",
      Rect: rectFromPoints([annotation.a, annotation.b], annotation.width),
      L: [round(annotation.a.x), round(annotation.a.y), round(annotation.b.x), round(annotation.b.y)],
      Contents: text("phoenix:line"),
    });
    return;
  }
  addAnnot(page, {
    ...common,
    Subtype: annotation.type === "rect" ? "Square" : "Circle",
    Rect: rectFromPoints([annotation.a, annotation.b], annotation.width),
    Contents: text(annotation.type === "rect" ? "phoenix:rect" : "phoenix:ellipse"),
  });
}

function addText(page: PDFPage, annotation: Extract<Annotation, { type: "text" }>): void {
  const width = Math.max(96, annotation.text.length * annotation.fontSize * 0.55);
  const height = annotation.fontSize * 1.8;
  addAnnot(page, {
    Subtype: "FreeText",
    Rect: [
      round(annotation.at.x),
      round(annotation.at.y - height),
      round(annotation.at.x + width),
      round(annotation.at.y),
    ],
    Contents: text(annotation.text),
    DA: text(`/Helv ${annotation.fontSize} Tf ${rgb(annotation.color).join(" ")} rg`),
    C: rgb(annotation.color),
    NM: text(annotation.id),
    Q: 0,
  });
}

function addMeasurement(page: PDFPage, project: Project, measurement: Measurement): void {
  const calibration = calibrationFor(project, measurement.revisionId, measurement.pageIndex);
  if (measurement.kind === "distance") {
    const evaluated = evaluateDistance(measurement, calibration);
    addAnnot(page, {
      Subtype: "Line",
      Rect: rectFromPoints([measurement.a, measurement.b], 1),
      L: [round(measurement.a.x), round(measurement.a.y), round(measurement.b.x), round(measurement.b.y)],
      C: [0.11, 0.3, 0.54],
      Border: [0, 0, 1.5],
      BS: { W: 1.5, S: "S" },
      NM: text(measurement.id),
      Contents: text(`phoenix:distance ${evaluated.text}`),
    });
    return;
  }
  if (measurement.kind === "area" && measurement.polygon.length >= 3) {
    const evaluated = evaluateArea(measurement, calibration);
    addAnnot(page, {
      Subtype: "Polygon",
      Rect: rectFromPoints(measurement.polygon, 1),
      Vertices: measurement.polygon.flatMap((point) => [round(point.x), round(point.y)]),
      C: [0.11, 0.3, 0.54],
      CA: 0.15,
      Border: [0, 0, 1.5],
      BS: { W: 1.5, S: "S" },
      NM: text(measurement.id),
      Contents: text(`phoenix:area ${evaluated.text}`),
    });
    return;
  }
  if (measurement.kind === "count") {
    measurement.points.forEach((point, index) => {
      addAnnot(page, {
        Subtype: "Circle",
        Rect: [round(point.x - 6), round(point.y - 6), round(point.x + 6), round(point.y + 6)],
        C: [0.11, 0.3, 0.54],
        Border: [0, 0, 1.25],
        BS: { W: 1.25, S: "S" },
        NM: text(`${measurement.id}:${index}`),
        Contents: text(`phoenix:count ${measurement.label}`),
      });
    });
  }
}

export function buildSidecar(
  project: Project,
  pdfs: ReadonlyMap<string, Uint8Array>,
  exportedAt: string,
): PhoenixSidecar {
  const files: { sha256: string; base64: string }[] = [];
  const seen = new Set<string>();
  for (const revision of project.revisions) {
    if (seen.has(revision.pdfSha256)) continue;
    const bytes = pdfs.get(revision.pdfSha256);
    if (!bytes) throw new Error(`Missing pristine PDF ${revision.pdfSha256}`);
    seen.add(revision.pdfSha256);
    files.push({ sha256: revision.pdfSha256, base64: bytesToBase64(bytes) });
  }
  return {
    schema: "phoenix-plans/1",
    kind: "phoenix-plans-sidecar",
    exportedAt,
    fidelity: "editable-annotations-plus-sidecar",
    flattened: false,
    note: "Sidecar is the editable model. Page annotations are a visual copy and are not a flattened replacement of the pristine PDFs embedded here.",
    project,
    pdfs: files,
  };
}

export async function exportAnnotatedPdf(input: {
  project: Project;
  pdfs: ReadonlyMap<string, Uint8Array>;
  revisionId: string;
  exportedAt: string;
}): Promise<Uint8Array> {
  const revision = input.project.revisions.find((item) => item.id === input.revisionId);
  if (!revision) throw new Error("Choose a revision before exporting.");
  const pristine = input.pdfs.get(revision.pdfSha256);
  if (!pristine) throw new Error("The pristine PDF for this revision is missing.");
  const document = await PDFDocument.load(pristine.slice());
  document.setTitle(`${input.project.name} — revision ${revision.label}`);
  document.setSubject("Phoenix Plans annotated export. Not flattened.");
  for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
    const page = document.getPage(pageIndex);
    for (const annotation of input.project.annotations) {
      if (annotation.revisionId !== revision.id || annotation.pageIndex !== pageIndex) continue;
      if (annotation.type === "ink" || annotation.type === "highlight") addInk(page, annotation);
      else if (annotation.type === "text") addText(page, annotation);
      else if (annotation.type === "line" || annotation.type === "rect" || annotation.type === "ellipse") {
        addShape(page, annotation);
      }
    }
    for (const measurement of input.project.measurements) {
      if (measurement.revisionId !== revision.id || measurement.pageIndex !== pageIndex) continue;
      addMeasurement(page, input.project, measurement);
    }
  }
  const sidecar = buildSidecar(input.project, input.pdfs, input.exportedAt);
  await document.attach(new TextEncoder().encode(JSON.stringify(sidecar)), SIDECAR_NAME, {
    mimeType: "application/json",
    description: "Phoenix Plans editable sidecar. This is not a flattened drawing.",
    creationDate: new Date(input.exportedAt),
    modificationDate: new Date(input.exportedAt),
  });
  return document.save({ useObjectStreams: false });
}
