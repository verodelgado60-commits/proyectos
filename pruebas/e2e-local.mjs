// Prueba de punta a punta contra una copia local de Supabase (Auth + PostgREST + función).
// Uso: SB_URL=... ANON_KEY=... ADMIN_USER=... ADMIN_PASS=... node pruebas/e2e-local.mjs
import { createClient } from "@supabase/supabase-js";
import { correoDeUsuario } from "../src/lib/supabase.js";

const { SB_URL, ANON_KEY, ADMIN_USER, ADMIN_PASS } = process.env;
let ok = 0, fallas = 0;
const check = (n, c) => { if (c) { ok++; console.log("  ✔", n); } else { fallas++; console.log("  ✘", n); } };
const cliente = () => createClient(SB_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = async (c, body) => { const { data, error } = await c.functions.invoke("admin-users", { body }); if (error) { let m = error.message; try { m = (await error.context.json()).error; } catch {} return { error: m }; } return data; };
const entrar = async (u, p) => { const c = cliente(); const r = await c.auth.signInWithPassword({ email: correoDeUsuario(u), password: p }); return { c, r }; };

console.log("Inicio de sesión");
{ const { r } = await entrar(ADMIN_USER, "incorrecta1"); check("contraseña incorrecta rechazada", !!r.error); }
const { c: vero, r: rv } = await entrar(ADMIN_USER.toUpperCase(), ADMIN_PASS);
check("administradora entra con usuario en mayúsculas", !rv.error);
const { data: pv } = await vero.from("profiles").select("*").single();
check("perfil exige cambiar contraseña temporal", pv.must_change_password === true && pv.is_admin === true);
{ const r = await vero.auth.updateUser({ password: "corta" }); check("contraseña débil rechazada por Auth", !!r.error); }
{ const r = await vero.auth.updateUser({ password: "SoloLetrasAqui" }); check("contraseña sin números rechazada por Auth", !!r.error); }
const NUEVA = "Vero2026Segura";
{ const r = await vero.auth.updateUser({ password: NUEVA }); check("cambio de contraseña válido", !r.error);
  const r2 = await vero.from("profiles").update({ must_change_password: false }).eq("id", pv.id); check("marca contraseña cambiada", !r2.error); }
{ const { r } = await entrar(ADMIN_USER, ADMIN_PASS); check("la contraseña temporal ya no sirve", !!r.error); }
{ const r = await cliente().auth.signUp({ email: "intruso@x.com", password: "Intruso2026" }); check("registro público desactivado", !!r.error); }

console.log("Administración de usuarios");
check("anónimo no lista usuarios", !!(await admin(cliente(), { action: "list" })).error);
check("crear usuario con clave débil rechazado", !!(await admin(vero, { action: "create", username: "ana", password: "abc" })).error);
check("crear ana", !(await admin(vero, { action: "create", username: "Ana", full_name: "Ana Mora", password: "Temporal123" })).error);
check("crear beto", !(await admin(vero, { action: "create", username: "beto", full_name: "Beto Solís", password: "Temporal456" })).error);
check("usuario duplicado rechazado", !!(await admin(vero, { action: "create", username: "ana", password: "Temporal123" })).error);
const lista = await admin(vero, { action: "list" });
check("lista 3 usuarios", lista.users?.length === 3);
const ana = lista.users.find((u) => u.username === "ana"), beto = lista.users.find((u) => u.username === "beto");
const { c: cAna, r: ra } = await entrar("ana", "Temporal123");
check("ana entra con su clave temporal", !ra.error);
check("ana (no admin) no puede listar usuarios", !!(await admin(cAna, { action: "list" })).error);
check("ana no puede crear usuarios", !!(await admin(cAna, { action: "create", username: "zz", password: "Temporal123" })).error);
check("admin no puede desactivarse a sí misma", !!(await admin(vero, { action: "disable", id: pv.id })).error);

console.log("Proyectos, tareas, subtareas y comentarios");
const { data: proy, error: ep } = await vero.from("projects").insert({ name: "Q3 - Project Alpha", owner_id: pv.id }).select().single();
check("crear proyecto", !ep);
const [{ data: grupos }, { data: etiquetas }] = await Promise.all([vero.from("groups").select("*").eq("project_id", proy.id), vero.from("labels").select("*").eq("project_id", proy.id)]);
check("grupo y 8 etiquetas por defecto", grupos.length === 1 && etiquetas.length === 8);
const est = Object.fromEntries(etiquetas.map((l) => [l.name, l.id]));
const { data: g2 } = await vero.from("groups").insert({ project_id: proy.id, name: "Phase B", position: 2 }).select().single();
check("crear grupo", !!g2);
const { data: t1, error: et } = await vero.from("tasks").insert({ project_id: proy.id, group_id: grupos[0].id, title: "High-level requirements", status_id: est["Listo"], priority_id: est["Crítica"], due_date: "2026-11-15", estimation: 6, position: 1 }).select().single();
check("crear tarea con todos los campos", !et);
const { data: sub } = await vero.from("tasks").insert({ project_id: proy.id, group_id: grupos[0].id, parent_id: t1.id, title: "Revisar alcance", position: 1 }).select().single();
check("crear subtarea", !!sub);
check("editar tarea (mover de grupo, cambiar estado)", !(await vero.from("tasks").update({ group_id: g2.id, status_id: est["En curso"] }).eq("id", t1.id)).error);
check("asignar a no miembro rechazado", !!(await vero.from("tasks").update({ assignee_id: ana.id }).eq("id", t1.id)).error);
const { data: encontrado } = await vero.rpc("find_profile", { u: "ANA" });
check("buscar miembro por usuario", encontrado?.[0]?.id === ana.id);
check("agregar a ana como editora", !(await vero.from("project_members").insert({ project_id: proy.id, user_id: ana.id, role: "editor" })).error);
check("agregar a beto como lector", !(await vero.from("project_members").insert({ project_id: proy.id, user_id: beto.id, role: "viewer" })).error);
check("asignar tarea a ana", !(await vero.from("tasks").update({ assignee_id: ana.id }).eq("id", t1.id)).error);
const { data: tareasAna } = await cAna.from("tasks").select("*").eq("project_id", proy.id);
check("ana ve las tareas (sincronizado entre cuentas)", tareasAna.length === 2);
check("ana edita una tarea", !(await cAna.from("tasks").update({ title: "Requisitos generales" }).eq("id", t1.id)).error);
const { data: com } = await cAna.from("comments").insert({ task_id: t1.id, body: "Listo para revisión" }).select().single();
check("ana comenta", !!com);
const { c: cBeto } = await entrar("beto", "Temporal456");
const { count: n } = await cBeto.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", proy.id);
check("beto (lector) ve tareas", n === 2);
await cBeto.from("tasks").update({ title: "hack" }).eq("id", t1.id);
const { data: t1b } = await vero.from("tasks").select("title").eq("id", t1.id).single();
check("beto (lector) no puede editar", t1b.title === "Requisitos generales");
check("beto (lector) sí puede comentar", !(await cBeto.from("comments").insert({ task_id: t1.id, body: "Visto" })).error);
const { data: perfilesVistos } = await cBeto.from("profiles").select("username");
check("beto ve los perfiles de su equipo", perfilesVistos.length === 3);

console.log("Desactivar y eliminar");
check("desactivar a beto", !(await admin(vero, { action: "disable", id: beto.id })).error);
{ const { r } = await entrar("beto", "Temporal456"); check("beto desactivado no puede entrar", !!r.error); }
const { count: n2 } = await cBeto.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", proy.id);
check("sesión abierta de beto pierde acceso de inmediato", n2 === 0);
check("reactivar a beto", !(await admin(vero, { action: "enable", id: beto.id })).error);
{ const { r } = await entrar("beto", "Temporal456"); check("beto reactivado entra de nuevo", !r.error); }
check("restablecer clave de beto", !(await admin(vero, { action: "set_password", id: beto.id, password: "Nueva2026x" })).error);
{ const { r } = await entrar("beto", "Nueva2026x"); check("beto entra con la clave restablecida", !r.error); }
check("eliminar subtarea", !(await vero.from("tasks").delete().eq("id", sub.id)).error);
check("eliminar a beto", !(await admin(vero, { action: "delete", id: beto.id })).error);
check("eliminar proyecto (dueña)", !(await cAna.from("projects").delete().eq("id", proy.id).select()).data?.length && !(await vero.from("projects").delete().eq("id", proy.id)).error);
const { count: quedan } = await vero.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", proy.id);
check("tareas borradas en cascada", quedan === 0);

console.log(`\nResultado: ${ok} OK, ${fallas} fallidas`);
process.exit(fallas ? 1 : 0);
