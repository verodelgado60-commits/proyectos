import { useEffect, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { useCarpetas, useProyectos } from "../lib/datos.js";
import { aplicarCambio, COLORES, diasHasta, fechaCorta, ordenar, posicionAlFinal } from "../lib/logica.js";
import { Avatar, Confirmar, Desplegable, Modal, TextoEditable } from "./ui.jsx";
import { Logo } from "./Login.jsx";
import Proyecto from "./Proyecto.jsx";
import AdminUsuarios from "./AdminUsuarios.jsx";
import CambiarClave from "./CambiarClave.jsx";
import ActualizarToken from "./ActualizarToken.jsx";
import { EstadoGuardado } from "./Sistema.jsx";
import Notificaciones from "./Notificaciones.jsx";
import ImportarExcel from "./ImportarExcel.jsx";

function leerRuta() {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [tipo, id] = h.split("/");
  if (tipo === "p" && id) return { tipo: "proyecto", id };
  if (tipo === "c" && id) return { tipo: "carpeta", id };
  if (tipo === "usuarios") return { tipo: "usuarios" };
  return { tipo: "inicio" };
}

export default function Espacio({ perfil, setPerfil, avisar }) {
  const { proyectos, setProyectos, cargando } = useProyectos(perfil.id, avisar);
  const cambioLocal = (ev) => setProyectos((l) => ordenar(aplicarCambio(l, ev)));
  const { carpetas: todasCarpetas, setCarpetas } = useCarpetas(perfil.id, avisar);
  const [ruta, setRuta] = useState(leerRuta);
  const [menuMovil, setMenuMovil] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [miCuenta, setMiCuenta] = useState(false);
  const [dialogo, setDialogo] = useState(null);
  const escribe = perfil.rol !== "lector";
  const ROL = { admin: "Administradora", editor: "Editor", lector: "Lector" };

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); setMenuMovil(false); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  // Si el proyecto abierto deja de existir (o pierdes acceso), volver al inicio
  useEffect(() => {
    if (!cargando && ruta.tipo === "proyecto" && !proyectos.some((p) => p.id === ruta.id)) window.location.hash = "";
  }, [cargando, proyectos, ruta]);

  const ir = (h) => { window.location.hash = h; };
  const actual = ruta.tipo === "proyecto" ? proyectos.find((p) => p.id === ruta.id) : null;
  // "Proyectos" (IA, IVR…) agrupan "tareas" (cada una con su tabla de subtareas).
  // Quien no administra ve los proyectos donde tiene tareas o que creó.
  const idsCarpeta = new Set(todasCarpetas.map((c) => c.id));
  const carpetas = perfil.is_admin ? todasCarpetas
    : todasCarpetas.filter((c) => c.created_by === perfil.id || proyectos.some((p) => p.carpeta_id === c.id));
  const sueltas = proyectos.filter((p) => !p.carpeta_id || !idsCarpeta.has(p.carpeta_id));
  const tareasDe = (cid) => (cid === SIN ? sueltas : proyectos.filter((p) => p.carpeta_id === cid));
  const carpetaAbierta = ruta.tipo === "carpeta" ? ruta.id : actual ? (idsCarpeta.has(actual.carpeta_id) ? actual.carpeta_id : SIN) : null;
  const mapaCarpetas = Object.fromEntries(todasCarpetas.map((c) => [c.id, c]));
  const [nuevaCarpeta, setNuevaCarpeta] = useState(false);
  const crearTareaEn = (cid) => setNuevo({ carpeta: cid === SIN ? null : cid });

  useEffect(() => {
    if (ruta.tipo === "carpeta" && ruta.id !== SIN && todasCarpetas.length && !idsCarpeta.has(ruta.id)) window.location.hash = "";
  }, [ruta, todasCarpetas]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`espacio ${menuMovil ? "menu-abierto" : ""}`}>
      <aside className="barra-lateral" aria-label="Navegación">
        <div className="marca"><span>Proyectos</span></div>
        {escribe && <button className="boton primario ancho" onClick={() => setNuevaCarpeta(true)}>+ Nuevo proyecto</button>}
        <nav>
          <button className={`nav-item ${ruta.tipo === "inicio" ? "activo" : ""}`} onClick={() => ir("")}>🏠 Inicio</button>
          {perfil.is_admin && <button className={`nav-item ${ruta.tipo === "usuarios" ? "activo" : ""}`} onClick={() => ir("/usuarios")}>👥 Usuarios y permisos</button>}
          <h3 className="nav-titulo">Mis proyectos</h3>
          {cargando && <p className="tenue pequeno">Cargando…</p>}
          {!cargando && !carpetas.length && !sueltas.length && <p className="tenue pequeno">Aún no tenés proyectos.</p>}
          {[...carpetas, ...(sueltas.length ? [{ id: SIN, name: "Sin proyecto", color: "#b0b0b4" }] : [])].map((c) => {
            const abierta = carpetaAbierta === c.id;
            return (
              <div key={c.id} className="grupo-nav">
                <button className={`nav-item nav-carpeta ${ruta.tipo === "carpeta" && abierta ? "activo" : ""}`} onClick={() => ir(`/c/${c.id}`)} aria-expanded={abierta}>
                  <span className="flecha-nav" aria-hidden="true">{abierta ? "▾" : "▸"}</span>
                  <i className="punto" style={{ background: c.color }} /> <span className="corta">{c.name}</span>
                  <small className="tenue">{tareasDe(c.id).length}</small>
                </button>
                {abierta && (
                  <div className="subnav">
                    {tareasDe(c.id).map((p) => (
                      <button key={p.id} className={`nav-item nav-tarea ${actual?.id === p.id ? "activo" : ""}`} onClick={() => ir(`/p/${p.id}`)}>
                        <span className="corta">{p.name}</span>
                      </button>
                    ))}
                    {escribe && <button className="nav-item nav-tarea nav-crear" onClick={() => crearTareaEn(c.id)}>+ Crear tarea</button>}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <Desplegable alinear="arriba" className="cuenta" boton={({ alternar }) => (
          <button className="nav-item" onClick={alternar}><Avatar perfil={perfil} size={26} /> <span className="corta">{perfil.full_name || perfil.username}</span></button>
        )}>
          {(cerrar) => (<>
            <div className="menu-info"><strong>{perfil.full_name || perfil.username}</strong><span className="tenue">@{perfil.username} · {ROL[perfil.rol]}</span><EstadoGuardado /></div>
            {escribe && <button className="opcion-menu" onClick={() => { cerrar(); setMiCuenta(true); }}>Mi cuenta</button>}
            {escribe && <button className="opcion-menu" onClick={() => { cerrar(); setDialogo("clave"); }}>Cambiar contraseña</button>}
            {escribe && <button className="opcion-menu" onClick={() => { cerrar(); setDialogo("token"); }}>Actualizar token</button>}
            {perfil.is_admin && <button className="opcion-menu" onClick={() => { cerrar(); ir("/usuarios"); }}>Usuarios y permisos</button>}
            <button className="opcion-menu" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
          </>)}
        </Desplegable>
      </aside>
      <div className="velo" onClick={() => setMenuMovil(false)} />

      <main className="principal">
        <button className="boton-menu" onClick={() => setMenuMovil(true)} aria-label="Abrir menú">☰</button>
        <Notificaciones className="campana-movil campana-fija" perfil={perfil} proyectos={proyectos} carpetas={mapaCarpetas} alAbrir={(id) => ir(`/p/${id}`)} />
        {ruta.tipo === "usuarios" && perfil.is_admin && <AdminUsuarios perfil={perfil} avisar={avisar} />}
        {ruta.tipo === "proyecto" && actual && <Proyecto key={actual.id} proyecto={actual} perfil={perfil} avisar={avisar} cambioLocal={cambioLocal}
          carpetas={carpetas} carpeta={mapaCarpetas[actual.carpeta_id] ?? null} escribe={escribe} />}
        {ruta.tipo === "carpeta" && (ruta.id === SIN || mapaCarpetas[ruta.id]) && (
          <VistaCarpeta key={ruta.id} carpeta={ruta.id === SIN ? { id: SIN, name: "Sin proyecto", color: "#b0b0b4" } : mapaCarpetas[ruta.id]}
            tareas={tareasDe(ruta.id)} perfil={perfil} escribe={escribe} cargando={cargando} avisar={avisar} ir={ir}
            onNueva={() => crearTareaEn(ruta.id)} onBorrada={(id) => { setCarpetas((l) => l.filter((c) => c.id !== id)); setProyectos((l) => l.map((p) => (p.carpeta_id === id ? { ...p, carpeta_id: null } : p))); ir(""); }} />
        )}
        {(ruta.tipo === "inicio" || (ruta.tipo === "usuarios" && !perfil.is_admin)) && (
          <Inicio perfil={perfil} carpetas={carpetas} sueltas={sueltas} tareasDe={tareasDe} cargando={cargando} escribe={escribe} onNuevo={() => setNuevaCarpeta(true)} ir={ir} />
        )}
      </main>

      {nuevaCarpeta && <NuevaCarpeta carpetas={todasCarpetas} avisar={avisar} onClose={() => setNuevaCarpeta(false)}
        onCreada={(c) => { setCarpetas((l) => ordenar(aplicarCambio(l, { eventType: "INSERT", new: c }))); setNuevaCarpeta(false); ir(`/c/${c.id}`); }} />}
      {nuevo && <NuevoProyecto carpeta={nuevo.carpeta ?? null} carpetas={carpetas} proyectos={proyectos} perfil={perfil} avisar={avisar} onClose={() => setNuevo(false)} onCreado={(p) => { cambioLocal({ eventType: "INSERT", new: p }); setNuevo(false); ir(`/p/${p.id}`); }} />}
      {miCuenta && <MiCuenta perfil={perfil} setPerfil={setPerfil} avisar={avisar} onClose={() => setMiCuenta(false)} />}
      {dialogo === "clave" && <Modal titulo="Cambiar contraseña" onClose={() => setDialogo(null)}><CambiarClave perfil={perfil} avisar={avisar} onListo={() => setDialogo(null)} onCancelar={() => setDialogo(null)} /></Modal>}
      {dialogo === "token" && <Modal titulo="Actualizar token de GitHub" onClose={() => setDialogo(null)}><ActualizarToken avisar={avisar} onListo={() => setDialogo(null)} onCancelar={() => setDialogo(null)} /></Modal>}
    </div>
  );
}

const SIN = "sin-proyecto";

function Inicio({ perfil, carpetas, sueltas, tareasDe, cargando, escribe, onNuevo, ir }) {
  // Saludo: el nombre que la persona eligió en Mi cuenta; si no, su primer nombre
  const nombre = perfil.nickname || (perfil.full_name || perfil.username).split(" ")[0];
  const lista = [...carpetas, ...(sueltas.length ? [{ id: SIN, name: "Sin proyecto", color: "#b0b0b4" }] : [])];
  return (
    <section className="inicio">
      <h1>Hola {nombre}</h1>
      <p className="tenue">Todo lo que cambiés se guarda al instante y se ve en vivo en todos tus dispositivos</p>
      <div className="tarjetas">
        {lista.map((c) => {
          const n = tareasDe(c.id).length;
          return (
            <button key={c.id} className="tarjeta-proyecto" onClick={() => ir(`/c/${c.id}`)} style={{ borderTopColor: c.color }}>
              <strong>{c.name}</strong>
              <span className="tenue">{n === 0 ? "Sin tareas" : n === 1 ? "1 tarea" : `${n} tareas`}</span>
            </button>
          );
        })}
        {!cargando && escribe && (
          <button className="tarjeta-proyecto nueva" onClick={onNuevo}><strong>+ Crear proyecto</strong><span className="tenue">Por ejemplo IA, IVR o Pre2post; adentro creás sus tareas</span></button>
        )}
      </div>
    </section>
  );
}

// Pantalla de un proyecto: sus tareas y "+ Crear tarea"
function VistaCarpeta({ carpeta, tareas, perfil, escribe, cargando, avisar, ir, onNueva, onBorrada }) {
  const [borrar, setBorrar] = useState(false);
  const [importar, setImportar] = useState(false);
  const [conTareas, setConTareas] = useState(false);
  const real = carpeta.id !== SIN;
  const guardar = async (cambios) => {
    const { error } = await supabase.from("carpetas").update(cambios).eq("id", carpeta.id);
    if (error) avisar(traducirError(error), "error");
  };
  const eliminar = async () => {
    if (conTareas) {
      for (const t of tareas) {
        const { error } = await supabase.from("projects").delete().eq("id", t.id);
        if (error) { avisar(`No se pudo eliminar la tarea «${t.name}»: ${traducirError(error)}`, "error"); return; }
      }
    }
    const { error } = await supabase.from("carpetas").delete().eq("id", carpeta.id);
    if (error) { avisar(traducirError(error), "error"); return; }
    avisar(conTareas && tareas.length ? "Proyecto y sus tareas eliminados" : "Proyecto eliminado"); onBorrada(carpeta.id);
  };
  return (
    <section className="inicio vista-carpeta">
      <div className="titulo-carpeta">
        <i className="punto grande" style={{ background: carpeta.color }} />
        <h1>{real ? <TextoEditable valor={carpeta.name} editable={escribe} max={80} onGuardar={(name) => guardar({ name })} /> : carpeta.name}</h1>
        <span className="empuje" />
        {real && escribe && <button className="boton" onClick={() => setImportar(true)}>📄 Importar de Excel</button>}
        {real && escribe && <button className="boton eliminar-carpeta" onClick={() => { setConTareas(false); setBorrar(true); }}>🗑 Eliminar proyecto</button>}
        {real && escribe && (
          <Desplegable alinear="derecha" boton={({ alternar }) => <button className="boton icono" onClick={alternar} aria-label="Más opciones del proyecto">•••</button>}>
            {(cerrar) => (<>
              <div className="menu-colores"><SelectorColor valor={carpeta.color} onCambiar={(color) => { guardar({ color }); cerrar(); }} /></div>
            </>)}
          </Desplegable>
        )}
      </div>
      <p className="tenue">{real ? "Elegí una tarea para ver sus subtareas" : "Tareas que todavía no están en ningún proyecto. Desde cada tarea (•••) las podés mover."}</p>
      <div className="tarjetas">
        {tareas.map((p) => (
          <button key={p.id} className="tarjeta-proyecto" onClick={() => ir(`/p/${p.id}`)} style={{ borderTopColor: p.color }}>
            <strong>{p.name}</strong>
            <span className="tenue">{p.description || "Sin descripción"}</span>
            {p.due_date && <span className={`vence-tarjeta ${diasHasta(p.due_date) <= 1 ? "pronto" : ""}`}>Vence {fechaCorta(p.due_date)}</span>}
          </button>
        ))}
        {!cargando && escribe && (
          <button className="tarjeta-proyecto nueva" onClick={onNueva}><strong>+ Crear tarea</strong><span className="tenue">Con subtareas, estados y prioridades listos para usar</span></button>
        )}
      </div>
      {importar && <ImportarExcel carpeta={carpeta} tareasActuales={tareas} perfil={perfil} avisar={avisar} onClose={() => setImportar(false)} />}
      {borrar && <Confirmar mensaje={`¿Eliminar el proyecto "${carpeta.name}"?`}
        detalle={!tareas.length ? "No tiene tareas." : (
          <span className="opciones-borrar" role="radiogroup" aria-label="Qué hacer con sus tareas">
            <span>{tareas.length === 1 ? "Tiene 1 tarea. ¿Qué hacemos con ella?" : `Tiene ${tareas.length} tareas. ¿Qué hacemos con ellas?`}</span>
            <label><input type="radio" name="con-tareas" checked={!conTareas} onChange={() => setConTareas(false)} /> Pasarlas a «Sin proyecto» (no se pierde nada)</label>
            <label><input type="radio" name="con-tareas" checked={conTareas} onChange={() => setConTareas(true)} /> Eliminarlas también, con sus subtareas, comentarios y adjuntos. No se puede deshacer.</label>
          </span>
        )}
        onNo={() => setBorrar(false)} onSi={() => { setBorrar(false); eliminar(); }} />}
    </section>
  );
}

function NuevaCarpeta({ carpetas, avisar, onClose, onCreada }) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[carpetas.length % COLORES.length]);
  const [enviando, setEnviando] = useState(false);
  const crear = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    const { data, error } = await supabase.from("carpetas").insert({ name: nombre.trim(), color, position: posicionAlFinal(carpetas) }).select().single();
    setEnviando(false);
    if (error) { avisar(traducirError(error), "error"); return; }
    avisar("Proyecto creado"); onCreada(data);
  };
  return (
    <Modal titulo="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={crear}>
        <label className="campo" htmlFor="nc-nombre"><span>Nombre</span><input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoFocus placeholder="Ej. IA, IVR, Pre2post" /></label>
        <div className="campo"><span>Color</span><SelectorColor valor={color} onCambiar={setColor} /></div>
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={!nombre.trim() || enviando}>{enviando ? "Creando…" : "Crear proyecto"}</button>
        </div>
      </form>
    </Modal>
  );
}

function NuevoProyecto({ carpeta: carpetaInicial, carpetas, proyectos, perfil, avisar, onClose, onCreado }) {
  const [carpeta, setCarpeta] = useState(carpetaInicial ?? "");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [vence, setVence] = useState("");
  const [enviando, setEnviando] = useState(false);
  const crear = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    const { data, error } = await supabase.from("projects")
      .insert({ name: nombre.trim(), description: descripcion.trim(), color, due_date: vence || null, carpeta_id: carpeta || null, owner_id: perfil.id, position: posicionAlFinal(proyectos) })
      .select().single();
    setEnviando(false);
    if (error) { avisar(traducirError(error), "error"); return; }
    avisar("Tarea creada");
    onCreado(data);
  };
  return (
    <Modal titulo="Nueva tarea" onClose={onClose}>
      <form onSubmit={crear}>
        <label className="campo" htmlFor="nt-nombre"><span>Nombre</span><input id="nt-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus placeholder="Ej. Ajustar flujo de bienvenida" /></label>
        <label className="campo" htmlFor="nt-carpeta"><span>Proyecto</span><select id="nt-carpeta" value={carpeta} onChange={(e) => setCarpeta(e.target.value)}>
          <option value="">Sin proyecto</option>
          {carpetas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="campo"><span>Descripción (opcional)</span><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={3} /></label>
        <label className="campo" htmlFor="np-vence"><span>Fecha de vencimiento</span><input id="np-vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          <small className="tenue">Te avisamos en la campanita un día antes.</small></label>
        <div className="campo"><span>Color</span><SelectorColor valor={color} onCambiar={setColor} /></div>
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={!nombre.trim() || enviando}>{enviando ? "Creando…" : "Crear tarea"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function SelectorColor({ valor, onCambiar }) {
  return (
    <div className="colores">
      {COLORES.map((c) => (
        <button key={c} type="button" className={`muestra ${valor === c ? "activa" : ""}`} style={{ background: c }} onClick={() => onCambiar(c)} aria-label={`Color ${c}`} />
      ))}
    </div>
  );
}

function MiCuenta({ perfil, setPerfil, avisar, onClose }) {
  const [nombre, setNombre] = useState(perfil.full_name);
  const [apodo, setApodo] = useState(perfil.nickname ?? "");
  const [color, setColor] = useState(perfil.avatar_color);
  const [clave, setClave] = useState(false);
  const guardar = async () => {
    const { data, error } = await supabase.from("profiles").update({ full_name: nombre.trim().slice(0, 80), nickname: apodo.trim().slice(0, 40), avatar_color: color }).eq("id", perfil.id).select().single();
    if (error) { avisar(traducirError(error), "error"); return; }
    setPerfil(data); avisar("Perfil actualizado"); onClose();
  };
  return (
    <Modal titulo="Mi cuenta" onClose={onClose}>
      {clave ? <CambiarClave perfil={perfil} avisar={avisar} onListo={onClose} onCancelar={() => setClave(false)} /> : (<>
        <div className="fila-perfil"><Avatar perfil={{ ...perfil, full_name: nombre, avatar_color: color }} size={48} /><div><strong>@{perfil.username}</strong><div className="tenue pequeno">El nombre de usuario no se puede cambiar.</div></div></div>
        <label className="campo" htmlFor="mc-nombre"><span>Nombre visible</span><input id="mc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} /></label>
        <label className="campo" htmlFor="mc-apodo"><span>¿Cómo querés que te saludemos?</span><input id="mc-apodo" value={apodo} onChange={(e) => setApodo(e.target.value)} maxLength={40} placeholder={(nombre || "").split(" ")[0]} /></label>
        <div className="campo"><span>Color de avatar</span><SelectorColor valor={color} onCambiar={setColor} /></div>
        <div className="acciones">
          <button className="boton" onClick={() => setClave(true)}>Cambiar contraseña</button>
          <button className="boton primario" onClick={guardar}>Guardar</button>
        </div>
      </>)}
    </Modal>
  );
}
