import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

// Versión con la que se compiló este código (AAAAMMDDhhmm)
export const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

const escribiendo = () => {
  const a = document.activeElement;
  return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
};

// Revisa cada 2 minutos si hay una versión nueva publicada. Si no hay cambios pendientes ni
// alguien escribiendo, recarga sola; si no, muestra un aviso para recargar.
export function AvisoVersion() {
  const [nueva, setNueva] = useState(null);
  useEffect(() => {
    if (VERSION === "dev") return;
    const pendiente = (e) => setNueva(e.detail);
    window.addEventListener("version-pendiente", pendiente);
    const revisar = async () => {
      try {
        const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { v } = await r.json();
        if (v && v !== VERSION) {
          if (!supabase.pendientes() && !escribiendo()) recargar(v);
          else setNueva(v);
        }
      } catch { /* sin conexión */ }
    };
    const t = setInterval(revisar, 120000);
    const alVolver = () => document.visibilityState === "visible" && revisar();
    document.addEventListener("visibilitychange", alVolver);
    revisar();
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); window.removeEventListener("version-pendiente", pendiente); };
  }, []);
  if (!nueva) return null;
  return (
    <div className="aviso-version" role="status">
      <span>Hay una versión nueva de la plataforma.</span>
      <button className="boton primario" onClick={async () => { await supabase.guardarAhora(); recargar(nueva); }}>Actualizar</button>
    </div>
  );
}
function recargar(v) {
  // Evita recargas en bucle si la caché de GitHub Pages aún sirve el código anterior
  try {
    if (sessionStorage.getItem("version-intentada") === v) { window.dispatchEvent(new CustomEvent("version-pendiente", { detail: v })); return; }
    sessionStorage.setItem("version-intentada", v);
  } catch { /* sin almacenamiento */ }
  const url = new URL(window.location.href);
  url.searchParams.set("v", v);
  window.location.replace(url.toString());
}

// Cierra la sesión tras N minutos sin actividad
export function useInactividad(activa, minutos, alVencer) {
  const ultimo = useRef(Date.now());
  const cb = useRef(alVencer);
  cb.current = alVencer;
  useEffect(() => {
    if (!activa) return;
    ultimo.current = Date.now();
    const tocar = () => { ultimo.current = Date.now(); };
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"];
    eventos.forEach((e) => window.addEventListener(e, tocar, { passive: true }));
    const t = setInterval(() => { if (Date.now() - ultimo.current > minutos * 60000) cb.current(); }, 15000);
    return () => { eventos.forEach((e) => window.removeEventListener(e, tocar)); clearInterval(t); };
  }, [activa, minutos]);
}

// Indicador de guardado: Guardando… / Guardado / Cambios pendientes
export function EstadoGuardado() {
  const [e, setE] = useState({ estado: "guardado", pendientes: 0 });
  useEffect(() => supabase.onEstado(setE), []);
  const textos = {
    guardado: ["Guardado en GitHub", "en-linea"],
    guardando: ["Guardando…", ""],
    pendiente: [e.error ? "Sin guardar · se reintentará" : "Guardando pronto…", e.error ? "con-error" : ""],
  };
  const [texto, clase] = textos[e.estado] ?? textos.guardado;
  return (
    <span className={`estado-conexion ${clase}`} title={e.error?.message ?? "Los datos se guardan cifrados en tu repositorio de GitHub"} role="status">
      {e.estado === "guardado" ? "●" : "○"} {texto}
    </span>
  );
}
