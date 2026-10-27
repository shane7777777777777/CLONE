import { cpSync, createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

function serveDirectory(urlPrefix: string, directory: string): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const path = req.url?.split("?")[0] ?? "";
    if (!path.startsWith(urlPrefix)) {
      next();
      return;
    }
    const relative = normalize(decodeURIComponent(path.slice(urlPrefix.length)));
    if (relative.startsWith("..") || relative.includes("..")) {
      res.statusCode = 400;
      res.end("Invalid path");
      return;
    }
    const file = join(directory, relative);
    if (!file.startsWith(directory) || !existsSync(file)) {
      res.statusCode = 404;
      res.end("Missing file");
      return;
    }
    const type =
      extname(file) === ".pdf"
        ? "application/pdf"
        : extname(file) === ".json"
          ? "application/json"
          : "application/octet-stream";
    res.setHeader("Content-Type", type);
    createReadStream(file).pipe(res);
  };
  return {
    name: `serve-${urlPrefix.replaceAll("/", "")}`,
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function copyStandardFonts(): Plugin {
  const source = join(root, "node_modules/pdfjs-dist/standard_fonts");
  return {
    name: "copy-standard-fonts",
    closeBundle() {
      cpSync(source, join(root, "dist/standard_fonts"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [
    serveDirectory("/fixtures/", join(root, "fixtures")),
    serveDirectory("/standard_fonts/", join(root, "node_modules/pdfjs-dist/standard_fonts")),
    copyStandardFonts(),
  ],
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { outDir: "dist", sourcemap: true },
});
