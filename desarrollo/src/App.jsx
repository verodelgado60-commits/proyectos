import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Toasts } from "./components/ui.jsx";
import Login from "./components/Login.jsx";
import CambiarClave from "./components/CambiarClave.jsx";
import ActualizarToken from "./components/ActualizarToken.jsx";
import Espacio from "./components/Espacio.jsx";
import { AvisoVersion, useInactividad } from "./components/Sistema.jsx";

const MINUTOS_INACTIVIDAD = 15;

export default function App() {
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [toasts, setToasts] = useState([]);

  const avisar = useCallback((mensaje, tipo = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((l) => [...l, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), tipo === "error" ? 7000 : 3000);
  }, []);
  const quitarToast = (id) => setToasts((l) => l.filter((t) => t.id !== id));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    const quitar = supabase.onEstado(({ estado }) => {
      if (estado === "llave-cambiada") avisar("Las llaves de acceso se renovaron. Volvé a iniciar sesión.", "error");
    });
    return () => { data.subscription.unsubscribe(); quitar(); };
  }, [avisar]);

  const cargarPerfil = useCallback(async () => {
    if (!sesion?.user) { setPerfil(null); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", sesion.user.id).single();
    if (error || !data || data.disabled) { await supabase.auth.signOut(); setPerfil(null); return; }
    setPerfil(data);
  }, [sesion]);
  useEffect(() => { cargarPerfil(); }, [cargarPerfil]);

  // Bloqueo por inactividad: se cierra la sesión (los cambios pendientes quedan guardados cifrados)
  useInactividad(Boolean(sesion), MINUTOS_INACTIVIDAD, async () => {
    await supabase.auth.signOut();
    avisar(`La sesión se cerró tras ${MINUTOS_INACTIVIDAD} minutos sin actividad.`, "error");
  });

  let contenido;
  if (sesion === undefined || (sesion && !perfil)) contenido = <div className="pantalla-centro"><div className="girando" aria-label="Cargando" /></div>;
  else if (!sesion) contenido = <Login avisar={avisar} />;
  else if (sesion.needsToken) contenido = <ActualizarToken obligatorio perfil={perfil} avisar={avisar} onListo={() => supabase.auth.getSession().then(({ data }) => setSesion(data.session))} />;
  else if (perfil.must_change_password) contenido = <CambiarClave perfil={perfil} obligatorio onListo={cargarPerfil} avisar={avisar} />;
  else contenido = <Espacio perfil={perfil} setPerfil={setPerfil} avisar={avisar} />;

  return <>{contenido}<AvisoVersion /><Toasts lista={toasts} quitar={quitarToast} /></>;
}
