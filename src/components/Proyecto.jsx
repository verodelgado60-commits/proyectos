import { useMemo, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { useProyecto } from "../lib/datos.js";
import { COLORES, filtrarTareas, POR_ESTADO_SIN, posicionAlFinal, progreso } from "../lib/logica.js";
import { Confirmar, Desplegable, TextoEditable } from "./ui.jsx";
import TablaVista from "./TablaVista.jsx";
import TableroVista from "./TableroVista.jsx";
import ResumenVista from "./ResumenVista.jsx";
import PanelTarea from "./PanelTarea.jsx";
import Miembros from "./Miembros.jsx";
import Etiquetas from "./Etiquetas.jsx";
import { SelectorColor } from "./Espacio.jsx";

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

  const miRol = d.project_members.find((m) => m.user_id === perfil.id)?.role ?? "viewer";
  const puedeEditar = miRol === "owner" || miRol === "editor";
  const esDueno = miRol === "owner";
  const estados = d.labels.filter((l) => l.kind === "status");
  const prioridades = d.labels.filter((l) => l.kind === "priority");
  const visibles = useMemo(() => filtrarTareas(d.tasks, filtros), [d.tasks, filtros]);
  const prog = progreso(visibles, d.labels);
  const hayFiltros = Object.values(filtros).some(Boolean);
  const tareaAbierta = abierta ? d.tasks.find((t) => t.id === abierta) : null;

  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem("vista", v); } catch { /* opcional */ } };

  const actualizarProyecto = async (cambios) => {
    cambioLocal({ eventType: "UPDATE", new: { ...proyecto, ...cambios } });
    const { error } = await supabase.from("projects").update(cambios).eq("id", proyecto.id);
    if (error) { avisar(traducirError(error), "error"); cambioLocal({ eventType: "UPDATE", new: proyecto }); }
  };
  const eliminarProyecto = async () => {
    const { error } = await supabase.from("projects").delete().eq("id", proyecto.id);
    if (error) avisar(traducirError(error), "error"); else { avisar("Proyecto eliminado"); window.location.hash = ""; cambioLocal({ eventType: "DELETE", old: { id: proyecto.id } }); }
  };
  const salir = async () => {
    const { error } = await supabase.from("project_members").delete().eq("project_id", proyecto.id).eq("user_id", perfil.id);
    if (error) avisar(traducirError(error), "error"); else { avisar("Saliste del proyecto"); window.location.hash = ""; cambioLocal({ eventType: "DELETE", old: { id: proyecto.id } }); }
  };
  const nuevoGrupo = () => d.api.crearGrupo({ name: "Nuevo grupo", color: COLORES[d.groups.length % COLORES.length], position: posicionAlFinal(d.groups) });

  const props = { ...d, estados, prioridades, visibles, puedeEditar, perfil, abrir: setAbierta, avisar };

  return (
    <section className="proyecto">
      <header className="cabecera-proyecto">
        <div className="titulo-proyecto">
          <i className="punto grande" style={{ background: proyecto.color }} />
          <h1><TextoEditable valor={proyecto.name} editable={puedeEditar} max={120} onGuardar={(name) => actualizarProyecto({ name })} /></h1>
          <span className={`estado-conexion ${d.conectado ? "en-linea" : ""}`} title={d.conectado ? "Sincronizado en tiempo real" : "Conectando…"}>
            {d.conectado ? "● En vivo" : "○ Conectando"}
          </span>
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
      {dialogo === "salir" && <Confirmar mensaje="¿Salir de este proyecto?" detalle="Dejarás de verlo hasta que el dueño te vuelva a agregar." textoSi="Salir"
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
