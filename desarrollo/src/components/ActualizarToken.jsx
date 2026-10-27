import { useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { Logo } from "./ui.jsx";

const ENLACE = "https://github.com/settings/personal-access-tokens/new";

export default function ActualizarToken({ obligatorio, perfil, avisar, onListo, onCancelar }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setError(""); setEnviando(true);
    const { error: err } = await supabase.auth.guardarToken(token);
    setEnviando(false);
    if (err) { setError(traducirError(err)); return; }
    setToken("");
    avisar("Token guardado cifrado en GitHub");
    onListo?.();
  };

  const formulario = (
    <form className={obligatorio ? "tarjeta-login" : ""} onSubmit={guardar} noValidate>
      {obligatorio && <div className="marca"><Logo /><span>Gestor de Proyectos</span></div>}
      {obligatorio && <h1>Conectá GitHub</h1>}
      <p className="tenue">
        {obligatorio ? `Hola ${perfil?.full_name || perfil?.username || ""}. ` : ""}
        Para guardar cambios, la plataforma necesita un token de GitHub con permiso de escritura solo sobre este repositorio.
        Se guarda cifrado y solo lo pueden abrir quienes administran o editan.
      </p>
      <ol className="pasos-token">
        <li>Abrí <a href={ENLACE} target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a></li>
        <li>En <strong>Repository access</strong> elegí <strong>Only select repositories</strong> y marcá <strong>proyectos</strong></li>
        <li>En <strong>Permissions → Repository permissions → Contents</strong> elegí <strong>Read and write</strong></li>
        <li>Generá el token y pegalo aquí</li>
      </ol>
      <label className="campo" htmlFor="token-gh"><span>Token de GitHub</span>
        <input id="token-gh" type="password" autoComplete="off" spellCheck="false" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        {obligatorio
          ? <button type="button" className="boton" onClick={() => supabase.auth.signOut()}>Salir</button>
          : <button type="button" className="boton" onClick={onCancelar}>Cancelar</button>}
        <button className="boton primario" disabled={!token.trim() || enviando}>{enviando ? "Guardando…" : "Guardar token"}</button>
      </div>
    </form>
  );
  return obligatorio ? <div className="pantalla-centro fondo-login">{formulario}</div> : formulario;
}
