// Sirve el sitio (raíz del repo) para pruebas, apuntando config.js al GitHub simulado.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
export function servirSitio({ raiz, puerto, api, versionForzada }) {
  const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
  const s = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let ruta = decodeURIComponent(url.pathname);
    if (ruta === "/") ruta = "/index.html";
    if (ruta === "/config.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      return res.end(`export const CONFIG = { owner: "o", repo: "r", rama: "datos", api: "${api}", raw: "${api}/raw" };`);
    }
    if (ruta === "/version.json" && versionForzada.v) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ v: versionForzada.v })); }
    const archivo = path.join(raiz, ruta);
    if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end(); }
    let cuerpo = fs.readFileSync(archivo);
    // El CSP real solo permite api.github.com y raw.githubusercontent.com; en la prueba se agrega el simulador
    if (ruta === "/index.html") cuerpo = Buffer.from(cuerpo.toString().replace("connect-src 'self'", `connect-src 'self' ${api}`));
    res.writeHead(200, { "Content-Type": tipos[path.extname(archivo)] ?? "application/octet-stream" });
    res.end(cuerpo);
  });
  return new Promise((ok) => s.listen(puerto, "127.0.0.1", () => ok(s)));
}
