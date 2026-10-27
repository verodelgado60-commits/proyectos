// Devuelve un proyecto al formato anterior (Atascado, colores viejos, "Grupo 1", sin esquema)
// para probar la actualización automática. Uso: node pruebas/proyecto-antiguo.mjs <usuario> <clave> <proyecto>
import { crearCliente } from "../../ghdb.js";
import { claves, reglas } from "../src/lib/reglas.js";
const [usuario, clave, nombre] = process.argv.slice(2);
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const c = crearCliente({ owner: "o", repo: "r", rama: "datos", api: "http://127.0.0.1:4378", raw: "http://127.0.0.1:4378/raw" },
  { claves, reglas, almacenamiento: memoria(), persistente: memoria() });
const r = await c.auth.signInWithPassword({ email: usuario, password: clave });
if (r.error) throw r.error;
const { data: p } = await c.from("projects").select("*").eq("name", nombre).single();
const viejos = { Pendiente: "#b0b0b4", "En curso": "#ff7c00", Stopper: "#893124", Listo: "#1dcd9f" };
const { data: labels } = await c.from("labels").select("*").eq("project_id", p.id).eq("kind", "status");
for (const l of labels) if (viejos[l.name]) await c.from("labels").update({ color: viejos[l.name], ...(l.name === "Stopper" ? { name: "Atascado" } : {}) }).eq("id", l.id);
await c.from("groups").update({ name: "Grupo 1" }).eq("project_id", p.id);
await c.from("projects").update({ esquema: 1 }).eq("id", p.id);
await c.guardarAhora();
const t = Date.now(); while (c.pendientes() && Date.now() - t < 20000) await new Promise((s) => setTimeout(s, 100));
console.log(c.pendientes() ? "pendiente" : "ok");
process.exit(0);
