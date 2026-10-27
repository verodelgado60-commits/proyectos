import { useEffect, useState } from "react";
import { crearProyecto, mensajeError, useProyectos } from "../lib/datos.js";
import { COLORES, posicionAlFinal } from "../lib/logica.js";
import { Avatar, Logo, Modal } from "./ui.jsx";
import Proyecto from "./Proyecto.jsx";

// Rutas en el hash con el formato que admiten las páginas de Claude: #p-<id>
function leerRuta() {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("p-") ? { tipo: "proyecto", id: h.slice(2) } : { tipo: "inicio" };
}
const ir = (h) => { window.location.hash = h; };

export default function Espacio({ perfil, puedeEscribir, avisar }) {
  const { proyectos, cargando } = useProyectos(perfil.id, avisar);
  const [ruta, setRuta] = useState(leerRuta);
  const [menuMovil, setMenuMovil] = useState(false);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); setMenuMovil(false); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!cargando && ruta.tipo === "proyecto" && !proyectos.some((p) => p.id === ruta.id)) ir("");
  }, [cargando, proyectos, ruta]);

  const actual = ruta.tipo === "proyecto" ? proyectos.find((p) => p.id === ruta.id) : null;

  return (
    <div className={`espacio ${menuMovil ? "menu-abierto" : ""}`}>
      <aside className="barra-lateral" aria-label="Navegación">
        <div className="marca"><Logo /><span>Gestor</span></div>
        {puedeEscribir && <button className="boton primario ancho" onClick={() => setNuevo(true)}>+ Nuevo proyecto</button>}
        <nav>
          <button className={`nav-item ${ruta.tipo === "inicio" ? "activo" : ""}`} onClick={() => ir("")}>Inicio</button>
          <h3 className="nav-titulo">Proyectos</h3>
          {cargando && <p className="tenue pequeno">Cargando…</p>}
          {!cargando && !proyectos.length && <p className="tenue pequeno">Aún no hay proyectos.</p>}
          {proyectos.map((p) => (
            <button key={p.id} className={`nav-item ${actual?.id === p.id ? "activo" : ""}`} onClick={() => ir(`p-${p.id}`)}>
              <i className="punto" style={{ background: p.color }} /> <span className="corta">{p.name}</span>
            </button>
          ))}
        </nav>
        <div className="nav-item cuenta-claude">
          <Avatar perfil={perfil} size={26} />
          <span className="corta">{perfil.full_name}<span className="tenue pequeno bloque-linea">{perfil.is_admin ? "Administra esta página" : puedeEscribir ? "Puede editar" : "Solo lectura"}</span></span>
        </div>
      </aside>
      <div className="velo" onClick={() => setMenuMovil(false)} />

      <main className="principal">
        <button className="boton-menu" onClick={() => setMenuMovil(true)} aria-label="Abrir menú">☰</button>
        {actual
          ? <Proyecto key={actual.id} proyecto={actual} perfil={perfil} avisar={avisar} cambioLocal={() => {}} />
          : <Inicio perfil={perfil} proyectos={proyectos} cargando={cargando} puedeEscribir={puedeEscribir} onNuevo={() => setNuevo(true)} />}
      </main>

      {nuevo && <NuevoProyecto proyectos={proyectos} perfil={perfil} avisar={avisar} onClose={() => setNuevo(false)}
        onCreado={(p) => { setNuevo(false); ir(`p-${p.id}`); }} />}
    </div>
  );
}

function Inicio({ perfil, proyectos, cargando, puedeEscribir, onNuevo }) {
  const nombre = (perfil.full_name || "").split(" ")[0];
  return (
    <section className="inicio">
      <h1>{nombre && nombre !== "Vos" ? `Hola, ${nombre}` : "Hola"}</h1>
      <p className="tenue">Todo lo que cambiés se guarda al instante y se ve en vivo en todos tus dispositivos</p>
      <div className="tarjetas">
        {proyectos.map((p) => (
          <button key={p.id} className="tarjeta-proyecto" onClick={() => ir(`p-${p.id}`)} style={{ borderTopColor: p.color }}>
            <strong>{p.name}</strong>
            <span className="tenue">{p.description || "Sin descripción"}</span>
          </button>
        ))}
        {!cargando && puedeEscribir && (
          <button className="tarjeta-proyecto nueva" onClick={onNuevo}>
            <strong>+ Crear proyecto</strong>
            <span className="tenue">Viene con un grupo, estados (Pendiente, En curso, Atascado, Listo) y prioridades listos para usar</span>
          </button>
        )}
        {!cargando && !puedeEscribir && !proyectos.length && <p className="tenue">Todavía no hay proyectos. Quien administra la página puede crearlos.</p>}
      </div>
    </section>
  );
}

function NuevoProyecto({ proyectos, perfil, avisar, onClose, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [enviando, setEnviando] = useState(false);
  const crear = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    try {
      const p = await crearProyecto({ name: nombre.trim().slice(0, 120), description: descripcion.trim().slice(0, 2000), color, position: posicionAlFinal(proyectos), creador: perfil.id });
      avisar("Proyecto creado");
      onCreado(p);
    } catch (err) { avisar(mensajeError(err), "error"); setEnviando(false); }
  };
  return (
    <Modal titulo="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={crear}>
        <label className="campo" htmlFor="np-nombre"><span>Nombre</span><input id="np-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus placeholder="Ej. Q3 Proyecto Alpha" /></label>
        <label className="campo" htmlFor="np-desc"><span>Descripción (opcional)</span><textarea id="np-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={3} /></label>
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
