import { LIMITS, type PageInfo } from "../domain/model.js";
import { sha256Bytes } from "./bytes.js";

export interface OpenedPdf {
  sha256: string;
  pages: PageInfo[];
  document: PdfJsDocument;
}

interface PdfJsViewport {
  width: number;
  height: number;
  scale: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

interface PdfJsPage {
  view: number[];
  rotate: number;
  getViewport(params: { scale: number }): PdfJsViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
    annotationMode?: number;
  }): { promise: Promise<void>; cancel: () => void };
  cleanup(): void;
}

interface PdfJsAnnotation {
  subtype: string;
  contents?: string;
  inkLists?: number[][][];
  rect?: number[];
  lineCoordinates?: number[];
  vertices?: number[][];
}

export interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  getAnnotations?(): Promise<unknown>;
  getAttachments(): Promise<Record<string, { filename?: string; content: Uint8Array }> | null>;
  destroy(): Promise<void>;
}

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array; isEvalSupported: boolean; disableFontFace: boolean }): {
    promise: Promise<PdfJsDocument>;
    destroy(): void;
  };
};

let workerSrc: string | undefined;
let pdfjsModule: PdfjsModule | undefined;

export function setPdfWorkerSrc(src: string): void {
  workerSrc = src;
}

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsModule) {
    pdfjsModule = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  }
  if (workerSrc) pdfjsModule.GlobalWorkerOptions.workerSrc = workerSrc;
  else if (!pdfjsModule.GlobalWorkerOptions.workerSrc && typeof document === "undefined") {
    pdfjsModule.GlobalWorkerOptions.workerSrc = new URL(
      "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).href;
  }
  return pdfjsModule;
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rotation = ((value % 360) + 360) % 360;
  if (rotation === 90 || rotation === 180 || rotation === 270) return rotation;
  return 0;
}

export function assertPdfCandidate(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "The file is empty.";
  if (bytes.byteLength > LIMITS.maxPdfBytes) {
    return `PDF is larger than the ${LIMITS.maxPdfBytes} byte limit.`;
  }
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.byteLength, 1024)));
  if (!header.includes("%PDF-")) return "This file is not a PDF.";
  return null;
}

export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const problem = assertPdfCandidate(bytes);
  if (problem) throw new Error(problem);
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    disableFontFace: typeof document === "undefined",
    ...(typeof location !== "undefined" ? { standardFontDataUrl: `${location.origin}/standard_fonts/` } : {}),
  });
  try {
    const document = await task.promise;
    if (document.numPages > LIMITS.maxPages) {
      await document.destroy();
      throw new Error(`PDF has ${document.numPages} pages, above the ${LIMITS.maxPages} page limit.`);
    }
    const pages: PageInfo[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const view = page.view;
      const x0 = view[0] ?? 0;
      const y0 = view[1] ?? 0;
      const x1 = view[2] ?? 0;
      const y1 = view[3] ?? 0;
      pages.push({
        pageIndex: pageNumber - 1,
        width: x1 - x0,
        height: y1 - y0,
        rotation: normalizeRotation(page.rotate),
      });
      page.cleanup();
    }
    return { sha256: await sha256Bytes(bytes), pages, document };
  } catch (error: unknown) {
    task.destroy();
    if (error instanceof Error && error.message.startsWith("PDF has")) throw error;
    const message = error instanceof Error ? error.message : "Unreadable PDF";
    throw new Error(`Could not read this PDF: ${message}`);
  }
}

export async function pageViewport(
  document: PdfJsDocument,
  pageIndex: number,
  scale: number,
): Promise<PdfJsViewport> {
  const page = await document.getPage(pageIndex + 1);
  return page.getViewport({ scale });
}

const activeRenders = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();

export async function renderPdfPage(
  document: PdfJsDocument,
  pageIndex: number,
  scale: number,
  canvas: HTMLCanvasElement,
): Promise<PdfJsViewport> {
  const page = await document.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  activeRenders.get(canvas)?.cancel();
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(viewport.width * outputScale);
  canvas.height = Math.ceil(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  const task = page.render({ canvasContext: context, viewport, annotationMode: 0 });
  activeRenders.set(canvas, task);
  try {
    await task.promise;
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "RenderingCancelledException") return viewport;
    throw error;
  }
  return viewport;
}

export async function readAttachments(
  document: PdfJsDocument,
): Promise<Record<string, Uint8Array>> {
  const raw = await document.getAttachments();
  const files: Record<string, Uint8Array> = {};
  if (!raw) return files;
  for (const [name, file] of Object.entries(raw)) {
    files[file.filename || name] = file.content;
  }
  return files;
}

export async function readPageAnnotations(
  document: PdfJsDocument,
  pageIndex: number,
): Promise<PdfJsAnnotation[]> {
  const page = await document.getPage(pageIndex + 1);
  const getter = (page as unknown as { getAnnotations(): Promise<PdfJsAnnotation[]> }).getAnnotations;
  return getter.call(page);
}

export type { PdfJsViewport, PdfJsAnnotation };
