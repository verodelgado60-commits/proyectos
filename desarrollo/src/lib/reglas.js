// Reglas de negocio de la plataforma (antes las hacía la base de datos).
// Corren en el navegador de cada persona: ordenan y validan los datos, pero la protección
// real de la información es el cifrado y el token de GitHub (solo administración y edición).

export const claves = { project_members: ["project_id", "user_id"] };

const ahora = () => new Date().toISOString();
const error = (m) => { throw new Error(m); };

// Estados con la paleta Liberty: Gris tres, Amarillo, Verde. El manual no trae rojo: se usa uno afín a la paleta.
export const GRIS = "#b0b0b4", AMARILLO = "#ffbe00", ROJO = "#e03c31", VERDE = "#1dcd9f";
export const ESQUEMA = 2;
const ETIQUETAS = [
  ["status", "Pendiente", GRIS, false], ["status", "En curso", AMARILLO, false],
  ["status", "Stopper", ROJO, false], ["status", "Listo", VERDE, true],
  ["priority", "Baja", "#4dc1ff", false], ["priority", "Media", "#0780ee", false],
  ["priority", "Alta", "#003ff9", false], ["priority", "Crítica", "#30343c", false],
];

function rolEnProyecto(ctx, projectId) {
  if (ctx.sesion?.rol === "admin") return "owner";
  const m = (ctx.tablas.project_members ?? []).find((x) => x.project_id === projectId && x.user_id === ctx.sesion?.user.id);
  return m?.role ?? null;
}
const puedeEditar = (ctx, pid) => ["owner", "editor"].includes(rolEnProyecto(ctx, pid));
const esMiembro = (ctx, pid) => rolEnProyecto(ctx, pid) !== null;
const proyectoDe = (ctx, tabla, fila) => (tabla === "projects" ? fila.id : fila.project_id);

export const reglas = {
  filtrarLectura(tabla, filas, ctx) {
    if (ctx.sesion?.rol === "admin") return filas;
    if (tabla === "projects") return filas.filter((p) => esMiembro(ctx, p.id));
    return filas.filter((f) => !("project_id" in f) || esMiembro(ctx, f.project_id));
  },

  insertar(tabla, fila, ctx) {
    const yo = ctx.sesion.user.id;
    if (tabla === "projects") {
      const p = { description: "", color: "#0780ee", position: 0, esquema: ESQUEMA, ...fila, owner_id: yo, created_at: ahora(), updated_at: ahora() };
      if (!p.name?.trim()) error("El proyecto necesita un nombre.");
      ctx.extra.push({ t: "insert", tabla: "project_members", filas: [{ project_id: p.id, user_id: yo, role: "owner", added_at: ahora() }] });
      const pos = { status: 0, priority: 0 };
      ctx.extra.push({ t: "insert", tabla: "labels", filas: ETIQUETAS.map(([kind, name, color, is_done]) => ({ id: ctx.nuevoId(), project_id: p.id, kind, name, color, position: pos[kind]++, is_done })) });
      ctx.extra.push({ t: "insert", tabla: "groups", filas: [{ id: ctx.nuevoId(), project_id: p.id, name: "Subtareas", color: "#0780ee", position: 0, created_at: ahora() }] });
      return p;
    }
    if (tabla === "project_members") {
      if (rolEnProyecto(ctx, fila.project_id) !== "owner") error("Solo quien es dueño del proyecto administra el equipo.");
      if (fila.role === "owner") error("Un proyecto tiene un solo dueño.");
      return { added_at: ahora(), ...fila };
    }
    if (tabla === "comments") {
      const t = (ctx.tablas.tasks ?? []).find((x) => x.id === fila.task_id);
      if (!t) error("La tarea ya no existe.");
      if (!esMiembro(ctx, t.project_id)) error("No sos parte de este proyecto.");
      return { ...fila, project_id: t.project_id, author_id: yo, created_at: ahora(), updated_at: ahora() };
    }
    if (tabla === "adjuntos") {
      const t = (ctx.tablas.tasks ?? []).find((x) => x.id === fila.task_id);
      if (!t || !puedeEditar(ctx, t.project_id)) error("No tenés permiso para adjuntar en este proyecto.");
      return { ...fila, project_id: t.project_id, creado_por: yo, created_at: ahora() };
    }
    const pid = proyectoDe(ctx, tabla, fila);
    if (!puedeEditar(ctx, pid)) error("No tenés permiso para editar este proyecto.");
    if (tabla === "tasks") {
      if (!fila.title?.trim()) error("La tarea necesita un título.");
      if (fila.parent_id) {
        const padre = (ctx.tablas.tasks ?? []).find((x) => x.id === fila.parent_id);
        if (!padre || padre.parent_id) error("Tarea padre inválida.");
      }
      return { description: "", status_id: null, priority_id: null, assignee_id: null, start_date: null, due_date: null, estimation: null, position: 0, group_id: null, parent_id: null, ...fila, created_by: yo, created_at: ahora(), updated_at: ahora() };
    }
    return { created_at: ahora(), ...fila };
  },

  actualizar(tabla, fila, cambios, ctx) {
    if (tabla === "project_members") {
      if (rolEnProyecto(ctx, fila.project_id) !== "owner") error("Solo quien es dueño del proyecto administra el equipo.");
      if (cambios.role === "owner" || fila.role === "owner") error("No se puede cambiar el rol del dueño.");
      return cambios;
    }
    if (tabla === "comments") {
      if (fila.author_id !== ctx.sesion.user.id) error("Solo podés editar tus comentarios.");
      return { body: cambios.body, updated_at: ahora() };
    }
    const pid = proyectoDe(ctx, tabla, fila);
    if (!puedeEditar(ctx, pid)) error("No tenés permiso para editar este proyecto.");
    const c = { ...cambios };
    delete c.id; delete c.project_id; delete c.owner_id; delete c.created_by; delete c.created_at;
    if (tabla === "tasks" || tabla === "projects") c.updated_at = ahora();
    if (tabla === "tasks") {
      const ini = c.start_date ?? fila.start_date, fin = c.due_date ?? fila.due_date;
      if (ini && fin && ini > fin) error("La fecha de inicio no puede ser posterior a la fecha límite.");
    }
    return c;
  },

  borrar(tabla, fila, ctx) {
    const tareas = ctx.tablas.tasks ?? [];
    const adjuntosDe = (ids) => (ctx.tablas.adjuntos ?? []).filter((a) => ids.includes(a.task_id));
    const cascadaTareas = (ids) => {
      for (const a of adjuntosDe(ids)) ctx.archivos.push(a.ruta);
      ctx.extra.push({ t: "delete", tabla: "comments", filtros: [["task_id", "in", ids]] });
      ctx.extra.push({ t: "delete", tabla: "adjuntos", filtros: [["task_id", "in", ids]] });
    };
    if (tabla === "projects") {
      if (rolEnProyecto(ctx, fila.id) !== "owner") error("Solo quien es dueño puede eliminar el proyecto.");
      cascadaTareas(tareas.filter((t) => t.project_id === fila.id).map((t) => t.id));
      for (const t of ["tasks", "groups", "labels", "project_members"]) ctx.extra.push({ t: "delete", tabla: t, filtros: [["project_id", "eq", fila.id]] });
      return;
    }
    if (tabla === "project_members") {
      const propio = fila.user_id === ctx.sesion.user.id;
      if (fila.role === "owner") error("El dueño no puede salir del proyecto.");
      if (!propio && rolEnProyecto(ctx, fila.project_id) !== "owner") error("Solo quien es dueño administra el equipo.");
      return;
    }
    if (tabla === "comments") {
      if (fila.author_id !== ctx.sesion.user.id && rolEnProyecto(ctx, fila.project_id) !== "owner") error("Solo podés borrar tus comentarios.");
      return;
    }
    if (!puedeEditar(ctx, fila.project_id)) error("No tenés permiso para editar este proyecto.");
    if (tabla === "groups") {
      const ids = tareas.filter((t) => t.group_id === fila.id).map((t) => t.id);
      cascadaTareas(ids);
      ctx.extra.push({ t: "delete", tabla: "tasks", filtros: [["group_id", "eq", fila.id]] });
    }
    if (tabla === "tasks") {
      const ids = [fila.id, ...tareas.filter((t) => t.parent_id === fila.id).map((t) => t.id)];
      cascadaTareas(ids);
      ctx.extra.push({ t: "delete", tabla: "tasks", filtros: [["parent_id", "eq", fila.id]] });
    }
    if (tabla === "labels") {
      ctx.extra.push({ t: "update", tabla: "tasks", filtros: [["status_id", "eq", fila.id]], cambios: { status_id: null } });
      ctx.extra.push({ t: "update", tabla: "tasks", filtros: [["priority_id", "eq", fila.id]], cambios: { priority_id: null } });
    }
    if (tabla === "adjuntos") ctx.archivos.push(fila.ruta);
  },
};

export function registrarRpcs(cliente) {
  cliente.registrarRpc("find_profile", ({ u }, ctx) =>
    ctx.perfiles.filter((p) => !p.disabled && p.username === String(u ?? "").trim().toLowerCase())
      .map(({ id, username, full_name, avatar_color }) => ({ id, username, full_name, avatar_color })));
}
