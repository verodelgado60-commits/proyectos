import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./ui.jsx";

// Al pasar una subtarea a "Stopper" se pide cuál es el bloqueo; queda guardado en la subtarea.
export const esStopper = (etiqueta) => !!etiqueta && /stopper|atasc/i.test(etiqueta.name);

export function useStopper(estados, actualizar) {
  const [pendiente, setPendiente] = useState(null); // { tarea, cambios }
  const cambiar = (tarea, cambios) => {
    if (!("status_id" in cambios) || cambios.status_id === tarea.status_id) return actualizar(tarea.id, cambios);
    const nuevo = estados.find((e) => e.id === cambios.status_id);
    if (esStopper(nuevo)) { setPendiente({ tarea, cambios }); return; }
    // Al salir del stopper se limpia el motivo
    return actualizar(tarea.id, tarea.stopper ? { ...cambios, stopper: null, stopper_desde: null } : cambios);
  };
  const editar = (tarea) => setPendiente({ tarea, cambios: {} });
  // Se dibuja sobre toda la página (no dentro de la fila de la tabla)
  const dialogo = pendiente && createPortal(
    <MotivoStopper tarea={pendiente.tarea} onClose={() => setPendiente(null)}
      onGuardar={(texto) => {
        const { tarea, cambios } = pendiente;
        actualizar(tarea.id, { ...cambios, stopper: texto, stopper_desde: tarea.stopper_desde && !cambios.status_id ? tarea.stopper_desde : new Date().toISOString().slice(0, 10) });
        setPendiente(null);
      }} />,
    document.body
  );
  return { cambiar, editar, dialogo };
}

function MotivoStopper({ tarea, onGuardar, onClose }) {
  const [texto, setTexto] = useState(tarea.stopper ?? "");
  const ref = useRef(null);
  const enviar = (e) => { e.preventDefault(); const t = texto.trim(); if (t) onGuardar(t); else ref.current?.focus(); };
  return (
    <Modal titulo="¿Cuál es el stopper?" onClose={onClose}>
      <form onSubmit={enviar} className="form-stopper">
        <p className="tenue pequeno">Subtarea: <strong>{tarea.title}</strong></p>
        <textarea ref={ref} autoFocus rows={4} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Contá qué está bloqueando esta subtarea" aria-label="Motivo del stopper"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); }} />
        <div className="acciones">
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button type="submit" className="boton primario boton-stopper" disabled={!texto.trim()}>Guardar stopper</button>
        </div>
      </form>
    </Modal>
  );
}

// Aviso visible del motivo
export function AvisoStopper({ tarea, estados, compacto = false, onEditar }) {
  const etiqueta = estados.find((e) => e.id === tarea.status_id);
  if (!esStopper(etiqueta) || !tarea.stopper) return null;
  if (compacto) return (
    <button type="button" className="icono-stopper" title={`Stopper: ${tarea.stopper}`} aria-label={`Ver stopper: ${tarea.stopper}`} onClick={onEditar}>!</button>
  );
  return (
    <div className="aviso-stopper" role="note">
      <strong>Stopper</strong>{tarea.stopper_desde && <span className="tenue pequeno"> · desde {tarea.stopper_desde.split("-").reverse().join("/")}</span>}
      <p>{tarea.stopper}</p>
      {onEditar && <button type="button" className="enlace" onClick={onEditar}>Editar</button>}
    </div>
  );
}
