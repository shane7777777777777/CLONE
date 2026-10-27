import type { Project, Snapshot } from "../domain/model.js";

export interface CommittedSnapshot {
  generation: number;
  snapshot: Snapshot;
  savedAt: string;
}

export type SaveResult =
  | { status: "saved"; generation: number }
  | { status: "conflict"; committedGeneration: number }
  | { status: "failed"; message: string; committedGeneration: number; previousIntact: true };

export interface SaveRequest {
  projectId: string;
  expectedGeneration: number;
  snapshot: Snapshot;
  savedAt: string;
}

export interface SaveHooks {
  afterPending?: () => Promise<void> | void;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  customerLabel: string;
  jobLabel: string;
  updatedAt: string;
}

export interface ProjectStore {
  load(projectId: string): Promise<CommittedSnapshot | null>;
  save(request: SaveRequest, hooks?: SaveHooks): Promise<SaveResult>;
  list(): Promise<ProjectIndexEntry[]>;
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    project: structuredClone(snapshot.project),
    pdfs: snapshot.pdfs.map((pdf) => ({ sha256: pdf.sha256, bytes: copyBytes(pdf.bytes) })),
  };
}

export function referencedSnapshot(project: Project, pdfs: ReadonlyMap<string, Uint8Array>): Snapshot {
  const missing: string[] = [];
  const blobs = project.revisions.map((revision) => {
    const bytes = pdfs.get(revision.pdfSha256);
    if (!bytes) missing.push(revision.pdfSha256);
    return { sha256: revision.pdfSha256, bytes: bytes ? copyBytes(bytes) : new Uint8Array() };
  });
  if (missing.length > 0) {
    throw new Error(`Missing PDF bytes for ${missing.join(", ")}`);
  }
  const unique = new Map<string, Uint8Array>();
  for (const blob of blobs) unique.set(blob.sha256, blob.bytes);
  return {
    project: structuredClone(project),
    pdfs: [...unique.entries()].map(([sha256, bytes]) => ({ sha256, bytes })),
  };
}

export class MemoryProjectStore implements ProjectStore {
  private committed = new Map<string, CommittedSnapshot>();
  private pending = new Map<string, SaveRequest>();

  async load(projectId: string): Promise<CommittedSnapshot | null> {
    const stored = this.committed.get(projectId);
    return stored ? { ...stored, snapshot: cloneSnapshot(stored.snapshot) } : null;
  }

  async list(): Promise<ProjectIndexEntry[]> {
    return [...this.committed.values()]
      .map((entry) => ({
        id: entry.snapshot.project.id,
        name: entry.snapshot.project.name,
        customerLabel: entry.snapshot.project.customerLabel,
        jobLabel: entry.snapshot.project.jobLabel,
        updatedAt: entry.savedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(request: SaveRequest, hooks?: SaveHooks): Promise<SaveResult> {
    const current = this.committed.get(request.projectId);
    const committedGeneration = current?.generation ?? 0;
    this.pending.set(request.projectId, request);
    try {
      if (hooks?.afterPending) await hooks.afterPending();
    } catch (error: unknown) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Save interrupted before commit.",
        committedGeneration,
        previousIntact: true,
      };
    }
    if (request.expectedGeneration !== committedGeneration) {
      this.pending.delete(request.projectId);
      return { status: "conflict", committedGeneration };
    }
    const generation = committedGeneration + 1;
    this.committed.set(request.projectId, {
      generation,
      savedAt: request.savedAt,
      snapshot: cloneSnapshot(request.snapshot),
    });
    this.pending.delete(request.projectId);
    return { status: "saved", generation };
  }

  pendingProject(projectId: string): SaveRequest | undefined {
    return this.pending.get(projectId);
  }
}
