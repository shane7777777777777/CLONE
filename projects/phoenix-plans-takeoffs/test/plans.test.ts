import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { polygonSelfIntersects } from "../src/domain/geometry.js";
import { quantityRows } from "../src/domain/measurements.js";
import { emptyProject, newId, type Project } from "../src/domain/model.js";
import { addDocument, addRevision, setCalibration } from "../src/domain/revisions.js";
import { taskMatches, visibleTasks } from "../src/domain/tasks.js";
import { convertLength } from "../src/domain/units.js";
import { KNOWN_GEOMETRY, MIXED_PAGES } from "../src/fixtures/geometry.js";
import { exportAnnotatedPdf } from "../src/pdf/export.js";
import { inspectPdf } from "../src/pdf/inspect.js";
import { pageViewport } from "../src/pdf/open.js";
import { reimportAnnotatedPdf } from "../src/pdf/reimport.js";
import { sha256Bytes } from "../src/pdf/bytes.js";
import { MemoryProjectStore, referencedSnapshot } from "../src/storage/memory.js";
import { Session } from "../src/session.js";

const fixtures = join(import.meta.dirname, "..", "fixtures");

async function readFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(fixtures, name)));
}

function pageContentText(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFRawStream) streams.push(contents);
  else if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index += 1) {
      const item = contents.lookup(index);
      if (item instanceof PDFRawStream) streams.push(item);
    }
  }
  return streams
    .map((stream) => new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode()))
    .join("\n");
}

function projectWith(pdf: { sha256: string; pages: Awaited<ReturnType<typeof inspectPdf>>["pages"] }, bytes: Uint8Array): {
  project: Project;
  pdfs: Map<string, Uint8Array>;
} {
  const project = addDocument(
    emptyProject({ name: "Synthetic yard office", customerLabel: "Synthetic — Northwind Fabrication", jobLabel: "Job 100" }),
    "Floor plan",
    { fileName: "known-geometry.pdf", ...pdf },
    new Date("2026-01-15T00:00:00Z"),
  );
  return { project, pdfs: new Map([[pdf.sha256, bytes]]) };
}

describe("known geometry and calibration", () => {
  it("measures the synthetic scale bar without reading pixels", async () => {
    const bytes = await readFixture("known-geometry.pdf");
    const source = await PDFDocument.load(bytes);
    const drawn = pageContentText(source.getPage(0));
    const visible = drawn.replace(/<([0-9A-Fa-f]+)> Tj/gu, (_match, hex: string) => {
      let text = "";
      for (let index = 0; index < hex.length; index += 2) {
        text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
      }
      return text;
    });
    expect(visible).toContain("Job 100 yard office");
    expect(visible).toContain("Synthetic plan");
    expect(drawn).toContain("72 360 m");
    expect(drawn).toContain("432 360 l");
    expect(drawn).toContain("72 220 m");
    expect(drawn).toContain("192 220 l");
    expect(drawn).toContain("1 0 0 1 300 200 cm");
    expect(drawn).toContain("144 144 l");
    const inspected = await inspectPdf(bytes);
    expect(inspected.pages[0]).toMatchObject(KNOWN_GEOMETRY.page);
    const { project } = projectWith(inspected, bytes);
    const revision = project.revisions[0];
    expect(revision).toBeDefined();
    const calibrated = setCalibration(project, {
      revisionId: revision!.id,
      pageIndex: 0,
      ...KNOWN_GEOMETRY.scale,
    }).project;
    const distanceId = newId("mea");
    calibrated.measurements.push({
      id: distanceId,
      kind: "distance",
      revisionId: revision!.id,
      pageIndex: 0,
      label: "Check line",
      a: KNOWN_GEOMETRY.distance.a,
      b: KNOWN_GEOMETRY.distance.b,
    });
    calibrated.measurements.push({
      id: newId("mea"),
      kind: "area",
      revisionId: revision!.id,
      pageIndex: 0,
      label: "Room",
      polygon: [KNOWN_GEOMETRY.square.a, KNOWN_GEOMETRY.square.b, KNOWN_GEOMETRY.square.c, KNOWN_GEOMETRY.square.d],
    });
    calibrated.measurements.push({
      id: newId("mea"),
      kind: "count",
      revisionId: revision!.id,
      pageIndex: 0,
      label: "Columns",
      points: [
        { x: 80, y: 80 },
        { x: 100, y: 80 },
        { x: 120, y: 80 },
      ],
    });
    const rows = quantityRows(calibrated, revision!.id);
    expect(rows.find((row) => row.kind === "distance")?.text).toBe(`${KNOWN_GEOMETRY.distance.feet} ft`);
    expect(rows.find((row) => row.kind === "area")?.text).toContain(`${KNOWN_GEOMETRY.square.areaSqFt} ft²`);
    expect(rows.find((row) => row.kind === "area")?.text).toContain(`${KNOWN_GEOMETRY.square.perimeterFeet} ft`);
    expect(rows.find((row) => row.kind === "count")?.text).toBe("3 count");
    expect(rows.find((row) => row.kind === "count")?.unit).toBe("count");
    const otherPage = quantityRows(
      setCalibration(calibrated, {
        revisionId: revision!.id,
        pageIndex: 1,
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        knownLength: 10,
        unit: "m",
      }).project,
      revision!.id,
    );
    expect(otherPage.find((row) => row.pageIndex === 0 && row.kind === "distance")?.unit).toBe("ft");
  });

  it("does not reuse calibration on another page or revision", async () => {
    const bytes = await readFixture("known-geometry.pdf");
    const inspected = await inspectPdf(bytes);
    const { project } = projectWith(inspected, bytes);
    const first = project.revisions[0]!;
    const calibrated = setCalibration(project, { revisionId: first.id, pageIndex: 0, ...KNOWN_GEOMETRY.scale }).project;
    const withDistance = structuredClone(calibrated);
    withDistance.measurements.push({
      id: "mea_other",
      kind: "distance",
      revisionId: first.id,
      pageIndex: 1,
      label: "Other page",
      a: { x: 0, y: 0 },
      b: { x: 120, y: 0 },
    });
    expect(quantityRows(withDistance, first.id).find((row) => row.pageIndex === 1)?.status).toBe("uncalibrated");
    const revised = addRevision(calibrated, first.documentId, { fileName: "next.pdf", ...inspected }, new Date("2026-02-01T00:00:00Z"));
    const second = revised.revisions[1]!;
    expect(second.pdfSha256).toBe(first.pdfSha256);
    expect(revised.revisions[0]?.pdfSha256).toBe(first.pdfSha256);
    expect(revised.calibrations.some((item) => item.revisionId === second.id)).toBe(false);
    expect(polygonSelfIntersects([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ])).toBe(true);
  });

  it("converts units only through an explicit display unit", () => {
    expect(convertLength(10, "ft", "in")).toBeCloseTo(120);
    expect(convertLength(10, "ft", "m")).toBeCloseTo(3.048);
  });
});

describe("pages, zoom, and malformed files", () => {
  it("keeps mixed sizes and rotation, and round-trips points across zoom", async () => {
    const bytes = await readFixture("mixed-pages.pdf");
    const inspected = await inspectPdf(bytes);
    expect(inspected.pages.map(({ width, height, rotation }) => ({ width, height, rotation }))).toEqual(
      MIXED_PAGES.map(({ width, height, rotation }) => ({ width, height, rotation })),
    );
    const { document } = await import("../src/pdf/open.js").then(async (pdf) => {
      const opened = await pdf.openPdf(bytes);
      return opened;
    });
    try {
      for (const scale of [1, 2.5]) {
        const viewport = await pageViewport(document, 0, scale);
        const [x, y] = viewport.convertToViewportPoint(KNOWN_GEOMETRY.scale.a.x, KNOWN_GEOMETRY.scale.a.y);
        const [userX, userY] = viewport.convertToPdfPoint(x ?? 0, y ?? 0);
        expect(userX).toBeCloseTo(KNOWN_GEOMETRY.scale.a.x);
        expect(userY).toBeCloseTo(KNOWN_GEOMETRY.scale.a.y);
        expect(x).toBeCloseTo(KNOWN_GEOMETRY.scale.a.x * scale);
      }
      const rotated = await pageViewport(document, 2, 1);
      expect(rotated.width).toBeCloseTo(MIXED_PAGES[2]!.height);
      expect(rotated.height).toBeCloseTo(MIXED_PAGES[2]!.width);
      const [vx, vy] = rotated.convertToViewportPoint(72, 360);
      const [ux, uy] = rotated.convertToPdfPoint(vx ?? 0, vy ?? 0);
      expect(ux).toBeCloseTo(72);
      expect(uy).toBeCloseTo(360);
    } finally {
      await document.destroy();
    }
  });

  it("rejects malformed PDFs before creating a revision", async () => {
    const session = new Session();
    session.createProject({ name: "Bad", customerLabel: "Synthetic", jobLabel: "Job" });
    await session.importPdf(await readFixture("malformed-text.pdf"), "malformed-text.pdf", "document");
    await session.importPdf(await readFixture("malformed-truncated.pdf"), "malformed-truncated.pdf", "document");
    expect(session.project?.revisions).toHaveLength(0);
    expect(session.message).toMatch(/not a PDF|Could not read/u);
  });
});

describe("save, conflict, export, and tasks", () => {
  it("saves, reopens, and keeps the previous bytes when a save is interrupted", async () => {
    const bytes = await readFixture("known-geometry.pdf");
    const inspected = await inspectPdf(bytes);
    const session = new Session();
    session.createProject({ name: "Save", customerLabel: "Synthetic", jobLabel: "Job" });
    await session.importPdf(bytes, "known-geometry.pdf", "document");
    const store = new MemoryProjectStore();
    const saved = await session.save(store);
    expect(saved?.status).toBe("saved");
    const reopened = new Session();
    const loaded = await store.load(session.project!.id);
    expect(loaded?.snapshot.pdfs[0]?.sha256).toBe(inspected.sha256);
    reopened.openSnapshot(loaded!.snapshot.project, new Map(loaded!.snapshot.pdfs.map((pdf) => [pdf.sha256, pdf.bytes])), loaded!.generation);
    expect(reopened.project?.revisions[0]?.pdfSha256).toBe(inspected.sha256);
    reopened.addText({ x: 10, y: 10 }, "late note");
    const failed = await reopened.save(store, { afterPending: () => { throw new Error("disk full"); } });
    expect(failed).toMatchObject({ status: "failed", previousIntact: true });
    const after = await store.load(session.project!.id);
    expect(after?.generation).toBe(1);
    expect(after?.snapshot.project.annotations).toHaveLength(0);
    expect(after?.snapshot.pdfs[0] && (await sha256Bytes(after.snapshot.pdfs[0].bytes))).toBe(inspected.sha256);
  });

  it("shows a conflict instead of overwriting a stale edit", async () => {
    const bytes = await readFixture("known-geometry.pdf");
    const store = new MemoryProjectStore();
    const first = new Session();
    first.createProject({ name: "Shared", customerLabel: "Synthetic", jobLabel: "Job" });
    await first.importPdf(bytes, "known-geometry.pdf", "document");
    await first.save(store);
    const second = new Session();
    const loaded = await store.load(first.project!.id);
    second.openSnapshot(loaded!.snapshot.project, new Map(loaded!.snapshot.pdfs.map((pdf) => [pdf.sha256, pdf.bytes])), loaded!.generation);
    first.addText({ x: 20, y: 20 }, "first editor");
    await first.save(store);
    second.addText({ x: 30, y: 30 }, "second editor");
    const conflict = await second.save(store);
    expect(conflict?.status).toBe("conflict");
    expect(second.status.state).toBe("conflict");
    const stored = await store.load(first.project!.id);
    expect(stored?.snapshot.project.annotations.map((item) => (item.type === "text" ? item.text : ""))).toEqual(["first editor"]);
    expect(second.project?.annotations.some((item) => item.type === "text" && item.text === "second editor")).toBe(true);
  });

  it("exports editable annotations without replacing the pristine PDF, then reimports them", async () => {
    const bytes = await readFixture("known-geometry.pdf");
    const inspected = await inspectPdf(bytes);
    const { project, pdfs } = projectWith(inspected, bytes);
    const revision = project.revisions[0]!;
    const calibrated = setCalibration(project, { revisionId: revision.id, pageIndex: 0, ...KNOWN_GEOMETRY.scale }).project;
    calibrated.annotations.push({
      id: "ann_ink",
      type: "ink",
      revisionId: revision.id,
      pageIndex: 0,
      color: "#B11226",
      width: 2,
      opacity: 1,
      strokes: [[KNOWN_GEOMETRY.scale.a, KNOWN_GEOMETRY.scale.b]],
    });
    calibrated.tasks.push({
      id: "tsk_link",
      title: "Linked note",
      notes: "",
      due: "2026-01-15",
      flagged: true,
      priority: "high",
      tags: ["yard"],
      completedAt: null,
      parentId: null,
      link: { documentId: revision.documentId, revisionId: revision.id, pageIndex: 0 },
    });
    const exported = await exportAnnotatedPdf({
      project: calibrated,
      pdfs,
      revisionId: revision.id,
      exportedAt: "2026-01-15T00:00:00.000Z",
    });
    expect(await sha256Bytes(exported)).not.toBe(inspected.sha256);
    expect(pdfs.get(inspected.sha256) && (await sha256Bytes(pdfs.get(inspected.sha256)!))).toBe(inspected.sha256);
    const opened = await PDFDocument.load(exported);
    const annots = opened.getPage(0).node.Annots();
    expect(annots?.size()).toBeGreaterThan(0);
    const ink = annots?.lookup(0);
    expect(ink?.toString()).toContain("72");
    expect(ink?.toString()).toContain("360");
    const decoded = pageContentText(opened.getPage(0));
    expect(decoded).toContain("72 360 m");
    expect(decoded).not.toContain("/Ink");
    const restored = await reimportAnnotatedPdf(exported);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.fidelity).toBe("sidecar");
    expect(restored.project.tasks[0]?.link?.pageIndex).toBe(0);
    expect(restored.project.annotations[0]).toMatchObject({ type: "ink" });
    const pristine = restored.pdfs.get(inspected.sha256);
    expect(pristine && (await sha256Bytes(pristine))).toBe(inspected.sha256);
    void PDFName;
  });

  it("links tasks to a page and keeps completion explicit", () => {
    const today = "2026-01-15";
    const tasks = [
      { id: "a", title: "Today", notes: "", due: today, flagged: false, priority: "high" as const, tags: ["yard"], completedAt: null, parentId: null, link: { documentId: "doc", revisionId: "rev", pageIndex: 2 } },
      { id: "b", title: "Later", notes: "", due: "2026-02-01", flagged: true, priority: "low" as const, tags: [], completedAt: null, parentId: null, link: null },
      { id: "c", title: "Child", notes: "", due: null, flagged: false, priority: "none" as const, tags: [], completedAt: null, parentId: "a", link: null },
      { id: "d", title: "Done", notes: "", due: today, flagged: false, priority: "none" as const, tags: [], completedAt: "2026-01-15T00:00:00Z", parentId: null, link: null },
    ];
    expect(visibleTasks(tasks, "today", today).map((task) => task.id)).toEqual(["a", "c"]);
    expect(taskMatches(tasks[1]!, "upcoming", today)).toBe(true);
    expect(visibleTasks(tasks, "today", today).some((task) => task.id === "d")).toBe(false);
    expect(tasks[0]?.link?.revisionId).toBe("rev");
  });
});

describe("snapshot helper", () => {
  it("refuses to save a revision whose PDF bytes are missing", () => {
    const project = emptyProject({ name: "x", customerLabel: "", jobLabel: "" });
    project.revisions.push({
      id: "rev",
      documentId: "doc",
      label: "A",
      createdAt: "2026-01-15T00:00:00Z",
      sourceFileName: "missing.pdf",
      pdfSha256: "abc",
      pages: [],
    });
    expect(() => referencedSnapshot(project, new Map())).toThrow(/Missing PDF bytes/u);
  });
});
