import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";

import { SCHEMA, emptyProject, newId, type Annotation, type Point, type Project } from "../domain/model.js";
import { base64ToBytes, sha256Bytes } from "./bytes.js";
import { SIDECAR_NAME, type PhoenixSidecar } from "./export.js";
import { openPdf, readAttachments } from "./open.js";

export type ReimportResult =
  | {
      ok: true;
      project: Project;
      pdfs: Map<string, Uint8Array>;
      fidelity: "sidecar" | "annotations-only";
      note: string;
    }
  | { ok: false; reason: string };

function decodeText(value: PDFObject | undefined): string {
  if (value instanceof PDFHexString || value instanceof PDFString || value instanceof PDFName) {
    return value.decodeText();
  }
  return "";
}

function numbersOf(array: PDFArray): number[] {
  const numbers: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const item = array.lookup(index);
    if (item instanceof PDFNumber) numbers.push(item.asNumber());
  }
  return numbers;
}

function pointsFromPairs(values: number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const x = values[index];
    const y = values[index + 1];
    if (x === undefined || y === undefined) continue;
    points.push({ x, y });
  }
  return points;
}

function pageAnnotations(page: PDFPage): PDFDict[] {
  const annots = page.node.Annots();
  if (!annots) return [];
  const dicts: PDFDict[] = [];
  for (let index = 0; index < annots.size(); index += 1) {
    const annot = annots.lookup(index);
    if (annot instanceof PDFDict) dicts.push(annot);
  }
  return dicts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  return (
    value.schema === SCHEMA &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.documents) &&
    Array.isArray(value.revisions) &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.calibrations) &&
    Array.isArray(value.measurements) &&
    Array.isArray(value.tasks)
  );
}

function isSidecar(value: unknown): value is PhoenixSidecar {
  if (!isRecord(value) || value.kind !== "phoenix-plans-sidecar" || !isProject(value.project)) return false;
  return Array.isArray(value.pdfs);
}

export async function reimportAnnotatedPdf(bytes: Uint8Array): Promise<ReimportResult> {
  let opened;
  try {
    opened = await openPdf(bytes);
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not read PDF" };
  }
  try {
    const attachments = await readAttachments(opened.document);
    const sidecarBytes = attachments[SIDECAR_NAME];
    if (sidecarBytes) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(sidecarBytes));
      } catch {
        return { ok: false, reason: "The Phoenix sidecar is not valid JSON." };
      }
      if (!isSidecar(parsed)) return { ok: false, reason: "The Phoenix sidecar schema was not recognized." };
      const pdfs = new Map<string, Uint8Array>();
      for (const file of parsed.pdfs) {
        if (typeof file.sha256 !== "string" || typeof file.base64 !== "string") {
          return { ok: false, reason: "The Phoenix sidecar is missing a pristine PDF." };
        }
        const pristine = base64ToBytes(file.base64);
        const actual = await sha256Bytes(pristine);
        if (actual !== file.sha256) {
          return {
            ok: false,
            reason: `Pristine PDF hash mismatch for ${file.sha256}. Import stopped so the original was not replaced.`,
          };
        }
        pdfs.set(file.sha256, pristine);
      }
      for (const revision of parsed.project.revisions) {
        if (!pdfs.has(revision.pdfSha256)) {
          return { ok: false, reason: `Revision ${revision.label} is missing its pristine PDF.` };
        }
      }
      return {
        ok: true,
        project: parsed.project,
        pdfs,
        fidelity: "sidecar",
        note: "Restored the editable project and pristine PDFs from the sidecar. The annotated file was not treated as the only copy.",
      };
    }
    const project = emptyProject({
      name: "Imported annotations",
      customerLabel: "Synthetic import",
      jobLabel: "Annotation-only",
    });
    const documentId = newId("doc");
    const revisionId = newId("rev");
    project.documents.push({ id: documentId, title: "Imported PDF" });
    project.revisions.push({
      id: revisionId,
      documentId,
      label: "A",
      createdAt: new Date().toISOString(),
      sourceFileName: "imported.pdf",
      pdfSha256: "",
      pages: opened.pages,
    });
    const source = await PDFDocument.load(bytes.slice());
    const annotations: Annotation[] = [];
    for (let pageIndex = 0; pageIndex < source.getPageCount(); pageIndex += 1) {
      const page = source.getPage(pageIndex);
      for (const annot of pageAnnotations(page)) {
        const subtype = decodeText(annot.lookup(PDFName.of("Subtype")));
        const contents = decodeText(annot.lookup(PDFName.of("Contents")));
        const name = decodeText(annot.lookup(PDFName.of("NM"))) || newId("ann");
        if (subtype === "Ink") {
          const ink = annot.lookup(PDFName.of("InkList"));
          const strokes: Point[][] = [];
          if (ink instanceof PDFArray) {
            for (let index = 0; index < ink.size(); index += 1) {
              const stroke = ink.lookup(index);
              if (stroke instanceof PDFArray) {
                const points = pointsFromPairs(numbersOf(stroke));
                if (points.length > 1) strokes.push(points);
              }
            }
          }
          if (strokes.length > 0) {
            annotations.push({
              id: name,
              type: contents.includes("phoenix:highlight") ? "highlight" : "ink",
              revisionId,
              pageIndex,
              color: contents.includes("phoenix:highlight") ? "#C6A15B" : "#B11226",
              width: contents.includes("phoenix:highlight") ? 16 : 2.5,
              opacity: contents.includes("phoenix:highlight") ? 0.35 : 1,
              strokes,
            });
          }
        } else if (subtype === "Line") {
          const line = annot.lookup(PDFName.of("L"));
          const values = line instanceof PDFArray ? numbersOf(line) : [];
          const a = values[0] !== undefined && values[1] !== undefined ? { x: values[0], y: values[1] } : null;
          const b = values[2] !== undefined && values[3] !== undefined ? { x: values[2], y: values[3] } : null;
          if (!a || !b) continue;
          if (contents.startsWith("phoenix:distance")) {
            project.measurements.push({
              id: name,
              kind: "distance",
              revisionId,
              pageIndex,
              label: "Distance",
              a,
              b,
            });
          } else {
            annotations.push({
              id: name,
              type: "line",
              revisionId,
              pageIndex,
              color: "#121212",
              width: 2,
              a,
              b,
            });
          }
        } else if (subtype === "Square" || subtype === "Circle") {
          const rect = annot.lookup(PDFName.of("Rect"));
          const values = rect instanceof PDFArray ? numbersOf(rect) : [];
          if (values.length < 4 || values[0] === undefined || values[1] === undefined || values[2] === undefined || values[3] === undefined) {
            continue;
          }
          annotations.push({
            id: name,
            type: subtype === "Square" ? "rect" : "ellipse",
            revisionId,
            pageIndex,
            color: "#121212",
            width: 2,
            a: { x: values[0], y: values[1] },
            b: { x: values[2], y: values[3] },
          });
        } else if (subtype === "FreeText") {
          const rect = annot.lookup(PDFName.of("Rect"));
          const values = rect instanceof PDFArray ? numbersOf(rect) : [];
          annotations.push({
            id: name,
            type: "text",
            revisionId,
            pageIndex,
            color: "#121212",
            fontSize: 14,
            at: { x: values[0] ?? 0, y: values[3] ?? 0 },
            text: contents,
          });
        } else if (subtype === "Polygon") {
          const vertices = annot.lookup(PDFName.of("Vertices"));
          const polygon = vertices instanceof PDFArray ? pointsFromPairs(numbersOf(vertices)) : [];
          if (polygon.length >= 3) {
            project.measurements.push({
              id: name,
              kind: "area",
              revisionId,
              pageIndex,
              label: "Area",
              polygon,
            });
          }
        }
      }
      page.node.delete(PDFName.of("Annots"));
    }
    const pristine = await source.save({ useObjectStreams: false });
    const sha = await sha256Bytes(pristine);
    const revision = project.revisions[0];
    if (!revision) return { ok: false, reason: "Import produced no revision." };
    revision.pdfSha256 = sha;
    project.annotations = annotations;
    const pdfs = new Map<string, Uint8Array>([[sha, pristine]]);
    return {
      ok: true,
      project,
      pdfs,
      fidelity: "annotations-only",
      note: "No Phoenix sidecar was found. Standard annotations were copied into the project and removed from the stored PDF so the sheet is not the only editable copy. Measurements have no calibration. Tasks were not in the file.",
    };
  } finally {
    await opened.document.destroy();
  }
}
