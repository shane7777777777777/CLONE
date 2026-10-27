import { distance } from "./geometry.js";
import {
  cloneProject,
  newId,
  type Annotation,
  type AreaMeasurement,
  type Calibration,
  type CountMeasurement,
  type DistanceMeasurement,
  type Measurement,
  type PageInfo,
  type Point,
  type Priority,
  type Project,
  type Task,
  type TaskLink,
  type Unit,
} from "./model.js";

export interface ImportedPdf {
  fileName: string;
  sha256: string;
  pages: PageInfo[];
}

export function addDocument(project: Project, title: string, pdf: ImportedPdf, now: Date): Project {
  const next = cloneProject(project);
  const documentId = newId("doc");
  next.documents.push({ id: documentId, title: title.trim() || pdf.fileName });
  next.revisions.push({
    id: newId("rev"),
    documentId,
    label: "A",
    createdAt: now.toISOString(),
    sourceFileName: pdf.fileName,
    pdfSha256: pdf.sha256,
    pages: pdf.pages,
  });
  return next;
}

export function addRevision(
  project: Project,
  documentId: string,
  pdf: ImportedPdf,
  now: Date,
): Project {
  const next = cloneProject(project);
  const existing = next.revisions.filter((revision) => revision.documentId === documentId);
  if (existing.length === 0) {
    throw new Error("Cannot add a revision to a missing document.");
  }
  const label = String.fromCharCode("A".charCodeAt(0) + existing.length);
  const previous = existing.map((revision) => ({ ...revision }));
  next.revisions.push({
    id: newId("rev"),
    documentId,
    label: label.length === 1 && existing.length < 26 ? label : `R${existing.length + 1}`,
    createdAt: now.toISOString(),
    sourceFileName: pdf.fileName,
    pdfSha256: pdf.sha256,
    pages: pdf.pages,
  });
  for (const revision of previous) {
    const stored = next.revisions.find((item) => item.id === revision.id);
    if (!stored || stored.pdfSha256 !== revision.pdfSha256) {
      throw new Error("Adding a revision changed an older revision.");
    }
  }
  return next;
}

export function addAnnotation(project: Project, annotation: Annotation): Project {
  const next = cloneProject(project);
  next.annotations.push(annotation);
  return next;
}

export function removeAnnotation(project: Project, annotationId: string): Project {
  const next = cloneProject(project);
  next.annotations = next.annotations.filter((annotation) => annotation.id !== annotationId);
  return next;
}

export function setCalibration(
  project: Project,
  input: { revisionId: string; pageIndex: number; a: Point; b: Point; knownLength: number; unit: Unit },
): { project: Project; replaced: boolean } {
  if (!(distance(input.a, input.b) > 0) || !(input.knownLength > 0)) {
    throw new Error("Calibration needs a positive known length and two different points.");
  }
  const next = cloneProject(project);
  const index = next.calibrations.findIndex(
    (calibration) =>
      calibration.revisionId === input.revisionId && calibration.pageIndex === input.pageIndex,
  );
  const calibration: Calibration = { id: newId("cal"), ...input };
  if (index >= 0) next.calibrations.splice(index, 1, calibration);
  else next.calibrations.push(calibration);
  return { project: next, replaced: index >= 0 };
}

export function addMeasurement(project: Project, measurement: Measurement): Project {
  const next = cloneProject(project);
  next.measurements.push(measurement);
  return next;
}

export function removeMeasurement(project: Project, measurementId: string): Project {
  const next = cloneProject(project);
  next.measurements = next.measurements.filter((measurement) => measurement.id !== measurementId);
  return next;
}

export function appendCountPoint(project: Project, measurementId: string, point: Point): Project {
  const next = cloneProject(project);
  const measurement = next.measurements.find((item) => item.id === measurementId);
  if (!measurement || measurement.kind !== "count") return project;
  measurement.points.push(point);
  return next;
}

export function createDistance(input: {
  revisionId: string;
  pageIndex: number;
  a: Point;
  b: Point;
  label?: string;
}): DistanceMeasurement {
  return {
    id: newId("mea"),
    kind: "distance",
    revisionId: input.revisionId,
    pageIndex: input.pageIndex,
    label: input.label ?? "Distance",
    a: input.a,
    b: input.b,
  };
}

export function createCount(input: {
  revisionId: string;
  pageIndex: number;
  label?: string;
}): CountMeasurement {
  return {
    id: newId("mea"),
    kind: "count",
    revisionId: input.revisionId,
    pageIndex: input.pageIndex,
    label: input.label ?? "Count",
    points: [],
  };
}

export function createArea(input: {
  revisionId: string;
  pageIndex: number;
  polygon: Point[];
  label?: string;
}): AreaMeasurement {
  return {
    id: newId("mea"),
    kind: "area",
    revisionId: input.revisionId,
    pageIndex: input.pageIndex,
    label: input.label ?? "Area",
    polygon: input.polygon,
  };
}

export function addTask(
  project: Project,
  input: { title: string; parentId?: string | null; link?: TaskLink | null },
): Project {
  const next = cloneProject(project);
  const task: Task = {
    id: newId("tsk"),
    title: input.title.trim() || "Untitled task",
    notes: "",
    due: null,
    flagged: false,
    priority: "none",
    tags: [],
    completedAt: null,
    parentId: input.parentId ?? null,
    link: input.link ?? null,
  };
  next.tasks.push(task);
  return next;
}

export function updateTask(
  project: Project,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "notes" | "due" | "flagged" | "priority" | "tags" | "link">>,
): Project {
  const next = cloneProject(project);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) return project;
  if (patch.title !== undefined) task.title = patch.title;
  if (patch.notes !== undefined) task.notes = patch.notes;
  if (patch.due !== undefined) task.due = patch.due;
  if (patch.flagged !== undefined) task.flagged = patch.flagged;
  if (patch.priority !== undefined) task.priority = patch.priority;
  if (patch.tags !== undefined) task.tags = patch.tags;
  if (patch.link !== undefined) task.link = patch.link;
  return next;
}

export function setTaskCompletion(project: Project, taskId: string, completedAt: string | null): Project {
  const next = cloneProject(project);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) return project;
  task.completedAt = completedAt;
  return next;
}

export function taskPriorityRank(priority: Priority): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  if (priority === "low") return 1;
  return 0;
}
