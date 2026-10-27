import type { PageInfo } from "../domain/model.js";
import { assertPdfCandidate, openPdf } from "./open.js";
import { sha256Bytes } from "./bytes.js";

export async function inspectPdf(bytes: Uint8Array): Promise<{ sha256: string; pages: PageInfo[] }> {
  const problem = assertPdfCandidate(bytes);
  if (problem) throw new Error(problem);
  const opened = await openPdf(bytes);
  try {
    return { sha256: await sha256Bytes(bytes), pages: opened.pages };
  } finally {
    await opened.document.destroy();
  }
}
