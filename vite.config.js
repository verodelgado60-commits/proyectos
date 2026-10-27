import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

// Dos versiones de la misma app:
// - normal (GitHub Pages + Supabase)
// - "claude": página dentro de Claude, con su base de datos e identidad (npm run build:claude)
// En modo "claude", un archivo X.claude.js(x) reemplaza a X.js(x) si existe.
function variantesClaude() {
  return {
    name: "variantes-claude",
    enforce: "pre",
    async resolveId(fuente, importador, opciones) {
      if (!importador || !/\.(jsx?|tsx?)$/.test(fuente)) return null;
      const r = await this.resolve(fuente, importador, { ...opciones, skipSelf: true });
      if (!r?.id) return null;
      const alt = r.id.replace(/\.(jsx?)$/, ".claude.$1");
      return fs.existsSync(alt) ? alt : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const claude = mode === "claude";
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  let origen = "https://*.supabase.co", ws = "wss://*.supabase.co";
  try {
    const u = new URL(env.VITE_SUPABASE_URL);
    origen = u.origin;
    ws = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
  } catch { /* sin URL: valor genérico */ }
  return {
    base: "./",
    plugins: [
      react(),
      claude && variantesClaude(),
      claude && viteSingleFile(),
      {
        name: "html-por-version",
        transformIndexHtml(html) {
          if (claude) return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/, "");
          // La política de seguridad solo permite conectarse a TU proyecto de Supabase
          return html.replaceAll("__SUPABASE_ORIGEN__", origen).replaceAll("__SUPABASE_WS__", ws);
        },
      },
    ].filter(Boolean),
    // La entrada de la app es app.html; index.html (raíz) es el acceso directo que publica GitHub Pages
    build: claude
      ? { outDir: "dist-claude", assetsInlineLimit: 100000000, cssCodeSplit: false, rollupOptions: { input: "app.html" } }
      : { rollupOptions: { input: "app.html" } },
    test: { environment: "jsdom" },
  };
});
