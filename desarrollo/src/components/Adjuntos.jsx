import { useEffect, useRef, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { nuevoId } from "ghdb";
import { hace } from "../lib/logica.js";

const MAX = 20 * 1024 * 1024;
const tamano = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

// Archivos adjuntos de una tarea: se cifran en el navegador antes de subirlos a GitHub
export default function Adjuntos({ tarea, puedeEditar, perfiles, avisar }) {
  const [lista, setLista] = useState([]);
  const [subiendo, setSubiendo] = useState(null);
  const [bajando, setBajando] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from("adjuntos").select("*").eq("task_id", tarea.id).order("created_at");
      setLista(data ?? []);
    };
    cargar();
    const c = supabase.channel(`adjuntos-${tarea.id}`).on("postgres_changes", { event: "*", schema: "public", table: "adjuntos", filter: `task_id=eq.${tarea.id}` }, cargar).subscribe();
    return () => supabase.removeChannel(c);
  }, [tarea.id]);

  const subir = async (archivos) => {
    for (const f of archivos) {
      if (f.size > MAX) { avisar(`"${f.name}" supera 20 MB.`, "error"); continue; }
      setSubiendo(f.name);
      const ruta = `${tarea.id}/${nuevoId()}`;
      const { error } = await supabase.storage.from("adjuntos").upload(ruta, f);
      if (error) { avisar(traducirError(error), "error"); continue; }
      const { error: e2 } = await supabase.from("adjuntos").insert({ task_id: tarea.id, ruta, nombre: f.name.slice(0, 200), tipo: f.type || "application/octet-stream", tam: f.size });
      if (e2) { avisar(traducirError(e2), "error"); await supabase.storage.from("adjuntos").remove([ruta]); continue; }
      avisar(`"${f.name}" adjuntado`);
    }
    setSubiendo(null);
    if (input.current) input.current.value = "";
  };

  const descargar = async (a) => {
    setBajando(a.id);
    const { data, error } = await supabase.storage.from("adjuntos").download(a.ruta);
    setBajando(null);
    if (error) { avisar(traducirError(error), "error"); return; }
    const url = URL.createObjectURL(new Blob([data], { type: a.tipo }));
    const enlace = document.createElement("a");
    enlace.href = url; enlace.download = a.nombre; enlace.rel = "noopener";
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const borrar = async (a) => {
    const { error } = await supabase.from("adjuntos").delete().eq("id", a.id);
    if (error) avisar(traducirError(error), "error"); else avisar("Adjunto eliminado");
  };

  return (
    <section className="seccion-panel">
      <h3>Adjuntos {lista.length > 0 && <span className="tenue pequeno">({lista.length})</span>}</h3>
      {!lista.length && <p className="tenue pequeno">{puedeEditar ? "Todavía no hay archivos. Se guardan cifrados." : "Sin archivos."}</p>}
      <ul className="lista-adjuntos">
        {lista.map((a) => (
          <li key={a.id}>
            <span className="icono-archivo" aria-hidden="true">📎</span>
            <div className="crece">
              <button className="enlace nombre-adjunto" onClick={() => descargar(a)} disabled={bajando === a.id}>{a.nombre}</button>
              <div className="tenue pequeno">{tamano(a.tam)} · {perfiles[a.creado_por]?.full_name || perfiles[a.creado_por]?.username || "Alguien"} · {hace(a.created_at)}</div>
            </div>
            {bajando === a.id && <span className="tenue pequeno">Descifrando…</span>}
            {puedeEditar && <button className="icono" onClick={() => borrar(a)} aria-label={`Eliminar ${a.nombre}`}>🗑</button>}
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <div className="subir-adjunto">
          <input ref={input} id={`adjuntar-${tarea.id}`} type="file" multiple className="sr-solo" onChange={(e) => subir([...e.target.files])} />
          <label htmlFor={`adjuntar-${tarea.id}`} className="boton">{subiendo ? `Cifrando y subiendo ${subiendo}…` : "+ Adjuntar archivo"}</label>
          <span className="tenue pequeno">Hasta 20 MB por archivo</span>
        </div>
      )}
    </section>
  );
}
