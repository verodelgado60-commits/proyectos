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
  // App instalable: se guarda el aviso del navegador para mostrar el botón "Instalar app"
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__instalarApp = e; window.dispatchEvent(new Event("instalar-disponible")); });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => { /* sin app instalable */ }); });
  }
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
