import { useCallback, useEffect, useState } from "react";
import { llamarAdmin } from "../lib/supabase.js";
import { validarClave, validarUsuario } from "../lib/logica.js";
import { Avatar, Confirmar, Modal } from "./ui.jsx";

function claveAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const todo = letras + numeros;
  const r = new Uint32Array(12);
  crypto.getRandomValues(r);
  let s = Array.from(r, (n) => todo[n % todo.length]).join("");
  s = letras[r[0] % letras.length] + numeros[r[1] % numeros.length] + s.slice(2);
  return s;
}

export default function AdminUsuarios({ perfil, avisar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [dialogo, setDialogo] = useState(null);

  const cargar = useCallback(async () => {
    try { const r = await llamarAdmin({ action: "list" }); setUsuarios(r.users); }
    catch (e) { avisar(e.message, "error"); }
    setCargando(false);
  }, [avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (body, ok) => {
    try { await llamarAdmin(body); avisar(ok); cargar(); }
    catch (e) { avisar(e.message, "error"); }
  };

  return (
    <section className="admin">
      <header className="cabecera-admin">
        <div><h1>Usuarios</h1><p className="tenue">Solo tú puedes crear cuentas. Nadie puede registrarse por su cuenta.</p></div>
        <button className="boton primario" onClick={() => setDialogo({ tipo: "crear" })}>+ Crear usuario</button>
      </header>
      {cargando ? <div className="girando" /> : (
        <ul className="lista-usuarios">
          {usuarios.map((u) => (
            <li key={u.id} className={u.disabled ? "desactivado" : ""}>
              <Avatar perfil={u} size={36} />
              <div className="crece">
                <strong>{u.full_name || u.username}</strong> {u.id === perfil.id && <span className="tenue">(tú)</span>}
                <div className="tenue pequeno">@{u.username}</div>
                <div className="insignias">
                  {u.is_admin && <span className="insignia">Administradora</span>}
                  {u.disabled && <span className="insignia gris">Desactivado</span>}
                  {u.must_change_password && !u.disabled && <span className="insignia ambar">Contraseña temporal</span>}
                </div>
              </div>
              {u.id !== perfil.id && (
                <div className="acciones-usuario">
                  <button className="boton" onClick={() => setDialogo({ tipo: "clave", u })}>Restablecer contraseña</button>
                  {u.disabled
                    ? <button className="boton" onClick={() => accion({ action: "enable", id: u.id }, "Usuario activado")}>Activar</button>
                    : <button className="boton" onClick={() => accion({ action: "disable", id: u.id }, "Usuario desactivado")}>Desactivar</button>}
                  <button className="boton" onClick={() => accion({ action: "set_admin", id: u.id, is_admin: !u.is_admin }, u.is_admin ? "Ya no es administrador/a" : "Ahora es administrador/a")}>
                    {u.is_admin ? "Quitar admin" : "Hacer admin"}</button>
                  <button className="boton peligro" onClick={() => setDialogo({ tipo: "borrar", u })}>Eliminar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialogo?.tipo === "crear" && <CrearUsuario onClose={() => setDialogo(null)} onCreado={() => { setDialogo(null); cargar(); }} avisar={avisar} />}
      {dialogo?.tipo === "clave" && <RestablecerClave u={dialogo.u} onClose={() => setDialogo(null)} avisar={avisar} onListo={() => { setDialogo(null); cargar(); }} />}
      {dialogo?.tipo === "borrar" && <Confirmar mensaje={`¿Eliminar a ${dialogo.u.full_name || dialogo.u.username}?`}
        detalle="Se borra su cuenta. Los proyectos de los que es dueño/a también se eliminarán. Si solo quieres quitarle el acceso, usa Desactivar."
        onNo={() => setDialogo(null)} onSi={() => { const u = dialogo.u; setDialogo(null); accion({ action: "delete", id: u.id }, "Usuario eliminado"); }} />}
    </section>
  );
}

function CampoClave({ clave, setClave }) {
  return (
    <label className="campo"><span>Contraseña temporal</span>
      <div className="con-boton">
        <input value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck="false" />
        <button type="button" className="enlace" onClick={() => setClave(claveAleatoria())}>Generar</button>
      </div>
      <small className="tenue">Mínimo 8 caracteres, con letras y números. La persona deberá cambiarla al entrar.</small>
    </label>
  );
}

function CrearUsuario({ onClose, onCreado, avisar }) {
  const [username, setUsername] = useState("");
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState(claveAleatoria);
  const [esAdmin, setEsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState(null);

  const crear = async (e) => {
    e.preventDefault();
    const v = validarUsuario(username) || validarClave(clave);
    if (v) { setError(v); return; }
    setEnviando(true); setError("");
    try {
      await llamarAdmin({ action: "create", username: username.trim().toLowerCase(), full_name: nombre, password: clave, is_admin: esAdmin });
      setCreado({ username: username.trim().toLowerCase(), clave });
      avisar("Usuario creado");
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  if (creado) {
    return (
      <Modal titulo="Usuario creado" onClose={onCreado}>
        <p>Comparte estos datos por un medio privado. No se volverán a mostrar.</p>
        <div className="credencial"><span>Usuario</span><code>{creado.username}</code></div>
        <div className="credencial"><span>Contraseña temporal</span><code>{creado.clave}</code></div>
        <div className="acciones">
          <button className="boton" onClick={() => navigator.clipboard?.writeText(`Usuario: ${creado.username}\nContraseña temporal: ${creado.clave}\n${window.location.href.split("#")[0]}`).then(() => avisar("Copiado"))}>Copiar</button>
          <button className="boton primario" onClick={onCreado}>Listo</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Crear usuario" onClose={onClose}>
      <form onSubmit={crear} noValidate>
        <label className="campo"><span>Nombre de usuario</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck="false" autoFocus placeholder="ej. ana.mora" /></label>
        <label className="campo"><span>Nombre completo</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Ana Mora" /></label>
        <CampoClave clave={clave} setClave={setClave} />
        <label className="casilla"><input type="checkbox" checked={esAdmin} onChange={(e) => setEsAdmin(e.target.checked)} /> También es administrador/a (puede gestionar usuarios)</label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button className="boton primario" disabled={enviando}>{enviando ? "Creando…" : "Crear usuario"}</button>
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
        <p>Nueva contraseña temporal (compártela por un medio privado):</p>
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
