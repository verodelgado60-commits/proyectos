import { createClient } from "@supabase/supabase-js";

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && key);

// Clave pública (publishable/anon): está pensada para el navegador.
// La seguridad la imponen las reglas RLS de la base de datos.
export const supabase = configurado
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const DOMINIO_INTERNO = "usuarios.example.com";

export function normalizarUsuario(u) {
  return String(u ?? "").trim().toLowerCase();
}

export function correoDeUsuario(usuario) {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`;
}

export function traducirError(e) {
  const m = (e?.message ?? String(e ?? "")).toLowerCase();
  if (m.includes("invalid login credentials")) return "Usuario o contraseña incorrectos.";
  if (m.includes("banned") || m.includes("user is banned")) return "Esta cuenta está desactivada. Contacta a la administradora.";
  if (m.includes("weak") || m.includes("password should")) return "La contraseña no cumple los requisitos: mínimo 8 caracteres, con letras y números.";
  if (m.includes("same_password") || m.includes("different from the old")) return "La nueva contraseña debe ser distinta a la actual.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "No tienes permiso para hacer eso en este proyecto.";
  if (m.includes("jwt expired")) return "Tu sesión venció. Vuelve a iniciar sesión.";
  return e?.message ?? "Ocurrió un error inesperado.";
}

export async function llamarAdmin(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let mensaje = error.message;
    try { const j = await error.context.json(); if (j?.error) mensaje = j.error; } catch { /* sin detalle */ }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
