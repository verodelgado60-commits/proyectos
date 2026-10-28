import { useMemo, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { elementosDeTablero, esPorDefecto, estadoEquivalente, leerXlsx, TAMANO_MAXIMO } from "../lib/importarExcel.js";
import { COLORES, fechaCorta, posicionAlFinal } from "../lib/logica.js";
import { Modal } from "./ui.jsx";

// Importa un Excel (por ejemplo, exportado de Monday) como tareas de este proyecto.
// Cada fila se vuelve una tarea; adentro queda su subtarea 1 con estado, prioridad, fecha y notas.
export default function ImportarExcel({ carpeta, tareasActuales, perfil, avisar, onClose }) {
  const [elementos, setElementos] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [error, setError] = useState("");
  const [avance, setAvance] = useState(null);
  const existentes = useMemo(() => new Set(tareasActuales.map((t) => t.name.trim().toLowerCase())), [tareasActuales]);

  const leer = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    setError(""); setElementos(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { setError("Elegí un archivo de Excel (.xlsx)."); return; }
    if (f.size > TAMANO_MAXIMO) { setError("El archivo es muy grande (máximo 5 MB)."); return; }
    try {
      const els = elementosDeTablero(leerXlsx(await f.arrayBuffer()));
      if (!els.length) { setError("No encontré filas con columnas Nombre y Estado."); return; }
      setElementos(els);
      setMarcados(new Set(els.map((x, i) => (esPorDefecto(x) && !existentes.has(x.nombre.toLowerCase()) ? i : -1)).filter((i) => i >= 0)));
    } catch (err) { setError(err.message || "No se pudo leer el archivo."); }
  };

  const alternar = (i) => setMarcados((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const importar = async () => {
    const lista = elementos.filter((_, i) => marcados.has(i));
    setAvance({ hechos: 0, total: lista.length });
    let posicion = posicionAlFinal(tareasActuales);
    for (const [n, el] of lista.entries()) {
      const { data: tarea, error: e1 } = await supabase.from("projects").insert({
        name: el.nombre, description: el.notas, due_date: el.vence, carpeta_id: carpeta.id,
        color: carpeta.color || COLORES[0], owner_id: perfil.id, position: posicion++,
      }).select().single();
      if (e1) { avisar(`No se pudo crear «${el.nombre}»: ${traducirError(e1)}`, "error"); setAvance(null); return; }
      const [{ data: labels }, { data: grupos }] = await Promise.all([
        supabase.from("labels").select("*").eq("project_id", tarea.id),
        supabase.from("groups").select("*").eq("project_id", tarea.id),
      ]);
      const etiqueta = (kind, nombre) => (labels ?? []).find((l) => l.kind === kind && l.name.toLowerCase() === String(nombre).toLowerCase())?.id ?? null;
      const estado = estadoEquivalente(el.estado);
      const { error: e2 } = await supabase.from("tasks").insert({
        project_id: tarea.id, group_id: grupos?.[0]?.id ?? null, title: el.nombre, position: 1,
        status_id: estado ? etiqueta("status", estado) : null, priority_id: el.prioridad ? etiqueta("priority", el.prioridad) : null,
        due_date: el.vence, start_date: el.inicio && (!el.vence || el.inicio <= el.vence) ? el.inicio : null, description: el.notas,
        ...(estado === "Stopper" ? { stopper: el.notas || "Importado como detenido", stopper_desde: new Date().toISOString().slice(0, 10) } : {}),
      });
      if (e2) { avisar(`«${el.nombre}» se creó, pero no su subtarea: ${traducirError(e2)}`, "error"); setAvance(null); return; }
      setAvance({ hechos: n + 1, total: lista.length });
    }
    avisar(lista.length === 1 ? "1 tarea importada" : `${lista.length} tareas importadas`);
    onClose();
  };

  return (
    <Modal titulo={`Importar de Excel a ${carpeta.name}`} onClose={avance ? () => {} : onClose} ancho={720}>
      <p className="tenue pequeno">Elegí el archivo exportado (columnas Nombre, Estado, Vencimiento, Prioridad, Notas). El archivo se lee aquí en tu navegador; solo se guardan las tareas que marqués, cifradas como todo lo demás.</p>
      <label className="boton subir-excel">📄 Elegir archivo .xlsx
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={leer} disabled={!!avance} hidden />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {elementos && (<>
        <div className="filtros-import">
          <span className="tenue pequeno">{marcados.size} de {elementos.length} marcadas</span>
          <span className="empuje" />
          <button type="button" className="enlace" onClick={() => setMarcados(new Set(elementos.map((x, i) => (esPorDefecto(x) ? i : -1)).filter((i) => i >= 0)))}>Solo en curso y sin iniciar</button>
          <button type="button" className="enlace" onClick={() => setMarcados(new Set(elementos.map((_, i) => i)))}>Todas</button>
          <button type="button" className="enlace" onClick={() => setMarcados(new Set())}>Ninguna</button>
        </div>
        <ul className="lista-import">
          {elementos.map((el, i) => (
            <li key={i}>
              <label>
                <input type="checkbox" checked={marcados.has(i)} onChange={() => alternar(i)} disabled={!!avance} />
                <span className="nombre-import">{el.nombre}{existentes.has(el.nombre.toLowerCase()) && <small className="tenue"> · ya existe</small>}</span>
                <span className={`estado-import e-${(estadoEquivalente(el.estado) ?? "otro").replace(" ", "-").toLowerCase()}`}>{el.estado || "—"}</span>
                <span className="tenue pequeno fecha-import">{el.vence ? fechaCorta(el.vence) : ""}</span>
              </label>
            </li>
          ))}
        </ul>
      </>)}
      <div className="acciones">
        <button type="button" className="boton" onClick={onClose} disabled={!!avance}>Cancelar</button>
        <button type="button" className="boton primario" disabled={!elementos || !marcados.size || !!avance} onClick={importar}>
          {avance ? `Importando ${avance.hechos}/${avance.total}…` : `Importar ${marcados.size || ""} ${marcados.size === 1 ? "tarea" : "tareas"}`}
        </button>
      </div>
    </Modal>
  );
}
