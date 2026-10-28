import { useEffect, useRef, useState } from "react";
import Adjuntos from "./Adjuntos.jsx";
import { useComentarios } from "../lib/datos.js";
import { hace, posicionAlFinal, subtareasDe } from "../lib/logica.js";
import { Avatar, CeldaEtiqueta, Confirmar, SelectorPersona, TextoEditable } from "./ui.jsx";
import { AvisoStopper, useStopper } from "./Stopper.jsx";
import { BloqueConclusion, useConclusion } from "./Conclusion.jsx";

export default function PanelTarea({ tarea, tasks, groups, estados, prioridades, labels, project_members, perfiles, puedeEditar, esDueno, perfil, api, abrir, avisar, onClose }) {
  const [descripcion, setDescripcion] = useState(tarea.description ?? "");
  const [nuevaSub, setNuevaSub] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const padre = tarea.parent_id ? tasks.find((t) => t.id === tarea.parent_id) : null;
  const subs = tarea.parent_id ? [] : subtareasDe(tasks, tarea.id);
  const listo = labels.find((l) => l.kind === "status" && l.is_done);
  const stopper = useStopper(estados, api.actualizarTarea);
  const conclusion = useConclusion(api.actualizarTarea);
  const cambiar = (c) => stopper.cambiar(tarea, c);

  const refDesc = useRef(null);
  // Si otra persona cambia la descripción mientras escribís, no se te borra lo que estás escribiendo
  useEffect(() => { if (document.activeElement !== refDesc.current) setDescripcion(tarea.description ?? ""); }, [tarea.id, tarea.description]);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && !document.querySelector(".capa") && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const agregarSub = async (e) => {
    e.preventDefault();
    const t = nuevaSub.trim(); if (!t) return;
    setNuevaSub("");
    await api.crearTarea({ title: t, parent_id: tarea.id, group_id: tarea.group_id, position: posicionAlFinal(subs), status_id: estados[0]?.id ?? null });
  };

  return (
    <div className="panel-capa" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel-tarea" role="dialog" aria-label={`Tarea ${tarea.title}`}>
        <header className="cabecera-panel">
          <div className="migas">
            {padre ? <button className="enlace" onClick={() => abrir(padre.id)}>← {padre.title}</button>
              : <span className="tenue">{groups.find((g) => g.id === tarea.group_id)?.name}</span>}
          </div>
          <button className="icono" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <h2 className="titulo-panel"><TextoEditable valor={tarea.title} editable={puedeEditar} onGuardar={(title) => cambiar({ title })} /></h2>

        <AvisoStopper tarea={tarea} estados={estados} onEditar={puedeEditar ? () => stopper.editar(tarea) : undefined} />
        {stopper.dialogo}
        {conclusion.dialogo}
        <BloqueConclusion tarea={tarea} editable={puedeEditar} onEditar={() => conclusion.abrir(tarea)} />
        <dl className="campos-tarea">
          <dt>Estado</dt><dd><CeldaEtiqueta etiquetas={estados} valor={tarea.status_id} editable={puedeEditar} onCambiar={(v) => cambiar({ status_id: v })} /></dd>
          <dt>Prioridad</dt><dd><CeldaEtiqueta etiquetas={prioridades} valor={tarea.priority_id} editable={puedeEditar} onCambiar={(v) => cambiar({ priority_id: v })} /></dd>
          <dt>Responsable</dt><dd className="con-nombre">
            <SelectorPersona miembros={project_members} perfiles={perfiles} valor={tarea.assignee_id} editable={puedeEditar} onCambiar={(v) => cambiar({ assignee_id: v })} />
            <span>{tarea.assignee_id ? (perfiles[tarea.assignee_id]?.full_name || perfiles[tarea.assignee_id]?.username) : <span className="tenue">Sin asignar</span>}</span>
          </dd>
          <dt>Inicio</dt><dd><input type="date" disabled={!puedeEditar} value={tarea.start_date ?? ""} max={tarea.due_date ?? undefined}
            onChange={(e) => cambiar({ start_date: e.target.value || null })} aria-label="Fecha de inicio" /></dd>
          <dt>Fecha límite</dt><dd>{tarea.fecha_na
            ? <button type="button" className="chip-na" disabled={!puedeEditar} onClick={() => cambiar({ fecha_na: false })}>N/A</button>
            : <span className="fecha-con-na"><input type="date" disabled={!puedeEditar} value={tarea.due_date ?? ""} min={tarea.start_date ?? undefined}
              onChange={(e) => cambiar({ due_date: e.target.value || null })} aria-label="Fecha límite" />
              {puedeEditar && !tarea.due_date && <button type="button" className="boton-na" onClick={() => cambiar({ fecha_na: true, due_date: null })}>N/A</button>}</span>}</dd>
          <dt>Estimación</dt><dd><input type="number" min="0" step="0.5" disabled={!puedeEditar} value={tarea.estimation ?? ""}
            onChange={(e) => cambiar({ estimation: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} aria-label="Estimación" /></dd>
          {!tarea.parent_id && <><dt>Sección</dt><dd><select disabled={!puedeEditar} value={tarea.group_id ?? ""} onChange={(e) => cambiar({ group_id: e.target.value })}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></dd></>}
        </dl>

        <section className="seccion-panel">
          <h3>Descripción</h3>
          <textarea ref={refDesc} id="descripcion-tarea" className="ancho" rows={4} value={descripcion} disabled={!puedeEditar} maxLength={10000} placeholder={puedeEditar ? "Agregá detalles, enlaces o notas…" : "Sin descripción"}
            onChange={(e) => setDescripcion(e.target.value)} onBlur={() => descripcion !== (tarea.description ?? "") && cambiar({ description: descripcion })} />
        </section>

        {!tarea.parent_id && (
          <section className="seccion-panel">
            <h3>Pasos {subs.length > 0 && <span className="tenue pequeno">({subs.filter((s) => labels.some((l) => l.id === s.status_id && l.is_done)).length}/{subs.length})</span>}</h3>
            <ul className="lista-subtareas">
              {subs.map((s) => {
                const hecha = labels.some((l) => l.id === s.status_id && l.is_done);
                return (
                  <li key={s.id} className={hecha ? "hecha" : ""}>
                    <input type="checkbox" checked={hecha} disabled={!puedeEditar || !listo} aria-label="Marcar como lista"
                      onChange={() => api.actualizarTarea(s.id, { status_id: hecha ? (estados.find((e) => !e.is_done)?.id ?? null) : listo.id })} />
                    <TextoEditable valor={s.title} editable={puedeEditar} onGuardar={(title) => api.actualizarTarea(s.id, { title })} />
                    <span className="empuje" />
                    <Avatar perfil={s.assignee_id ? perfiles[s.assignee_id] : null} size={20} />
                    <button className="icono" onClick={() => abrir(s.id)} aria-label="Abrir subtarea">↗</button>
                    {puedeEditar && <button className="icono" onClick={() => api.borrarTarea(s.id)} aria-label="Eliminar subtarea">🗑</button>}
                  </li>
                );
              })}
            </ul>
            {puedeEditar && <form onSubmit={agregarSub}><input className="entrada-nueva ancho" placeholder="+ Agregar paso" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} maxLength={300} /></form>}
          </section>
        )}

        <Adjuntos tarea={tarea} puedeEditar={puedeEditar} perfiles={perfiles} avisar={avisar} />

        <Comentarios tareaId={tarea.id} perfil={perfil} perfiles={perfiles} esDueno={esDueno} avisar={avisar} />

        {puedeEditar && (
          <footer className="pie-panel">
            <button className="boton peligro" onClick={() => setConfirmar(true)}>Eliminar tarea</button>
          </footer>
        )}
        {confirmar && <Confirmar mensaje={`¿Eliminar "${tarea.title}"?`} detalle={subs.length ? `También se eliminarán sus ${subs.length} subtareas y los comentarios.` : "También se eliminarán sus comentarios."}
          onNo={() => setConfirmar(false)} onSi={() => { setConfirmar(false); onClose(); api.borrarTarea(tarea.id); }} />}
      </aside>
    </div>
  );
}

function Comentarios({ tareaId, perfil, perfiles, esDueno, avisar }) {
  const { comentarios, cargando, agregar, editar, borrar, autores = {} } = useComentarios(tareaId, avisar);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(null);
  const [textoEdit, setTextoEdit] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    const t = texto.trim(); if (!t) return;
    setEnviando(true);
    if (await agregar(t)) setTexto("");
    setEnviando(false);
  };

  return (
    <section className="seccion-panel">
      <h3>Comentarios</h3>
      <form onSubmit={enviar} className="nuevo-comentario">
        <textarea rows={2} placeholder="Escribí una actualización…" value={texto} maxLength={5000} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); }} />
        <button className="boton primario" disabled={!texto.trim() || enviando}>Comentar</button>
      </form>
      {cargando && <p className="tenue pequeno">Cargando comentarios…</p>}
      {!cargando && !comentarios.length && <p className="tenue pequeno">Aún no hay comentarios.</p>}
      <ul className="comentarios">
        {[...comentarios].reverse().map((c) => {
          const autor = autores[c.author_id] || perfiles[c.author_id];
          const mio = c.author_id === perfil.id;
          return (
            <li key={c.id} className="comentario">
              <Avatar perfil={autor} size={30} />
              <div className="cuerpo-comentario">
                <div className="meta"><strong>{autor?.full_name || autor?.username || "Ex miembro"}</strong> <span className="tenue pequeno">{hace(c.created_at)}{c.updated_at !== c.created_at ? " · editado" : ""}</span></div>
                {editando === c.id ? (
                  <form onSubmit={async (e) => { e.preventDefault(); if (textoEdit.trim() && await editar(c.id, textoEdit.trim())) setEditando(null); }}>
                    <textarea className="ancho" rows={2} value={textoEdit} maxLength={5000} onChange={(e) => setTextoEdit(e.target.value)} autoFocus />
                    <div className="acciones"><button type="button" className="boton" onClick={() => setEditando(null)}>Cancelar</button><button className="boton primario">Guardar</button></div>
                  </form>
                ) : <p className="texto-comentario">{c.body}</p>}
                {editando !== c.id && (mio || esDueno) && (
                  <div className="acciones-comentario">
                    {mio && <button className="enlace" onClick={() => { setEditando(c.id); setTextoEdit(c.body); }}>Editar</button>}
                    <button className="enlace peligro" onClick={() => borrar(c.id)}>Eliminar</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
