import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { aplicarCambio, diasHasta, fechaCorta } from "../lib/logica.js";
import { useResponsables } from "../lib/datos.js";
import { Avatar, textoSobre } from "./ui.jsx";
import { esStopper } from "./Stopper.jsx";
import { ActivarAvisosNavegador } from "./AvisoHoy.jsx";

// "Mi día": lo atrasado, lo que vence hoy y mañana, y los stoppers abiertos de todos los proyectos.
export default function MiDia({ perfil, proyectos, carpetas, avisar, ir }) {
  const [subtareas, setSubtareas] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [perfiles, setPerfiles] = useState({});
  const [cargando, setCargando] = useState(true);
  const [persona, setPersona] = useState("");
  const [ahora, setAhora] = useState(() => new Date());
  const escribe = ["admin", "editor"].includes(perfil.rol);
  const externos = useResponsables(escribe, avisar);

  const cargar = useCallback(async () => {
    const [t, l, p] = await Promise.all([
      supabase.from("tasks").select("*"),
      supabase.from("labels").select("*"),
      supabase.from("profiles").select("id, username, full_name, avatar_color"),
    ]);
    const fallo = [t, l, p].find((r) => r.error);
    if (fallo) avisar(traducirError(fallo.error), "error");
    setSubtareas(t.data ?? []); setEtiquetas(l.data ?? []);
    setPerfiles(Object.fromEntries((p.data ?? []).map((x) => [x.id, x])));
    setCargando(false);
  }, [avisar]);

  useEffect(() => {
    cargar();
    const canal = supabase.channel(`mi-dia-${perfil.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (ev) => setSubtareas((l) => aplicarCambio(l, ev)))
      .on("postgres_changes", { event: "*", schema: "public", table: "labels" }, (ev) => setEtiquetas((l) => aplicarCambio(l, ev)))
      .subscribe();
    const reloj = setInterval(() => setAhora(new Date()), 60000);
    return () => { supabase.removeChannel(canal); clearInterval(reloj); };
  }, [cargar, perfil.id]);

  const todosPerfiles = useMemo(() => ({ ...perfiles, ...Object.fromEntries(externos.responsables.map((r) => [r.id, { id: r.id, full_name: r.name, username: r.name, avatar_color: r.avatar_color }])) }), [perfiles, externos.responsables]);
  const tareaDe = useMemo(() => Object.fromEntries(proyectos.map((p) => [p.id, p])), [proyectos]);
  const carpetaDe = useMemo(() => Object.fromEntries(carpetas.map((c) => [c.id, c])), [carpetas]);
  const etiquetaDe = useMemo(() => Object.fromEntries(etiquetas.map((l) => [l.id, l])), [etiquetas]);

  const grupos = useMemo(() => {
    const g = { atrasadas: [], hoy: [], manana: [], stoppers: [] };
    for (const s of subtareas) {
      if (!tareaDe[s.project_id]) continue;
      if (persona && (persona === "nadie" ? s.assignee_id : s.assignee_id !== persona)) continue;
      const estado = etiquetaDe[s.status_id];
      if (estado?.is_done) continue;
      if (esStopper(estado)) g.stoppers.push(s);
      if (!s.due_date || s.fecha_na) continue;
      const d = diasHasta(s.due_date, ahora);
      if (d < 0) g.atrasadas.push(s); else if (d === 0) g.hoy.push(s); else if (d === 1) g.manana.push(s);
    }
    const porFecha = (a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.title.localeCompare(b.title);
    g.atrasadas.sort(porFecha); g.hoy.sort(porFecha); g.manana.sort(porFecha);
    g.stoppers.sort((a, b) => (a.stopper_desde ?? "9").localeCompare(b.stopper_desde ?? "9"));
    return g;
  }, [subtareas, tareaDe, etiquetaDe, persona, ahora]);

  // Tareas (no subtareas) con fecha de vencimiento hoy o mañana
  const tareasPorVencer = useMemo(() => proyectos.filter((p) => p.due_date && [0, 1].includes(diasHasta(p.due_date, ahora))), [proyectos, ahora]);

  const marcarListo = async (s) => {
    const listo = etiquetas.find((l) => l.project_id === s.project_id && l.kind === "status" && l.is_done);
    if (!listo) return;
    const { error } = await supabase.from("tasks").update({ status_id: listo.id, ...(s.stopper ? { stopper: null, stopper_desde: null } : {}) }).eq("id", s.id);
    if (error) avisar(traducirError(error), "error"); else avisar(`«${s.title}» quedó lista`);
  };

  const nombre = perfil.nickname || (perfil.full_name || perfil.username).split(" ")[0];
  const hoyTexto = new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "long" }).format(ahora);
  const personas = [...Object.values(perfiles), ...externos.responsables.map((r) => ({ id: r.id, full_name: r.name }))];
  const total = grupos.atrasadas.length + grupos.hoy.length + grupos.manana.length + grupos.stoppers.length;

  const Lista = ({ titulo, clase, items, vacio, conMotivo }) => (
    <section className={`bloque-dia ${clase}`}>
      <h2>{titulo} <span className="contador-dia">{items.length}</span></h2>
      {!items.length ? <p className="tenue pequeno">{vacio}</p> : (
        <ul className="lista-dia">
          {items.map((s) => {
            const t = tareaDe[s.project_id]; const c = carpetaDe[t?.carpeta_id]; const e = etiquetaDe[s.status_id];
            return (
              <li key={s.id} className="item-dia">
                <button className="abrir-dia" onClick={() => ir(`/p/${s.project_id}/${s.id}`)}>
                  <span className="titulo-dia">{s.title}</span>
                  <span className="tenue pequeno">{c ? `${c.name} · ` : ""}{t?.name}</span>
                  {conMotivo && s.stopper && <span className="motivo-dia">⚠ {s.stopper}{s.stopper_desde ? ` · desde ${s.stopper_desde.split("-").reverse().join("/")}` : ""}</span>}
                </button>
                <span className="lado-dia">
                  {s.due_date && !conMotivo && <span className="tenue pequeno">{fechaCorta(s.due_date)}</span>}
                  {e && <span className="pastilla-dia" style={{ background: e.color, color: textoSobre(e.color) }}>{e.name}</span>}
                  <Avatar perfil={s.assignee_id ? todosPerfiles[s.assignee_id] : null} size={26} />
                  {escribe && <button className="boton boton-listo" onClick={() => marcarListo(s)} title="Marcar como Listo" aria-label={`Marcar «${s.title}» como Listo`}>✓</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <section className="inicio mi-dia">
      <h1>Mi día</h1>
      <p className="tenue">Hola {nombre}, hoy es {hoyTexto}. {cargando ? "" : total ? `Tenés ${total} pendiente${total === 1 ? "" : "s"} por revisar.` : "No tenés nada urgente. ¡Buen día!"}</p>
      <div className="filtros-dia">
        <label className="pequeno tenue" htmlFor="md-persona">Responsable</label>
        <select id="md-persona" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">Todas las personas</option>
          <option value={perfil.id}>Solo lo mío</option>
          {personas.filter((p) => p.id !== perfil.id).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}
          <option value="nadie">Sin responsable</option>
        </select>
        <span className="empuje" />
        <ActivarAvisosNavegador />
      </div>
      {cargando ? <div className="cargando-bloque"><div className="girando" /></div> : (<>
        {tareasPorVencer.length > 0 && (
          <div className="tareas-dia">
            {tareasPorVencer.map((p) => (
              <button key={p.id} className="chip-tarea-dia" onClick={() => ir(`/p/${p.id}`)}>
                📌 La tarea <strong>{p.name}</strong> vence {diasHasta(p.due_date, ahora) === 0 ? "hoy" : "mañana"}
              </button>
            ))}
          </div>
        )}
        <div className="bloques-dia">
          <Lista titulo="Atrasadas" clase="atrasadas" items={grupos.atrasadas} vacio="Nada atrasado." />
          <Lista titulo="Vencen hoy" clase="hoy" items={grupos.hoy} vacio="Nada vence hoy." />
          <Lista titulo="Vencen mañana" clase="manana" items={grupos.manana} vacio="Nada vence mañana." />
          <Lista titulo="Stoppers abiertos" clase="stoppers" items={grupos.stoppers} vacio="No hay stoppers." conMotivo />
        </div>
      </>)}
    </section>
  );
}
