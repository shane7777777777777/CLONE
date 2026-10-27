import { LIMITS, localDate, newId, type Point, type Project, type Unit } from "./domain/model.js";
import {
  addAnnotation,
  addDocument,
  addMeasurement,
  addRevision,
  addTask,
  appendCountPoint,
  createArea,
  createCount,
  createDistance,
  removeAnnotation,
  removeMeasurement,
  setCalibration,
  setTaskCompletion,
  updateTask,
} from "./domain/revisions.js";
import type { Priority, TaskLink } from "./domain/model.js";
import { PDFDocument } from "pdf-lib";
import { inspectPdf } from "./pdf/inspect.js";
import { referencedSnapshot, type ProjectStore, type SaveHooks, type SaveResult } from "./storage/memory.js";

export type Tool =
  | "pan"
  | "ink"
  | "highlight"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "calibrate"
  | "distance"
  | "count"
  | "area";

export type TaskViewName = "inbox" | "today" | "upcoming" | "flagged" | "all";

export type SaveState =
  | { state: "saved"; generation: number }
  | { state: "unsaved"; generation: number }
  | { state: "saving"; generation: number }
  | { state: "failed"; generation: number; message: string }
  | { state: "conflict"; generation: number; storedGeneration: number };

export function statusLabel(status: SaveState): string {
  if (status.state === "saved") return "Saved";
  if (status.state === "unsaved") return "Unsaved";
  if (status.state === "saving") return "Saving";
  if (status.state === "failed") return "Save failed";
  return "Conflict";
}

export class Session {
  project: Project | null = null;
  pdfs = new Map<string, Uint8Array>();
  generation = 0;
  status: SaveState = { state: "unsaved", generation: 0 };
  tool: Tool = "pan";
  penOnly = false;
  documentId: string | null = null;
  revisionId: string | null = null;
  pageIndex = 0;
  zoom = 1;
  message: string | null = null;
  taskView: TaskViewName = "today";
  displayUnit: Unit | "page" = "page";
  selection: { kind: "annotation" | "measurement"; id: string } | null = null;
  activeCountId: string | null = null;
  private checkpointOpen = false;
  private undo: Project[] = [];
  private redo: Project[] = [];
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  checkpoint(): void {
    if (!this.project || this.checkpointOpen) return;
    this.undo.push(this.project);
    if (this.undo.length > LIMITS.maxUndo) this.undo.shift();
    this.redo = [];
    this.checkpointOpen = true;
  }

  endCheckpoint(): void {
    this.checkpointOpen = false;
  }

  private change(next: Project): void {
    if (!this.project) return;
    this.undo.push(this.project);
    if (this.undo.length > LIMITS.maxUndo) this.undo.shift();
    this.redo = [];
    this.project = next;
    if (this.status.state !== "conflict") {
      this.status = { state: "unsaved", generation: this.generation };
    }
    this.emit();
  }

  private adopt(project: Project, pdfs: Map<string, Uint8Array>, generation: number, state: SaveState["state"]): void {
    this.project = project;
    this.pdfs = pdfs;
    this.generation = generation;
    this.status = { state, generation } as SaveState;
    this.undo = [];
    this.redo = [];
    this.checkpointOpen = false;
    this.selection = null;
    this.activeCountId = null;
    this.documentId = project.documents[0]?.id ?? null;
    this.revisionId = project.revisions.find((revision) => revision.documentId === this.documentId)?.id ?? null;
    this.pageIndex = 0;
    this.message = null;
    this.emit();
  }

  createProject(input: { name: string; customerLabel: string; jobLabel: string }): void {
    this.adopt(
      {
        schema: "phoenix-plans/1",
        id: newId("prj"),
        name: input.name.trim() || "Untitled project",
        customerLabel: input.customerLabel.trim(),
        jobLabel: input.jobLabel.trim(),
        documents: [],
        revisions: [],
        annotations: [],
        calibrations: [],
        measurements: [],
        tasks: [],
      },
      new Map(),
      0,
      "unsaved",
    );
  }

  openSnapshot(project: Project, pdfs: Map<string, Uint8Array>, generation: number): void {
    this.adopt(structuredClone(project), new Map(pdfs), generation, generation === 0 ? "unsaved" : "saved");
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== "count") this.activeCountId = null;
    this.emit();
  }

  setPenOnly(value: boolean): void {
    this.penOnly = value;
    this.emit();
  }

  setTaskView(view: TaskViewName): void {
    this.taskView = view;
    this.emit();
  }

  setDisplayUnit(unit: Unit | "page"): void {
    this.displayUnit = unit;
    this.emit();
  }

  closeToLibrary(): void {
    this.project = null;
    this.message = null;
    this.emit();
  }

  setMessage(message: string | null): void {
    this.message = message;
    this.emit();
  }

  selectDocument(documentId: string): void {
    if (!this.project) return;
    this.documentId = documentId;
    const revision = this.project.revisions.find((item) => item.documentId === documentId);
    this.revisionId = revision?.id ?? null;
    this.pageIndex = 0;
    this.emit();
  }

  selectRevision(revisionId: string): void {
    const revision = this.project?.revisions.find((item) => item.id === revisionId);
    if (!revision) return;
    this.revisionId = revisionId;
    this.documentId = revision.documentId;
    this.pageIndex = 0;
    this.activeCountId = null;
    this.emit();
  }

  setPage(pageIndex: number): void {
    const revision = this.currentRevision();
    if (!revision) return;
    this.pageIndex = Math.max(0, Math.min(revision.pages.length - 1, pageIndex));
    this.activeCountId = null;
    this.emit();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.25, Math.min(4, zoom));
    this.emit();
  }

  currentRevision() {
    return this.project?.revisions.find((revision) => revision.id === this.revisionId);
  }

  currentPage() {
    return this.currentRevision()?.pages[this.pageIndex];
  }

  async importPdf(bytes: Uint8Array, fileName: string, mode: "document" | "revision", now = new Date()): Promise<void> {
    if (!this.project) return;
    try {
      const inspected = await inspectPdf(bytes);
      await PDFDocument.load(bytes.slice());
      const imported = { fileName, sha256: inspected.sha256, pages: inspected.pages };
      this.pdfs.set(inspected.sha256, bytes.slice());
      if (mode === "document") {
        const next = addDocument(this.project, fileName.replace(/\.pdf$/iu, ""), imported, now);
        const added = next.revisions[next.revisions.length - 1];
        this.change(next);
        if (added) {
          this.documentId = added.documentId;
          this.revisionId = added.id;
          this.pageIndex = 0;
        }
      } else {
        if (!this.documentId) throw new Error("Open a document before adding a revision.");
        const next = addRevision(this.project, this.documentId, imported, now);
        const added = next.revisions[next.revisions.length - 1];
        this.change(next);
        if (added) {
          this.revisionId = added.id;
          this.pageIndex = 0;
        }
      }
      this.message = mode === "revision" ? "New revision added. Earlier revisions were kept." : null;
      this.emit();
    } catch (error: unknown) {
      this.message = error instanceof Error ? error.message : "Could not import that PDF.";
      this.emit();
    }
  }

  addInk(strokes: Point[][], kind: "ink" | "highlight"): void {
    const revision = this.currentRevision();
    if (!this.project || !revision || strokes.every((stroke) => stroke.length < 2)) return;
    this.change(
      addAnnotation(this.project, {
        id: newId("ann"),
        type: kind,
        revisionId: revision.id,
        pageIndex: this.pageIndex,
        color: kind === "highlight" ? "#C6A15B" : "#B11226",
        width: kind === "highlight" ? 16 : 2.5,
        opacity: kind === "highlight" ? 0.35 : 1,
        strokes,
      }),
    );
  }

  addShape(type: "line" | "rect" | "ellipse", a: Point, b: Point): void {
    const revision = this.currentRevision();
    if (!this.project || !revision) return;
    this.change(
      addAnnotation(this.project, {
        id: newId("ann"),
        type,
        revisionId: revision.id,
        pageIndex: this.pageIndex,
        color: "#121212",
        width: 2,
        a,
        b,
      }),
    );
  }

  addText(at: Point, text: string): void {
    const revision = this.currentRevision();
    if (!this.project || !revision || !text.trim()) return;
    this.change(
      addAnnotation(this.project, {
        id: newId("ann"),
        type: "text",
        revisionId: revision.id,
        pageIndex: this.pageIndex,
        color: "#121212",
        fontSize: 14,
        at,
        text: text.trim(),
      }),
    );
  }

  calibrate(a: Point, b: Point, knownLength: number, unit: Unit): void {
    const revision = this.currentRevision();
    if (!this.project || !revision) return;
    try {
      const result = setCalibration(this.project, {
        revisionId: revision.id,
        pageIndex: this.pageIndex,
        a,
        b,
        knownLength,
        unit,
      });
      this.change(result.project);
      this.message = result.replaced
        ? "Replaced calibration for this page only. Other pages and revisions were left alone."
        : "Calibrated this page only.";
      this.emit();
    } catch (error: unknown) {
      this.message = error instanceof Error ? error.message : "Calibration was rejected.";
      this.emit();
    }
  }

  addDistance(a: Point, b: Point): void {
    const revision = this.currentRevision();
    if (!this.project || !revision) return;
    this.change(
      addMeasurement(
        this.project,
        createDistance({ revisionId: revision.id, pageIndex: this.pageIndex, a, b }),
      ),
    );
  }

  addCountPoint(point: Point): void {
    const revision = this.currentRevision();
    if (!this.project || !revision) return;
    if (!this.activeCountId || !this.project.measurements.some((item) => item.id === this.activeCountId)) {
      const measurement = createCount({ revisionId: revision.id, pageIndex: this.pageIndex });
      measurement.points.push(point);
      this.activeCountId = measurement.id;
      this.change(addMeasurement(this.project, measurement));
      return;
    }
    this.change(appendCountPoint(this.project, this.activeCountId, point));
  }

  addArea(polygon: Point[]): void {
    const revision = this.currentRevision();
    if (!this.project || !revision) return;
    this.change(
      addMeasurement(
        this.project,
        createArea({ revisionId: revision.id, pageIndex: this.pageIndex, polygon }),
      ),
    );
  }

  deleteSelection(): void {
    if (!this.project || !this.selection) return;
    const next =
      this.selection.kind === "annotation"
        ? removeAnnotation(this.project, this.selection.id)
        : removeMeasurement(this.project, this.selection.id);
    this.selection = null;
    this.change(next);
  }

  select(selection: Session["selection"]): void {
    this.selection = selection;
    this.emit();
  }

  addQuickTask(title: string, due: string | null, linkHere: boolean): void {
    if (!this.project || !title.trim()) return;
    const revision = this.currentRevision();
    const link: TaskLink | null =
      linkHere && revision && this.documentId
        ? { documentId: this.documentId, revisionId: revision.id, pageIndex: this.pageIndex }
        : null;
    const next = addTask(this.project, { title, link });
    const created = next.tasks[next.tasks.length - 1];
    if (created && due) created.due = due;
    this.change(next);
  }

  addSubtask(parentId: string): void {
    if (!this.project) return;
    this.change(addTask(this.project, { title: "Subtask", parentId }));
  }

  patchTask(taskId: string, patch: Parameters<typeof updateTask>[2], recordHistory = true): void {
    if (!this.project) return;
    const next = updateTask(this.project, taskId, patch);
    if (!recordHistory) {
      this.project = next;
      if (this.status.state !== "conflict" && this.status.state !== "saving") {
        this.status = { state: "unsaved", generation: this.generation };
      }
      this.emit();
      return;
    }
    this.change(next);
  }

  completeTask(taskId: string, completed: boolean, now = new Date()): void {
    if (!this.project) return;
    this.change(setTaskCompletion(this.project, taskId, completed ? now.toISOString() : null));
  }

  linkTaskToCurrentPage(taskId: string): void {
    const revision = this.currentRevision();
    if (!this.project || !revision || !this.documentId) return;
    this.change(
      updateTask(this.project, taskId, {
        link: { documentId: this.documentId, revisionId: revision.id, pageIndex: this.pageIndex },
      }),
    );
  }

  undoChange(): void {
    const previous = this.undo.pop();
    if (!previous || !this.project) return;
    this.redo.push(this.project);
    this.project = previous;
    if (this.status.state !== "conflict") this.status = { state: "unsaved", generation: this.generation };
    this.emit();
  }

  redoChange(): void {
    const next = this.redo.pop();
    if (!next || !this.project) return;
    this.undo.push(this.project);
    this.project = next;
    if (this.status.state !== "conflict") this.status = { state: "unsaved", generation: this.generation };
    this.emit();
  }

  canUndo(): boolean {
    return this.undo.length > 0;
  }

  canRedo(): boolean {
    return this.redo.length > 0;
  }

  async save(store: ProjectStore, hooks?: SaveHooks): Promise<SaveResult | null> {
    if (!this.project || this.status.state === "conflict" || this.status.state === "saving") return null;
    this.status = { state: "saving", generation: this.generation };
    this.emit();
    try {
      const result = await store.save(
        {
          projectId: this.project.id,
          expectedGeneration: this.generation,
          snapshot: referencedSnapshot(this.project, this.pdfs),
          savedAt: new Date().toISOString(),
        },
        hooks,
      );
      this.applySaveResult(result);
      return result;
    } catch (error: unknown) {
      this.status = {
        state: "failed",
        generation: this.generation,
        message: error instanceof Error ? error.message : "Save failed",
      };
      this.emit();
      return null;
    }
  }

  async overwriteSaved(store: ProjectStore): Promise<void> {
    if (this.status.state !== "conflict") return;
    this.generation = this.status.storedGeneration;
    this.status = { state: "unsaved", generation: this.generation };
    await this.save(store);
  }

  async discardLocalEdits(store: ProjectStore): Promise<void> {
    if (!this.project) return;
    const stored = await store.load(this.project.id);
    if (!stored) {
      this.message = "Nothing was saved yet, so there is no stored copy to restore.";
      this.emit();
      return;
    }
    const pdfs = new Map(stored.snapshot.pdfs.map((pdf) => [pdf.sha256, pdf.bytes]));
    this.adopt(stored.snapshot.project, pdfs, stored.generation, "saved");
  }

  private applySaveResult(result: SaveResult): void {
    if (result.status === "saved") {
      this.generation = result.generation;
      this.status = { state: "saved", generation: result.generation };
      this.message = null;
    } else if (result.status === "conflict") {
      this.status = {
        state: "conflict",
        generation: this.generation,
        storedGeneration: result.committedGeneration,
      };
      this.message = "This project was saved somewhere else. Your edits are still here and were not written over the saved copy.";
    } else {
      this.status = { state: "failed", generation: result.committedGeneration, message: result.message };
      this.message = result.message;
    }
    this.emit();
  }
}

export function todayString(now = new Date()): string {
  return localDate(now);
}
