import { useCallback, useEffect, useState } from "react";
import { llamarAdmin, supabase } from "../lib/supabase.js";
import { validarClave, validarUsuario } from "../lib/logica.js";
import { Avatar, Confirmar, Modal } from "./ui.jsx";

const ROLES = {
  admin: { nombre: "Administradora", texto: "Todo, incluida la gestión de usuarios" },
  editor: { nombre: "Editor", texto: "Crea y edita proyectos y tareas" },
  lector: { nombre: "Lector", texto: "Solo ve; no necesita token" },
};

function claveAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", numeros = "23456789", todo = letras + numeros + "-";
  const r = new Uint32Array(16); crypto.getRandomValues(r);
  const s = Array.from(r, (n) => todo[n % todo.length]);
  s[0] = letras[r[0] % letras.length]; s[1] = numeros[r[1] % numeros.length];
  return s.join("");
}

export default function AdminUsuarios({ perfil, avisar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [dialogo, setDialogo] = useState(null);
  const [trabajando, setTrabajando] = useState(null);

  const cargar = useCallback(async () => { try { setUsuarios((await llamarAdmin({ action: "list" })).users); } catch (e) { avisar(e.message, "error"); } }, [avisar]);
  useEffect(() => {
    cargar();
    const c = supabase.channel("usuarios").on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, cargar).subscribe();
    return () => supabase.removeChannel(c);
  }, [cargar]);

  const accion = async (body, ok, msgTrabajo) => {
    setTrabajando(msgTrabajo ?? "Guardando…");
    try {
      const r = await llamarAdmin(body);
      avisar(ok);
      if (r?.requiereNuevoToken) setDialogo({ tipo: "token" });
      cargar();
    } catch (e) { avisar(e.message, "error"); }
    setTrabajando(null);
  };

  const activos = usuarios.filter((u) => !u.disabled), inactivos = usuarios.filter((u) => u.disabled);

  return (
    <section className="admin">
      <header className="cabecera-admin">
        <div><h1>Usuarios y permisos</h1><p className="tenue">Solo vos creás cuentas. Nadie puede registrarse por su cuenta.</p></div>
        <button className="boton primario" onClick={() => setDialogo({ tipo: "crear" })}>+ Crear usuario</button>
      </header>
      {trabajando && <p className="aviso-trabajo" role="status">{trabajando}</p>}
      <ul className="lista-usuarios">
        {activos.map((u) => (
          <li key={u.id}>
            <Avatar perfil={u} size={36} />
            <div className="crece">
              <strong>{u.full_name || u.username}</strong> {u.id === perfil.id && <span className="tenue">(vos)</span>}
              <div className="tenue pequeno">@{u.username}</div>
              <div className="insignias">
                <span className="insignia">{ROLES[u.rol]?.nombre}</span>
                {u.must_change_password && <span className="insignia ambar">Contraseña temporal</span>}
              </div>
            </div>
            {u.id !== perfil.id && (
              <div className="acciones-usuario">
                <label className="sr-solo" htmlFor={`rol-${u.id}`}>Rol</label>
                <select id={`rol-${u.id}`} value={u.rol} disabled={Boolean(trabajando)}
                  onChange={(e) => accion({ action: "set_rol", id: u.id, rol: e.target.value }, "Rol actualizado", "Actualizando permisos…")}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
                </select>
                <button className="boton" disabled={Boolean(trabajando)} onClick={() => setDialogo({ tipo: "clave", u })}>Restablecer contraseña</button>
                <button className="boton peligro" disabled={Boolean(trabajando)} onClick={() => setDialogo({ tipo: "desactivar", u })}>Quitar acceso</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {inactivos.length > 0 && (<>
        <h2 className="nav-titulo">Sin acceso</h2>
        <ul className="lista-usuarios">
          {inactivos.map((u) => (
            <li key={u.id} className="desactivado">
              <Avatar perfil={u} size={36} />
              <div className="crece"><strong>{u.full_name || u.username}</strong><div className="tenue pequeno">@{u.username}</div></div>
              <div className="acciones-usuario">
                <button className="boton" onClick={() => setDialogo({ tipo: "crear", base: u })}>Reactivar</button>
                <button className="boton peligro" onClick={() => accion({ action: "delete", id: u.id }, "Usuario eliminado")}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      </>)}
      <p className="tenue pequeno nota">Los permisos los aplica la plataforma. Por seguridad del repositorio, quien tiene rol Editor o Administradora puede abrir el token de GitHub, así que dale esos roles solo a personas de confianza.</p>

      {dialogo?.tipo === "crear" && <CrearUsuario base={dialogo.base} onClose={() => setDialogo(null)} onCreado={() => { setDialogo(null); cargar(); }} avisar={avisar} />}
      {dialogo?.tipo === "clave" && <RestablecerClave u={dialogo.u} onClose={() => setDialogo(null)} avisar={avisar} onListo={() => { setDialogo(null); cargar(); }} />}
      {dialogo?.tipo === "desactivar" && <Confirmar mensaje={`¿Quitarle el acceso a ${dialogo.u.full_name || dialogo.u.username}?`}
        detalle="Se generan llaves nuevas y se vuelven a cifrar los datos y los adjuntos, para que lo que esa persona conocía ya no sirva. Puede tardar si hay muchos adjuntos."
        textoSi="Quitar acceso" onNo={() => setDialogo(null)}
        onSi={() => { const u = dialogo.u; setDialogo(null); accion({ action: "disable", id: u.id }, "Acceso quitado y llaves renovadas", "Renovando llaves y volviendo a cifrar…"); }} />}
      {dialogo?.tipo === "token" && (
        <Modal titulo="Renová el token de GitHub" onClose={() => setDialogo(null)}>
          <p>Esa persona podía usar el token actual. Para cerrar ese acceso:</p>
          <ol className="pasos-token">
            <li>En <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens</a> eliminá el token actual.</li>
            <li>Creá uno nuevo (Only select repositories → proyectos → Contents: Read and write).</li>
            <li>Pegalo en el menú de tu cuenta → <strong>Actualizar token</strong>.</li>
          </ol>
          <div className="acciones"><button className="boton primario" onClick={() => setDialogo(null)}>Entendido</button></div>
        </Modal>
      )}
    </section>
  );
}

function CampoClave({ clave, setClave }) {
  return (
    <label className="campo" htmlFor="clave-temporal"><span>Contraseña temporal</span>
      <div className="con-boton">
        <input id="clave-temporal" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck="false" />
        <button type="button" className="enlace" onClick={() => setClave(claveAleatoria())}>Generar</button>
      </div>
      <small className="tenue">Mínimo 8 caracteres, con letras y números. Editores y administradoras la cambian al entrar.</small>
    </label>
  );
}

function CrearUsuario({ base, onClose, onCreado, avisar }) {
  const [username, setUsername] = useState(base?.username ?? "");
  const [nombre, setNombre] = useState(base?.full_name ?? "");
  const [rol, setRol] = useState(base?.rol === "admin" ? "editor" : base?.rol ?? "editor");
  const [clave, setClave] = useState(claveAleatoria);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState(null);

  const crear = async (e) => {
    e.preventDefault();
    const v = validarUsuario(username) || validarClave(clave);
    if (v) { setError(v); return; }
    setEnviando(true); setError("");
    try {
      await llamarAdmin({ action: "create", username: username.trim().toLowerCase(), full_name: nombre, password: clave, rol });
      setCreado({ username: username.trim().toLowerCase(), clave });
      avisar("Usuario creado");
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  if (creado) {
    return (
      <Modal titulo="Usuario creado" onClose={onCreado}>
        <p>Compartí estos datos por un medio privado. No se vuelven a mostrar.</p>
        <div className="credencial"><span>Sitio</span><code>{window.location.origin + window.location.pathname}</code></div>
        <div className="credencial"><span>Usuario</span><code>{creado.username}</code></div>
        <div className="credencial"><span>Contraseña temporal</span><code>{creado.clave}</code></div>
        <div className="acciones">
          <button className="boton" onClick={() => navigator.clipboard?.writeText(`Sitio: ${window.location.origin + window.location.pathname}\nUsuario: ${creado.username}\nContraseña temporal: ${creado.clave}`).then(() => avisar("Copiado"), () => avisar("No se pudo copiar; seleccioná el texto", "error"))}>Copiar</button>
          <button className="boton primario" onClick={onCreado}>Listo</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo={base ? "Reactivar usuario" : "Crear usuario"} onClose={onClose}>
      <form onSubmit={crear} noValidate>
        <label className="campo" htmlFor="nu-usuario"><span>Nombre de usuario</span><input id="nu-usuario" value={username} disabled={Boolean(base)} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck="false" autoFocus placeholder="ej. ana.mora" /></label>
        <label className="campo" htmlFor="nu-nombre"><span>Nombre completo</span><input id="nu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ana Mora" /></label>
        <label className="campo" htmlFor="nu-rol"><span>Rol</span>
          <select id="nu-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.nombre}: {v.texto}</option>)}
          </select>
        </label>
        <CampoClave clave={clave} setClave={setClave} />
        {rol === "lector" && <p className="tenue pequeno">Las personas con rol Lector no pueden cambiar su propia contraseña: si la olvidan o querés cambiarla, restablecela vos.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={enviando}>{enviando ? "Creando…" : base ? "Reactivar" : "Crear usuario"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RestablecerClave({ u, onClose, onListo, avisar }) {
  const [clave, setClave] = useState(claveAleatoria);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState("");
  const guardar = async (e) => {
    e.preventDefault();
    const v = validarClave(clave); if (v) { setError(v); return; }
    try { await llamarAdmin({ action: "set_password", id: u.id, password: clave }); setHecho(true); avisar("Contraseña restablecida"); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal titulo={`Restablecer contraseña de @${u.username}`} onClose={hecho ? onListo : onClose}>
      {hecho ? (<>
        <p>Nueva contraseña temporal (compartila por un medio privado):</p>
        <div className="credencial"><span>Contraseña</span><code>{clave}</code></div>
        <div className="acciones"><button className="boton primario" onClick={onListo}>Listo</button></div>
      </>) : (
        <form onSubmit={guardar} noValidate>
          <CampoClave clave={clave} setClave={setClave} />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones"><button type="button" className="boton" onClick={onClose}>Cancelar</button><button className="boton primario">Restablecer</button></div>
        </form>
      )}
    </Modal>
  );
}
