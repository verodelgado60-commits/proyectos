// Lógica pura de la app (sin red), cubierta por pruebas.

export const POR_ESTADO_SIN = "__sin_estado__";

export function ordenar(lista) {
  return [...lista].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

// Posición para insertar entre dos elementos (orden fraccionario)
export function posicionEntre(antes, despues) {
  if (antes == null && despues == null) return 1;
  if (antes == null) return despues - 1;
  if (despues == null) return antes + 1;
  return (antes + despues) / 2;
}

export function posicionAlFinal(lista) {
  return lista.length ? Math.max(...lista.map((x) => x.position ?? 0)) + 1 : 1;
}

export function tareasPrincipales(tareas) {
  return tareas.filter((t) => !t.parent_id);
}

export function subtareasDe(tareas, id) {
  return ordenar(tareas.filter((t) => t.parent_id === id));
}

export function filtrarTareas(tareas, { texto = "", responsable = "", estado = "", prioridad = "" } = {}) {
  const q = texto.trim().toLowerCase();
  const coincide = (t) =>
    (!q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)) &&
    (!responsable || (responsable === "nadie" ? !t.assignee_id : t.assignee_id === responsable)) &&
    (!estado || (t.status_id ?? POR_ESTADO_SIN) === estado) &&
    (!prioridad || t.priority_id === prioridad);
  const principales = tareasPrincipales(tareas);
  // Una tarea principal se muestra si ella o alguna subtarea coincide
  return principales.filter((t) => coincide(t) || tareas.some((s) => s.parent_id === t.id && coincide(s)));
}

export function agruparPor(tareas, claves, campo) {
  const mapa = new Map(claves.map((k) => [k, []]));
  for (const t of tareas) {
    const k = t[campo] ?? POR_ESTADO_SIN;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(t);
  }
  for (const [k, v] of mapa) mapa.set(k, ordenar(v));
  return mapa;
}

export function progreso(tareas, etiquetas) {
  const hechas = new Set(etiquetas.filter((l) => l.is_done).map((l) => l.id));
  const total = tareas.length;
  const listas = tareas.filter((t) => hechas.has(t.status_id)).length;
  return { total, listas, porcentaje: total ? Math.round((listas / total) * 100) : 0 };
}

export function resumenEstados(tareas, estados) {
  const total = tareas.length || 1;
  return estados.map((e) => {
    const n = tareas.filter((t) => t.status_id === e.id).length;
    return { ...e, n, pct: (n / total) * 100 };
  }).filter((e) => e.n > 0);
}

export function estaVencida(tarea, etiquetas, hoy = new Date()) {
  if (!tarea.due_date) return false;
  const hecha = etiquetas.some((l) => l.id === tarea.status_id && l.is_done);
  if (hecha) return false;
  const limite = new Date(tarea.due_date + "T23:59:59");
  return limite < hoy;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const anioActual = new Date().getFullYear();
  return `${d} ${MESES[m - 1]}${y !== anioActual ? " " + y : ""}`;
}

export function hace(fechaIso, ahora = new Date()) {
  const s = Math.max(0, Math.round((ahora - new Date(fechaIso)) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); if (d < 30) return `hace ${d} d`;
  return new Date(fechaIso).toLocaleDateString("es-CR");
}

export function iniciales(perfil) {
  const base = (perfil?.full_name || perfil?.username || "?").trim();
  const partes = base.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Aplica un evento de tiempo real a una lista en memoria
export function aplicarCambio(lista, evento) {
  const { eventType, new: nuevo, old } = evento;
  if (eventType === "INSERT") return lista.some((x) => x.id === nuevo.id) ? lista.map((x) => (x.id === nuevo.id ? nuevo : x)) : [...lista, nuevo];
  if (eventType === "UPDATE") return lista.some((x) => x.id === nuevo.id) ? lista.map((x) => (x.id === nuevo.id ? nuevo : x)) : [...lista, nuevo];
  if (eventType === "DELETE") return lista.filter((x) => x.id !== old.id);
  return lista;
}

export function validarClave(p) {
  const s = String(p ?? "");
  if (s.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (s.length > 72) return "La contraseña no puede tener más de 72 caracteres.";
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(s) || !/[0-9]/.test(s)) return "La contraseña debe incluir letras y números.";
  return null;
}

export function validarUsuario(u) {
  return /^[a-z0-9_.-]{3,30}$/.test(String(u ?? "").trim().toLowerCase())
    ? null
    : "El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.";
}

export const COLORES = ["#0780ee", "#003ff9", "#4dc1ff", "#ff7c00", "#1dcd9f", "#a63be3", "#ffbe00", "#893124", "#098e68", "#7e16c1", "#6b6e74", "#30343c"];

// ---------- Avisos de vencimiento de proyectos ----------
const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function diasHasta(iso, hoy = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const [hy, hm, hd] = fechaLocal(hoy).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}
// Tareas que vencen mañana u hoy, o que ya vencieron (hasta 30 días atrás)
export function avisosDeVencimiento(tareas, nombre, hoy = new Date(), carpetas = {}) {
  const quien = nombre ? `${nombre}, la` : "La";
  return tareas
    .filter((p) => p.due_date)
    .map((p) => ({ p, dias: diasHasta(p.due_date, hoy) }))
    .filter(({ dias }) => dias <= 1 && dias >= -30)
    .sort((a, b) => a.dias - b.dias)
    .map(({ p, dias }) => {
      const de = carpetas[p.carpeta_id] ? ` del proyecto ${carpetas[p.carpeta_id].name}` : "";
      return {
      id: `${p.id}:${p.due_date}:${dias < 0 ? "vencido" : dias === 0 ? "hoy" : "pronto"}`,
      proyectoId: p.id,
      tipo: dias < 0 ? "vencido" : dias === 0 ? "hoy" : "pronto",
      texto: dias < 0
        ? `${quien} tarea ${p.name}${de} venció el ${fechaCorta(p.due_date)}, revisala`
        : dias === 0
          ? `${quien} tarea ${p.name}${de} vence hoy, revisala`
          : `${quien} tarea ${p.name}${de} está pronta a vencer, revisala`,
      fecha: p.due_date,
      };
    });
}
