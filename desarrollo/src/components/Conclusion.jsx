import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./ui.jsx";

// Nota de conclusión de una subtarea: en qué quedó. Se abre con Shift + Enter o con el botón 📝.
export function useConclusion(actualizar) {
  const [tarea, setTarea] = useState(null);
  const dialogo = tarea && createPortal(
    <NotaConclusion tarea={tarea} onClose={() => setTarea(null)}
      onGuardar={(texto) => {
        actualizar(tarea.id, texto ? { conclusion: texto, conclusion_fecha: new Date().toISOString().slice(0, 10) } : { conclusion: null, conclusion_fecha: null });
        setTarea(null);
      }} />,
    document.body
  );
  return { abrir: setTarea, dialogo };
}

function NotaConclusion({ tarea, onGuardar, onClose }) {
  const [texto, setTexto] = useState(tarea.conclusion ?? "");
  const enviar = (e) => { e.preventDefault(); onGuardar(texto.trim()); };
  return (
    <Modal titulo="Conclusión" onClose={onClose}>
      <form onSubmit={enviar} className="form-conclusion">
        <p className="tenue pequeno">Subtarea: <strong>{tarea.title}</strong></p>
        <textarea autoFocus rows={5} maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="¿En qué quedó esta subtarea?" aria-label="Conclusión"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); }} />
        <div className="acciones">
          {tarea.conclusion && <button type="button" className="boton peligro" onClick={() => onGuardar("")}>Borrar</button>}
          <span className="empuje" />
          <button type="button" className="boton" onClick={onClose}>Cancelar</button>
          <button type="submit" className="boton primario">Guardar conclusión</button>
        </div>
      </form>
    </Modal>
  );
}

export function BloqueConclusion({ tarea, editable, onEditar }) {
  if (!tarea.conclusion) return editable ? <button type="button" className="enlace agregar-conclusion" onClick={onEditar}>📝 Agregar conclusión</button> : null;
  return (
    <div className="aviso-conclusion" role="note">
      <strong>Conclusión</strong>{tarea.conclusion_fecha && <span className="tenue pequeno"> · {tarea.conclusion_fecha.split("-").reverse().join("/")}</span>}
      <p>{tarea.conclusion}</p>
      {editable && <button type="button" className="enlace" onClick={onEditar}>Editar</button>}
    </div>
  );
}
