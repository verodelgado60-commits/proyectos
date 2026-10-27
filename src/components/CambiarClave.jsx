import { useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { validarClave } from "../lib/logica.js";
import { Logo } from "./Login.jsx";

export default function CambiarClave({ perfil, obligatorio, onListo, onCancelar, avisar }) {
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    const v = validarClave(clave);
    if (v) { setError(v); return; }
    if (clave !== repetir) { setError("Las contraseñas no coinciden."); return; }
    setEnviando(true);
    const { error: e1 } = await supabase.auth.updateUser({ password: clave });
    if (e1) { setEnviando(false); setError(traducirError(e1)); return; }
    if (perfil.must_change_password) {
      const { error: e2 } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", perfil.id);
      if (e2) { setEnviando(false); setError(traducirError(e2)); return; }
    }
    setEnviando(false);
    avisar("Contraseña actualizada");
    onListo?.();
  };

  const formulario = (
    <form className={obligatorio ? "tarjeta-login" : ""} onSubmit={guardar} noValidate>
      {obligatorio && <div className="marca"><Logo /><span>Gestor de Proyectos</span></div>}
      {obligatorio && <h1>Crea tu contraseña</h1>}
      {obligatorio && <p className="tenue">Hola {perfil.full_name || perfil.username}. Por seguridad, cambia la contraseña temporal antes de continuar.</p>}
      <label className="campo"><span>Nueva contraseña</span>
        <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus />
      </label>
      <label className="campo"><span>Repetir contraseña</span>
        <input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
      </label>
      <p className="tenue pequeno">Mínimo 8 caracteres, con letras y números.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        {obligatorio
          ? <button type="button" className="boton" onClick={() => supabase.auth.signOut()}>Salir</button>
          : <button type="button" className="boton" onClick={onCancelar}>Cancelar</button>}
        <button className="boton primario" disabled={enviando}>{enviando ? "Guardando…" : "Guardar contraseña"}</button>
      </div>
    </form>
  );
  return obligatorio ? <div className="pantalla-centro fondo-login">{formulario}</div> : formulario;
}
