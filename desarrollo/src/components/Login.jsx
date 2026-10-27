import { useState } from "react";
import { correoDeUsuario, supabase, traducirError } from "../lib/supabase.js";

import { Logo } from "./ui.jsx";
export { Logo };

export default function Login({ avisar }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [ver, setVer] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError("");
    if (!usuario.trim() || !clave) { setError("Escribí tu usuario y contraseña."); return; }
    setEnviando(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password: clave });
    setEnviando(false);
    if (err) setError(traducirError(err));
    else { setClave(""); avisar("¡Bienvenida de vuelta!"); }
  };

  return (
    <div className="pantalla-centro fondo-login">
      <form className="tarjeta-login" onSubmit={entrar} noValidate>
        <div className="marca"><Logo /><span>Gestor de Proyectos</span></div>
        <h1>Iniciar sesión</h1>
        <label className="campo">
          <span>Usuario</span>
          <input autoComplete="username" autoCapitalize="none" spellCheck="false" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <div className="con-boton">
            <input type={ver ? "text" : "password"} autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            <button type="button" className="enlace" onClick={() => setVer((v) => !v)}>{ver ? "Ocultar" : "Mostrar"}</button>
          </div>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton primario ancho" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        <p className="tenue pequeno">¿No tenés cuenta? Pedila a la administradora.</p>
      </form>
    </div>
  );
}
