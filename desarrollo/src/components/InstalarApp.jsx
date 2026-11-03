import { useEffect, useState } from "react";
import { Modal } from "./ui.jsx";

// Botón "Instalar app": usa el aviso del navegador (Chrome, Edge, Android) o muestra los pasos (iPhone/iPad, otros)
const instalada = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstalarApp() {
  const [evento, setEvento] = useState(() => window.__instalarApp ?? null);
  const [ya, setYa] = useState(instalada);
  const [ayuda, setAyuda] = useState(false);
  useEffect(() => {
    const disp = () => setEvento(window.__instalarApp ?? null);
    const lista = () => { setYa(true); setEvento(null); };
    window.addEventListener("instalar-disponible", disp);
    window.addEventListener("appinstalled", lista);
    return () => { window.removeEventListener("instalar-disponible", disp); window.removeEventListener("appinstalled", lista); };
  }, []);
  if (ya) return null;
  const instalar = async () => {
    if (!evento) { setAyuda(true); return; }
    evento.prompt();
    const r = await evento.userChoice.catch(() => null);
    if (r?.outcome === "accepted") setYa(true);
    window.__instalarApp = null; setEvento(null);
  };
  return (<>
    <button className="nav-item boton-instalar" onClick={instalar}>📲 Instalar app</button>
    {ayuda && (
      <Modal titulo="Instalar como app" onClose={() => setAyuda(false)}>
        {esIOS() ? (
          <ol className="pasos-instalar">
            <li>Abrí este sitio en <strong>Safari</strong>.</li>
            <li>Tocá el botón <strong>Compartir</strong> (el cuadrito con la flecha hacia arriba).</li>
            <li>Elegí <strong>Agregar a pantalla de inicio</strong> y luego <strong>Agregar</strong>.</li>
          </ol>
        ) : (
          <ol className="pasos-instalar">
            <li>Abrí este sitio en <strong>Chrome</strong> o <strong>Edge</strong>.</li>
            <li>En la barra de direcciones tocá el ícono de <strong>Instalar</strong> (una pantallita con una flecha), o en el menú <strong>⋮</strong> elegí <strong>Instalar Proyectos</strong> / <strong>Agregar a pantalla principal</strong>.</li>
            <li>Confirmá con <strong>Instalar</strong>.</li>
          </ol>
        )}
        <p className="tenue pequeno">Queda con su ícono en el escritorio o en la pantalla del celular y se abre en su propia ventana. Tus datos siguen en el mismo lugar.</p>
        <div className="acciones"><button className="boton primario" onClick={() => setAyuda(false)}>Entendido</button></div>
      </Modal>
    )}
  </>);
}
