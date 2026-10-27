// Capa de datos para la versión que vive dentro de Claude.
// Misma interfaz que datos.js (Supabase), pero usando la base de datos de la página
// (capacidad "db") y la identidad de Claude (capacidad "user").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aplicarCambio, ordenar } from "./logica.js";

// ---------- Capacidades de la plataforma ----------
let promesa = null;
export function capacidades() {
  if (!promesa) {
    promesa = (async () => {
      const c = typeof window !== "undefined" ? window.claude : null;
      if (!c?.use) return { db: null, user: null };
      const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
      return { db, user };
    })();
  }
  return promesa;
}

export function mensajeError(e) {
  const c = e?.code;
  if (c === "invalid_argument") return "No tienes permiso para hacer cambios aquí. Pide acceso de Colaborador a quien te compartió la página.";
  if (c === "quota_exceeded") return "Se llenó el espacio de la base de datos. Elimina proyectos o tareas que ya no uses.";
  if (c === "resource_exhausted") return "Demasiados cambios seguidos. Espera unos segundos y vuelve a intentar.";
  if (c === "revoked") return "Ya no tienes acceso a esta página.";
  if (c === "unavailable") return "Sin conexión por un momento. Vuelve a intentar.";
  return e?.message || "Ocurrió un error inesperado.";
}

const ahora = () => new Date().toISOString();
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const docsA = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));

// ---------- Escrituras: una a la vez por documento, agrupando cambios ----------
const colas = new Map();
const pendientes = new Map();
function encolar(clave, tarea) {
  const previa = colas.get(clave) ?? Promise.resolve();
  const siguiente = previa.then(tarea, tarea);
  colas.set(clave, siguiente.catch(() => {}));
  return siguiente;
}
function actualizarAgrupado(db, ruta, cambios) {
  pendientes.set(ruta, { ...(pendientes.get(ruta) ?? {}), ...cambios });
  return encolar(ruta, async () => {
    const lote = pendientes.get(ruta);
    if (!lote) return; // otro turno ya lo envió
    pendientes.delete(ruta);
    await db.doc(ruta).update(lote);
  });
}

// ---------- Sesión: quién está viendo y qué puede hacer ----------
export function useSesion() {
  const [s, setS] = useState({ estado: "cargando" });
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { db, user } = await capacidades();
      if (!vivo) return;
      if (!db || !user) { setS({ estado: "sin-acceso" }); return; }
      const [yo, escribe, admin] = await Promise.all([user.me(), user.can("data.write"), user.canEdit()]);
      if (!vivo) return;
      if (!yo.id) { setS({ estado: "sin-acceso" }); return; }
      setS({
        estado: "listo",
        perfil: { id: yo.id, username: "", full_name: yo.name || "Tú", avatar_color: yo.color, is_admin: admin },
        puedeEscribir: escribe !== false, // null = la plataforma no dijo: se intenta y decide el servidor
        esAdmin: admin,
      });
    })();
    return () => { vivo = false; };
  }, []);
  return s;
}

// Resuelve ids de personas a nombre y color (nunca se guardan nombres)
export function usePerfiles(ids) {
  const [mapa, setMapa] = useState({});
  const clave = [...new Set(ids.filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    capacidades().then(async ({ user }) => {
      if (!user) return;
      const ps = await user.profiles(clave.split(","));
      if (!vivo) return;
      setMapa(Object.fromEntries(Object.values(ps).map((p) => [p.id, { id: p.id, username: "", full_name: p.name || "Alguien", avatar_color: p.color }])));
    });
    return () => { vivo = false; };
  }, [clave]);
  return mapa;
}

// ---------- Lista de proyectos ----------
export function useProyectos(_usuarioId, avisar) {
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let cancelar = () => {};
    let vivo = true;
    capacidades().then(({ db }) => {
      if (!vivo || !db) { setCargando(false); return; }
      cancelar = db.collection("proyectos").onSnapshot(
        (snap) => { setProyectos(ordenar(docsA(snap))); setCargando(false); },
        (e) => { avisar?.(mensajeError(e), "error"); setCargando(false); },
      );
    });
    return () => { vivo = false; cancelar(); };
  }, [avisar]);
  return { proyectos, setProyectos, cargando, recargar: () => {} };
}

export async function crearProyecto({ name, description, color, position, creador }) {
  const { db } = await capacidades();
  const id = nuevoId();
  const fila = { name, description, color, position, created_by: creador, miembros: [creador], created_at: ahora(), updated_at: ahora() };
  await db.doc(`proyectos/${id}`).set(fila);
  // Etiquetas y grupo iniciales
  const etiquetas = [
    ["status", "Pendiente", "#c4c4c4", false], ["status", "En curso", "#fdab3d", false],
    ["status", "Atascado", "#e2445c", false], ["status", "Listo", "#00c875", true],
    ["priority", "Baja", "#579bfc", false], ["priority", "Media", "#5559df", false],
    ["priority", "Alta", "#401694", false], ["priority", "Crítica", "#333333", false],
  ];
  const pos = { status: 0, priority: 0 };
  for (const [kind, n, c, hecha] of etiquetas) {
    await db.doc(`etiquetas/${nuevoId()}`).set({ project_id: id, kind, name: n, color: c, position: pos[kind]++, is_done: hecha });
  }
  await db.doc(`grupos/${nuevoId()}`).set({ project_id: id, name: "Grupo 1", color: "#579bfc", position: 0, created_at: ahora() });
  return { id, ...fila };
}

// ---------- Todo lo de un proyecto, en vivo ----------
export function useProyecto(proyectoId, avisar) {
  const [proyecto, setProyecto] = useState(null);
  const [groups, setGroups] = useState([]);
  const [labels, setLabels] = useState([]);
  const [tareasBase, setTareasBase] = useState([]);
  const [listos, setListos] = useState(0);
  const [sesion, setSesion] = useState(null);
  const [capa, setCapa] = useState({}); // cambios locales aún no confirmados, por tarea
  const dbRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    const bajas = [];
    setListos(0);
    capacidades().then(async ({ db, user }) => {
      if (!vivo || !db) return;
      dbRef.current = db;
      const [escribe, admin, yo] = await Promise.all([user?.can("data.write"), user?.canEdit(), user?.id()]);
      if (!vivo) return;
      setSesion({ puedeEscribir: escribe !== false, esAdmin: !!admin, yo });
      const error = (e) => avisar?.(mensajeError(e), "error");
      const listo = () => setListos((n) => n + 1);
      bajas.push(db.doc(`proyectos/${proyectoId}`).onSnapshot((d) => { setProyecto(d.exists ? { ...d.data(), id: d.id } : null); }, error));
      let g = false, l = false, t = false;
      bajas.push(db.collection("grupos").where("project_id", "==", proyectoId).onSnapshot((s) => { setGroups(ordenar(docsA(s))); if (!g) { g = true; listo(); } }, error));
      bajas.push(db.collection("etiquetas").where("project_id", "==", proyectoId).onSnapshot((s) => { setLabels(ordenar(docsA(s))); if (!l) { l = true; listo(); } }, error));
      bajas.push(db.collection("tareas").where("project_id", "==", proyectoId).onSnapshot((s) => { setTareasBase(docsA(s)); if (!t) { t = true; listo(); } }, error));
    });
    return () => { vivo = false; bajas.forEach((b) => b()); };
  }, [proyectoId, avisar]);

  const tasks = useMemo(() => tareasBase.map((t) => (capa[t.id] ? { ...t, ...capa[t.id] } : t)), [tareasBase, capa]);

  // Equipo: miembros guardados en el proyecto + quien tenga tareas asignadas
  const idsEquipo = useMemo(() => {
    const s = new Set(proyecto?.miembros ?? []);
    if (proyecto?.created_by) s.add(proyecto.created_by);
    tasks.forEach((t) => t.assignee_id && s.add(t.assignee_id));
    return [...s];
  }, [proyecto, tasks]);
  const perfiles = usePerfiles(idsEquipo);
  const project_members = idsEquipo.map((id) => ({ user_id: id, role: id === proyecto?.created_by ? "owner" : "editor" }));

  const miRol = !sesion ? "viewer" : sesion.esAdmin ? "owner" : sesion.puedeEscribir ? "editor" : "viewer";

  const fallo = useCallback((e) => { avisar?.(mensajeError(e), "error"); return null; }, [avisar]);

  const borrarComentariosDe = async (db, tareaIds) => {
    for (const tid of tareaIds) {
      const s = await db.collection("comentarios").where("task_id", "==", tid).get();
      for (const d of s.docs) await db.doc(`comentarios/${d.id}`).delete();
    }
  };

  const api = {
    crearTarea: async (fila) => {
      const db = dbRef.current; const id = nuevoId();
      const datos = { project_id: proyectoId, group_id: null, parent_id: null, title: "", description: "", status_id: null, priority_id: null,
        assignee_id: null, start_date: null, due_date: null, estimation: null, position: 0, created_by: sesion?.yo ?? null, created_at: ahora(), updated_at: ahora(), ...fila };
      try { await db.doc(`tareas/${id}`).set(datos); return { id, ...datos }; } catch (e) { return fallo(e); }
    },
    actualizarTarea: async (id, cambios) => {
      const db = dbRef.current;
      setCapa((c) => ({ ...c, [id]: { ...(c[id] ?? {}), ...cambios } }));
      try { await actualizarAgrupado(db, `tareas/${id}`, { ...cambios, updated_at: ahora() }); }
      catch (e) { fallo(e); }
      finally { if (!pendientes.has(`tareas/${id}`)) setCapa((c) => { const n = { ...c }; delete n[id]; return n; }); }
    },
    borrarTarea: async (id) => {
      const db = dbRef.current;
      try {
        const subs = tareasBase.filter((t) => t.parent_id === id).map((t) => t.id);
        await borrarComentariosDe(db, [id, ...subs]);
        for (const s of subs) await db.doc(`tareas/${s}`).delete();
        await db.doc(`tareas/${id}`).delete();
        avisar?.("Tarea eliminada");
      } catch (e) { fallo(e); }
    },
    crearGrupo: async (fila) => {
      const db = dbRef.current; const id = nuevoId();
      try { await db.doc(`grupos/${id}`).set({ project_id: proyectoId, created_at: ahora(), ...fila }); return { id, ...fila }; } catch (e) { return fallo(e); }
    },
    actualizarGrupo: async (id, cambios) => { try { await actualizarAgrupado(dbRef.current, `grupos/${id}`, cambios); } catch (e) { fallo(e); } },
    borrarGrupo: async (id) => {
      const db = dbRef.current;
      try {
        const ids = tareasBase.filter((t) => t.group_id === id).map((t) => t.id);
        await borrarComentariosDe(db, ids);
        for (const t of ids) await db.doc(`tareas/${t}`).delete();
        await db.doc(`grupos/${id}`).delete();
        avisar?.("Grupo eliminado");
      } catch (e) { fallo(e); }
    },
    crearEtiqueta: async (fila) => {
      const db = dbRef.current; const id = nuevoId();
      try { await db.doc(`etiquetas/${id}`).set({ project_id: proyectoId, is_done: false, ...fila }); return { id, ...fila }; } catch (e) { return fallo(e); }
    },
    actualizarEtiqueta: async (id, cambios) => { try { await actualizarAgrupado(dbRef.current, `etiquetas/${id}`, cambios); } catch (e) { fallo(e); } },
    borrarEtiqueta: async (id) => {
      const db = dbRef.current;
      try {
        for (const t of tareasBase) {
          const c = {};
          if (t.status_id === id) c.status_id = null;
          if (t.priority_id === id) c.priority_id = null;
          if (Object.keys(c).length) await actualizarAgrupado(db, `tareas/${t.id}`, c);
        }
        await db.doc(`etiquetas/${id}`).delete();
      } catch (e) { fallo(e); }
    },
    actualizarProyecto: async (p, cambios) => { try { await actualizarAgrupado(dbRef.current, `proyectos/${p.id}`, { ...cambios, updated_at: ahora() }); } catch (e) { fallo(e); } },
    eliminarProyecto: async (p) => {
      const db = dbRef.current;
      try {
        for (const col of ["comentarios", "tareas", "grupos", "etiquetas"]) {
          const s = await db.collection(col).where("project_id", "==", p.id).get();
          for (const d of s.docs) await db.doc(`${col}/${d.id}`).delete();
        }
        await db.doc(`proyectos/${p.id}`).delete();
        return true;
      } catch (e) { fallo(e); return false; }
    },
    salirProyecto: async (p, yo) => {
      try { await actualizarAgrupado(dbRef.current, `proyectos/${p.id}`, { miembros: (proyecto?.miembros ?? []).filter((m) => m !== yo) }); return true; }
      catch (e) { fallo(e); return false; }
    },
    agregarMiembro: async (uid) => {
      const lista = [...new Set([...(proyecto?.miembros ?? []), uid])];
      try { await actualizarAgrupado(dbRef.current, `proyectos/${proyectoId}`, { miembros: lista }); return true; } catch (e) { fallo(e); return false; }
    },
    quitarMiembro: async (uid) => {
      try { await actualizarAgrupado(dbRef.current, `proyectos/${proyectoId}`, { miembros: (proyecto?.miembros ?? []).filter((m) => m !== uid) }); return true; }
      catch (e) { fallo(e); return false; }
    },
    recargar: () => {},
  };

  return { groups, labels, tasks, project_members, perfiles, cargando: listos < 3, conectado: listos >= 3, miRol, api };
}

// ---------- Comentarios de una tarea, en vivo ----------
export function useComentarios(tareaId, avisar) {
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [yo, setYo] = useState(null);
  const dbRef = useRef(null);

  useEffect(() => {
    let vivo = true, baja = () => {};
    setCargando(true);
    capacidades().then(async ({ db, user }) => {
      if (!vivo || !db) return;
      dbRef.current = db;
      setYo(await user?.id());
      baja = db.collection("comentarios").where("task_id", "==", tareaId).onSnapshot(
        (s) => { setComentarios(docsA(s).sort((a, b) => a.created_at.localeCompare(b.created_at))); setCargando(false); },
        (e) => { avisar?.(mensajeError(e), "error"); setCargando(false); },
      );
    });
    return () => { vivo = false; baja(); };
  }, [tareaId, avisar]);

  const autores = usePerfiles(comentarios.map((c) => c.author_id));

  const agregar = async (body) => {
    const db = dbRef.current;
    try {
      const t = await db.doc(`tareas/${tareaId}`).get();
      const id = nuevoId();
      const fila = { task_id: tareaId, project_id: t.data()?.project_id ?? null, author_id: yo, body, created_at: ahora(), updated_at: ahora() };
      await db.doc(`comentarios/${id}`).set(fila);
      setComentarios((l) => aplicarCambio(l, { eventType: "INSERT", new: { id, ...fila } }));
      return true;
    } catch (e) { avisar?.(mensajeError(e), "error"); return false; }
  };
  const editar = async (id, body) => {
    try { await dbRef.current.doc(`comentarios/${id}`).update({ body, updated_at: ahora() }); return true; }
    catch (e) { avisar?.(mensajeError(e), "error"); return false; }
  };
  const borrar = async (id) => {
    try { await dbRef.current.doc(`comentarios/${id}`).delete(); } catch (e) { avisar?.(mensajeError(e), "error"); }
  };
  return { comentarios, cargando, agregar, editar, borrar, autores };
}
