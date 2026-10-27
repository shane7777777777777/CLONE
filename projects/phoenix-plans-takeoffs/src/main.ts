import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

import { todayString, type Session } from "./session.js";
import { Session as PlanSession } from "./session.js";
import { buildSidecar, exportAnnotatedPdf } from "./pdf/export.js";
import { reimportAnnotatedPdf } from "./pdf/reimport.js";
import { setPdfWorkerSrc } from "./pdf/open.js";
import { IndexedDbProjectStore } from "./storage/indexeddb.js";
import { mount } from "./ui/view.js";

setPdfWorkerSrc(workerUrl);

const store = new IndexedDbProjectStore();
const session = new PlanSession();
let timer = 0;

session.subscribe(() => {
  window.clearTimeout(timer);
  if (session.status.state === "unsaved" && session.project) {
    timer = window.setTimeout(() => void session.save(store), 800);
  }
});

function download(filename: string, bytes: Uint8Array, type: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadSample(): Promise<void> {
  const response = await fetch("/fixtures/known-geometry.pdf");
  if (!response.ok) throw new Error("The synthetic plan is not available.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  session.createProject({
    name: "Synthetic yard office",
    customerLabel: "Synthetic — Northwind Fabrication",
    jobLabel: "Job 100 — Yard office",
  });
  await session.importPdf(bytes, "known-geometry.pdf", "document");
  session.addText({ x: 72, y: 740 }, "Synthetic note — not for construction");
  session.addQuickTask("Check the yard-office scale bar", todayString(), true);
  session.setTaskView("today");
}

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) throw new Error("Missing #app");

mount(app, session, {
  listProjects: () => store.list(),
  openProject: async (id) => {
    const loaded = await store.load(id);
    if (!loaded) return;
    session.openSnapshot(
      loaded.snapshot.project,
      new Map(loaded.snapshot.pdfs.map((pdf) => [pdf.sha256, pdf.bytes])),
      loaded.generation,
    );
  },
  save: async () => {
    await session.save(store);
  },
  exportPdf: async () => {
    if (!session.project || !session.revisionId) return;
    const bytes = await exportAnnotatedPdf({
      project: session.project,
      pdfs: session.pdfs,
      revisionId: session.revisionId,
      exportedAt: new Date().toISOString(),
    });
    download(`${session.project.name}-rev.pdf`, bytes, "application/pdf");
  },
  downloadBundle: async () => {
    if (!session.project) return;
    const sidecar = buildSidecar(session.project, session.pdfs, new Date().toISOString());
    download(`${session.project.name}.phoenix.json`, new TextEncoder().encode(JSON.stringify(sidecar)), "application/json");
  },
  reimportFile: async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await reimportAnnotatedPdf(bytes);
    if (!result.ok) {
      session.createProject({ name: "Import failed", customerLabel: "", jobLabel: "" });
      session.setMessage(result.reason);
      return;
    }
    const existing = await store.load(result.project.id);
    session.openSnapshot(result.project, result.pdfs, existing?.generation ?? 0);
    if (existing) session.status = { state: "unsaved", generation: existing.generation };
    session.setMessage(result.note);
  },
  loadSample,
  overwrite: () => session.overwriteSaved(store),
  discard: () => session.discardLocalEdits(store),
});

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void session.save(store);
  }
  if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) session.redoChange();
    else session.undoChange();
  }
  if (!typing && event.key === "Delete") session.deleteSelection();
  if (!typing && event.key === "ArrowRight") session.setPage(session.pageIndex + 1);
  if (!typing && event.key === "ArrowLeft") session.setPage(session.pageIndex - 1);
});

declare global {
  interface Window {
    __phoenix?: { session: Session };
  }
}

window.__phoenix = { session };
