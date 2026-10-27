// Compila la app y copia el sitio a la raíz del repositorio (lo que publica GitHub Pages).
// Agrega ?v=AAAAMMDDhhmm a todos los scripts y estilos, y escribe version.json.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VERSION = new Date(Date.now() - 6 * 3600000).toISOString().replace(/\D/g, "").slice(0, 12);
const aqui = path.resolve(import.meta.dirname, "..");
const raiz = path.resolve(aqui, "..");
execSync("npx vite build", { cwd: aqui, stdio: "inherit", env: { ...process.env, VERSION } });

const dist = path.join(aqui, "dist");
// Limpia lo publicado antes (solo archivos del sitio, nunca el código fuente)
for (const f of ["index.html", "app.js", "estilos.css", "version.json"]) fs.rmSync(path.join(raiz, f), { force: true });
fs.rmSync(path.join(raiz, "lib"), { recursive: true, force: true });

const v = (texto) => texto
  .replaceAll('"./lib/vendor.js"', `"./lib/vendor.js?v=${VERSION}"`)
  .replaceAll("'./lib/vendor.js'", `'./lib/vendor.js?v=${VERSION}'`);
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
html = html.replace(/src="\.\/app\.js"/, `src="./app.js?v=${VERSION}"`).replace(/href="\.\/estilos\.css"/, `href="./estilos.css?v=${VERSION}"`);
fs.writeFileSync(path.join(raiz, "index.html"), html);
fs.writeFileSync(path.join(raiz, "app.js"), v(fs.readFileSync(path.join(dist, "app.js"), "utf8")));
fs.copyFileSync(path.join(dist, "estilos.css"), path.join(raiz, "estilos.css"));
fs.cpSync(path.join(dist, "lib"), path.join(raiz, "lib"), { recursive: true });
fs.writeFileSync(path.join(raiz, "version.json"), JSON.stringify({ v: VERSION }) + "\n");
console.log(`Sitio publicado en la raíz con versión ${VERSION}`);
