import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const requestedBase = process.env.PAGES_BASE_PATH || "/verzamelde-paginas/";
const baseName = requestedBase.replace(/^\/+|\/+$/g, "");
const base = baseName ? `/${baseName}/` : "/";

export default defineConfig({
  root: path.join(projectRoot, "github-pages"),
  base,
  publicDir: path.join(projectRoot, "public"),
  plugins: [react()],
  build: {
    outDir: path.join(projectRoot, "pages-dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
