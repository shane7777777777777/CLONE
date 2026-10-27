import "fake-indexeddb/auto";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IndexedDbProjectStore } from "../src/storage/indexeddb.js";
import { sha256Bytes } from "../src/pdf/bytes.js";

describe("IndexedDB save", () => {
  it("reopens a committed project and ignores an interrupted pending write", async () => {
    const bytes = new Uint8Array(await readFile(join(import.meta.dirname, "..", "fixtures", "known-geometry.pdf")));
    const sha = await sha256Bytes(bytes);
    const store = new IndexedDbProjectStore("phoenix-test-save");
    const project = {
      schema: "phoenix-plans/1" as const,
      id: "prj_test",
      name: "Indexed",
      customerLabel: "Synthetic",
      jobLabel: "Job",
      documents: [{ id: "doc", title: "Plan" }],
      revisions: [
        {
          id: "rev",
          documentId: "doc",
          label: "A",
          createdAt: "2026-01-15T00:00:00Z",
          sourceFileName: "known-geometry.pdf",
          pdfSha256: sha,
          pages: [{ pageIndex: 0, width: 612, height: 792, rotation: 0 as const }],
        },
      ],
      annotations: [],
      calibrations: [],
      measurements: [],
      tasks: [],
    };
    const first = await store.save({
      projectId: project.id,
      expectedGeneration: 0,
      savedAt: "2026-01-15T00:00:00Z",
      snapshot: { project, pdfs: [{ sha256: sha, bytes }] },
    });
    expect(first.status).toBe("saved");
    const failed = await store.save({
      projectId: project.id,
      expectedGeneration: 1,
      savedAt: "2026-01-15T01:00:00Z",
      snapshot: {
        project: { ...project, annotations: [{ id: "ann", type: "text", revisionId: "rev", pageIndex: 0, color: "#000", fontSize: 12, at: { x: 1, y: 1 }, text: "lost" }] },
        pdfs: [{ sha256: sha, bytes }],
      },
    }, { afterPending: () => { throw new Error("interrupted"); } });
    expect(failed).toMatchObject({ status: "failed", previousIntact: true, committedGeneration: 1 });
    const loaded = await store.load(project.id);
    expect(loaded?.generation).toBe(1);
    expect(loaded?.snapshot.project.annotations).toHaveLength(0);
    expect(await sha256Bytes(loaded!.snapshot.pdfs[0]!.bytes)).toBe(sha);
  });
});
