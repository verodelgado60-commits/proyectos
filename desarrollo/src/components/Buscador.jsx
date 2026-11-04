import { useEffect, useMemo, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { textoSobre } from "./ui.jsx";

// Buscador general: proyectos, tareas, subtareas (título, descripción, conclusión, stopper) y comentarios.
// No distingue mayúsculas ni tildes.
const normal = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Buscador({ texto, proyectos, carpetas, avisar, ir }) {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [t, c, l] = await Promise.all([supabase.from("tasks").select("*"), supabase.from("comments").select("*"), supabase.from("labels").select("*")]);
      const fallo = [t, c, l].find((r) => r.error);
      if (fallo) avisar(traducirError(fallo.error), "error");
      if (vivo) setDatos({ subtareas: t.data ?? [], comentarios: c.data ?? [], etiquetas: l.data ?? [] });
    })();
    return () => { vivo = false; };
  }, [avisar]);

  const q = normal(texto.trim());
  const res = useMemo(() => {
    if (!datos || q.length < 2) return null;
    const tiene = (...campos) => campos.some((x) => normal(x).includes(q));
    const tareaDe = Object.fromEntries(proyectos.map((p) => [p.id, p]));
    const carpetaDe = Object.fromEntries(carpetas.map((c) => [c.id, c]));
    const subPorId = Object.fromEntries(datos.subtareas.map((s) => [s.id, s]));
    return {
      carpetas: carpetas.filter((c) => tiene(c.name)),
      tareas: proyectos.filter((p) => tiene(p.name, p.description)).map((p) => ({ ...p, carpeta: carpetaDe[p.carpeta_id] })),
      subtareas: datos.subtareas.filter((s) => tareaDe[s.project_id] && tiene(s.title, s.description, s.conclusion, s.stopper))
        .map((s) => ({ ...s, tarea: tareaDe[s.project_id], estado: datos.etiquetas.find((l) => l.id === s.status_id), donde: [s.title, s.description, s.conclusion, s.stopper].find((x) => normal(x).includes(q)) })),
      comentarios: datos.comentarios.filter((c) => tareaDe[c.project_id] && subPorId[c.task_id] && tiene(c.body))
        .map((c) => ({ ...c, subtarea: subPorId[c.task_id], tarea: tareaDe[c.project_id] })),
    };
  }, [datos, q, proyectos, carpetas]);

  // Resalta lo encontrado sin usar HTML
  const Resaltar = ({ t }) => {
    const s = String(t ?? ""); const n = normal(s); const i = n.indexOf(q);
    if (i < 0 || !q) return s;
    return <>{s.slice(0, i)}<mark>{s.slice(i, i + q.length)}</mark>{s.slice(i + q.length)}</>;
  };
  const recorte = (t) => { const s = String(t ?? ""); const i = normal(s).indexOf(q); return i > 40 ? "…" + s.slice(i - 30) : s; };
  const total = res ? res.carpetas.length + res.tareas.length + res.subtareas.length + res.comentarios.length : 0;

  return (
    <section className="inicio buscador">
      <h1>Buscar</h1>
      {q.length < 2 ? <p className="tenue">Escribí al menos 2 letras en el buscador del menú.</p>
        : !datos ? <div className="cargando-bloque"><div className="girando" /></div>
          : <p className="tenue">{total ? `${total} resultado${total === 1 ? "" : "s"} para «${texto.trim()}»` : `No encontré nada con «${texto.trim()}».`}</p>}
      {res && (<div className="resultados">
        {res.carpetas.length > 0 && <Grupo titulo="Proyectos">{res.carpetas.map((c) => (
          <button key={c.id} className="resultado" onClick={() => ir(`/c/${c.id}`)}><i className="punto" style={{ background: c.color }} /> <strong><Resaltar t={c.name} /></strong></button>))}</Grupo>}
        {res.tareas.length > 0 && <Grupo titulo="Tareas">{res.tareas.map((p) => (
          <button key={p.id} className="resultado" onClick={() => ir(`/p/${p.id}`)}>
            <strong><Resaltar t={p.name} /></strong>{p.archivada && <span className="insignia-archivada">Tarea lista</span>}
            <span className="tenue pequeno">{p.carpeta ? p.carpeta.name : "Sin proyecto"}{p.description ? " · " : ""}<Resaltar t={recorte(p.description)} /></span>
          </button>))}</Grupo>}
        {res.subtareas.length > 0 && <Grupo titulo="Subtareas">{res.subtareas.map((s) => (
          <button key={s.id} className="resultado" onClick={() => ir(`/p/${s.project_id}/${s.id}`)}>
            <strong><Resaltar t={s.title} /></strong>
            {s.estado && <span className="pastilla-dia" style={{ background: s.estado.color, color: textoSobre(s.estado.color) }}>{s.estado.name}</span>}
            {s.archivada && <span className="insignia-archivada">Archivada</span>}
            <span className="tenue pequeno">{s.tarea.name}{s.donde !== s.title ? " · " : ""}{s.donde !== s.title && <Resaltar t={recorte(s.donde)} />}</span>
          </button>))}</Grupo>}
        {res.comentarios.length > 0 && <Grupo titulo="Comentarios">{res.comentarios.map((c) => (
          <button key={c.id} className="resultado" onClick={() => ir(`/p/${c.project_id}/${c.task_id}`)}>
            <span>💬 <Resaltar t={recorte(c.body)} /></span>
            <span className="tenue pequeno">{c.subtarea.title} · {c.tarea.name}</span>
          </button>))}</Grupo>}
      </div>)}
    </section>
  );
}

function Grupo({ titulo, children }) {
  return <div className="grupo-resultados"><h2>{titulo}</h2><div className="lista-resultados">{children}</div></div>;
}
