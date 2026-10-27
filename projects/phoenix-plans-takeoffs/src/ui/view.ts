import { calibrationFor, type Point, type Project, type Task, type Unit } from "../domain/model.js";
import { quantityRows } from "../domain/measurements.js";
import { linkLabel, parseTags, visibleTasks } from "../domain/tasks.js";
import { openPdf, renderPdfPage, type PdfJsDocument, type PdfJsViewport } from "../pdf/open.js";
import { statusLabel, todayString, type Session, type Tool } from "../session.js";
import type { ProjectIndexEntry } from "../storage/memory.js";

export interface Host {
  listProjects: () => Promise<ProjectIndexEntry[]>;
  openProject: (id: string) => Promise<void>;
  save: () => Promise<void>;
  exportPdf: () => Promise<void>;
  downloadBundle: () => Promise<void>;
  reimportFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  overwrite: () => Promise<void>;
  discard: () => Promise<void>;
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "pan", label: "Pan" },
  { id: "ink", label: "Pen" },
  { id: "highlight", label: "Marker" },
  { id: "line", label: "Line" },
  { id: "rect", label: "Rect" },
  { id: "ellipse", label: "Ellipse" },
  { id: "text", label: "Note" },
  { id: "calibrate", label: "Calibrate" },
  { id: "distance", label: "Distance" },
  { id: "count", label: "Count" },
  { id: "area", label: "Area" },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function svg(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function mount(root: HTMLElement, session: Session, host: Host): void {
  const docs = new Map<string, Promise<PdfJsDocument>>();
  const thumbs = new Map<string, string>();
  let viewport: PdfJsViewport | null = null;
  let mode = "";
  let paintToken = 0;
  let fittedFor = "";
  const draft: { points: Point[]; pointerId: number | null } = { points: [], pointerId: null };

  const userPoint = (event: PointerEvent, overlay: SVGElement): Point | null => {
    if (!viewport) return null;
    const rect = overlay.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    return { x: x ?? 0, y: y ?? 0 };
  };

  const documentFor = (sha: string): Promise<PdfJsDocument> => {
    const cached = docs.get(sha);
    if (cached) return cached;
    const bytes = session.pdfs.get(sha);
    if (!bytes) return Promise.reject(new Error("The PDF bytes for this revision are not loaded."));
    const pending = openPdf(bytes).then((opened) => opened.document);
    docs.set(sha, pending);
    return pending;
  };

  const render = (): void => {
    if (!session.project) {
      if (mode !== "library") {
        mode = "library";
        root.replaceChildren(renderLibrary());
      }
      void refreshLibrary();
      return;
    }
    if (mode !== `editor:${session.project.id}`) {
      mode = `editor:${session.project.id}`;
      fittedFor = "";
      root.replaceChildren(renderEditor());
    }
    updateEditor();
  };

  const renderLibrary = (): HTMLElement => {
    const name = el("input", { id: "project-name", "data-testid": "project-name", value: "Synthetic yard office" });
    const customer = el("input", { id: "customer-label", "data-testid": "customer-label", value: "Synthetic — Northwind Fabrication" });
    const job = el("input", { id: "job-label", "data-testid": "job-label", value: "Job 100 — Yard office" });
    const create = el("button", { class: "btn", type: "button", "data-testid": "create-project" }, "Create project");
    create.addEventListener("click", () => {
      session.createProject({ name: name.value, customerLabel: customer.value, jobLabel: job.value });
    });
    const sample = el("button", { class: "btn-gold", type: "button", "data-testid": "load-sample" }, "Open synthetic sample");
    sample.addEventListener("click", () => void host.loadSample());
    const list = el("div", { class: "project-list", "data-testid": "project-list" });
    const file = el("input", { type: "file", accept: "application/pdf,.pdf", "data-testid": "reimport-file" });
    file.addEventListener("change", () => {
      const picked = file.files?.[0];
      if (picked) void host.reimportFile(picked);
    });
    const form = el(
      "form",
      { class: "card" },
      el("h1", {}, "Start a job"),
      el("label", {}, "Project", name),
      el("label", {}, "Customer", customer),
      el("label", {}, "Job", job),
      create,
      sample,
      el("label", {}, "Reimport an annotated PDF", file),
    );
    form.addEventListener("submit", (event) => event.preventDefault());
    return el(
      "section",
      { class: "library", "data-testid": "library" },
      el("header", { class: "library-hero" }, el("div", { class: "brand" }, el("strong", {}, "Phoenix Plans & Takeoffs"), el("span", {}, "Plans, markup, and takeoff notes"))),
      el("div", { class: "library-body" }, form, el("div", {}, el("h2", {}, "Saved on this browser"), list)),
      el(
        "footer",
        { class: "limits", "data-testid": "limits" },
        "Desktop preview. iPad and Apple Pencil acceptance is pending. No Reminders sync, no notifications, no pricing, no Phoenix Hub connection.",
      ),
    );
  };

  const refreshLibrary = async (): Promise<void> => {
    const list = root.querySelector("[data-testid=project-list]");
    if (!list) return;
    const projects = await host.listProjects();
    list.replaceChildren(
      ...(projects.length
        ? projects.map((project) => {
            const button = el(
              "button",
              { type: "button", "data-testid": "open-project" },
              `${project.name} — ${project.jobLabel || "No job label"}`,
            );
            button.addEventListener("click", () => void host.openProject(project.id));
            return button;
          })
        : [el("p", { class: "muted" }, "Nothing is saved in this browser yet.")]),
    );
  };

  const renderEditor = (): HTMLElement => {
    const back = el("button", { class: "btn-quiet", type: "button", "data-testid": "library-button" }, "Library");
    back.addEventListener("click", () => {
      void (async () => {
        if (session.status.state === "unsaved" || session.status.state === "failed") await host.save();
        if (session.status.state === "saved") session.closeToLibrary();
      })();
    });
    const save = el("button", { class: "btn-gold", type: "button", "data-testid": "save" }, "Save");
    save.addEventListener("click", () => void host.save());
    const exportPdf = el("button", { class: "btn", type: "button", "data-testid": "export" }, "Export annotated PDF");
    exportPdf.addEventListener("click", () => void host.exportPdf());
    const bundle = el("button", { class: "btn-quiet", type: "button", "data-testid": "bundle" }, "Download bundle");
    bundle.addEventListener("click", () => void host.downloadBundle());
    const addDoc = el("input", { type: "file", accept: "application/pdf,.pdf", "data-testid": "add-document" });
    addDoc.addEventListener("change", () => {
      const file = addDoc.files?.[0];
      if (file) void file.arrayBuffer().then((buffer) => session.importPdf(new Uint8Array(buffer), file.name, "document"));
    });
    const addRev = el("input", { type: "file", accept: "application/pdf,.pdf", "data-testid": "add-revision" });
    addRev.addEventListener("change", () => {
      const file = addRev.files?.[0];
      if (file) void file.arrayBuffer().then((buffer) => session.importPdf(new Uint8Array(buffer), file.name, "revision"));
    });
    return el(
      "section",
      { class: "editor", "data-testid": "editor" },
      el(
        "header",
        { class: "topbar" },
        back,
        el("div", { class: "brand", "data-region": "title" }),
        el("label", {}, "Document", el("select", { "data-testid": "document-select" })),
        el("label", {}, "Add PDF", addDoc),
        el("label", {}, "Revision", el("select", { "data-testid": "revision-select" })),
        el("label", {}, "New revision", addRev),
        el("div", { class: "status", "data-testid": "status", role: "status" }, "Unsaved"),
        save,
        exportPdf,
        bundle,
      ),
      el("div", { class: "conflict hidden", "data-testid": "conflict-banner" }),
      el("p", { class: "message", "data-testid": "message" }),
      el(
        "div",
        { class: "workspace" },
        el("aside", { class: "thumbs", "data-testid": "thumbs" }),
        el(
          "div",
          { class: "stage-wrap" },
          el(
            "div",
            { class: "pagebar" },
            el("button", { type: "button", "data-testid": "page-prev" }, "Previous"),
            el("button", { type: "button", "data-testid": "page-next" }, "Next"),
            el("span", { "data-testid": "page-label" }, "Page"),
            el("button", { type: "button", "data-testid": "zoom-out" }, "−"),
            el("span", { "data-testid": "zoom-label" }, "100%"),
            el("button", { type: "button", "data-testid": "zoom-in" }, "+"),
            el("button", { type: "button", "data-testid": "zoom-fit" }, "Fit"),
          ),
          el("p", { class: "banner", "data-testid": "calibration-banner" }),
          el(
            "div",
            { class: "scroller", "data-testid": "scroller" },
            el("div", { class: "stage" }, el("canvas", { "data-testid": "pdf-canvas" }), svg("svg", { class: "overlay", "data-testid": "overlay" })),
          ),
          el("div", { class: "tools", "data-testid": "tools" }),
        ),
        el(
          "aside",
          { class: "side" },
          el("section", { "data-testid": "quantities" }),
          el("section", { "data-testid": "tasks" }),
        ),
      ),
      el(
        "footer",
        { class: "limits", "data-testid": "limits" },
        "Drawings stay on a light sheet. Pen pressure is not reproduced. Pencil-only and the wide-touch filter are unverified on iPad. iPad acceptance is pending. No Hub login.",
      ),
    );
  };

  const updateEditor = (): void => {
    const project = session.project;
    if (!project) return;
    const title = root.querySelector("[data-region=title]");
    if (title) title.textContent = `${project.name} · ${project.customerLabel}`;
    paintStatus();
    paintSelects(project);
    paintBanner(project);
    paintTools();
    paintTasks(project);
    paintQuantities(project);
    void paintSheet();
    void paintThumbs(project);
  };

  const paintStatus = (): void => {
    const status = root.querySelector<HTMLElement>("[data-testid=status]");
    if (!status) return;
    status.dataset.state = session.status.state;
    status.textContent = statusLabel(session.status);
    const banner = root.querySelector<HTMLElement>("[data-testid=conflict-banner]");
    if (!banner) return;
    banner.classList.toggle("hidden", session.status.state !== "conflict");
    if (session.status.state === "conflict") {
      banner.replaceChildren(
        el("p", {}, session.message || "Conflict: the saved copy changed. Your edits were not overwritten."),
        button("Keep my edits", "keep-mine", () => void host.overwrite()),
        button("Use saved copy", "discard-changes", () => void host.discard()),
      );
    }
    const message = root.querySelector("[data-testid=message]");
    if (message) message.textContent = session.status.state === "conflict" ? "" : session.message ?? "";
  };

  const button = (label: string, testid: string, action: () => void): HTMLButtonElement => {
    const node = el("button", { class: "btn", type: "button", "data-testid": testid }, label);
    node.addEventListener("click", action);
    return node;
  };

  const paintSelects = (project: Project): void => {
    const documents = root.querySelector<HTMLSelectElement>("[data-testid=document-select]");
    const revisions = root.querySelector<HTMLSelectElement>("[data-testid=revision-select]");
    if (!documents || !revisions || document.activeElement === documents || document.activeElement === revisions) return;
    documents.replaceChildren(
      ...project.documents.map((document) => el("option", { value: document.id }, document.title)),
    );
    documents.value = session.documentId ?? "";
    documents.onchange = () => session.selectDocument(documents.value);
    const visible = project.revisions.filter((revision) => revision.documentId === session.documentId);
    revisions.replaceChildren(...visible.map((revision) => el("option", { value: revision.id }, `Rev ${revision.label}`)));
    revisions.value = session.revisionId ?? "";
    revisions.onchange = () => session.selectRevision(revisions.value);
  };

  const paintBanner = (project: Project): void => {
    const banner = root.querySelector("[data-testid=calibration-banner]");
    const revision = session.currentRevision();
    if (!banner || !revision) return;
    const calibration = calibrationFor(project, revision.id, session.pageIndex);
    banner.textContent = calibration
      ? `Calibrated on this page only: ${calibration.knownLength} ${calibration.unit}. Other pages and revisions are not included.`
      : "This page is not calibrated. Distance and area stay blocked until you mark a known length here.";
  };

  const paintTools = (): void => {
    const bar = root.querySelector("[data-testid=tools]");
    if (!bar) return;
    const focused = document.activeElement;
    if (focused && bar.contains(focused)) return;
    bar.replaceChildren(
      ...TOOLS.map((tool) => {
        const node = el("button", { type: "button", "data-testid": `tool-${tool.id}`, "aria-pressed": String(session.tool === tool.id) }, tool.label);
        node.addEventListener("click", () => session.setTool(tool.id));
        return node;
      }),
      (() => {
        const node = el("button", { type: "button", "data-testid": "pen-only", "aria-pressed": String(session.penOnly) }, "Pencil only");
        node.addEventListener("click", () => session.setPenOnly(!session.penOnly));
        return node;
      })(),
      (() => {
        const node = el("button", { type: "button", "data-testid": "undo" }, "Undo");
        node.disabled = !session.canUndo();
        node.addEventListener("click", () => session.undoChange());
        return node;
      })(),
      (() => {
        const node = el("button", { type: "button", "data-testid": "redo" }, "Redo");
        node.disabled = !session.canRedo();
        node.addEventListener("click", () => session.redoChange());
        return node;
      })(),
      (() => {
        const node = el("button", { type: "button", "data-testid": "delete-selected" }, "Delete");
        node.addEventListener("click", () => session.deleteSelection());
        return node;
      })(),
      el("span", { "data-testid": "tool-hint" }, hint()),
    );
    const prev = root.querySelector<HTMLButtonElement>("[data-testid=page-prev]");
    const next = root.querySelector<HTMLButtonElement>("[data-testid=page-next]");
    const zoomOut = root.querySelector<HTMLButtonElement>("[data-testid=zoom-out]");
    const zoomIn = root.querySelector<HTMLButtonElement>("[data-testid=zoom-in]");
    const fit = root.querySelector<HTMLButtonElement>("[data-testid=zoom-fit]");
    if (prev) prev.onclick = () => session.setPage(session.pageIndex - 1);
    if (next) next.onclick = () => session.setPage(session.pageIndex + 1);
    if (zoomOut) zoomOut.onclick = () => session.setZoom(session.zoom / 1.25);
    if (zoomIn) zoomIn.onclick = () => session.setZoom(session.zoom * 1.25);
    if (fit) fit.onclick = () => { fittedFor = ""; updateEditor(); };
    const label = root.querySelector("[data-testid=page-label]");
    const revision = session.currentRevision();
    if (label && revision) label.textContent = `Page ${session.pageIndex + 1} of ${revision.pages.length} · Rev ${revision.label}`;
    const zoom = root.querySelector("[data-testid=zoom-label]");
    if (zoom) zoom.textContent = `${Math.round(session.zoom * 100)}%`;
    const overlay = root.querySelector<SVGElement>("[data-testid=overlay]");
    if (overlay && !overlay.dataset.bound) {
      overlay.dataset.bound = "true";
      bindPointer(overlay);
    }
  };

  const hint = (): string => {
    if (session.tool === "calibrate") return "Click two ends of a known length, then enter the real distance. This page only.";
    if (session.tool === "area") return "Click corners, then press Close area. Self-crossing shapes are marked unreliable.";
    if (session.tool === "count") return "Click each item. Count does not use scale.";
    if (session.penOnly) return "Pencil only is on. Mouse and finger strokes are ignored. This is not verified palm rejection.";
    return "Markup is stored with the project. Export writes PDF annotations and keeps the pristine file.";
  };

  const bindPointer = (overlay: SVGElement): void => {
    const scroller = root.querySelector<HTMLElement>("[data-testid=scroller]");
    let pan: { x: number; y: number; left: number; top: number } | null = null;
    overlay.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const drawing = session.tool !== "pan";
      if (drawing && session.penOnly && event.pointerType !== "pen") return;
      if (drawing && event.pointerType === "touch" && (event.width > 40 || event.height > 40)) return;
      if (session.tool === "pan" && scroller) {
        pan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
        overlay.setPointerCapture(event.pointerId);
        return;
      }
      const point = userPoint(event, overlay);
      if (!point) return;
      if (session.tool === "text") {
        placeText(point);
        return;
      }
      if (session.tool === "count") {
        session.addCountPoint(point);
        return;
      }
      if (session.tool === "area" || session.tool === "calibrate" || session.tool === "distance") {
        draft.points.push(point);
        if ((session.tool === "calibrate" || session.tool === "distance") && draft.points.length === 2) finishTwoPoint();
        paintOverlay();
        return;
      }
      draft.points = [point];
      draft.pointerId = event.pointerId;
      overlay.setPointerCapture(event.pointerId);
    });
    overlay.addEventListener("pointermove", (event) => {
      if (pan && scroller) {
        scroller.scrollLeft = pan.left - (event.clientX - pan.x);
        scroller.scrollTop = pan.top - (event.clientY - pan.y);
        return;
      }
      if (draft.pointerId !== event.pointerId) return;
      const coalesced = event.getCoalescedEvents?.() ?? [event];
      for (const item of coalesced) {
        const point = userPoint(item, overlay);
        if (point) draft.points.push(point);
      }
      paintOverlay();
    });
    const finishStroke = (event: PointerEvent): void => {
      if (pan) {
        pan = null;
        return;
      }
      if (draft.pointerId !== event.pointerId) return;
      const points = draft.points.slice();
      draft.points = [];
      draft.pointerId = null;
      if (session.tool === "ink" || session.tool === "highlight") session.addInk([points], session.tool);
      else if (points.length > 1) {
        const start = points[0];
        const end = points[points.length - 1];
        if (start && end && (session.tool === "line" || session.tool === "rect" || session.tool === "ellipse")) {
          session.addShape(session.tool, start, end);
        }
      }
    };
    overlay.addEventListener("pointerup", finishStroke);
    overlay.addEventListener("pointercancel", () => {
      draft.points = [];
      draft.pointerId = null;
      pan = null;
    });
  };

  const finishTwoPoint = (): void => {
    const a = draft.points[0];
    const b = draft.points[1];
    draft.points = [];
    if (!a || !b) return;
    if (session.tool === "distance") {
      session.addDistance(a, b);
      return;
    }
    const length = el("input", { type: "number", min: "0", step: "0.001", "data-testid": "calibration-length", value: "10" });
    const unit = el("select", { "data-testid": "calibration-unit" });
    for (const value of ["ft", "in", "m", "cm", "mm"] as const) unit.append(el("option", { value }, value));
    const apply = el("button", { class: "btn-gold", type: "button", "data-testid": "calibration-apply" }, "Apply to this page");
    apply.addEventListener("click", () => {
      session.calibrate(a, b, Number(length.value), unit.value as Unit);
      form.remove();
    });
    const form = el("div", { class: "row", "data-testid": "calibration-form" }, length, unit, apply);
    root.querySelector("[data-testid=calibration-banner]")?.after(form);
  };

  const placeText = (at: Point): void => {
    const input = el("input", { type: "text", "data-testid": "note-input", placeholder: "Note" });
    const save = el("button", { class: "btn", type: "button" }, "Add note");
    const row = el("div", { class: "row" }, input, save);
    const commit = (): void => {
      session.addText(at, input.value);
      row.remove();
    };
    save.addEventListener("click", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
    });
    root.querySelector("[data-testid=calibration-banner]")?.after(row);
    input.focus();
  };

  const paintSheet = async (): Promise<void> => {
    const canvas = root.querySelector<HTMLCanvasElement>("[data-testid=pdf-canvas]");
    const revision = session.currentRevision();
    const page = session.currentPage();
    if (!canvas || !revision || !page) return;
    const fitKey = `${revision.id}:${session.pageIndex}`;
    if (fittedFor !== fitKey) {
      const scroller = root.querySelector<HTMLElement>("[data-testid=scroller]");
      const displayed = page.rotation % 180 === 0 ? page.width : page.height;
      const available = (scroller?.clientWidth ?? 800) - 64;
      session.zoom = Math.max(0.25, Math.min(1.5, available / displayed));
      fittedFor = fitKey;
      const zoom = root.querySelector("[data-testid=zoom-label]");
      if (zoom) zoom.textContent = `${Math.round(session.zoom * 100)}%`;
    }
    const token = ++paintToken;
    try {
      const document = await documentFor(revision.pdfSha256);
      if (token !== paintToken) return;
      viewport = await renderPdfPage(document, session.pageIndex, session.zoom, canvas);
      const overlay = root.querySelector<SVGElement>("[data-testid=overlay]");
      if (overlay) {
        overlay.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;
      }
      paintOverlay();
    } catch (error: unknown) {
      const message = root.querySelector("[data-testid=message]");
      if (message) message.textContent = error instanceof Error ? error.message : "Could not draw this page.";
    }
  };

  const toView = (point: Point): string => {
    if (!viewport) return "0,0";
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
    return `${x},${y}`;
  };

  const paintOverlay = (): void => {
    const overlay = root.querySelector<SVGElement>("[data-testid=overlay]");
    const project = session.project;
    const revision = session.currentRevision();
    if (!overlay || !project || !revision || !viewport) return;
    overlay.replaceChildren();
    overlay.append(
      svg("rect", {
        x: "0",
        y: "0",
        width: String(viewport.width),
        height: String(viewport.height),
        fill: "transparent",
        "pointer-events": "all",
      }),
    );
    const addPath = (points: Point[], color: string, width: number, opacity: number): void => {
      if (points.length < 2) return;
      overlay.append(
        svg("path", {
          d: points
            .map((point, index) => {
              const [x, y] = viewport!.convertToViewportPoint(point.x, point.y);
              return `${index === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" "),
          fill: "none",
          stroke: color,
          "stroke-width": String(width * session.zoom),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-opacity": String(opacity),
        }),
      );
    };
    for (const annotation of project.annotations) {
      if (annotation.revisionId !== revision.id || annotation.pageIndex !== session.pageIndex) continue;
      if (annotation.type === "ink" || annotation.type === "highlight") {
        for (const stroke of annotation.strokes) addPath(stroke, annotation.color, annotation.width, annotation.opacity);
      } else if (annotation.type === "line") addPath([annotation.a, annotation.b], annotation.color, annotation.width, 1);
      else if (annotation.type === "text") {
        const [x, y] = viewport.convertToViewportPoint(annotation.at.x, annotation.at.y);
        const text = svg("text", { x: String(x), y: String(y), fill: annotation.color, "font-size": String(annotation.fontSize * session.zoom) });
        text.textContent = annotation.text;
        overlay.append(text);
      } else if (annotation.type === "rect" || annotation.type === "ellipse") {
        const [x1, y1] = viewport.convertToViewportPoint(annotation.a.x, annotation.a.y);
        const [x2, y2] = viewport.convertToViewportPoint(annotation.b.x, annotation.b.y);
        const shape = annotation.type === "rect" ? "rect" : "ellipse";
        overlay.append(
          svg(shape, {
            x: String(Math.min(x1 ?? 0, x2 ?? 0)),
            y: String(Math.min(y1 ?? 0, y2 ?? 0)),
            width: String(Math.abs((x2 ?? 0) - (x1 ?? 0))),
            height: String(Math.abs((y2 ?? 0) - (y1 ?? 0))),
            cx: String(((x1 ?? 0) + (x2 ?? 0)) / 2),
            cy: String(((y1 ?? 0) + (y2 ?? 0)) / 2),
            rx: String(Math.abs((x2 ?? 0) - (x1 ?? 0)) / 2),
            ry: String(Math.abs((y2 ?? 0) - (y1 ?? 0)) / 2),
            fill: "none",
            stroke: annotation.color,
            "stroke-width": String(annotation.width * session.zoom),
          }),
        );
      }
    }
    for (const measurement of project.measurements) {
      if (measurement.revisionId !== revision.id || measurement.pageIndex !== session.pageIndex) continue;
      if (measurement.kind === "distance") addPath([measurement.a, measurement.b], "#1d4e89", 2, 1);
      if (measurement.kind === "area") addPath([...measurement.polygon, measurement.polygon[0]!].filter(Boolean), "#1d4e89", 2, 1);
      if (measurement.kind === "count") {
        for (const point of measurement.points) {
          const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
          overlay.append(svg("circle", { cx: String(x), cy: String(y), r: String(6 * session.zoom), fill: "none", stroke: "#1d4e89", "stroke-width": "2" }));
        }
      }
    }
    if (draft.points.length > 1) addPath(draft.points, session.tool === "highlight" ? "#C6A15B" : "#B11226", 2, 1);
    if (draft.points.length === 1 && draft.points[0]) {
      const [x, y] = viewport.convertToViewportPoint(draft.points[0].x, draft.points[0].y);
      overlay.append(svg("circle", { cx: String(x), cy: String(y), r: "4", fill: "#1d4e89" }));
    }
    void toView;
  };

  const paintThumbs = async (project: Project): Promise<void> => {
    const hostNode = root.querySelector("[data-testid=thumbs]");
    const revision = session.currentRevision();
    if (!hostNode || !revision) return;
    hostNode.replaceChildren(
      ...revision.pages.map((page, index) => {
        const node = el("button", { type: "button", "aria-current": String(index === session.pageIndex) });
        const key = `${revision.pdfSha256}:${index}`;
        const image = thumbs.get(key);
        node.append(image ? el("img", { src: image, alt: `Page ${index + 1}` }) : el("span", { class: "thumb-fallback" }, String(index + 1)));
        node.append(el("span", {}, String(index + 1)));
        node.addEventListener("click", () => session.setPage(index));
        return node;
      }),
    );
    const bytes = session.pdfs.get(revision.pdfSha256);
    if (!bytes) return;
    let created = false;
    const missing = revision.pages.some((page) => !thumbs.has(`${revision.pdfSha256}:${page.pageIndex}`));
    if (!missing) return;
    const opened = await openPdf(bytes);
    try {
      for (const page of revision.pages) {
        const key = `${revision.pdfSha256}:${page.pageIndex}`;
        if (thumbs.has(key)) continue;
        const canvas = document.createElement("canvas");
        await renderPdfPage(opened.document, page.pageIndex, 0.12, canvas);
        thumbs.set(key, canvas.toDataURL("image/png"));
        created = true;
      }
    } finally {
      await opened.document.destroy();
    }
    if (created && session.project === project && session.revisionId === revision.id) void paintThumbs(project);
  };

  const paintQuantities = (project: Project): void => {
    const hostNode = root.querySelector("[data-testid=quantities]");
    const revision = session.currentRevision();
    if (!hostNode || !revision) return;
    if (hostNode.contains(document.activeElement)) return;
    const unit = el("select", { "data-testid": "display-unit" });
    unit.append(el("option", { value: "page" }, "Page units"));
    for (const value of ["ft", "in", "m", "cm", "mm"] as const) unit.append(el("option", { value }, value));
    unit.value = session.displayUnit;
    unit.onchange = () => session.setDisplayUnit(unit.value as Unit | "page");
    const rows = quantityRows(project, revision.id, session.displayUnit === "page" ? undefined : session.displayUnit);
    const close = el("button", { class: "btn", type: "button", "data-testid": "close-area" }, "Close area");
    close.addEventListener("click", () => {
      if (draft.points.length >= 3) {
        const polygon = draft.points.slice();
        draft.points = [];
        session.addArea(polygon);
      }
    });
    hostNode.replaceChildren(
      el("h2", {}, `Takeoff · Rev ${revision.label}`),
      el("label", {}, "Display unit", unit),
      close,
      ...(rows.length
        ? rows.map((row) =>
            el(
              "article",
              { class: "quantity", "data-status": row.status },
              el("strong", {}, `${row.label} · page ${row.pageIndex + 1} · Rev ${row.revisionLabel}`),
              el("span", {}, row.text),
            ),
          )
        : [el("p", {}, "No quantities on this revision yet.")]),
    );
  };

  const paintTasks = (project: Project): void => {
    const hostNode = root.querySelector("[data-testid=tasks]");
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!hostNode || (typing && hostNode.contains(active))) return;
    const today = todayString();
    const title = el("input", { "data-testid": "task-title", placeholder: "Quick capture" });
    const due = el("input", { type: "date", "data-testid": "task-due" });
    const link = el("input", { type: "checkbox", "data-testid": "task-link" });
    link.checked = true;
    const add = el("button", { class: "btn-gold", type: "button", "data-testid": "task-add" }, "Add task");
    add.addEventListener("click", () => {
      session.addQuickTask(title.value, due.value || null, link.checked);
      title.value = "";
    });
    const views = el("div", { class: "views" });
    for (const view of ["inbox", "today", "upcoming", "flagged", "all"] as const) {
      const node = el("button", { type: "button", "data-testid": `task-view-${view}`, "aria-pressed": String(session.taskView === view) }, view === "today" ? "Today" : view[0]!.toUpperCase() + view.slice(1));
      node.addEventListener("click", () => session.setTaskView(view));
      views.append(node);
    }
    const tasks = visibleTasks(project.tasks, session.taskView, today);
    hostNode.replaceChildren(
      el("h2", {}, "Tasks"),
      el("p", { class: "muted" }, "Today includes overdue. Upcoming is later only. Completion does not cascade to subtasks. No Reminders sync."),
      views,
      el("div", { class: "row" }, title, due, el("label", {}, link, "Link to this page"), add),
      ...tasks.map((task) => renderTask(project, task)),
    );
  };

  const renderTask = (project: Project, task: Task): HTMLElement => {
    const revision = task.link ? project.revisions.find((item) => item.id === task.link?.revisionId) : undefined;
    const done = el("input", { type: "checkbox", "data-testid": "task-complete" });
    done.checked = task.completedAt !== null;
    done.addEventListener("change", () => session.completeTask(task.id, done.checked));
    const name = el("input", { value: task.title, "data-testid": "task-name" });
    name.addEventListener("focus", () => session.checkpoint());
    name.addEventListener("input", () => session.patchTask(task.id, { title: name.value }, false));
    name.addEventListener("blur", () => session.endCheckpoint());
    const date = el("input", { type: "date", value: task.due ?? "" });
    date.addEventListener("change", () => session.patchTask(task.id, { due: date.value || null }));
    const flag = el("button", { type: "button", "aria-pressed": String(task.flagged) }, task.flagged ? "Flagged" : "Flag");
    flag.addEventListener("click", () => session.patchTask(task.id, { flagged: !task.flagged }));
    const priority = el("select", {});
    for (const value of ["none", "low", "medium", "high"] as const) priority.append(el("option", { value }, value));
    priority.value = task.priority;
    priority.addEventListener("change", () => session.patchTask(task.id, { priority: priority.value as Task["priority"] }));
    const tags = el("input", { value: task.tags.join(", "), placeholder: "tags" });
    tags.addEventListener("focus", () => session.checkpoint());
    tags.addEventListener("input", () => session.patchTask(task.id, { tags: parseTags(tags.value) }, false));
    tags.addEventListener("blur", () => session.endCheckpoint());
    const notes = el("textarea", { placeholder: "Notes" }, task.notes);
    notes.addEventListener("focus", () => session.checkpoint());
    notes.addEventListener("input", () => session.patchTask(task.id, { notes: notes.value }, false));
    notes.addEventListener("blur", () => session.endCheckpoint());
    const sub = el("button", { type: "button" }, "Subtask");
    sub.addEventListener("click", () => session.addSubtask(task.id));
    const link = el("button", { type: "button" }, task.link && revision ? linkLabel(task.link, revision.label) : "Link to this page");
    link.addEventListener("click", () => {
      if (task.link) {
        session.selectRevision(task.link.revisionId);
        session.setPage(task.link.pageIndex);
      } else session.linkTaskToCurrentPage(task.id);
    });
    return el(
      "article",
      { class: task.parentId ? "task subtask" : "task", "data-done": String(task.completedAt !== null), "data-testid": "task-card" },
      el("header", {}, done, name, flag),
      el("div", { class: "row" }, date, priority, tags),
      notes,
      el("div", { class: "row" }, sub, link),
    );
  };

  session.subscribe(render);
  render();
}
