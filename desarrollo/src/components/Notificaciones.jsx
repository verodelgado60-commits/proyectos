import { useEffect, useMemo, useState } from "react";
import { avisosDeVencimiento } from "../lib/logica.js";
import { Desplegable } from "./ui.jsx";

// Campanita: avisa de proyectos que vencen mañana, hoy o ya vencieron.
// Lo leído se recuerda en este dispositivo.
const claveLeidas = (uid) => `avisos-leidos:${uid}`;
function leerLeidas(uid) { try { return new Set(JSON.parse(localStorage.getItem(claveLeidas(uid)) || "[]")); } catch { return new Set(); } }
function guardarLeidas(uid, set) { try { localStorage.setItem(claveLeidas(uid), JSON.stringify([...set].slice(-300))); } catch { /* sin almacenamiento */ } }

export default function Notificaciones({ perfil, proyectos, carpetas = {}, alAbrir, className = "" }) {
  const [ahora, setAhora] = useState(() => new Date());
  const [leidas, setLeidas] = useState(() => leerLeidas(perfil.id));
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 60000); return () => clearInterval(t); }, []);

  const nombre = perfil.nickname || (perfil.full_name || perfil.username || "").split(" ")[0];
  const avisos = useMemo(() => avisosDeVencimiento(proyectos, nombre, ahora, carpetas), [proyectos, nombre, ahora, carpetas]);
  const sinLeer = avisos.filter((a) => !leidas.has(a.id)).length;

  const marcar = (ids) => { const n = new Set(leidas); ids.forEach((i) => n.add(i)); setLeidas(n); guardarLeidas(perfil.id, n); };

  return (
    <Desplegable className={`campana ${className}`} boton={({ alternar, abierto }) => (
      <button type="button" className={`boton-campana ${sinLeer ? "con-avisos" : ""}`} onClick={alternar} aria-expanded={abierto}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : "Notificaciones"} title="Notificaciones">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7Z" /></svg>
        {sinLeer > 0 && <span className="contador-campana">{sinLeer > 9 ? "9+" : sinLeer}</span>}
      </button>
    )}>
      {(cerrar) => (
        <div className="panel-avisos" role="dialog" aria-label="Notificaciones">
          <header className="cabecera-avisos">
            <strong>Notificaciones</strong>
            {sinLeer > 0 && <button className="enlace" onClick={() => marcar(avisos.map((a) => a.id))}>Marcar leídas</button>}
          </header>
          {!avisos.length && <p className="tenue pequeno vacio-avisos">No hay tareas por vencer. Te avisamos aquí un día antes de cada fecha de vencimiento.</p>}
          <ul className="lista-avisos">
            {avisos.map((a) => (
              <li key={a.id}>
                <button className={`aviso aviso-${a.tipo} ${leidas.has(a.id) ? "leido" : ""}`}
                  onClick={() => { marcar([a.id]); cerrar(); alAbrir(a.proyectoId); }}>
                  <span className="punto-aviso" aria-hidden="true" />
                  <span className="texto-aviso">{a.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Desplegable>
  );
}
