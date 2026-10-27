// Levanta GitHub simulado + sitio para la prueba en navegador. Escribe la clave temporal en un archivo.
import fs from "node:fs";
import path from "node:path";
import { crearSimulador } from "./github-simulado.mjs";
import { servirSitio } from "./servidor-sitio.mjs";
import { crearInstalacion } from "../../ghdb.js";
const sim = crearSimulador({ owner: "o", repo: "r" });
await sim.escuchar(4378);
const { usuarios, datos } = await crearInstalacion({ usuarioAdmin: "VeronicaDelgado1", claveAdmin: "Temporal-Prueba-9", nombreAdmin: "Verónica Delgado" });
sim.poner("datos", "usuarios.json", JSON.stringify(usuarios));
sim.poner("datos", "datos.json", JSON.stringify(datos));
const versionForzada = { v: null };
await servirSitio({ raiz: path.resolve(import.meta.dirname, "../.."), puerto: 4379, api: "http://127.0.0.1:4378", versionForzada });
// Control remoto simple para la prueba
import http from "node:http";
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.searchParams.has("version")) versionForzada.v = u.searchParams.get("version") || null;
  if (u.searchParams.has("archivo")) { const b = sim.obtener("datos", u.searchParams.get("archivo")); res.end(b ? b : ""); return; }
  res.end(JSON.stringify({ token: sim.tokenValido, escrituras: sim.control.escrituras, raw: sim.control.lecturasRaw }));
}).listen(4380, "127.0.0.1");
console.log("listo");
