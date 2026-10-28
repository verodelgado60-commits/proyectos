import { useState } from "react";
import { COLORES, estaVencida, fechaCorta, ordenar, posicionAlFinal, posicionEntre, progreso, resumenEstados, subtareasDe } from "../lib/logica.js";
import { Confirmar, Desplegable, ListaEtiqueta, SelectorPersona, TextoEditable } from "./ui.jsx";
import { AvisoStopper, useStopper } from "./Stopper.jsx";

const ESTIMACIONES = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40];

export default function TablaVista(props) {
  const { groups, visibles, puedeEditar, api } = props;
  const [arrastrando, setArrastrando] = useState(null);

  if (!groups.length) {
    return <div className="vacio"><p>Este proyecto no tiene grupos.</p>
      {puedeEditar && <button className="boton primario" onClick={() => api.crearGrupo({ name: "Subtareas", color: COLORES[0], position: 1 })}>+ Crear sección</button>}</div>;
  }
  return (
    <div className="tabla-grupos">
      {groups.map((g) => (
        <Grupo key={g.id} grupo={g} tareas={ordenar(visibles.filter((t) => t.group_id === g.id))} arrastrando={arrastrando} setArrastrando={setArrastrando} {...props} />
      ))}
    </div>
  );
}

function Grupo({ grupo, tareas, puedeEditar, api, estados, labels, arrastrando, setArrastrando, ...props }) {
  const [plegado, setPlegado] = useState(false);
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [sobre, setSobre] = useState(false);
  const prog = progreso(tareas, labels);

  const agregar = async (e) => {
    e.preventDefault();
    const titulo = nueva.trim();
    if (!titulo) return;
    setNueva("");
    await api.crearTarea({ title: titulo, group_id: grupo.id, position: posicionAlFinal(tareas), status_id: estados[0]?.id ?? null });
  };

  // Soltar una tarea arrastrada: antes de "destino" o al final del grupo
  const soltar = (destino) => {
    if (!arrastrando) return;
    const id = arrastrando;
    setArrastrando(null); setSobre(false);
    const lista = tareas.filter((t) => t.id !== id);
    let position;
    if (destino) {
      const i = lista.findIndex((t) => t.id === destino);
      position = posicionEntre(lista[i - 1]?.position ?? null, lista[i]?.position ?? null);
    } else position = posicionAlFinal(lista);
    api.actualizarTarea(id, { group_id: grupo.id, position });
  };

  return (
    <div className="grupo" style={{ "--color-grupo": grupo.color }}>
      <div className="cabecera-grupo">
        <button className="icono plegar" onClick={() => setPlegado((p) => !p)} aria-label={plegado ? "Expandir sección" : "Plegar sección"}>{plegado ? "▸" : "▾"}</button>
        <h2 className="nombre-grupo"><TextoEditable valor={grupo.name} editable={puedeEditar} max={120} onGuardar={(name) => api.actualizarGrupo(grupo.id, { name })} /></h2>
        <span className="tenue pequeno">{tareas.length} {tareas.length === 1 ? "subtarea" : "subtareas"}</span>
        {puedeEditar && (
          <Desplegable boton={({ alternar }) => <button className="icono" onClick={alternar} aria-label="Opciones del grupo">•••</button>}>
            {(cerrar) => (<>
              <div className="colores menu-colores">
                {COLORES.map((c) => <button key={c} className="muestra" style={{ background: c }} aria-label={`Color ${c}`} onClick={() => { api.actualizarGrupo(grupo.id, { color: c }); cerrar(); }} />)}
              </div>
              <button className="opcion-menu peligro" onClick={() => { cerrar(); setConfirmar(true); }}>Eliminar grupo</button>
            </>)}
          </Desplegable>
        )}
      </div>
      {!plegado && (
        <div className="tabla-desplazable">
          <table className="tabla" role="grid">
            <thead>
              <tr>
                <th className="col-tarea">Subtarea</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Fecha límite</th>
                <th>Prioridad</th>
                <th>Estimación</th>
              </tr>
            </thead>
            <tbody>
              {tareas.map((t, i) => (
                <Fila key={t.id} numero={`${i + 1}.`} tarea={t} puedeEditar={puedeEditar} api={api} estados={estados} labels={labels} {...props}
                  arrastrable={puedeEditar} onArrastre={() => setArrastrando(t.id)} onFinArrastre={() => { setArrastrando(null); setSobre(false); }}
                  onSoltar={() => soltar(t.id)} />
              ))}
              {puedeEditar && (
                <tr className={`fila-agregar ${sobre ? "sobre" : ""}`}
                  onDragOver={(e) => { if (arrastrando) { e.preventDefault(); setSobre(true); } }} onDragLeave={() => setSobre(false)} onDrop={() => soltar(null)}>
                  <td className="col-tarea" colSpan={6}>
                    <form onSubmit={agregar} className="form-agregar">
                      <button type="submit" className="boton-mas" aria-label="Agregar subtarea" title="Agregar subtarea">+</button>
                      <input className="entrada-nueva" placeholder={`${tareas.length + 1}. Escribí la subtarea y presioná Enter`} value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={300} aria-label={`Agregar subtarea a ${grupo.name}`} />
                    </form>
                  </td>
                </tr>
              )}
            </tbody>
            {tareas.length > 0 && (
              <tfoot>
                <tr>
                  <td className="col-tarea" />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="centro tenue pequeno">{sumar(tareas)} · {prog.porcentaje}% listo</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {confirmar && <Confirmar mensaje={`¿Eliminar el grupo "${grupo.name}"?`} detalle="También se eliminarán sus tareas y subtareas."
        onNo={() => setConfirmar(false)} onSi={() => { setConfirmar(false); api.borrarGrupo(grupo.id); }} />}
    </div>
  );
}

function sumar(tareas) {
  const s = tareas.reduce((acc, t) => acc + (Number(t.estimation) || 0), 0);
  return `Σ ${Math.round(s * 100) / 100}`;
}

export function BarraEstados({ tareas, estados }) {
  const partes = resumenEstados(tareas, estados);
  return (
    <span className="barra-estados" title={partes.map((p) => `${p.name}: ${p.n}`).join(" · ")}>
      {partes.map((p) => <i key={p.id} style={{ width: `${p.pct}%`, background: p.color }} />)}
    </span>
  );
}

function Fila({ numero, tarea, tasks, puedeEditar, api, estados, prioridades, labels, project_members, perfiles, abrir, arrastrable, onArrastre, onFinArrastre, onSoltar, esSub = false }) {
  const [expandida, setExpandida] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [nuevaSub, setNuevaSub] = useState("");
  const subs = esSub ? [] : subtareasDe(tasks, tarea.id);
  const hechas = subs.filter((s) => labels.some((l) => l.id === s.status_id && l.is_done)).length;
  const vencida = estaVencida(tarea, labels);
  const stopper = useStopper(estados, api.actualizarTarea);
  const cambiar = (c) => stopper.cambiar(tarea, c);
  const comunes = { tasks, puedeEditar, api, estados, prioridades, labels, project_members, perfiles, abrir };

  const agregarSub = async (e) => {
    e.preventDefault();
    const t = nuevaSub.trim(); if (!t) return;
    setNuevaSub("");
    await api.crearTarea({ title: t, parent_id: tarea.id, group_id: tarea.group_id, position: posicionAlFinal(subs), status_id: estados[0]?.id ?? null });
  };

  return (<>
    <tr className={`fila ${esSub ? "fila-sub" : ""} ${sobre ? "sobre" : ""}`}
      draggable={arrastrable && !esSub} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tarea.id); onArrastre?.(); }}
      onDragEnd={onFinArrastre} onDragOver={(e) => { if (onSoltar) { e.preventDefault(); setSobre(true); } }} onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); onSoltar?.(); }}>
      <td className="col-tarea">
        <div className="celda-tarea">
          <span className="numero-fila">{numero}</span>
          {!esSub && <button className={`icono subs ${subs.length ? "" : "sin"}`} onClick={() => setExpandida((x) => !x)} aria-label="Pasos" title="Pasos de esta subtarea">
            {expandida ? "▾" : "▸"}{subs.length > 0 && <small>{hechas}/{subs.length}</small>}
          </button>}
          <TextoEditable className="titulo-tarea" valor={tarea.title} editable={puedeEditar} onGuardar={(title) => cambiar({ title })} />
          <AvisoStopper tarea={tarea} estados={estados} compacto onEditar={() => (puedeEditar ? stopper.editar(tarea) : abrir(tarea.id))} />
          {stopper.dialogo}
          <button className="abrir" onClick={() => abrir(tarea.id)} aria-label={`Abrir ${tarea.title}`} title="Abrir detalle y comentarios">💬</button>
        </div>
      </td>
      <td className="centro"><SelectorPersona miembros={project_members} perfiles={perfiles} valor={tarea.assignee_id} editable={puedeEditar} onCambiar={(v) => cambiar({ assignee_id: v })} /></td>
      <td className="celda-pastilla"><ListaEtiqueta etiqueta="Estado" etiquetas={estados} valor={tarea.status_id} editable={puedeEditar} onCambiar={(v) => cambiar({ status_id: v })} /></td>
      <td className={`centro ${vencida ? "vencida" : ""}`}>
        {puedeEditar
          ? <input type="date" className="entrada-fecha campo-celda" value={tarea.due_date ?? ""} onChange={(e) => cambiar({ due_date: e.target.value || null })} aria-label="Fecha límite" />
          : <span>{fechaCorta(tarea.due_date)}</span>}
      </td>
      <td className="celda-pastilla"><ListaEtiqueta etiqueta="Prioridad" etiquetas={prioridades} valor={tarea.priority_id} editable={puedeEditar} onCambiar={(v) => cambiar({ priority_id: v })} /></td>
      <td className="centro">
        {puedeEditar
          ? <select className="campo-celda lista-estimacion" value={tarea.estimation ?? ""} aria-label="Estimación en horas"
              onChange={(e) => cambiar({ estimation: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">—</option>
              {[...new Set([...ESTIMACIONES, ...(tarea.estimation != null ? [Number(tarea.estimation)] : [])])].sort((a, b) => a - b)
                .map((h) => <option key={h} value={h}>{h} h</option>)}
            </select>
          : <span>{tarea.estimation ?? ""}</span>}
      </td>
    </tr>
    {expandida && subs.map((s, i) => <Fila key={s.id} numero={`${numero}${i + 1}`} tarea={s} esSub {...comunes} />)}
    {expandida && puedeEditar && (
      <tr className="fila-sub fila-agregar"><td className="col-tarea" colSpan={6}>
        <form onSubmit={agregarSub}><input className="entrada-nueva" placeholder="+ Agregar paso" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} maxLength={300} /></form>
      </td></tr>
    )}
  </>);
}
