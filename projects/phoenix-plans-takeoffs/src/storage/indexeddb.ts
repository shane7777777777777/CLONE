import {
  cloneSnapshot,
  copyBytes,
  type CommittedSnapshot,
  type ProjectIndexEntry,
  type ProjectStore,
  type SaveHooks,
  type SaveRequest,
  type SaveResult,
} from "./memory.js";
import type { Snapshot } from "../domain/model.js";

interface StoredCommit {
  generation: number;
  projectJson: string;
  savedAt: string;
}

function requestTo<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openDatabase(name: string): Promise<IDBDatabase> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("committed")) db.createObjectStore("committed");
    if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending");
    if (!db.objectStoreNames.contains("pendingBlobs")) db.createObjectStore("pendingBlobs");
  };
  return requestTo(request);
}

function snapshotFrom(projectJson: string, blobs: Iterable<[string, Uint8Array]>): Snapshot {
  const blobMap = new Map(blobs);
  return {
    project: JSON.parse(projectJson) as Snapshot["project"],
    pdfs: [...blobMap.entries()].map(([sha256, bytes]) => ({ sha256, bytes: copyBytes(bytes) })),
  };
}

export class IndexedDbProjectStore implements ProjectStore {
  constructor(private readonly databaseName = "phoenix-plans-takeoffs") {}

  private async db(): Promise<IDBDatabase> {
    return openDatabase(this.databaseName);
  }

  async load(projectId: string): Promise<CommittedSnapshot | null> {
    const db = await this.db();
    const transaction = db.transaction(["committed", "blobs"], "readonly");
    const finished = transactionDone(transaction);
    const stored = await requestTo(
      transaction.objectStore("committed").get(projectId) as IDBRequest<StoredCommit | undefined>,
    );
    if (!stored) {
      await finished;
      db.close();
      return null;
    }
    const project = JSON.parse(stored.projectJson) as Snapshot["project"];
    const pdfs: { sha256: string; bytes: Uint8Array }[] = [];
    for (const revision of project.revisions) {
      if (pdfs.some((pdf) => pdf.sha256 === revision.pdfSha256)) continue;
      const bytes = await requestTo(
        transaction.objectStore("blobs").get(revision.pdfSha256) as IDBRequest<Uint8Array | undefined>,
      );
      if (!bytes) throw new Error(`Stored project is missing PDF ${revision.pdfSha256}`);
      pdfs.push({ sha256: revision.pdfSha256, bytes: copyBytes(bytes) });
    }
    await finished;
    db.close();
    return {
      generation: stored.generation,
      savedAt: stored.savedAt,
      snapshot: { project, pdfs },
    };
  }

  async list(): Promise<ProjectIndexEntry[]> {
    const db = await this.db();
    const transaction = db.transaction(["committed"], "readonly");
    const finished = transactionDone(transaction);
    const all = await requestTo(
      transaction.objectStore("committed").getAll() as IDBRequest<StoredCommit[]>,
    );
    await finished;
    db.close();
    return all
      .map((stored) => {
        const project = JSON.parse(stored.projectJson) as Snapshot["project"];
        return {
          id: project.id,
          name: project.name,
          customerLabel: project.customerLabel,
          jobLabel: project.jobLabel,
          updatedAt: stored.savedAt,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(request: SaveRequest, hooks?: SaveHooks): Promise<SaveResult> {
    const db = await this.db();
    const readTx = db.transaction(["committed"], "readonly");
    const readDone = transactionDone(readTx);
    const current = await requestTo(
      readTx.objectStore("committed").get(request.projectId) as IDBRequest<StoredCommit | undefined>,
    );
    await readDone;
    const committedGeneration = current?.generation ?? 0;
    const pendingTx = db.transaction(["pending", "pendingBlobs"], "readwrite");
    const pendingDone = transactionDone(pendingTx);
    pendingTx.objectStore("pending").put(
      {
        expectedGeneration: request.expectedGeneration,
        projectJson: JSON.stringify(request.snapshot.project),
        savedAt: request.savedAt,
      },
      request.projectId,
    );
    for (const pdf of request.snapshot.pdfs) {
      pendingTx.objectStore("pendingBlobs").put(copyBytes(pdf.bytes), pdf.sha256);
    }
    try {
      await pendingDone;
      if (hooks?.afterPending) await hooks.afterPending();
    } catch (error: unknown) {
      db.close();
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Save interrupted before commit.",
        committedGeneration,
        previousIntact: true,
      };
    }
    if (request.expectedGeneration !== committedGeneration) {
      const clearTx = db.transaction(["pending"], "readwrite");
      const clearDone = transactionDone(clearTx);
      clearTx.objectStore("pending").delete(request.projectId);
      await clearDone;
      db.close();
      return { status: "conflict", committedGeneration };
    }
    const writeTx = db.transaction(["committed", "blobs", "pending"], "readwrite");
    const writeDone = transactionDone(writeTx);
    writeTx.objectStore("committed").put(
      {
        generation: committedGeneration + 1,
        projectJson: JSON.stringify(request.snapshot.project),
        savedAt: request.savedAt,
      } satisfies StoredCommit,
      request.projectId,
    );
    for (const pdf of request.snapshot.pdfs) {
      writeTx.objectStore("blobs").put(copyBytes(pdf.bytes), pdf.sha256);
    }
    writeTx.objectStore("pending").delete(request.projectId);
    await writeDone;
    db.close();
    return { status: "saved", generation: committedGeneration + 1 };
  }
}

export function snapshotBytes(snapshot: Snapshot): Map<string, Uint8Array> {
  return new Map(cloneSnapshot(snapshot).pdfs.map((pdf) => [pdf.sha256, pdf.bytes]));
}
