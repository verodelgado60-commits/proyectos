import { useEffect, useRef, useState } from "react";
import { capacidades } from "../lib/datos.js";
import { Avatar, Modal } from "./ui.jsx";

// Equipo del proyecto: personas que aparecen para asignar tareas.
// Quién puede entrar a la página se decide en Claude con el botón Compartir.
export default function Miembros({ project_members, perfiles, perfil, esDueno, api, avisar, onClose }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscador, setBuscador] = useState(null);
  const ref = useRef(null);

  useEffect(() => { capacidades().then(({ user }) => setBuscador(user)); }, []);

  const buscar = async (q) => {
    setTexto(q);
    if (!buscador) return;
    const hits = await buscador.search(q);
    setResultados(hits.filter((h) => !project_members.some((m) => m.user_id === h.id)));
  };
  const agregar = async (hit) => {
    if (await api.agregarMiembro(hit.id)) { avisar(`${hit.name || "La persona"} se agregó al equipo`); setTexto(""); setResultados([]); }
  };

  return (
    <Modal titulo="Equipo del proyecto" onClose={onClose} ancho={520}>
      {esDueno && (
        <div className="buscar-personas">
          <label className="campo" htmlFor="buscar-persona"><span>Agregar persona</span>
            <input id="buscar-persona" ref={ref} placeholder="Escribe un nombre" value={texto} autoComplete="off"
              onFocus={() => buscar(texto)} onChange={(e) => buscar(e.target.value)} />
          </label>
          {resultados.length > 0 && (
            <ul className="lista-miembros">
              {resultados.map((h) => (
                <li key={h.id}>
                  <Avatar perfil={{ full_name: h.name, avatar_color: h.color }} size={28} />
                  <span className="crece">{h.name}{h.guest ? " · invitado/a" : ""}</span>
                  <button className="boton" onClick={() => agregar(h)}>Agregar</button>
                </li>
              ))}
            </ul>
          )}
          {texto && !resultados.length && <p className="tenue pequeno">Sin resultados. La búsqueda encuentra personas de tu organización.</p>}
        </div>
      )}
      <p className="tenue pequeno">El equipo define a quién se le pueden asignar tareas. Para que alguien pueda abrir la página, compártela desde el botón Compartir de Claude: como Colaborador puede editar, y como Lector solo ver.</p>
      <ul className="lista-miembros">
        {project_members.map((m) => {
          const p = perfiles[m.user_id];
          return (
            <li key={m.user_id}>
              <Avatar perfil={p} size={32} />
              <div className="crece"><strong>{p?.full_name || "Alguien"}</strong>{m.user_id === perfil.id && <span className="tenue"> (tú)</span>}</div>
              {m.role === "owner" ? <span className="insignia">Creó el proyecto</span>
                : esDueno && <button className="icono" onClick={() => api.quitarMiembro(m.user_id)} aria-label="Quitar del equipo">✕</button>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
