// Avisa a la pantalla que algo quedó listo para que el dino celebre.
export function celebrar(titulo = "") {
  try { window.dispatchEvent(new CustomEvent("celebrar", { detail: { titulo } })); } catch { /* sin ventana */ }
}
