import { useCallback, useState } from "react";
import { useSesion } from "./lib/datos.js";
import { Logo, Toasts } from "./components/ui.jsx";
import Espacio from "./components/Espacio.jsx";

// Versión dentro de Claude: la identidad y el acceso los maneja Claude (botón Compartir).
export default function App() {
  const sesion = useSesion();
  const [toasts, setToasts] = useState([]);
  const avisar = useCallback((mensaje, tipo = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((l) => [...l, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), tipo === "error" ? 6000 : 3000);
  }, []);
  const quitar = (id) => setToasts((l) => l.filter((t) => t.id !== id));

  let contenido;
  if (sesion.estado === "cargando") {
    contenido = <div className="pantalla-centro"><div className="girando" aria-label="Cargando" /></div>;
  } else if (sesion.estado === "sin-acceso") {
    contenido = (
      <div className="pantalla-centro fondo-login">
        <div className="tarjeta-login">
          <div className="marca"><Logo /><span>Gestor de Proyectos</span></div>
          <h1>Iniciá sesión en Claude</h1>
          <p className="tenue">Para ver y editar los proyectos, abrí esta página con tu cuenta de Claude. Si alguien te compartió el enlace, entrá con la cuenta a la que te invitó.</p>
        </div>
      </div>
    );
  } else {
    contenido = <Espacio perfil={sesion.perfil} puedeEscribir={sesion.puedeEscribir} avisar={avisar} />;
  }
  return <>{contenido}<Toasts lista={toasts} quitar={quitar} /></>;
}
