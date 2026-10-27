// Cliente de datos: misma forma que supabase-js, pero sobre GitHub cifrado (ghdb.js).
import { crearCliente } from "ghdb";
import { CONFIG } from "config";
import { claves, reglas, registrarRpcs } from "./reglas.js";

export const supabase = crearCliente(CONFIG, { claves, reglas });
registrarRpcs(supabase);
export const configurado = true;

export function normalizarUsuario(u) {
  return String(u ?? "").trim().toLowerCase();
}
// Se conserva el nombre por compatibilidad con las pantallas: el ingreso es por usuario
export const correoDeUsuario = normalizarUsuario;

export function traducirError(e) {
  if (!e) return "Ocurrió un error inesperado.";
  const m = e.message ?? String(e);
  if (/failed to fetch|network/i.test(m)) return "Sin conexión con GitHub. Revisá tu internet e intentá de nuevo.";
  return m;
}

// Administración de usuarios (antes era una función del servidor)
export async function llamarAdmin({ action, id, ...datos }) {
  const a = supabase.admin;
  switch (action) {
    case "list": return { users: a.listar() };
    case "create": await a.crear({ usuario: datos.username, nombre: datos.full_name, clave: datos.password, rol: datos.rol }); return { ok: true };
    case "set_password": await a.restablecerClave(id, datos.password); return { ok: true };
    case "set_rol": return a.cambiarRol(id, datos.rol);
    case "disable": return a.desactivar(id);
    case "delete": return a.eliminar(id);
    default: throw new Error("Acción desconocida");
  }
}
