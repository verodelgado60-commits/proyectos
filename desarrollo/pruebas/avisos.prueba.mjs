// Prueba del recordatorio por WhatsApp contra un GitHub simulado y un WhatsApp simulado.
// Uso: node pruebas/avisos.prueba.mjs
import http from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import { crearSimulador } from "./github-simulado.mjs";
import { crearCliente, crearInstalacion } from "../../ghdb.js";
import { claves, reglas } from "../src/lib/reglas.js";

let ok = 0, fallas = 0;
const check = (n, c) => { if (c) { ok++; console.log("  ✔", n); } else { fallas++; console.log("  ✘", n); } };
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const PUERTO = 4391, PUERTO_WA = 4392;
const sim = crearSimulador({ owner: "o", repo: "r" });
await sim.escuchar(PUERTO);
const config = { owner: "o", repo: "r", rama: "datos", api: `http://127.0.0.1:${PUERTO}`, raw: `http://127.0.0.1:${PUERTO}/raw` };
const { usuarios, datos } = await crearInstalacion({ usuarioAdmin: "VeronicaDelgado1", claveAdmin: "Temporal-Prueba-9", nombreAdmin: "Verónica Delgado" });
sim.poner("datos", "usuarios.json", JSON.stringify(usuarios));
sim.poner("datos", "datos.json", JSON.stringify(datos));

// Datos: proyecto IVR, una tarea que vence mañana y subtareas de hoy (una lista, otra N/A)
const a = crearCliente(config, { claves, reglas, almacenamiento: memoria(), persistente: memoria() });
await a.auth.signInWithPassword({ usuario: "VeronicaDelgado1", password: "Temporal-Prueba-9" });
await a.auth.guardarToken(sim.tokenValido);
await a.admin.crear({ usuario: "avisos", nombre: "Avisos", clave: "Avisos-Lector-1", rol: "lector" });
const { data: carpeta } = await a.from("carpetas").insert({ name: "IVR" }).select().single();
const { data: t1 } = await a.from("projects").insert({ name: "Retenciones\nMóvil", carpeta_id: carpeta.id, due_date: "2026-11-04" }).select().single();
const { data: t2 } = await a.from("projects").insert({ name: "Lejana", carpeta_id: carpeta.id, due_date: "2026-12-30" }).select().single();
const { data: labels } = await a.from("labels").select("*").eq("project_id", t1.id);
const listo = labels.find((l) => l.name === "Listo"), curso = labels.find((l) => l.name === "En curso");
const { data: grupos } = await a.from("groups").select("*").eq("project_id", t1.id);
await a.from("tasks").insert([
  { project_id: t1.id, group_id: grupos[0].id, title: "Enviar flujo", due_date: "2026-11-03", status_id: curso.id },
  { project_id: t1.id, group_id: grupos[0].id, title: "Ya terminada", due_date: "2026-11-03", status_id: listo.id },
  { project_id: t1.id, group_id: grupos[0].id, title: "Sin fecha", fecha_na: true, status_id: curso.id },
  { project_id: t2.id, group_id: grupos[0].id, title: "Dentro de un mes", due_date: "2026-12-01", status_id: curso.id },
]);
await a.guardarAhora();
for (let i = 0; i < 200 && a.pendientes(); i++) await esperar(100);
check("datos de prueba guardados", a.pendientes() === 0);

// WhatsApp simulado
const recibidos = [];
const wa = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => { recibidos.push({ url: req.url, auth: req.headers.authorization, cuerpo: JSON.parse(b || "{}") }); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"messages":[{"id":"x"}]}'); });
}).listen(PUERTO_WA, "127.0.0.1");

const correr = (extra) => new Promise((resolve) => {
  execFile("node", [path.join(import.meta.dirname, "../scripts/avisos-whatsapp.mjs")], {
    env: { ...process.env, AVISOS_CONFIG: JSON.stringify(config), AVISOS_USUARIO: "avisos", AVISOS_CLAVE: "Avisos-Lector-1",
      WA_TOKEN: "token-falso", WA_PHONE_ID: "123", WA_DESTINO: "+506 8888-7777", WA_API: `http://127.0.0.1:${PUERTO_WA}`, ...extra },
  }, (err, stdout, stderr) => resolve({ codigo: err ? err.code : 0, salida: stdout + stderr }));
});

console.log("Recordatorio por WhatsApp");
let r = await correr({ AVISOS_HOY: "2026-11-03" });
const primera = r;
check("el script termina bien", r.codigo === 0);
check("se envió un solo mensaje", recibidos.length === 1);
const m = recibidos[0]?.cuerpo;
const params = m?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
check("va a la API oficial con el token y el número limpio", recibidos[0]?.url === "/v23.0/123/messages" && recibidos[0]?.auth === "Bearer token-falso" && m?.to === "50688887777");
check("usa la plantilla aprobada en español", m?.type === "template" && m.template.name === "recordatorio_vencimiento" && m.template.language.code === "es");
check("saluda a Vero", params[0] === "Vero");
check("incluye lo de hoy y mañana", /HOY: Enviar flujo \(Retenciones Móvil\)/.test(params[1]) && /MAÑANA: Retenciones Móvil \(IVR\)/.test(params[1]));
check("no incluye lo listo, lo N/A ni lo lejano", !/Ya terminada|Sin fecha|Lejana|Dentro de un mes/.test(params[1]));
check("el texto no lleva saltos de línea (lo exige Meta)", !/[\n\t]/.test(params[1]));

r = await correr({ AVISOS_HOY: "2026-11-20" });
check("el registro no muestra nombres de tareas (es público)", !/Enviar flujo|Retenciones/.test(primera.salida));
check("si nada vence, no envía", r.codigo === 0 && recibidos.length === 1 && /No se envía/.test(r.salida));

r = await correr({ AVISOS_HOY: "2026-11-03", AVISOS_CLAVE: "mala" });
check("con clave incorrecta falla sin enviar", r.codigo !== 0 && recibidos.length === 1);

r = await correr({ AVISOS_USUARIO: "", AVISOS_CLAVE: "", WA_TOKEN: "", WA_PHONE_ID: "", WA_DESTINO: "" });
check("sin configurar: no hace nada y no falla", r.codigo === 0 && /aún no está configurado/.test(r.salida) && recibidos.length === 1);
r = await correr({ AVISOS_HOY: "2026-11-03", WA_TOKEN: "" });
check("si falta un Secret lo dice y no envía", r.codigo !== 0 && /Faltan estos Secrets: WA_TOKEN/.test(r.salida) && recibidos.length === 1);

wa.close();
console.log(`\nResultado: ${ok} OK, ${fallas} fallidas`);
process.exit(fallas ? 1 : 0);
