import { useCallback, useEffect, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { aplicarCambio, COLORES, ordenar, posicionAlFinal } from "../lib/logica.js";
import { Confirmar, Desplegable, Modal, TextoEditable } from "./ui.jsx";

// "Mis dash": grupos de dashboards (como los proyectos) y, adentro, cada dash.
// La primera vez se crea el grupo "Tipos" con el dash "Tipologías" (vacío hasta cargar sus datos).
export function useDashes(perfil, avisar) {
  const [grupos, setGrupos] = useState([]);
  const [dashes, setDashes] = useState([]);
  const escribe = ["admin", "editor"].includes(perfil.rol);
  const cargar = useCallback(async () => {
    const [g, d] = await Promise.all([supabase.from("dash_grupos").select("*"), supabase.from("dashes").select("*")]);
    const fallo = [g, d].find((r) => r.error);
    if (fallo) { avisar(traducirError(fallo.error), "error"); return; }
    setGrupos(ordenar(g.data)); setDashes(ordenar(d.data));
    if (escribe && !g.data.length) {
      const { data: hecho } = await supabase.from("ajustes").select("*").eq("id", "dash-inicial");
      if (!hecho?.length) {
        await supabase.from("ajustes").insert({ id: "dash-inicial", valor: true });
        const { data: grupo } = await supabase.from("dash_grupos").insert({ name: "Tipos", color: "#0780ee", position: 1 }).select().single();
        if (grupo) {
          const { data: dash } = await supabase.from("dashes").insert({ name: "Tipologías", grupo_id: grupo.id, tipo: "tipologias", position: 1 }).select().single();
          setGrupos([grupo]); if (dash) setDashes([dash]);
        }
      }
    }
  }, [escribe, avisar]);
  useEffect(() => {
    cargar();
    const canal = supabase.channel(`dashes-${perfil.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dash_grupos" }, (ev) => setGrupos((l) => ordenar(aplicarCambio(l, ev))))
      .on("postgres_changes", { event: "*", schema: "public", table: "dashes" }, (ev) => setDashes((l) => ordenar(aplicarCambio(l, ev))))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar, perfil.id]);

  const api = {
    crearGrupo: async (name, color) => {
      const { data, error } = await supabase.from("dash_grupos").insert({ name, color, position: posicionAlFinal(grupos) }).select().single();
      if (error) { avisar(traducirError(error), "error"); return null; }
      setGrupos((l) => ordenar(aplicarCambio(l, { eventType: "INSERT", new: data }))); return data;
    },
    crearDash: async (grupoId, name) => {
      const { data, error } = await supabase.from("dashes").insert({ name, grupo_id: grupoId, tipo: "libre", position: posicionAlFinal(dashes.filter((d) => d.grupo_id === grupoId)) }).select().single();
      if (error) { avisar(traducirError(error), "error"); return null; }
      setDashes((l) => ordenar(aplicarCambio(l, { eventType: "INSERT", new: data }))); return data;
    },
    actualizar: async (tabla, id, cambios) => {
      const { error } = await supabase.from(tabla).update(cambios).eq("id", id);
      if (error) avisar(traducirError(error), "error");
    },
    eliminar: async (tabla, id) => {
      const { error } = await supabase.from(tabla).delete().eq("id", id);
      if (error) { avisar(traducirError(error), "error"); return false; }
      if (tabla === "dash_grupos") { setGrupos((l) => l.filter((g) => g.id !== id)); setDashes((l) => l.filter((d) => d.grupo_id !== id)); }
      else setDashes((l) => l.filter((d) => d.id !== id));
      return true;
    },
  };
  return { grupos, dashes, escribe, api };
}

// Sección del menú, igual a "Mis proyectos"
export function MenuDashes({ datos, ruta, ir, onNuevoGrupo }) {
  const { grupos, dashes, escribe } = datos;
  const [manual, setManual] = useState({});
  const dashActual = ruta.tipo === "dash" ? dashes.find((d) => d.id === ruta.id) : null;
  const grupoActual = ruta.tipo === "dash-grupo" ? ruta.id : dashActual?.grupo_id ?? null;
  const expandido = (id) => manual[id] ?? grupoActual === id;
  return (<>
    <div className="titulo-seccion-nav">
      <h3 className="nav-titulo">Mis dash</h3>
      {escribe && <button type="button" className="mas-seccion" onClick={onNuevoGrupo} aria-label="Nuevo grupo de dash" title="Nuevo grupo de dash">+</button>}
    </div>
    {!grupos.length && <p className="tenue pequeno">Aún no tenés dash.</p>}
    {grupos.map((g) => {
      const abierto = expandido(g.id);
      const lista = dashes.filter((d) => d.grupo_id === g.id);
      return (
        <div key={g.id} className="grupo-nav">
          <div className="fila-carpeta">
            <button type="button" className="flecha-nav" onClick={() => setManual((m) => ({ ...m, [g.id]: !abierto }))} aria-expanded={abierto}
              aria-label={`${abierto ? "Cerrar" : "Abrir"} ${g.name}`} title={abierto ? "Cerrar" : "Abrir"}>{abierto ? "▾" : "▸"}</button>
            <button className={`nav-item nav-carpeta nav-dash-grupo ${ruta.tipo === "dash-grupo" && ruta.id === g.id ? "activo" : ""}`}
              onClick={() => { setManual((m) => ({ ...m, [g.id]: true })); ir(`/dg/${g.id}`); }}>
              <i className="punto" style={{ background: g.color }} /> <span className="corta">{g.name}</span>
              <small className="tenue">{lista.length}</small>
            </button>
          </div>
          {abierto && (
            <div className="subnav">
              {lista.map((d) => (
                <button key={d.id} className={`nav-item nav-tarea nav-dash ${dashActual?.id === d.id ? "activo" : ""}`} onClick={() => ir(`/d/${d.id}`)}>
                  <span className="corta">📊 {d.name}</span>
                </button>
              ))}
              {escribe && <CrearDashEnLinea grupo={g} datos={datos} ir={ir} />}
            </div>
          )}
        </div>
      );
    })}
  </>);
}

function CrearDashEnLinea({ grupo, datos, ir }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  if (!abierto) return <button className="nav-item nav-tarea nav-crear" onClick={() => setAbierto(true)}>+ Crear dash</button>;
  return (
    <form className="crear-dash-linea" onSubmit={async (e) => {
      e.preventDefault(); const n = nombre.trim(); if (!n) return;
      const d = await datos.api.crearDash(grupo.id, n); setNombre(""); setAbierto(false); if (d) ir(`/d/${d.id}`);
    }}>
      <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre del dash" aria-label={`Nombre del dash nuevo en ${grupo.name}`}
        onKeyDown={(e) => { if (e.key === "Escape") { setAbierto(false); setNombre(""); } }} onBlur={() => { if (!nombre.trim()) setAbierto(false); }} />
    </form>
  );
}

export function NuevoGrupoDash({ datos, onClose, ir }) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[datos.grupos.length % COLORES.length]);
  return (
    <Modal titulo="Nuevo grupo de dash" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault(); if (!nombre.trim()) return;
        const g = await datos.api.crearGrupo(nombre.trim(), color); if (g) { onClose(); ir(`/dg/${g.id}`); }
      }}>
        <label className="campo" htmlFor="ndg-nombre"><span>Nombre</span><input id="ndg-nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ej. NPS, Contención" /></label>
        <div className="campo"><span>Color</span>
          <div className="colores">{COLORES.map((c) => <button key={c} type="button" className={`muestra ${color === c ? "activa" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />)}</div>
        </div>
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={!nombre.trim()}>Crear grupo</button>
        </div>
      </form>
    </Modal>
  );
}

// Pantalla de un grupo: sus dash en tarjetas
export function VistaGrupoDash({ grupo, datos, ir }) {
  const { dashes, escribe, api } = datos;
  const [borrar, setBorrar] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const lista = dashes.filter((d) => d.grupo_id === grupo.id);
  return (
    <section className="inicio vista-carpeta">
      <div className="titulo-carpeta">
        <i className="punto grande" style={{ background: grupo.color }} />
        <h1><TextoEditable valor={grupo.name} editable={escribe} max={80} onGuardar={(name) => api.actualizar("dash_grupos", grupo.id, { name })} /></h1>
        <span className="empuje" />
        {escribe && <button className="boton eliminar-carpeta" onClick={() => setBorrar(true)}>🗑 Eliminar grupo</button>}
      </div>
      <p className="tenue">Elegí un dash para verlo y trabajarlo</p>
      <div className="tarjetas">
        {lista.map((d) => (
          <button key={d.id} className="tarjeta-proyecto" onClick={() => ir(`/d/${d.id}`)} style={{ borderTopColor: grupo.color }}>
            <strong>📊 {d.name}</strong>
            <span className="tenue">{d.tipo === "tipologias" ? "Contención por tipología · Móvil y Hogar" : "Dash"}</span>
          </button>
        ))}
        {escribe && (nuevo
          ? <form className="tarjeta-proyecto nueva" onSubmit={async (e) => { e.preventDefault(); const n = e.currentTarget.elements.nombre.value.trim(); if (!n) return; const d = await api.crearDash(grupo.id, n); setNuevo(false); if (d) ir(`/d/${d.id}`); }}>
              <strong>Nombre del dash</strong><input name="nombre" autoFocus maxLength={80} aria-label="Nombre del dash nuevo" onKeyDown={(e) => e.key === "Escape" && setNuevo(false)} />
              <span className="acciones"><button type="button" className="boton" onClick={() => setNuevo(false)}>Cancelar</button><button className="boton primario">Crear</button></span>
            </form>
          : <button className="tarjeta-proyecto nueva" onClick={() => setNuevo(true)}><strong>+ Crear dash</strong><span className="tenue">Tablas para llenar y gráficos que se actualizan solos</span></button>)}
      </div>
      {borrar && <Confirmar mensaje={`¿Eliminar el grupo "${grupo.name}"?`} detalle={lista.length ? `También se eliminarán sus ${lista.length} dash y sus datos. No se puede deshacer.` : "No tiene dash."}
        onNo={() => setBorrar(false)} onSi={async () => { setBorrar(false); if (await api.eliminar("dash_grupos", grupo.id)) ir(""); }} />}
    </section>
  );
}

// Pantalla de un dash (por ahora vacía: el contenido se arma con los datos)
export function VistaDash({ dash, grupo, datos, ir }) {
  const { escribe, api } = datos;
  const [borrar, setBorrar] = useState(false);
  return (
    <section className="inicio vista-dash">
      <nav className="migas-proyecto" aria-label="Ubicación"><a href={`#/dg/${grupo?.id ?? ""}`}>← {grupo?.name ?? "Mis dash"}</a></nav>
      <div className="titulo-carpeta">
        <h1>📊 <TextoEditable valor={dash.name} editable={escribe} max={80} onGuardar={(name) => api.actualizar("dashes", dash.id, { name })} /></h1>
        <span className="empuje" />
        {escribe && (
          <Desplegable fijo alinear="derecha" boton={({ alternar }) => <button className="boton icono tres-puntos" onClick={alternar} aria-label="Opciones del dash">•••</button>}>
            {(cerrar) => <button className="opcion-menu peligro" onClick={() => { cerrar(); setBorrar(true); }}>🗑 Eliminar dash</button>}
          </Desplegable>
        )}
      </div>
      <div className="dash-vacio">
        <p><strong>Este dash todavía no tiene datos.</strong></p>
        <p className="tenue">{dash.tipo === "tipologias"
          ? "Aquí va a quedar el dash de Tipologías: la tabla para llenar (mes, línea, tipología, volumen y contención), el evolutivo de Móvil y Hogar, el top 4 por volumen y el titular automático."
          : "Aquí vas a poder llenar los datos y ver los gráficos de este dash."}</p>
      </div>
      {borrar && <Confirmar mensaje={`¿Eliminar el dash "${dash.name}"?`} detalle="Se borrarán sus datos. No se puede deshacer."
        onNo={() => setBorrar(false)} onSi={async () => { setBorrar(false); if (await api.eliminar("dashes", dash.id)) ir(grupo ? `/dg/${grupo.id}` : ""); }} />}
    </section>
  );
}
