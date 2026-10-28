import { useState } from "react";
import { agruparPor, estaVencida, fechaCorta, POR_ESTADO_SIN, posicionAlFinal, posicionEntre, subtareasDe } from "../lib/logica.js";
import { Avatar, CeldaEtiqueta, textoSobre } from "./ui.jsx";
import { useStopper } from "./Stopper.jsx";

export default function TableroVista({ visibles, estados, prioridades, labels, groups, tasks, perfiles, puedeEditar, api, abrir }) {
  const stopper = useStopper(estados, api.actualizarTarea);
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const columnas = [...estados, { id: POR_ESTADO_SIN, name: "Sin estado", color: "#c4c4c4" }];
  const mapa = agruparPor(visibles, estados.map((e) => e.id), "status_id");

  const soltar = (colId, antesDe) => {
    const id = arrastrando;
    setArrastrando(null); setSobre(null);
    if (!id) return;
    const lista = (mapa.get(colId) ?? []).filter((t) => t.id !== id);
    let position;
    if (antesDe) {
      const i = lista.findIndex((t) => t.id === antesDe);
      position = posicionEntre(lista[i - 1]?.position ?? null, lista[i]?.position ?? null);
    } else position = posicionAlFinal(lista);
    const tarea = tasks.find((t) => t.id === id);
    if (tarea) stopper.cambiar(tarea, { status_id: colId === POR_ESTADO_SIN ? null : colId, position });
  };

  const agregar = (colId) => {
    const grupo = groups[0];
    if (!grupo) return;
    api.crearTarea({ title: "Nueva tarea", group_id: grupo.id, status_id: colId === POR_ESTADO_SIN ? null : colId, position: posicionAlFinal(mapa.get(colId) ?? []) })
      .then((t) => t?.id && abrir(t.id));
  };

  return (
    <div className="tablero">
      {columnas.map((col) => {
        const tarjetas = mapa.get(col.id) ?? [];
        if (col.id === POR_ESTADO_SIN && !tarjetas.length && !arrastrando) return null;
        return (
          <div key={col.id} className={`columna ${sobre === col.id ? "sobre" : ""}`}
            onDragOver={(e) => { if (arrastrando) { e.preventDefault(); setSobre(col.id); } }}
            onDrop={(e) => { e.preventDefault(); soltar(col.id, null); }}>
            <header className="cabecera-columna" style={{ background: col.color, color: textoSobre(col.color) }}>
              <span>{col.name}</span><span className="contador">{tarjetas.length}</span>
            </header>
            <div className="tarjetas-columna">
              {tarjetas.map((t) => {
                const grupo = groups.find((g) => g.id === t.group_id);
                const subs = subtareasDe(tasks, t.id);
                const vencida = estaVencida(t, labels);
                return (
                  <article key={t.id} className={`tarjeta ${arrastrando === t.id ? "fantasma" : ""}`} draggable={puedeEditar}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setArrastrando(t.id); }}
                    onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                    onDragOver={(e) => { if (arrastrando) { e.preventDefault(); e.stopPropagation(); setSobre(col.id); } }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); soltar(col.id, t.id); }}
                    onClick={() => abrir(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && abrir(t.id)}>
                    {grupo && <span className="chip-grupo" style={{ borderColor: grupo.color, color: grupo.color }}>{grupo.name}</span>}
                    <h3>{t.title}</h3>
                    {t.stopper && <p className="stopper-tarjeta" title={t.stopper}>⚠ {t.stopper}</p>}
                    <div className="pie-tarjeta">
                      <Avatar perfil={t.assignee_id ? perfiles[t.assignee_id] : null} size={24} />
                      {t.due_date && <span className={`fecha ${vencida ? "vencida" : ""}`}>📅 {fechaCorta(t.due_date)}</span>}
                      {subs.length > 0 && <span className="tenue pequeno">☑ {subs.filter((s) => labels.some((l) => l.id === s.status_id && l.is_done)).length}/{subs.length}</span>}
                      <span className="empuje" />
                      {t.priority_id && <CeldaEtiqueta etiquetas={prioridades} valor={t.priority_id} compacta />}
                    </div>
                  </article>
                );
              })}
              {!tarjetas.length && <p className="tenue pequeno centro">{puedeEditar ? "Arrastrá subtareas aquí" : "Sin subtareas"}</p>}
            </div>
            {puedeEditar && groups.length > 0 && <button className="agregar-tarjeta" onClick={() => agregar(col.id)}>+ Agregar subtarea</button>}
          </div>
        );
      })}
      {stopper.dialogo}
    </div>
  );
}
