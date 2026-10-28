import { useState } from "react";
import { supabase, traducirError } from "../lib/supabase.js";
import { Avatar, Modal } from "./ui.jsx";

const ROLES = { owner: "Dueño", editor: "Editor", viewer: "Lector" };

export default function Miembros({ proyecto, project_members, perfiles, perfil, esDueno, api, avisar, onClose }) {
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState("editor");
  const [enviando, setEnviando] = useState(false);

  const agregar = async (e) => {
    e.preventDefault();
    const u = usuario.trim(); if (!u) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc("find_profile", { u });
    if (error) { setEnviando(false); avisar(traducirError(error), "error"); return; }
    if (!data?.length) { setEnviando(false); avisar("No existe un usuario activo con ese nombre.", "error"); return; }
    const p = data[0];
    if (project_members.some((m) => m.user_id === p.id)) { setEnviando(false); avisar("Esa persona ya es parte del equipo.", "error"); return; }
    const { error: e2 } = await supabase.from("project_members").insert({ project_id: proyecto.id, user_id: p.id, role: rol });
    setEnviando(false);
    if (e2) { avisar(traducirError(e2), "error"); return; }
    setUsuario(""); avisar(`${p.full_name || p.username} se unió a la tarea`);
    api.recargar();
  };

  const cambiarRol = async (userId, role) => {
    const { error } = await supabase.from("project_members").update({ role }).eq("project_id", proyecto.id).eq("user_id", userId);
    if (error) avisar(traducirError(error), "error"); else api.recargar();
  };
  const quitar = async (userId) => {
    const { error } = await supabase.from("project_members").delete().eq("project_id", proyecto.id).eq("user_id", userId);
    if (error) avisar(traducirError(error), "error"); else { avisar("Miembro eliminado"); api.recargar(); }
  };

  const ordenados = [...project_members].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));

  return (
    <Modal titulo="Equipo de la tarea" onClose={onClose} ancho={520}>
      {esDueno && (
        <form className="fila-formulario" onSubmit={agregar}>
          <input placeholder="Nombre de usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" spellCheck="false" aria-label="Nombre de usuario" />
          <select value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Rol"><option value="editor">Editor</option><option value="viewer">Lector</option></select>
          <button className="boton primario" disabled={!usuario.trim() || enviando}>Agregar</button>
        </form>
      )}
      <p className="tenue pequeno">Dueño: administra el equipo y puede eliminar la tarea · Editor: crea y edita subtareas · Lector: solo ve y comenta.</p>
      <ul className="lista-miembros">
        {ordenados.map((m) => {
          const p = perfiles[m.user_id];
          return (
            <li key={m.user_id}>
              <Avatar perfil={p} size={32} />
              <div className="crece"><strong>{p?.full_name || p?.username}</strong>{m.user_id === perfil.id && <span className="tenue"> (vos)</span>}<div className="tenue pequeno">@{p?.username}</div></div>
              {esDueno && m.role !== "owner"
                ? <><select value={m.role} onChange={(e) => cambiarRol(m.user_id, e.target.value)} aria-label="Rol"><option value="editor">Editor</option><option value="viewer">Lector</option></select>
                  <button className="icono" onClick={() => quitar(m.user_id)} aria-label="Quitar del equipo">✕</button></>
                : <span className="insignia">{ROLES[m.role]}</span>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
