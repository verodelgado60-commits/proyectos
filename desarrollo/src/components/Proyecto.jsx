import { useMemo, useState } from "react";
import { useProyecto } from "../lib/datos.js";
import { COLORES, diasHasta, fechaCorta, filtrarTareas, POR_ESTADO_SIN, posicionAlFinal, progreso } from "../lib/logica.js";
import { Confirmar, Desplegable, TextoEditable } from "./ui.jsx";
import TablaVista from "./TablaVista.jsx";
import TableroVista from "./TableroVista.jsx";
import ResumenVista from "./ResumenVista.jsx";
import PanelTarea from "./PanelTarea.jsx";
import Miembros from "./Miembros.jsx";
import Etiquetas from "./Etiquetas.jsx";
import { SelectorColor } from "./Espacio.jsx";
import { EstadoGuardado } from "./Sistema.jsx";

const VISTAS = [
  { id: "tabla", nombre: "Tabla principal" },
  { id: "tablero", nombre: "Tablero" },
  { id: "resumen", nombre: "Resumen" },
];

export default function Proyecto({ proyecto, perfil, avisar, cambioLocal }) {
  const d = useProyecto(proyecto.id, avisar);
  const [vista, setVista] = useState(() => { try { return localStorage.getItem("vista") || "tabla"; } catch { return "tabla"; } });
  const [filtros, setFiltros] = useState({ texto: "", responsable: "", estado: "", prioridad: "" });
  const [abierta, setAbierta] = useState(null);
  const [dialogo, setDialogo] = useState(null);

  // La versión en Claude informa el rol directamente; la de Supabase lo toma del equipo
  // Rol global "lector": solo lectura en todo. Administración: dueña de todo. Si no, el rol dentro del proyecto.
  const miRol = perfil.rol === "lector" ? "viewer" : perfil.rol === "admin" ? "owner" : d.project_members.find((m) => m.user_id === perfil.id)?.role ?? "viewer";
  const puedeEditar = miRol === "owner" || miRol === "editor";
  const esDueno = miRol === "owner";
  const estados = d.labels.filter((l) => l.kind === "status");
  const prioridades = d.labels.filter((l) => l.kind === "priority");
  const visibles = useMemo(() => filtrarTareas(d.tasks, filtros), [d.tasks, filtros]);
  const prog = progreso(visibles, d.labels);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const tareaAbierta = abierta ? d.tasks.find((t) => t.id === abierta) : null;

  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem("vista", v); } catch { /* opcional */ } };

  const actualizarProyecto = (cambios) => d.api.actualizarProyecto(proyecto, cambios, cambioLocal);
  const eliminarProyecto = async () => {
    if (await d.api.eliminarProyecto(proyecto, cambioLocal)) { avisar("Proyecto eliminado"); window.location.hash = ""; }
  };
  const salir = async () => {
    if (await d.api.salirProyecto(proyecto, perfil.id, cambioLocal)) { avisar("Saliste del proyecto"); window.location.hash = ""; }
  };
  const nuevoGrupo = () => d.api.crearGrupo({ name: "Nuevo grupo", color: COLORES[d.groups.length % COLORES.length], position: posicionAlFinal(d.groups) });

  const props = { ...d, estados, prioridades, visibles, puedeEditar, perfil, abrir: setAbierta, avisar };

  return (
    <section className="proyecto">
      <header className="cabecera-proyecto">
        <div className="titulo-proyecto">
          <i className="punto grande" style={{ background: proyecto.color }} />
          <h1><TextoEditable valor={proyecto.name} editable={puedeEditar} max={120} onGuardar={(name) => actualizarProyecto({ name })} /></h1>
          <VenceProyecto proyecto={proyecto} editable={puedeEditar} guardar={actualizarProyecto} />
          <EstadoGuardado />
          <div className="empuje" />
          <button className="boton" onClick={() => setDialogo("miembros")}>👥 Equipo ({d.project_members.length})</button>
          <Desplegable alinear="derecha" boton={({ alternar }) => <button className="boton icono" onClick={alternar} aria-label="Más opciones">•••</button>}>
            {(cerrar) => (<>
              {puedeEditar && <button className="opcion-menu" onClick={() => { cerrar(); setDialogo("etiquetas"); }}>Editar estados y prioridades</button>}
              {puedeEditar && <button className="opcion-menu" onClick={() => { cerrar(); setDialogo("color"); }}>Cambiar color y descripción</button>}
              {!esDueno && <button className="opcion-menu" onClick={() => { cerrar(); setDialogo("salir"); }}>Salir del proyecto</button>}
              {esDueno && <button className="opcion-menu peligro" onClick={() => { cerrar(); setDialogo("eliminar"); }}>Eliminar proyecto</button>}
            </>)}
          </Desplegable>
        </div>
        {proyecto.description && <p className="tenue descripcion">{proyecto.description}</p>}
        <div className="pestanas" role="tablist">
          {VISTAS.map((v) => (
            <button key={v.id} role="tab" aria-selected={vista === v.id} className={`pestana ${vista === v.id ? "activa" : ""}`} onClick={() => cambiarVista(v.id)}>{v.nombre}</button>
          ))}
          {miRol === "viewer" && <span className="insignia">Solo lectura</span>}
        </div>
        <div className="barra-herramientas">
          {puedeEditar && vista === "tabla" && <button className="boton primario" onClick={nuevoGrupo}>+ Nuevo grupo</button>}
          <input className="buscar" type="search" placeholder="Buscar tareas…" value={filtros.texto} onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })} aria-label="Buscar" />
          <select value={filtros.responsable} onChange={(e) => setFiltros({ ...filtros, responsable: e.target.value })} aria-label="Filtrar por responsable">
            <option value="">Personas</option>
            <option value="nadie">Sin responsable</option>
            {d.project_members.map((m) => d.perfiles[m.user_id] && <option key={m.user_id} value={m.user_id}>{d.perfiles[m.user_id].full_name || d.perfiles[m.user_id].username}</option>)}
          </select>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} aria-label="Filtrar por estado">
            <option value="">Estados</option>
            {estados.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value={POR_ESTADO_SIN}>Sin estado</option>
          </select>
          <select value={filtros.prioridad} onChange={(e) => setFiltros({ ...filtros, prioridad: e.target.value })} aria-label="Filtrar por prioridad">
            <option value="">Prioridades</option>
            {prioridades.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {hayFiltros && <button className="enlace" onClick={() => setFiltros({ texto: "", responsable: "", estado: "", prioridad: "" })}>Limpiar filtros</button>}
          <div className="empuje" />
          <span className="progreso" title={`${prog.listas} de ${prog.total} tareas listas`}>
            <span className="barra-progreso"><i style={{ width: `${prog.porcentaje}%` }} /></span> {prog.porcentaje}%
          </span>
        </div>
      </header>

      {d.cargando ? <div className="cargando-bloque"><div className="girando" /></div> : (
        <div className="contenido-vista">
          {vista === "tabla" && <TablaVista {...props} />}
          {vista === "tablero" && <TableroVista {...props} />}
          {vista === "resumen" && <ResumenVista {...props} />}
        </div>
      )}

      {tareaAbierta && <PanelTarea tarea={tareaAbierta} {...props} esDueno={esDueno} onClose={() => setAbierta(null)} />}
      {dialogo === "miembros" && <Miembros proyecto={proyecto} {...props} esDueno={esDueno} onClose={() => setDialogo(null)} />}
      {dialogo === "etiquetas" && <Etiquetas {...props} onClose={() => setDialogo(null)} />}
      {dialogo === "color" && <EditarProyecto proyecto={proyecto} guardar={actualizarProyecto} onClose={() => setDialogo(null)} />}
      {dialogo === "eliminar" && <Confirmar mensaje={`¿Eliminar "${proyecto.name}"?`} detalle="Se borrarán todas sus tareas, subtareas y comentarios para todo el equipo. No se puede deshacer."
        onNo={() => setDialogo(null)} onSi={() => { setDialogo(null); eliminarProyecto(); }} />}
      {dialogo === "salir" && <Confirmar mensaje="¿Salir de este proyecto?" detalle="Vas a dejar de verlo hasta que te vuelvan a agregar." textoSi="Salir"
        onNo={() => setDialogo(null)} onSi={() => { setDialogo(null); salir(); }} />}
    </section>
  );
}

function EditarProyecto({ proyecto, guardar, onClose }) {
  const [color, setColor] = useState(proyecto.color);
  const [descripcion, setDescripcion] = useState(proyecto.description);
  return (
    <Confirmar mensaje="Color y descripción" textoSi="Guardar" onNo={onClose}
      onSi={() => { guardar({ color, description: descripcion.trim() }); onClose(); }}
      detalle={<span className="bloque">
        <SelectorColor valor={color} onCambiar={setColor} />
        <textarea className="ancho" rows={3} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción del proyecto" />
      </span>} />
  );
}

// Fecha de vencimiento del proyecto: se muestra y edita en el encabezado
function VenceProyecto({ proyecto, editable, guardar }) {
  const [editando, setEditando] = useState(false);
  const dias = proyecto.due_date ? diasHasta(proyecto.due_date) : null;
  const estado = dias === null ? "" : dias < 0 ? "vencido" : dias <= 1 ? "pronto" : "";
  if (editable && (editando || !proyecto.due_date)) {
    if (!editando) return <button className="boton chip-vence" onClick={() => setEditando(true)}>+ Fecha de vencimiento</button>;
    return (
      <label className="chip-vence editando" htmlFor="vence-proyecto">Vence
        <input id="vence-proyecto" type="date" autoFocus defaultValue={proyecto.due_date ?? ""}
          onBlur={(e) => { setEditando(false); if (e.target.value !== (proyecto.due_date ?? "")) guardar({ due_date: e.target.value || null }); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditando(false); }} />
      </label>
    );
  }
  if (!proyecto.due_date) return null;
  const texto = dias < 0 ? `Venció el ${fechaCorta(proyecto.due_date)}` : dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence ${fechaCorta(proyecto.due_date)}`;
  return editable
    ? <button className={`chip-vence ${estado}`} onClick={() => setEditando(true)} title="Cambiar fecha de vencimiento">{texto}</button>
    : <span className={`chip-vence ${estado}`}>{texto}</span>;
}
