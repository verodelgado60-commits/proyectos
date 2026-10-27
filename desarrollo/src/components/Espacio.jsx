import { useEffect, useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { useProyectos } from "../lib/datos.js";
import { aplicarCambio, COLORES, diasHasta, fechaCorta, ordenar, posicionAlFinal } from "../lib/logica.js";
import { Avatar, Desplegable, Modal } from "./ui.jsx";
import { Logo } from "./Login.jsx";
import Proyecto from "./Proyecto.jsx";
import AdminUsuarios from "./AdminUsuarios.jsx";
import CambiarClave from "./CambiarClave.jsx";
import ActualizarToken from "./ActualizarToken.jsx";
import { EstadoGuardado } from "./Sistema.jsx";
import Notificaciones from "./Notificaciones.jsx";

function leerRuta() {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [tipo, id] = h.split("/");
  if (tipo === "p" && id) return { tipo: "proyecto", id };
  if (tipo === "usuarios") return { tipo: "usuarios" };
  return { tipo: "inicio" };
}

export default function Espacio({ perfil, setPerfil, avisar }) {
  const { proyectos, setProyectos, cargando } = useProyectos(perfil.id, avisar);
  const cambioLocal = (ev) => setProyectos((l) => ordenar(aplicarCambio(l, ev)));
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

  return (
    <div className={`espacio ${menuMovil ? "menu-abierto" : ""}`}>
      <aside className="barra-lateral" aria-label="Navegación">
        <div className="marca"><span>Proyectos</span><span className="empuje" /><Notificaciones perfil={perfil} proyectos={proyectos} alAbrir={(id) => ir(`/p/${id}`)} /></div>
        {escribe && <button className="boton primario ancho" onClick={() => setNuevo(true)}>+ Nuevo proyecto</button>}
        <nav>
          <button className={`nav-item ${ruta.tipo === "inicio" ? "activo" : ""}`} onClick={() => ir("")}>🏠 Inicio</button>
          {perfil.is_admin && <button className={`nav-item ${ruta.tipo === "usuarios" ? "activo" : ""}`} onClick={() => ir("/usuarios")}>👥 Usuarios y permisos</button>}
          <h3 className="nav-titulo">Mis proyectos</h3>
          {cargando && <p className="tenue pequeno">Cargando…</p>}
          {!cargando && !proyectos.length && <p className="tenue pequeno">Aún no tenés proyectos.</p>}
          {proyectos.map((p) => (
            <button key={p.id} className={`nav-item ${actual?.id === p.id ? "activo" : ""}`} onClick={() => ir(`/p/${p.id}`)}>
              <i className="punto" style={{ background: p.color }} /> <span className="corta">{p.name}</span>
            </button>
          ))}
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
        <Notificaciones className="campana-movil" perfil={perfil} proyectos={proyectos} alAbrir={(id) => ir(`/p/${id}`)} />
        {ruta.tipo === "usuarios" && perfil.is_admin && <AdminUsuarios perfil={perfil} avisar={avisar} />}
        {ruta.tipo === "proyecto" && actual && <Proyecto key={actual.id} proyecto={actual} perfil={perfil} avisar={avisar} cambioLocal={cambioLocal} />}
        {(ruta.tipo === "inicio" || (ruta.tipo === "usuarios" && !perfil.is_admin)) && (
          <Inicio perfil={perfil} proyectos={proyectos} cargando={cargando} escribe={escribe} onNuevo={() => setNuevo(true)} ir={ir} />
        )}
      </main>

      {nuevo && <NuevoProyecto proyectos={proyectos} perfil={perfil} avisar={avisar} onClose={() => setNuevo(false)} onCreado={(p) => { cambioLocal({ eventType: "INSERT", new: p }); setNuevo(false); ir(`/p/${p.id}`); }} />}
      {miCuenta && <MiCuenta perfil={perfil} setPerfil={setPerfil} avisar={avisar} onClose={() => setMiCuenta(false)} />}
      {dialogo === "clave" && <Modal titulo="Cambiar contraseña" onClose={() => setDialogo(null)}><CambiarClave perfil={perfil} avisar={avisar} onListo={() => setDialogo(null)} onCancelar={() => setDialogo(null)} /></Modal>}
      {dialogo === "token" && <Modal titulo="Actualizar token de GitHub" onClose={() => setDialogo(null)}><ActualizarToken avisar={avisar} onListo={() => setDialogo(null)} onCancelar={() => setDialogo(null)} /></Modal>}
    </div>
  );
}

function Inicio({ perfil, proyectos, cargando, escribe, onNuevo, ir }) {
  // Saludo: el nombre que la persona eligió en Mi cuenta; si no, su primer nombre
  const nombre = perfil.nickname || (perfil.full_name || perfil.username).split(" ")[0];
  return (
    <section className="inicio">
      <h1>Hola {nombre}</h1>
      <p className="tenue">Todo lo que cambiés se guarda al instante y se ve en vivo en todos tus dispositivos</p>
      <div className="tarjetas">
        {proyectos.map((p) => (
          <button key={p.id} className="tarjeta-proyecto" onClick={() => ir(`/p/${p.id}`)} style={{ borderTopColor: p.color }}>
            <strong>{p.name}</strong>
            <span className="tenue">{p.description || "Sin descripción"}</span>
            {p.due_date && <span className={`vence-tarjeta ${diasHasta(p.due_date) <= 1 ? "pronto" : ""}`}>Vence {fechaCorta(p.due_date)}</span>}
          </button>
        ))}
        {!cargando && escribe && (
          <button className="tarjeta-proyecto nueva" onClick={onNuevo}><strong>+ Crear proyecto</strong><span className="tenue">Con grupos, estados y prioridades listos para usar</span></button>
        )}
      </div>
    </section>
  );
}

function NuevoProyecto({ proyectos, perfil, avisar, onClose, onCreado }) {
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
      .insert({ name: nombre.trim(), description: descripcion.trim(), color, due_date: vence || null, owner_id: perfil.id, position: posicionAlFinal(proyectos) })
      .select().single();
    setEnviando(false);
    if (error) { avisar(traducirError(error), "error"); return; }
    avisar("Proyecto creado");
    onCreado(data);
  };
  return (
    <Modal titulo="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={crear}>
        <label className="campo"><span>Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus placeholder="Ej. Q3 Proyecto Alpha" /></label>
        <label className="campo"><span>Descripción (opcional)</span><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={3} /></label>
        <label className="campo" htmlFor="np-vence"><span>Fecha de vencimiento</span><input id="np-vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          <small className="tenue">Te avisamos en la campanita un día antes.</small></label>
        <div className="campo"><span>Color</span><SelectorColor valor={color} onCambiar={setColor} /></div>
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={!nombre.trim() || enviando}>{enviando ? "Creando…" : "Crear proyecto"}</button>
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
