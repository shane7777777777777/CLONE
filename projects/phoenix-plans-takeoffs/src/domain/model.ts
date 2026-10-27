export const SCHEMA = "phoenix-plans/1" as const;

export const LIMITS = {
  maxPdfBytes: 20 * 1024 * 1024,
  maxPages: 40,
  maxUndo: 50,
} as const;

export type Unit = "mm" | "cm" | "m" | "in" | "ft";

export const UNITS: readonly Unit[] = ["mm", "cm", "m", "in", "ft"];

export type Priority = "none" | "low" | "medium" | "high";

export interface Point {
  x: number;
  y: number;
}

export interface PageInfo {
  pageIndex: number;
  /** Crop-box width in PDF points before page rotation. */
  width: number;
  /** Crop-box height in PDF points before page rotation. */
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface PlanDocument {
  id: string;
  title: string;
}

export interface Revision {
  id: string;
  documentId: string;
  label: string;
  createdAt: string;
  sourceFileName: string;
  pdfSha256: string;
  pages: PageInfo[];
}

export interface InkAnnotation {
  id: string;
  type: "ink" | "highlight";
  revisionId: string;
  pageIndex: number;
  color: string;
  width: number;
  opacity: number;
  strokes: Point[][];
}

export interface ShapeAnnotation {
  id: string;
  type: "line" | "rect" | "ellipse";
  revisionId: string;
  pageIndex: number;
  color: string;
  width: number;
  a: Point;
  b: Point;
}

export interface TextAnnotation {
  id: string;
  type: "text";
  revisionId: string;
  pageIndex: number;
  color: string;
  fontSize: number;
  at: Point;
  text: string;
}

export type Annotation = InkAnnotation | ShapeAnnotation | TextAnnotation;

/** Explicit scale for one revision page. Never shared with another page or revision. */
export interface Calibration {
  id: string;
  revisionId: string;
  pageIndex: number;
  a: Point;
  b: Point;
  knownLength: number;
  unit: Unit;
}

export interface DistanceMeasurement {
  id: string;
  kind: "distance";
  revisionId: string;
  pageIndex: number;
  label: string;
  a: Point;
  b: Point;
}

export interface CountMeasurement {
  id: string;
  kind: "count";
  revisionId: string;
  pageIndex: number;
  label: string;
  points: Point[];
}

export interface AreaMeasurement {
  id: string;
  kind: "area";
  revisionId: string;
  pageIndex: number;
  label: string;
  polygon: Point[];
}

export type Measurement = DistanceMeasurement | CountMeasurement | AreaMeasurement;

export interface TaskLink {
  documentId: string;
  revisionId: string;
  pageIndex: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** Local calendar date YYYY-MM-DD, or null when unscheduled. */
  due: string | null;
  flagged: boolean;
  priority: Priority;
  tags: string[];
  /** Set only when someone explicitly marks the task complete. */
  completedAt: string | null;
  parentId: string | null;
  link: TaskLink | null;
}

export interface Project {
  schema: typeof SCHEMA;
  id: string;
  name: string;
  customerLabel: string;
  jobLabel: string;
  documents: PlanDocument[];
  revisions: Revision[];
  annotations: Annotation[];
  calibrations: Calibration[];
  measurements: Measurement[];
  tasks: Task[];
}

export interface PdfBlob {
  sha256: string;
  bytes: Uint8Array;
}

export interface Snapshot {
  project: Project;
  pdfs: PdfBlob[];
}

export function newId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function emptyProject(input: {
  name: string;
  customerLabel: string;
  jobLabel: string;
  now?: Date;
}): Project {
  void input.now;
  return {
    schema: SCHEMA,
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
  };
}

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function documentOf(project: Project, documentId: string): PlanDocument | undefined {
  return project.documents.find((document) => document.id === documentId);
}

export function revisionOf(project: Project, revisionId: string): Revision | undefined {
  return project.revisions.find((revision) => revision.id === revisionId);
}

export function revisionsFor(project: Project, documentId: string): Revision[] {
  return project.revisions.filter((revision) => revision.documentId === documentId);
}

export function calibrationFor(
  project: Project,
  revisionId: string,
  pageIndex: number,
): Calibration | undefined {
  return project.calibrations.find(
    (calibration) =>
      calibration.revisionId === revisionId && calibration.pageIndex === pageIndex,
  );
}
