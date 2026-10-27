import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Versión AAAAMMDDhhmm (hora de Costa Rica) para las URLs de los scripts y la revisión de versión
const VERSION = process.env.VERSION ?? new Date(Date.now() - 6 * 3600000).toISOString().replace(/\D/g, "").slice(0, 12);
const raiz = path.resolve(__dirname, "..");

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(VERSION) },
  resolve: { alias: { ghdb: path.join(raiz, "ghdb.js"), config: path.join(raiz, "config.js") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      // ghdb.js y config.js viven sueltos en la raíz del sitio (código legible y auditable)
      external: [path.join(raiz, "ghdb.js"), path.join(raiz, "config.js")],
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "lib/[name].js",
        assetFileNames: (a) => (a.name?.endsWith(".css") ? "estilos.css" : "lib/fuentes/[name][extname]"),
        manualChunks: (id) => (id.includes("node_modules") ? "vendor" : undefined),
        paths: { [path.join(raiz, "ghdb.js")]: `./ghdb.js?v=${VERSION}`, [path.join(raiz, "config.js")]: `./config.js?v=${VERSION}` },
      },
    },
  },
  test: { environment: "jsdom", alias: { ghdb: path.join(raiz, "ghdb.js"), config: path.join(__dirname, "pruebas/config.prueba.js") } },
});
