import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// No mostrar el sitio dentro de iframes de otras páginas (protección contra clickjacking).
// estilos.css oculta la página hasta que se confirme que no está enmarcada.
if (window.top !== window.self) {
  try { window.top.location.replace(window.location.href); } catch { /* el marco lo impide: la página queda oculta */ }
} else {
  document.documentElement.classList.add("permitido");
  // La app instalable se quitó: si algún navegador alcanzó a registrar el service worker, se da de baja
  navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
