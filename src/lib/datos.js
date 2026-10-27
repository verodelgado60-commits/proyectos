import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, traducirError } from "./supabase.js";
import { aplicarCambio, ordenar } from "./logica.js";

// ---------- Lista de proyectos del usuario ----------
export function useProyectos(usuarioId, avisar) {
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("projects").select("*").order("position").order("created_at");
    if (error) avisar?.(traducirError(error), "error"); else setProyectos(data);
    setCargando(false);
  }, [avisar]);

  useEffect(() => {
    if (!usuarioId) return;
    cargar();
    const canal = supabase.channel(`proyectos-${usuarioId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (ev) => {
        setProyectos((l) => ordenar(aplicarCambio(l, ev)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: `user_id=eq.${usuarioId}` }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [usuarioId, cargar]);

  return { proyectos, setProyectos, cargando, recargar: cargar };
}

// ---------- Todo lo de un proyecto, sincronizado en vivo ----------
const TABLAS = ["groups", "labels", "tasks", "project_members"];

export function useProyecto(proyectoId, avisar) {
  const vacio = { groups: [], labels: [], tasks: [], project_members: [], perfiles: {} };
  const [datos, setDatos] = useState(vacio);
  const [cargando, setCargando] = useState(true);
  const [conectado, setConectado] = useState(false);
  const idRef = useRef(proyectoId);
  idRef.current = proyectoId;

  const cargarPerfiles = useCallback(async (miembros) => {
    const ids = miembros.map((m) => m.user_id);
    if (!ids.length) return {};
    const { data } = await supabase.from("profiles").select("id, username, full_name, avatar_color").in("id", ids);
    return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
  }, []);

  const cargar = useCallback(async () => {
    const id = proyectoId;
    const resultados = await Promise.all(TABLAS.map((t) => supabase.from(t).select("*").eq("project_id", id)));
    if (idRef.current !== id) return;
    const fallo = resultados.find((r) => r.error);
    if (fallo) { avisar?.(traducirError(fallo.error), "error"); setCargando(false); return; }
    const [groups, labels, tasks, project_members] = resultados.map((r) => r.data);
    const perfiles = await cargarPerfiles(project_members);
    if (idRef.current !== id) return;
    setDatos({ groups: ordenar(groups), labels: ordenar(labels), tasks, project_members, perfiles });
    setCargando(false);
  }, [proyectoId, avisar, cargarPerfiles]);

  useEffect(() => {
    if (!proyectoId) return;
    setDatos(vacio); setCargando(true);
    cargar();
    let canal = supabase.channel(`proyecto-${proyectoId}`);
    for (const tabla of TABLAS) {
      canal = canal.on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: `project_id=eq.${proyectoId}` }, async (ev) => {
        if (tabla === "project_members") {
          // Cambió el equipo: recargar miembros y sus perfiles
          const { data } = await supabase.from("project_members").select("*").eq("project_id", proyectoId);
          const perfiles = await cargarPerfiles(data ?? []);
          setDatos((d) => ({ ...d, project_members: data ?? [], perfiles }));
          return;
        }
        setDatos((d) => {
          const lista = aplicarCambio(d[tabla], ev);
          return { ...d, [tabla]: tabla === "tasks" ? lista : ordenar(lista) };
        });
      });
    }
    canal.subscribe((estado) => {
      setConectado(estado === "SUBSCRIBED");
      if (estado === "SUBSCRIBED") cargar(); // re-sincroniza al (re)conectar
    });
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  // Cambio local inmediato + guardado en la base; si falla, se revierte recargando
  const mutar = useCallback(async (tabla, local, remoto, mensajeOk) => {
    if (local) setDatos((d) => ({ ...d, [tabla]: local(d[tabla]) }));
    const { data, error } = await remoto();
    if (error) { avisar?.(traducirError(error), "error"); cargar(); return null; }
    if (mensajeOk) avisar?.(mensajeOk);
    return data ?? true;
  }, [avisar, cargar]);

  const api = {
    crearTarea: (fila) => mutar("tasks", null, async () => {
      const r = await supabase.from("tasks").insert({ project_id: proyectoId, ...fila }).select().single();
      if (!r.error) setDatos((d) => ({ ...d, tasks: aplicarCambio(d.tasks, { eventType: "INSERT", new: r.data }) }));
      return r;
    }),
    actualizarTarea: (id, cambios) => mutar("tasks",
      (l) => l.map((t) => (t.id === id ? { ...t, ...cambios } : t)),
      () => supabase.from("tasks").update(cambios).eq("id", id)),
    borrarTarea: (id) => mutar("tasks",
      (l) => l.filter((t) => t.id !== id && t.parent_id !== id),
      () => supabase.from("tasks").delete().eq("id", id), "Tarea eliminada"),
    crearGrupo: (fila) => mutar("groups", null, async () => {
      const r = await supabase.from("groups").insert({ project_id: proyectoId, ...fila }).select().single();
      if (!r.error) setDatos((d) => ({ ...d, groups: ordenar(aplicarCambio(d.groups, { eventType: "INSERT", new: r.data })) }));
      return r;
    }),
    actualizarGrupo: (id, cambios) => mutar("groups",
      (l) => ordenar(l.map((g) => (g.id === id ? { ...g, ...cambios } : g))),
      () => supabase.from("groups").update(cambios).eq("id", id)),
    borrarGrupo: (id) => mutar("groups",
      (l) => l.filter((g) => g.id !== id),
      async () => {
        const r = await supabase.from("groups").delete().eq("id", id);
        if (!r.error) setDatos((d) => ({ ...d, tasks: d.tasks.filter((t) => t.group_id !== id) }));
        return r;
      }, "Grupo eliminado"),
    crearEtiqueta: (fila) => mutar("labels", null, async () => {
      const r = await supabase.from("labels").insert({ project_id: proyectoId, ...fila }).select().single();
      if (!r.error) setDatos((d) => ({ ...d, labels: ordenar(aplicarCambio(d.labels, { eventType: "INSERT", new: r.data })) }));
      return r;
    }),
    actualizarEtiqueta: (id, cambios) => mutar("labels",
      (l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)),
      () => supabase.from("labels").update(cambios).eq("id", id)),
    borrarEtiqueta: (id) => mutar("labels",
      (l) => l.filter((x) => x.id !== id),
      async () => {
        const r = await supabase.from("labels").delete().eq("id", id);
        if (!r.error) setDatos((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, status_id: t.status_id === id ? null : t.status_id, priority_id: t.priority_id === id ? null : t.priority_id })) }));
        return r;
      }),
    actualizarProyecto: async (proyecto, cambios, cambioLocal) => {
      cambioLocal?.({ eventType: "UPDATE", new: { ...proyecto, ...cambios } });
      const { error } = await supabase.from("projects").update(cambios).eq("id", proyecto.id);
      if (error) { avisar?.(traducirError(error), "error"); cambioLocal?.({ eventType: "UPDATE", new: proyecto }); }
    },
    eliminarProyecto: async (proyecto, cambioLocal) => {
      const { error } = await supabase.from("projects").delete().eq("id", proyecto.id);
      if (error) { avisar?.(traducirError(error), "error"); return false; }
      cambioLocal?.({ eventType: "DELETE", old: { id: proyecto.id } });
      return true;
    },
    salirProyecto: async (proyecto, usuarioId, cambioLocal) => {
      const { error } = await supabase.from("project_members").delete().eq("project_id", proyecto.id).eq("user_id", usuarioId);
      if (error) { avisar?.(traducirError(error), "error"); return false; }
      cambioLocal?.({ eventType: "DELETE", old: { id: proyecto.id } });
      return true;
    },
    recargar: cargar,
  };

  return { ...datos, cargando, conectado, api };
}

// ---------- Comentarios de una tarea, en vivo ----------
export function useComentarios(tareaId, avisar) {
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!tareaId) return;
    let activo = true;
    setCargando(true);
    supabase.from("comments").select("*").eq("task_id", tareaId).order("created_at").then(({ data, error }) => {
      if (!activo) return;
      if (error) avisar?.(traducirError(error), "error"); else setComentarios(data);
      setCargando(false);
    });
    const canal = supabase.channel(`comentarios-${tareaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `task_id=eq.${tareaId}` }, (ev) => {
        setComentarios((l) => aplicarCambio(l, ev).sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }).subscribe();
    return () => { activo = false; supabase.removeChannel(canal); };
  }, [tareaId, avisar]);

  const agregar = async (body) => {
    const { data, error } = await supabase.from("comments").insert({ task_id: tareaId, body }).select().single();
    if (error) { avisar?.(traducirError(error), "error"); return false; }
    setComentarios((l) => aplicarCambio(l, { eventType: "INSERT", new: data }));
    return true;
  };
  const editar = async (id, body) => {
    const { error } = await supabase.from("comments").update({ body }).eq("id", id);
    if (error) { avisar?.(traducirError(error), "error"); return false; }
    setComentarios((l) => l.map((c) => (c.id === id ? { ...c, body } : c)));
    return true;
  };
  const borrar = async (id) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) { avisar?.(traducirError(error), "error"); return; }
    setComentarios((l) => l.filter((c) => c.id !== id));
  };
  return { comentarios, cargando, agregar, editar, borrar };
}
