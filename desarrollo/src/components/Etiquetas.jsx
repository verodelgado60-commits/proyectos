import { useState } from "react";
import { COLORES, posicionAlFinal } from "../lib/logica.js";
import { Desplegable, Modal, TextoEditable, textoSobre } from "./ui.jsx";

export default function Etiquetas({ labels, api, onClose }) {
  const [tipo, setTipo] = useState("status");
  const lista = labels.filter((l) => l.kind === tipo);
  const agregar = () => api.crearEtiqueta({ kind: tipo, name: tipo === "status" ? "Nuevo estado" : "Nueva prioridad", color: COLORES[lista.length % COLORES.length], position: posicionAlFinal(lista) });

  return (
    <Modal titulo="Estados y prioridades" onClose={onClose} ancho={460}>
      <div className="pestanas">
        <button className={`pestana ${tipo === "status" ? "activa" : ""}`} onClick={() => setTipo("status")}>Estados</button>
        <button className={`pestana ${tipo === "priority" ? "activa" : ""}`} onClick={() => setTipo("priority")}>Prioridades</button>
      </div>
      <ul className="lista-etiquetas">
        {lista.map((l) => (
          <li key={l.id}>
            <Desplegable boton={({ alternar }) => <button className="muestra" style={{ background: l.color }} onClick={alternar} aria-label="Cambiar color" />}>
              {(cerrar) => <div className="colores menu-colores">{COLORES.map((c) => <button key={c} className="muestra" style={{ background: c }} aria-label={`Color ${c}`} onClick={() => { api.actualizarEtiqueta(l.id, { color: c }); cerrar(); }} />)}</div>}
            </Desplegable>
            <span className="pastilla crece" style={{ background: l.color, color: textoSobre(l.color) }}>
              <TextoEditable valor={l.name} editable max={40} onGuardar={(name) => api.actualizarEtiqueta(l.id, { name })} />
            </span>
            {tipo === "status" && (
              <label className="pequeno" title="Las tareas con este estado cuentan como completadas">
                <input type="checkbox" checked={l.is_done} onChange={() => api.actualizarEtiqueta(l.id, { is_done: !l.is_done })} /> Completa
              </label>
            )}
            <button className="icono" onClick={() => api.borrarEtiqueta(l.id)} aria-label={`Eliminar ${l.name}`}>🗑</button>
          </li>
        ))}
      </ul>
      <button className="boton" onClick={agregar}>+ Agregar {tipo === "status" ? "estado" : "prioridad"}</button>
      <p className="tenue pequeno">Al eliminar una etiqueta, las tareas que la usaban quedan sin ese valor.</p>
    </Modal>
  );
}
