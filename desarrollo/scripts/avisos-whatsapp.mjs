// Recordatorio diario por WhatsApp (API oficial de Meta, WhatsApp Cloud API).
// Lo corre GitHub Actions una vez al día (.github/workflows/avisos-whatsapp.yml).
// Entra con una cuenta de solo lectura (sus datos están en los "Secrets" del repositorio, nunca en el código),
// descifra los datos aquí mismo, busca lo que vence hoy o mañana y envía un solo mensaje.
//
// Variables (Secrets del repositorio):
//   AVISOS_USUARIO, AVISOS_CLAVE      cuenta de solo lectura creada en "Usuarios y permisos"
//   WA_TOKEN                          token permanente de la app de Meta
//   WA_PHONE_ID                       "Phone number ID" del número de WhatsApp Business
//   WA_DESTINO                        tu número con código de país, sin + ni espacios (ej. 50688887777)
//   WA_PLANTILLA (opcional)           nombre de la plantilla aprobada (por defecto: recordatorio_vencimiento)
//   WA_IDIOMA (opcional)              idioma de la plantilla (por defecto: es)
//   WA_VERSION (opcional)             versión de la API de Meta (por defecto: v23.0)
//   AVISOS_NOMBRE (opcional)          cómo saludarte (por defecto: Vero)
// Para pruebas: AVISOS_HOY=AAAA-MM-DD, WA_API (otra URL base), AVISOS_SOLO_MOSTRAR=1 (no envía)
import { crearCliente } from "../../ghdb.js";
import { CONFIG } from "../../config.js";

const env = process.env;
const todos = ["AVISOS_USUARIO", "AVISOS_CLAVE", "WA_TOKEN", "WA_PHONE_ID", "WA_DESTINO"];
if (!env.AVISOS_SOLO_MOSTRAR && todos.every((k) => !env[k])) { console.log("El recordatorio por WhatsApp aún no está configurado (faltan los Secrets). No se hace nada."); process.exit(0); }
const faltan = ["AVISOS_USUARIO", "AVISOS_CLAVE", ...(env.AVISOS_SOLO_MOSTRAR ? [] : ["WA_TOKEN", "WA_PHONE_ID", "WA_DESTINO"])].filter((k) => !env[k]);
if (faltan.length) { console.error(`Faltan estos Secrets: ${faltan.join(", ")}`); process.exit(1); }

const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const config = env.AVISOS_CONFIG ? JSON.parse(env.AVISOS_CONFIG) : CONFIG;
const cliente = crearCliente(config, { almacenamiento: memoria(), persistente: memoria() });

// Fecha de hoy en Costa Rica
const hoy = env.AVISOS_HOY || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
const dias = (iso) => Math.round((Date.UTC(...iso.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(...hoy.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)))) / 86400000);
const limpio = (s) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();

const { error } = await cliente.auth.signInWithPassword({ email: env.AVISOS_USUARIO, password: env.AVISOS_CLAVE });
if (error) { console.error("No se pudo entrar con la cuenta de avisos:", error.message); process.exit(1); }

const leer = async (t) => { const { data, error: e } = await cliente.from(t).select("*"); if (e) throw e; return data ?? []; };
const [tareas, subtareas, etiquetas, carpetas] = await Promise.all([leer("projects"), leer("tasks"), leer("labels"), leer("carpetas")]);
const nombreCarpeta = Object.fromEntries(carpetas.map((c) => [c.id, c.name]));
const tareaPorId = Object.fromEntries(tareas.map((t) => [t.id, t]));
const listas = new Set(etiquetas.filter((l) => l.is_done).map((l) => l.id));

const items = [];
for (const t of tareas) {
  if (!t.due_date) continue;
  const d = dias(t.due_date);
  if (d === 0 || d === 1) items.push({ d, texto: `${limpio(t.name)}${nombreCarpeta[t.carpeta_id] ? ` (${limpio(nombreCarpeta[t.carpeta_id])})` : ""}` });
}
for (const s of subtareas) {
  if (!s.due_date || s.fecha_na || listas.has(s.status_id)) continue;
  const d = dias(s.due_date);
  if (d === 0 || d === 1) items.push({ d, texto: `${limpio(s.title)}${tareaPorId[s.project_id] ? ` (${limpio(tareaPorId[s.project_id].name)})` : ""}` });
}

if (!items.length) { console.log(`${hoy}: nada vence hoy ni mañana. No se envía mensaje.`); process.exit(0); }

const parte = (lista) => lista.slice(0, 8).map((x) => x.texto).join(", ") + (lista.length > 8 ? ` y ${lista.length - 8} más` : "");
const deHoy = items.filter((x) => x.d === 0), deManana = items.filter((x) => x.d === 1);
const detalle = [deHoy.length ? `HOY: ${parte(deHoy)}` : "", deManana.length ? `MAÑANA: ${parte(deManana)}` : ""].filter(Boolean).join(" · ").slice(0, 900);
const nombre = limpio(env.AVISOS_NOMBRE || "Vero");

// Ojo: el registro de GitHub Actions es público en este repositorio; nunca se imprimen nombres de tareas.
console.log(`${hoy}: ${items.length} pendiente(s) por vencer (${deHoy.length} hoy, ${deManana.length} mañana).`);
if (env.AVISOS_SOLO_MOSTRAR) { if (env.AVISOS_MOSTRAR_TEXTO) console.log(detalle); process.exit(0); }

// Plantilla de Meta (debe estar aprobada). Texto sugerido de la plantilla:
//   "Hola {{1}}, tenés pendientes por vencer: {{2}}. Revisalos en tu plataforma de proyectos."
const base = env.WA_API || "https://graph.facebook.com";
const r = await fetch(`${base}/${env.WA_VERSION || "v23.0"}/${encodeURIComponent(env.WA_PHONE_ID)}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: env.WA_DESTINO.replace(/\D/g, ""),
    type: "template",
    template: {
      name: env.WA_PLANTILLA || "recordatorio_vencimiento",
      language: { code: env.WA_IDIOMA || "es" },
      components: [{ type: "body", parameters: [{ type: "text", text: nombre }, { type: "text", text: detalle }] }],
    },
  }),
});
const cuerpo = await r.text();
if (!r.ok) {
  let motivo = ""; try { const j = JSON.parse(cuerpo); motivo = `${j.error?.code ?? ""} ${j.error?.message ?? ""}`.trim(); } catch { /* sin detalle */ }
  console.error(`WhatsApp respondió ${r.status}. ${motivo}`.slice(0, 400)); process.exit(1);
}
console.log("Mensaje enviado por WhatsApp.");
process.exit(0);
