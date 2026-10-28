import { useEffect, useRef, useState } from "react";
import { iniciales } from "../lib/logica.js";

export function Avatar({ perfil, size = 28, title }) {
  if (!perfil) {
    return <span className="avatar avatar-vacio" style={{ width: size, height: size }} title={title ?? "Sin responsable"} aria-label="Sin responsable">
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" /></svg>
    </span>;
  }
  return (
    <span className="avatar" style={{ width: size, height: size, background: perfil.avatar_color || "#579bfc", fontSize: size * 0.4 }}
      title={title ?? (perfil.full_name || perfil.username)}>
      {iniciales(perfil)}
    </span>
  );
}

export function Modal({ titulo, onClose, children, ancho = 480 }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="capa" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: ancho }}>
        <header className="modal-cabecera">
          <h2>{titulo}</h2>
          <button className="icono" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}

// Menú desplegable anclado a un botón; se cierra al hacer clic fuera
// "fijo": el menú se dibuja sobre la página (no lo recorta la tabla) y se abre hacia arriba si no cabe abajo
export function Desplegable({ boton, children, alinear = "izquierda", className = "", fijo = false }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const alternar = () => setAbierto((a) => {
    if (!a && fijo && ref.current) {
      // Se abre hacia donde haya más espacio y nunca se sale de la pantalla
      const r = ref.current.getBoundingClientRect();
      const abajo = window.innerHeight - r.bottom - 12, arriba = r.top - 12;
      const haciaAbajo = abajo >= 300 || abajo >= arriba;
      setPos({ position: "fixed", left: Math.max(8, Math.min(r.left, window.innerWidth - 240)), right: "auto",
        ...(haciaAbajo ? { top: r.bottom + 4, bottom: "auto" } : { top: "auto", bottom: window.innerHeight - r.top + 4 }),
        "--alto-max": `${Math.max(160, Math.floor(haciaAbajo ? abajo : arriba) - 16)}px` });
    }
    return !a;
  });
  useEffect(() => {
    if (!abierto || !fijo) return;
    // Se cierra si se desplaza la página, pero no al desplazarse dentro del propio menú
    const cerrar = (e) => { if (e?.type === "scroll" && ref.current?.contains(e.target)) return; setAbierto(false); };
    window.addEventListener("scroll", cerrar, true); window.addEventListener("resize", cerrar);
    return () => { window.removeEventListener("scroll", cerrar, true); window.removeEventListener("resize", cerrar); };
  }, [abierto, fijo]);
  useEffect(() => {
    if (!abierto) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const k = (e) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); };
  }, [abierto]);
  return (
    <div className={`desplegable ${className}`} ref={ref}>
      {boton({ abierto, alternar })}
      {abierto && <div className={`menu menu-${alinear}`} role="menu" style={fijo && pos ? { ...pos, zIndex: 35 } : undefined}>{children(() => setAbierto(false))}</div>}
    </div>
  );
}

// Celda de etiqueta (estado/prioridad) estilo Monday con selector
export function CeldaEtiqueta({ etiquetas, valor, onCambiar, editable, vacio = "—", compacta = false }) {
  const actual = etiquetas.find((l) => l.id === valor);
  const estilo = actual ? { background: actual.color, color: textoSobre(actual.color) } : undefined;
  if (!editable) return <span className={`pastilla ${compacta ? "compacta" : ""} ${actual ? "" : "pastilla-vacia"}`} style={estilo}>{actual?.name ?? vacio}</span>;
  return (
    <Desplegable className="celda-etiqueta" boton={({ alternar }) => (
      <button type="button" className={`pastilla ${compacta ? "compacta" : ""} ${actual ? "" : "pastilla-vacia"}`} style={estilo} onClick={alternar}>
        {actual?.name ?? vacio}
      </button>
    )}>
      {(cerrar) => (
        <div className="selector-etiquetas">
          {etiquetas.map((l) => (
            <button key={l.id} type="button" className="opcion-etiqueta" style={{ background: l.color, color: textoSobre(l.color) }}
              onClick={() => { onCambiar(l.id); cerrar(); }}>{l.name}</button>
          ))}
          <button type="button" className="opcion-etiqueta pastilla-vacia" onClick={() => { onCambiar(null); cerrar(); }}>Quitar</button>
        </div>
      )}
    </Desplegable>
  );
}

export function SelectorPersona({ miembros, perfiles, valor, onCambiar, editable, onAgregar }) {
  const actual = valor ? perfiles[valor] : null;
  const [nombre, setNombre] = useState("");
  if (!editable) return <Avatar perfil={actual} />;
  return (
    <Desplegable fijo boton={({ alternar }) => (
      <button type="button" className="boton-avatar" onClick={alternar} aria-label="Cambiar responsable"><Avatar perfil={actual} /></button>
    )}>
      {(cerrar) => (
        <div className="lista-personas">
          {miembros.map((m) => {
            const p = perfiles[m.user_id];
            if (!p) return null;
            return (
              <button key={m.user_id} type="button" className={`opcion-persona ${valor === m.user_id ? "activa" : ""}`} onClick={() => { onCambiar(m.user_id); cerrar(); }}>
                <Avatar perfil={p} size={24} /> <span>{p.full_name || p.username}</span>
              </button>
            );
          })}
          <button type="button" className="opcion-persona" onClick={() => { onCambiar(null); cerrar(); }}><Avatar perfil={null} size={24} /> <span>Sin responsable</span></button>
          {onAgregar && (
            <form className="agregar-persona" onSubmit={async (e) => {
              e.preventDefault(); const n = nombre.trim(); if (!n) return;
              const nueva = await onAgregar(n); setNombre("");
              if (nueva) { onCambiar(nueva.id); cerrar(); }
            }}>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="+ Agregar persona" aria-label="Agregar persona responsable" />
            </form>
          )}
        </div>
      )}
    </Desplegable>
  );
}

// Texto editable en línea: clic para editar, Enter para guardar, Esc para cancelar
export function TextoEditable({ valor, onGuardar, editable, className = "", placeholder = "", max = 300 }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  if (!editable || !editando) {
    return <span className={`texto-editable ${className} ${editable ? "puede" : ""}`} onClick={() => editable && setEditando(true)}
      tabIndex={editable ? 0 : -1} onKeyDown={(e) => editable && e.key === "Enter" && setEditando(true)} role={editable ? "button" : undefined}>
      {valor || <span className="tenue">{placeholder}</span>}
    </span>;
  }
  const guardar = () => {
    const t = texto.trim();
    setEditando(false);
    if (t && t !== valor) onGuardar(t); else setTexto(valor);
  };
  return <input className={`entrada-linea ${className}`} autoFocus value={texto} maxLength={max}
    onChange={(e) => setTexto(e.target.value)} onBlur={guardar}
    onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") { setTexto(valor); setEditando(false); } }} />;
}

export function Toasts({ lista, quitar }) {
  return (
    <div className="toasts" aria-live="polite">
      {lista.map((t) => (
        <div key={t.id} className={`toast toast-${t.tipo}`} onClick={() => quitar(t.id)}>{t.mensaje}</div>
      ))}
    </div>
  );
}

export function Confirmar({ mensaje, detalle, onSi, onNo, textoSi = "Eliminar" }) {
  return (
    <Modal titulo="Confirmar" onClose={onNo} ancho={420}>
      <p><strong>{mensaje}</strong></p>
      {detalle && <div className="tenue detalle-confirmar">{detalle}</div>}
      <div className="acciones">
        <button className="boton" onClick={onNo}>Cancelar</button>
        <button className={`boton ${textoSi === "Guardar" ? "primario" : "peligro"}`} onClick={onSi} autoFocus>{textoSi}</button>
      </div>
    </Modal>
  );
}

// Elige texto blanco u oscuro según el contraste con el fondo
export function textoSobre(hex) {
  const h = (hex || "#c4c4c4").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? "#1f1f1f" : "#ffffff";
}

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <i style={{ background: "#0780ee" }} /><i style={{ background: "#4dc1ff" }} /><i style={{ background: "#ff7c00" }} />
    </span>
  );
}


// Lista desplegable con el color de la opción elegida (estado y prioridad)
export function ListaEtiqueta({ etiquetas, valor, onCambiar, editable, etiqueta, vacio = "Sin asignar" }) {
  const actual = etiquetas.find((l) => l.id === valor);
  const estilo = actual ? { background: actual.color, color: textoSobre(actual.color) } : undefined;
  if (!editable) return <span className={`pastilla ${actual ? "" : "pastilla-vacia"}`} style={estilo}>{actual?.name ?? "—"}</span>;
  return (
    <span className={`lista-etiqueta ${actual ? "" : "sin-valor"}`} style={estilo}>
      <select aria-label={etiqueta} value={valor ?? ""} onChange={(e) => onCambiar(e.target.value || null)}>
        <option value="">{vacio}</option>
        {etiquetas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </span>
  );
}
