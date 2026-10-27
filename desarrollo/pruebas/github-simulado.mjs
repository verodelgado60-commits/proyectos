// Simulador de la API de contenidos de GitHub para pruebas locales.
// Implementa lo que usa ghdb.js: contents GET/PUT/DELETE (sha, 409/422, ETag/304),
// git/blobs (archivos > 1 MB), raw.githubusercontent.com, límite de cupo y fallas.
import http from "node:http";
import crypto from "node:crypto";

export function crearSimulador({ owner = "o", repo = "r", tokenValido = "github_pat_PRUEBA_0123456789abcdefghij" } = {}) {
  const archivos = new Map(); // "rama:ruta" -> Buffer
  const control = { limite: false, fallaEscritura: false, escrituras: 0, lecturasApi: 0, lecturasRaw: 0, commits: [] };
  const shaDe = (buf) => crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match, Accept",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "ETag, X-RateLimit-Remaining, X-RateLimit-Reset",
  };
  const responder = (res, codigo, cuerpo, extra = {}) => {
    const esBuffer = Buffer.isBuffer(cuerpo);
    res.writeHead(codigo, { ...cors, "Content-Type": esBuffer ? "application/octet-stream" : "application/json", ...extra });
    res.end(esBuffer ? cuerpo : cuerpo === undefined ? "" : JSON.stringify(cuerpo));
  };
  const leerCuerpo = (req) => new Promise((ok) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => ok(Buffer.concat(p))); });

  const servidor = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") return responder(res, 204);
    const url = new URL(req.url, "http://x");
    const auth = req.headers.authorization;
    const autorizado = auth === `Bearer ${tokenValido}`;
    if (auth && !autorizado) return responder(res, 401, { message: "Bad credentials" });

    // raw.githubusercontent.com/{owner}/{repo}/{rama}/{ruta}
    let m = url.pathname.match(/^\/raw\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) {
      control.lecturasRaw++;
      const b = archivos.get(`${decodeURIComponent(m[3])}:${decodeURIComponent(m[4])}`);
      return b ? responder(res, 200, b, { "Content-Type": "text/plain" }) : responder(res, 404, { message: "Not Found" });
    }
    m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/blobs\/([0-9a-f]+)$/);
    if (m) {
      const b = [...archivos.values()].find((x) => shaDe(x) === m[3]);
      return b ? responder(res, 200, b) : responder(res, 404, { message: "Not Found" });
    }
    m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    if (!m || m[1] !== owner || m[2] !== repo) return responder(res, 404, { message: "Not Found" });
    const ruta = m[3].split("/").map(decodeURIComponent).join("/");

    if (req.method === "GET") {
      control.lecturasApi++;
      if (control.limite) return responder(res, 403, { message: "API rate limit exceeded" }, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600) });
      const rama = url.searchParams.get("ref") || "main";
      const prefijo = `${rama}:${ruta}/`;
      const enCarpeta = [...archivos.keys()].filter((k) => k.startsWith(prefijo));
      if (enCarpeta.length) return responder(res, 200, enCarpeta.map((k) => ({ type: "file", path: k.slice(rama.length + 1), sha: shaDe(archivos.get(k)) })));
      const b = archivos.get(`${rama}:${ruta}`);
      if (!b) return responder(res, 404, { message: "Not Found" });
      const sha = shaDe(b);
      const etag = `"${sha}"`;
      if (req.headers["if-none-match"] === etag) return responder(res, 304, undefined, { ETag: etag });
      const grande = b.length > 1024 * 1024;
      return responder(res, 200, { type: "file", path: ruta, sha, size: b.length, encoding: grande ? "none" : "base64", content: grande ? "" : b.toString("base64").replace(/(.{60})/g, "$1\n") }, { ETag: etag });
    }
    if (req.method === "PUT" || req.method === "DELETE") {
      if (!autorizado) return responder(res, 401, { message: "Requires authentication" });
      if (control.fallaEscritura) return responder(res, 502, { message: "Bad gateway (simulado)" });
      const cuerpo = JSON.parse((await leerCuerpo(req)).toString() || "{}");
      const clave = `${cuerpo.branch || "main"}:${ruta}`;
      const actual = archivos.get(clave);
      if (req.method === "DELETE") {
        if (!actual) return responder(res, 404, { message: "Not Found" });
        if (cuerpo.sha !== shaDe(actual)) return responder(res, 409, { message: "sha mismatch" });
        archivos.delete(clave); control.commits.push(cuerpo.message);
        return responder(res, 200, { commit: {} });
      }
      if (actual && !cuerpo.sha) return responder(res, 422, { message: "sha wasn't supplied" });
      if (actual && cuerpo.sha !== shaDe(actual)) return responder(res, 409, { message: "does not match" });
      if (!actual && cuerpo.sha) return responder(res, 409, { message: "does not match" });
      const nuevo = Buffer.from(cuerpo.content, "base64");
      archivos.set(clave, nuevo); control.escrituras++; control.commits.push(cuerpo.message);
      return responder(res, actual ? 200 : 201, { content: { path: ruta, sha: shaDe(nuevo) }, commit: {} });
    }
    return responder(res, 405, { message: "Method not allowed" });
  });

  return {
    servidor, archivos, control, tokenValido, shaDe,
    poner: (rama, ruta, buf) => archivos.set(`${rama}:${ruta}`, Buffer.from(buf)),
    obtener: (rama, ruta) => archivos.get(`${rama}:${ruta}`),
    escuchar: (puerto) => new Promise((ok) => servidor.listen(puerto, "127.0.0.1", ok)),
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}
