import { useCallback, useEffect, useState } from "react";
import { configurado, supabase } from "./lib/supabase.js";
import { Toasts } from "./components/ui.jsx";
import Login from "./components/Login.jsx";
import CambiarClave from "./components/CambiarClave.jsx";
import Espacio from "./components/Espacio.jsx";

export default function App() {
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [toasts, setToasts] = useState([]);

  const avisar = useCallback((mensaje, tipo = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((l) => [...l, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), tipo === "error" ? 6000 : 3000);
  }, []);
  const quitarToast = (id) => setToasts((l) => l.filter((t) => t.id !== id));

  useEffect(() => {
    if (!configurado) return;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const cargarPerfil = useCallback(async () => {
    if (!sesion?.user) { setPerfil(null); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", sesion.user.id).single();
    if (error || !data || data.disabled) { await supabase.auth.signOut(); setPerfil(null); if (data?.disabled) avisar("Esta cuenta está desactivada.", "error"); return; }
    setPerfil(data);
  }, [sesion?.user?.id, avisar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargarPerfil(); }, [cargarPerfil]);

  if (!configurado) {
    return <div className="pantalla-centro"><div className="tarjeta-login"><h1>Falta configuración</h1>
      <p className="tenue">La app no encontró los datos de conexión. Se agregan automáticamente al publicar desde GitHub.</p></div></div>;
  }

  let contenido;
  if (sesion === undefined || (sesion && !perfil)) contenido = <div className="pantalla-centro"><div className="girando" aria-label="Cargando" /></div>;
  else if (!sesion) contenido = <Login avisar={avisar} />;
  else if (perfil.must_change_password) contenido = <CambiarClave perfil={perfil} obligatorio onListo={cargarPerfil} avisar={avisar} />;
  else contenido = <Espacio perfil={perfil} setPerfil={setPerfil} avisar={avisar} />;

  return <>{contenido}<Toasts lista={toasts} quitar={quitarToast} /></>;
}
