import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { aplicarCambio, diasHasta } from "../lib/logica.js";
import { Modal } from "./ui.jsx";

// Ventanita "¡Revisá las tareas de hoy!" una vez al día cuando hay algo que vence hoy.
// Si se activan los avisos del navegador, también sale una notificación del sistema
// (mientras el sitio esté abierto en alguna pestaña, aunque no la estés viendo).
const hoyLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export const avisosNavegadorDisponibles = () => typeof window !== "undefined" && "Notification" in window;
export const avisosNavegadorActivos = () => avisosNavegadorDisponibles() && Notification.permission === "granted";

export function usePendientesHoy(perfil, proyectos) {
  const [subtareas, setSubtareas] = useState([]);
  const [etiquetas, setEtiquetas] = useState([]);
  const [ahora, setAhora] = useState(() => new Date());
  const [cargado, setCargado] = useState(false);
  const cargar = useCallback(async () => {
    const [t, l] = await Promise.all([supabase.from("tasks").select("*"), supabase.from("labels").select("*")]);
    setSubtareas(t.data ?? []); setEtiquetas(l.data ?? []); setCargado(true);
  }, []);
  useEffect(() => {
    cargar();
    const canal = supabase.channel(`aviso-hoy-${perfil.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (ev) => setSubtareas((l) => aplicarCambio(l, ev)))
      .on("postgres_changes", { event: "*", schema: "public", table: "labels" }, (ev) => setEtiquetas((l) => aplicarCambio(l, ev)))
      .subscribe();
    const reloj = setInterval(() => setAhora(new Date()), 5 * 60000);
    return () => { supabase.removeChannel(canal); clearInterval(reloj); };
  }, [cargar, perfil.id]);
  return useMemo(() => {
    const ids = new Set(proyectos.map((p) => p.id));
    const listas = new Set(etiquetas.filter((l) => l.is_done).map((l) => l.id));
    const vivas = subtareas.filter((s) => ids.has(s.project_id) && s.due_date && !s.fecha_na && !listas.has(s.status_id));
    return {
      cargado,
      fecha: hoyLocal(ahora),
      hoy: vivas.filter((s) => diasHasta(s.due_date, ahora) === 0),
      atrasadas: vivas.filter((s) => diasHasta(s.due_date, ahora) < 0),
      tareasHoy: proyectos.filter((p) => p.due_date && diasHasta(p.due_date, ahora) === 0),
    };
  }, [subtareas, etiquetas, proyectos, ahora, cargado]);
}

export default function AvisoHoy({ perfil, proyectos, ir }) {
  const p = usePendientesHoy(perfil, proyectos);
  const [abierto, setAbierto] = useState(false);
  const total = p.hoy.length + p.tareasHoy.length;
  const nombre = perfil.nickname || (perfil.full_name || perfil.username).split(" ")[0];

  useEffect(() => {
    if (!p.cargado || !total) return;
    const clave = `aviso-hoy:${perfil.id}:${p.fecha}`;
    if (leer(clave)) return;
    guardar(clave, "1");
    setAbierto(true);
    if (avisosNavegadorActivos()) {
      try {
        const n = new Notification("¡Revisá las tareas de hoy!", {
          body: `${nombre}, tenés ${total === 1 ? "1 pendiente que vence" : `${total} pendientes que vencen`} hoy.`,
          tag: clave, lang: "es",
        });
        n.onclick = () => { window.focus(); ir("/hoy"); n.close(); };
      } catch { /* el navegador no permitió la notificación */ }
    }
  }, [p.cargado, total, p.fecha, perfil.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!abierto) return null;
  const nombres = [...p.tareasHoy.map((t) => `📌 ${t.name}`), ...p.hoy.map((s) => s.title)];
  return (
    <Modal titulo="🔔 ¡Revisá las tareas de hoy!" onClose={() => setAbierto(false)}>
      <p>{nombre}, {total === 1 ? "hay 1 pendiente que vence hoy" : `hay ${total} pendientes que vencen hoy`}{p.atrasadas.length ? ` y ${p.atrasadas.length} atrasad${p.atrasadas.length === 1 ? "o" : "os"}` : ""}:</p>
      <ul className="lista-aviso-hoy">
        {nombres.slice(0, 6).map((n, i) => <li key={i}>{n}</li>)}
        {nombres.length > 6 && <li className="tenue">y {nombres.length - 6} más…</li>}
      </ul>
      <div className="acciones">
        <button className="boton" onClick={() => setAbierto(false)}>Después</button>
        <button className="boton primario" autoFocus onClick={() => { setAbierto(false); ir("/hoy"); }}>Ver Mi día</button>
      </div>
    </Modal>
  );
}

// Botón para activar los avisos del navegador (debe pedirse con un clic)
export function ActivarAvisosNavegador() {
  const [estado, setEstado] = useState(() => (avisosNavegadorDisponibles() ? Notification.permission : "no"));
  if (estado === "no") return null;
  if (estado === "granted") return <span className="tenue pequeno">🔔 Avisos del navegador activos</span>;
  if (estado === "denied") return <span className="tenue pequeno">🔕 Los avisos están bloqueados en este navegador (se activan desde el candado de la barra de direcciones).</span>;
  return (
    <button className="boton" onClick={async () => {
      try { setEstado(await Notification.requestPermission()); } catch { setEstado("denied"); }
    }}>🔔 Activar avisos del navegador</button>
  );
}
