// Función segura de administración de usuarios (Supabase Edge Function).
// Usa la clave de servicio que Supabase inyecta en el servidor: nunca llega al navegador.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  correoInterno, igualesSeguro, normalizarUsuario, validarClave, validarUsuario,
} from "./validar.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
const error = (status: number, mensaje: string) => respuesta(status, { error: mensaje });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CAMPOS = "id, username, full_name, avatar_color, is_admin, disabled, must_change_password, created_at";

async function crearCuenta(usuario: string, nombre: string, clave: string, esAdmin: boolean) {
  const { data, error: e } = await admin.auth.admin.createUser({
    email: correoInterno(usuario),
    password: clave,
    email_confirm: true,
    user_metadata: { username: usuario, full_name: nombre },
  });
  if (e) throw new Error(e.message.includes("already") ? "Ese usuario ya existe." : e.message);
  const { error: e2 } = await admin.from("profiles")
    .update({ is_admin: esAdmin, must_change_password: true, full_name: nombre })
    .eq("id", data.user.id);
  if (e2) throw new Error(e2.message);
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return error(405, "Método no permitido");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return error(400, "Solicitud inválida"); }
  const accion = String(body.action ?? "");

  try {
    // --- Arranque: crea la cuenta de administradora una sola vez (lo llama GitHub Actions) ---
    if (accion === "bootstrap") {
      const esperado = Deno.env.get("ADMIN_PASSWORD") ?? "";
      const recibido = req.headers.get("x-bootstrap-token") ?? "";
      if (!esperado || !igualesSeguro(recibido, esperado)) return error(403, "No autorizado");
      const usuario = normalizarUsuario(Deno.env.get("ADMIN_USERNAME"));
      const eu = validarUsuario(usuario); if (eu) return error(400, eu);
      const { data: existente } = await admin.from("profiles").select("id").eq("username", usuario).maybeSingle();
      if (existente) {
        await admin.from("profiles").update({ is_admin: true }).eq("id", existente.id);
        return respuesta(200, { ok: true, creado: false });
      }
      const ec = validarClave(esperado); if (ec) return error(400, ec);
      await crearCuenta(usuario, Deno.env.get("ADMIN_FULL_NAME") ?? "Administradora", esperado, true);
      return respuesta(200, { ok: true, creado: true });
    }

    // --- Resto de acciones: solo una administradora con sesión activa ---
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return error(401, "Inicia sesión");
    const { data: quien, error: eAuth } = await admin.auth.getUser(token);
    if (eAuth || !quien?.user) return error(401, "Sesión inválida o vencida");
    const { data: yo } = await admin.from("profiles").select("is_admin, disabled").eq("id", quien.user.id).single();
    if (!yo?.is_admin || yo.disabled) return error(403, "Solo la administradora puede hacer esto");
    const miId = quien.user.id;
    const objetivo = String(body.id ?? "");

    switch (accion) {
      case "list": {
        const { data, error: e } = await admin.from("profiles").select(CAMPOS).order("created_at");
        if (e) throw new Error(e.message);
        return respuesta(200, { users: data });
      }
      case "create": {
        const usuario = normalizarUsuario(body.username);
        const eu = validarUsuario(usuario); if (eu) return error(400, eu);
        const ec = validarClave(body.password); if (ec) return error(400, ec);
        const nombre = String(body.full_name ?? "").trim().slice(0, 80);
        const id = await crearCuenta(usuario, nombre, String(body.password), body.is_admin === true);
        return respuesta(200, { ok: true, id });
      }
      case "set_password": {
        const ec = validarClave(body.password); if (ec) return error(400, ec);
        const { error: e } = await admin.auth.admin.updateUserById(objetivo, { password: String(body.password) });
        if (e) throw new Error(e.message);
        await admin.from("profiles").update({ must_change_password: objetivo !== miId }).eq("id", objetivo);
        return respuesta(200, { ok: true });
      }
      case "disable":
      case "enable": {
        if (objetivo === miId) return error(400, "No puedes desactivar tu propia cuenta");
        const desactivar = accion === "disable";
        const { error: e } = await admin.auth.admin.updateUserById(objetivo, { ban_duration: desactivar ? "876000h" : "none" });
        if (e) throw new Error(e.message);
        await admin.from("profiles").update({ disabled: desactivar }).eq("id", objetivo);
        return respuesta(200, { ok: true });
      }
      case "set_admin": {
        if (objetivo === miId) return error(400, "No puedes quitarte tus propios permisos");
        await admin.from("profiles").update({ is_admin: body.is_admin === true }).eq("id", objetivo);
        return respuesta(200, { ok: true });
      }
      case "delete": {
        if (objetivo === miId) return error(400, "No puedes eliminar tu propia cuenta");
        const { error: e } = await admin.auth.admin.deleteUser(objetivo);
        if (e) throw new Error(e.message);
        return respuesta(200, { ok: true });
      }
      default:
        return error(400, "Acción desconocida");
    }
  } catch (e) {
    return error(400, e instanceof Error ? e.message : "Error inesperado");
  }
});
